/* ============================================================================
 *  IntMap · Weather — IntMapModules.{wind,weatherEC,weatherPanel}  (#R166, rebuilt #R276)
 * ----------------------------------------------------------------------------
 *  The animated wind field, the ECMWF raster/contour layers with their own numeric legends and
 *  forecast player, and the point-weather popup.
 *
 *  ⚠ (#R276) THE WIND IS NO LONGER A GRID OF POINT REQUESTS. What used to be here asked
 *  api.open-meteo.com for the CURRENT wind at 2,232 individual coordinates (five parallel chunked
 *  requests, a 1,152-point 8° fallback when the fine one timed out — MEASURED live: the fallback is
 *  what usually won, so the animation was 855 usable samples for the whole planet), painted them
 *  into a 1024×512 Web-Mercator canvas and handed that to an image source. Everything about that is
 *  now gone: the field, the colour raster AND the particles all read the ECMWF IFS HRES ≈9 km native
 *  data through window.IntMapECMWF — 6,599,680 samples, one ranged read, one valid time. The colour
 *  and the streaks cannot disagree because they are the same Float32Array.
 *
 *  The model, its forecast axis and its colour scales live in js/wx-ecmwf.js; the particle renderer
 *  lives in js/wx-wind.js. This file is what wires them to the map and to the panel UI.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};

  /* ══ ⚠⚠ (#R284) THE PLAYER'S ICONS ARE DRAWN, AND NO TWO OF THEM ARE THE SAME ═══════════════
     「ECMWFの時間UIはボタンがくそ。アイコンが分かりにくすぎるし、再生ボタンと次に行くボタンが同じ
       アイコンというくそ仕様。」 — MEASURED, the five buttons carried `⏮ ◀ ▶ ▶ ⦿`: **play and next
     were literally the same character**, and 「戻る」 and 「再生」 were the same triangle mirrored.
     A glyph out of the emoji / Miscellaneous-Technical blocks is also whatever the reader's OS
     decides to draw at 10.5 px, which is the other half of 「分かりにくすぎる」.
     So they are inline SVG at a size that can be seen and hit: bar-plus-triangle for 「最初へ」,
     DOUBLE triangles for the two steps and a SINGLE one for play — the shape difference IS the
     distinction — two bars for pause, and 「現在」 is a WORD, because no icon reads as 「now」 and
     `⦿` certainly did not. */
  window.IntMapWxPlayer=(function(){
    const _svg=(d)=>'<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false" fill="currentColor">'+d+'</svg>';
    const IC={
      first:_svg('<rect x="4" y="5" width="2.6" height="14" rx="1"></rect><path d="M20 6.2v11.6a1 1 0 0 1-1.53.85l-9.1-5.8a1 1 0 0 1 0-1.7l9.1-5.8A1 1 0 0 1 20 6.2z"></path>'),
      prev:_svg('<path d="M12.6 6.6v10.8a.9.9 0 0 1-1.38.76l-8.5-5.4a.9.9 0 0 1 0-1.52l8.5-5.4a.9.9 0 0 1 1.38.76z"></path><path d="M22 6.6v10.8a.9.9 0 0 1-1.38.76l-8.5-5.4a.9.9 0 0 1 0-1.52l8.5-5.4A.9.9 0 0 1 22 6.6z"></path>'),
      play:_svg('<path d="M7 4.9v14.2a1 1 0 0 0 1.53.85l11.2-7.1a1 1 0 0 0 0-1.7L8.53 4.05A1 1 0 0 0 7 4.9z"></path>'),
      pause:_svg('<rect x="6" y="4.5" width="4.4" height="15" rx="1.4"></rect><rect x="13.6" y="4.5" width="4.4" height="15" rx="1.4"></rect>'),
      next:_svg('<path d="M11.4 6.6v10.8a.9.9 0 0 0 1.38.76l8.5-5.4a.9.9 0 0 0 0-1.52l-8.5-5.4a.9.9 0 0 0-1.38.76z"></path><path d="M2 6.6v10.8a.9.9 0 0 0 1.38.76l8.5-5.4a.9.9 0 0 0 0-1.52L3.38 5.84A.9.9 0 0 0 2 6.6z"></path>')
    };
    const _b=(act,label,inner,cls)=>'<button class="ecl-b'+(cls?' '+cls:'')+'" data-act="'+act+'" aria-label="'+label+'" title="'+label+'">'+inner+'</button>';
    /* ══ ⚠⚠⚠ (#R290) EVERY WEATHER LAYER GETS ITS OWN CLOCK BACK, AND ITS STEPS ARE DISCRETE ═══
       「ECMWF系レイヤーで、時間選択をChronosに受け流さなくてよい。個別の時間選択UIを使え。」
       「時刻をそれぞれの時間選択UIで選択するとき、データのある時間のみを選べる、離散的な感じに。
         データのない時間を選べないように。」

       #R288 removed the ECMWF box and routed the forecast hour through Chronos, the app-wide
       clock — which means moving the weather also moved the news, the borders, the terminator and
       the statistics, and it means the reader picks the hour with a control whose Year and Date
       tabs offer instants the model has never published. Both halves of the report are that one
       decision. The axis is the model's own again (see the note on `_pushClock` in js/wx-ecmwf.js),
       and the control is HERE, in each layer's legend, next to the picture it moves.

       ⚠⚠ (#R293) 「また、タイムスライダーをつけろ。」 — AND IT IS BOTH, WHICH IS NOT A CONTRADICTION.
       #R290 argued a `<select>` rather than a range because 「データのない時間を選べない」 is a claim
       about the CONTROL and a range over an index LOOKS continuous. That argument is about what a
       control implies, and it is answered by making the two controls one thing: the range steps
       over the model's OWN INDEX with `step=1`, so every position it can occupy is a published
       valid time — there is no reachable position that has no data — and the `<select>` beside it
       NAMES the instant the range is standing on. Scrubbing is the range's job; saying exactly
       which hour you are on is the select's; neither can reach an hour the model never published.
       ⚠ The range emits `input` on every pixel (#R286's 「点滅と異常に遅い」), so it moves the axis
       QUIETLY while dragging and only fetches on `change` — the same two-speed split #R286 wrote
       for the ECMWF index/time events, in the control that produces them.
       ⚠ ONE DECLARATION, TWO LEGENDS. The wind box and the ECMWF boxes both build from here, which
       is the rule that keeps two views of one axis from disagreeing about which button is 「再生」. */
    /* ══ ⚠⚠⚠ (#R302) 一つの option の中身は、軸が動かないかぎり毎回同じ文字列である ═══════════
       「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで爆速にしろ。」
       この `<select>` はモデルが公表する valid time を**全件**並べる——現在およそ 109 件——ので、
       凡例を1回組むたびに `E.fmt()` が 109 回呼ばれ、そのたびに Intl の formatter が1つできて
       いた（js/wx-ecmwf.js の `fmt` の注記）。しかも凡例は 1 回の時刻変更で何度も描き直される：
       `load()` の開始で1回、答えが返って1回、`time` / `play` / `meta` のたびに1回。
       軸の同一性（本数と両端）・「現在」がどれか・言語・表示タイムゾーンが同じなら、出てくる
       文字列は 1 文字も違わない。違うのは `selected` がどれに付くかだけなので、**中身だけ**を
       覚えて、外側の `<option …>` は毎回組む。
       ⚠ 表示は 1 文字も変えていない——`_optLabels` が返すのは、以前 `opt(k)` が `<option>` の中に
       書いていた文字列そのもの。
       ⚠ 鍵には `E.fmt` が読むものが全部入っている。`lang` と `userTZ` は利用者が設定でいつでも
       変えられるし、`MODEL` は「これは同じ軸か」を名前でも訊いておくため。 */
    let _optMemo=null;
    function _optLabels(E,times,n,now,nowTxt){
      const H=window.IM_HOST||{};
      const k=(E.MODEL||'')+'|'+n+'|'+times[0]+'|'+times[n-1]+'|'+now+'|'+nowTxt+'|'+(H.lang||'')+'|'+(H.userTZ||'');
      if(_optMemo&&_optMemo.k===k) return _optMemo.v;
      const v=new Array(n);
      for(let j=0;j<n;j++) v[j]=E.fmt(times[j])+(j===now?nowTxt:'');
      _optMemo={k:k,v:v};
      return v;
    }
    function _timeUI(id,E,L){
      if(!E) return '';
      const n=E.count(); if(!n) return '';
      const i=E.index(), playing=!!E.isPlaying(), times=E.times(), now=E.nowIndex();
      const nowTxt=' · '+L('now','現在','jetzt','сейчас','ahora');
      const lbl=_optLabels(E,times,n,now,nowTxt);
      let o=''; for(let k=0;k<n;k++) o+='<option value="'+k+'"'+(k===i?' selected':'')+'>'+lbl[k]+'</option>';
      const pct=(n>1)?((i/(n-1))*100):0;
      return '<div class="ecl-player">'
        +_b('first',L('First step','最初の時刻','Erster Schritt','Первый шаг','Primer paso'),IC.first)
        +_b('prev',L('One step back','1つ前の時刻','Ein Schritt zurück','На шаг назад','Un paso atrás'),IC.prev)
        +_b('play',(playing?L('Pause','一時停止','Pause','Пауза','Pausa'):L('Play','再生','Abspielen','Воспроизвести','Reproducir')),(playing?IC.pause:IC.play),'ecl-play')
        +_b('next',L('One step forward','1つ次の時刻','Ein Schritt vor','На шаг вперёд','Un paso adelante'),IC.next)
        +_b('now',L('Back to now','現在に戻る','Zurück zu jetzt','К текущему времени','Volver a ahora'),L('Now','現在','Jetzt','Сейчас','Ahora'),'ecl-now')
        +'</div>'
        +'<div class="kl-period" style="margin:6px 0 2px;"><label>'+L('Time','時刻','Zeit','Время','Hora')+'</label>'
        +'<select class="ecl-timesel" id="'+id+'">'+o+'</select></div>'
        +'<input type="range" class="ecl-timerange" id="'+id+'-r" min="0" max="'+Math.max(0,n-1)+'" step="1" value="'+i+'" '
        +'aria-label="'+L('Time','時刻','Zeit','Время','Hora')+'" style="--ntl-fill:'+pct.toFixed(1)+'%;">'
        +'<div class="ecl-timescale"><span>'+E.fmt(times[0])+'</span><span>'+E.fmt(times[n-1])+'</span></div>';
    }
    /* the handlers for the block above — again once, for both legends */
    function _wireTimeUI(root,id,E){
      if(!root||!E) return;
      const sel=root.querySelector('#'+id);
      const rng=root.querySelector('#'+id+'-r');
      const fill=(el)=>{ try{ const mn=+el.min,mx=+el.max;
        el.style.setProperty('--ntl-fill',(mx>mn?(((+el.value-mn)/(mx-mn))*100):0)+'%'); }catch(_){} };
      if(sel) sel.onchange=()=>{ E.pause(); E.setIndex(+sel.value,{now:true});
        if(rng){ rng.value=sel.value; fill(rng); } };
      if(rng){
        /* (#R293) drag = move the axis and the label; release = fetch. See the note above. */
        rng.addEventListener('input',()=>{ E.pause(); fill(rng);
          if(sel) sel.value=rng.value;
          try{ E.setIndex(+rng.value); }catch(_){} });
        rng.addEventListener('change',()=>{ E.pause(); try{ E.setIndex(+rng.value,{now:true}); }catch(_){} });
      }
      root.querySelectorAll('.ecl-b').forEach(b=>{ b.onclick=()=>{ const a=b.getAttribute('data-act');
        if(a==='first'){ E.pause(); E.setIndex(0,{now:true}); }
        else if(a==='prev'){ E.pause(); E.step(-1); }
        else if(a==='next'){ E.pause(); E.step(1); }
        else if(a==='now'){ E.pause(); E.setIndex(E.nowIndex(),{now:true}); }
        else if(a==='play') E.togglePlay(); }; });
    }
    return { svg:_svg, IC:IC, b:_b, timeUI:_timeUI, wireTimeUI:_wireTimeUI };
  })();

window.IntMapModules.wind=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  const IC=window.IntMapWxPlayer.IC, _b=window.IntMapWxPlayer.b;   /* (#R284) one declaration, two views of one clock */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  const satToast=HOST.satToast, isMobile=HOST.isMobile;
  const L=window.IntMapLang.pick(()=>HOST.lang);
  window.Wind=(function(){
    const cv=document.getElementById('wind-canvas'); if(!cv) return {toggle(){},stop(){},setOpacity(){}};
    const EC=()=>window.IntMapECMWF;
    const VAR='wind_u_component_10m';        /* the reader pairs u+v → values=speed, directions=bearing */
    const R=Math.PI/180;
    /* TWO layer slots, alternated. A time step used to remove the source and add it again, which is
       exactly the interval in which there is nothing on the map — 「タイルの消失や点滅を抑える」. The
       new frame is built in the free slot at opacity 0 and the old one is only removed once the new
       one has painted, so the map never goes blank between two hours. */
    /* ══ ⚠⚠⚠ (#R298) …AND THE FREE SLOT IS THE ONE THE READER IS NOT LOOKING AT ═══════════════
       「時間を選択したとき、変えてから読み込まれるまでいったん地図から何もなくなるのを辞めろ。」
       #R284's two slots alternated off a counter that was flipped the moment a slot was BUILT, and
       #R297 then made the reveal wait for a tile — so for the whole interval between those two
       events the counter already pointed at the slot that is ON SCREEN. A second step inside that
       interval (the player steps every 700 ms, and 「次へ」 is a button people press twice) therefore
       tore down the visible slot to build the new hour in it, leaving zero layers above opacity 0 —
       which is the blank in the report. The first step's reveal then removed 「its old slot」, which
       by that point was holding the newer hour.
       → the slot to build in is derived from the slot that is actually SHOWN, and a reveal carries
       the sequence number of the build that scheduled it: an overtaken reveal uncovers nothing and
       removes nothing. `slot` is that derived choice now, not a counter. */
    const SLOT=[{src:'wind-field-a-src',lyr:'wind-field-a'},{src:'wind-field-b-src',lyr:'wind-field-b'}];
    let slot=0, shownSlot=-1, fieldSeq=0, liveKey='', liveSlot=-1;
    let on=false, raf=0, moving=false, opacity=1, renderer=null, loading=false, lastErr='';
    /* ══ ⚠⚠⚠ (#R337) THE STREAKS CAN BE ASKED FOR BY A LAYER THAT IS NOT THIS ONE ══════════════
       「気温レイヤーでも、風レイヤーのパーティクルをオンオフできるトグルを付けて。」
       #R313 split the streaks from the colour raster, but both halves still hung off `on` — the
       WIND LAYER's own switch — so the only way to see moving air over the temperature field was to
       switch the wind layer on as well and take its colour raster with it. There is no version of
       that which answers the request: a second switch that does nothing unless the first one is on
       is a switch that does nothing.
       → `soloOn` is 「something OTHER than this layer wants the streaks」 (today: the Temperature
       legend's own box — js/weather.js's weatherEC module, which owns that preference and pushes
       the EFFECTIVE value here). This module only has to know that someone is asking.
       ⚠ `live()` IS 「THE FIELD IS WANTED」, AND IT IS NOT 「THE COLOUR RASTER IS WANTED」. Every use
       of `on` below now says exactly one of the two: the u/v field, the widening ladder, the frame
       loop and the canvas follow `live()`; `addField` / `ensureField` / the reveal — the two raster
       SLOTS on the map — stay on `on`, because the reader asking for streaks over the temperature
       did not ask for the wind's colours on top of it.
       ⚠ AND THE TWO SWITCHES ARE INDEPENDENT QUESTIONS WITH DIFFERENT DEFAULTS. 「when I look at
       the Wind layer, do I want streaks?」 is `partsOn`, default ON since #R313. 「do I want the wind
       drawn over the Temperature layer?」 is the other legend's box, default OFF — because turning
       it on costs a forecast read nobody with only a temperature raster up has been paying for. */
    let soloOn=false;
    const live=()=>on||soloOn;
    /* the ONE predicate that says whether streaks are on screen: this layer's own switch while this
       layer is up, or another layer asking for them while it is not. */
    function streaksWanted(){ return (on&&partsOn)||soloOn; }
    /* ══ ⚠⚠⚠ (#R313) THE PARTICLES ARE A SECOND SWITCH, INDEPENDENT OF THE LAYER ══════════════
       「風レイヤーの凡例に、パーティクルをオンオフできるトグルを付けて。」
       This layer draws TWO things from one field — a colour raster and the animated streaks — and
       until now both hung off the single `on` above, so the only way to stop the animation was to
       switch the whole layer off and lose the colours with it. `partsOn` is the streaks alone.
       ⚠ DEFAULT ON, AND THE KEY IS ITS OWN. Nothing about the layer changes for a reader who never
       touches the switch; an absent key reads as on, and only an explicit '0' turns them off.
       ⚠ IT GATES THE FRAME LOOP, NOT JUST THE CANVAS. Hiding #wind-canvas while `step()` kept asking
       for frames would have left the whole particle simulation running for something nobody can see —
       the reader asked to turn them OFF, and that has to mean the work stops too. */
    const PARTS_KEY='intmap_wind_parts';
    let partsOn=true; try{ const _p=localStorage.getItem(PARTS_KEY); if(_p!=null) partsOn=(_p!=='0'); }catch(_){}
    /* (#R293) the last field that answered, and the hour it is of — see `sampleAt` below */
    let _lastField=null, _lastFieldAt=null;
    /* ⚠ (#R305) WHICH WAY THE READER IS GOING. #R276 追記 warms 「the next hour」 and spelled that
       `index()+1`, so a reader stepping BACKWARDS along the axis warmed the hour behind them and
       paid a cold read every single time. The axis has two directions and the player runs in one of
       them at a time; the last move is the only evidence of which, and +1 is the honest default for
       the first step of a session (the player's own ▶ goes forward). */
    let _lastIdx=-1, _stepDir=1;
    /* ══ ⚠⚠⚠ (#R314) ONE HOUR AHEAD IS EXACTLY ONE STEP OF HEADROOM ═══════════════════════════
       #R310 wrote 「ONE HOUR, NOT A WINDOW」 and gave the size of a read as the reason — 8.6 MB for
       the planet. That reason is about the BAND, not about the COUNT: the band a future hour is
       actually read at is `nearBand()` (#R305's rule, four lines from the call), and MEASURED on
       this build that read is **4.5 MB and ~520 ms**, not 8.6 MB. One hour of headroom means a
       reader who is TRAVELLING — pressing 次へ again as soon as the picture lands — stands at the
       edge of the window on every second step, which is the alternation the baseline shows:
           0 / 1,180 / 0 / 1,279 / 0 / 1,724 ms
       → a second hour, and only on EVIDENCE: at least `AHEAD_MAX` steps in a row in the same
       direction, inside `TRAVEL_MS`. One step is a look; two in a row is a journey.
       ⚠ THIS IS THE ONE PLACE THE LAYER SPENDS BYTES NOBODY ASKED FOR, so every guard is on:
       it is the narrow band and never the planet, it is the background lane (`serial(fn,true)`),
       it stands down while the reader is waiting for anything (`foregroundBusy`), and it does not
       run at all for a reader who has not moved twice. `_runN` is reset by a turn or a pause.
       ⚠⚠⚠ AND IT — ALONE — STILL WAITS FOR THE COLOUR (`afterFieldShown` at the call site).
       MEASURED with both hours released by the field, against origin/main, six steps a session,
       four sessions, 700 ms between clicks:
           the particles' hour   802 → 447 ms   (better)
           the COLOUR's hour   1,584 → 1,906 ms (WORSE by 322 ms)
       and 「パーティクルは比較的すぐ表示されるが、背景のカラーが、時間を変えるとなかなか表示され
       ない」 is a report this project has ALREADY had (#R298). A second hour nobody has asked for
       must not be paid for out of the picture the reader is waiting to see. The hour they are
       actually stepping onto is a different matter — that one is certain, and it is released by
       the field, which is the thing it is a read of. */
    const TRAVEL_MS=6000, AHEAD_MAX=2;
    let _runN=0, _runAt=0;
    function aheadMore(nx){
      if(!live()||_runN<AHEAD_MAX) return;
      try{
        /* the reader is waiting for something right now — #R305 wrote this door and nobody had
           opened it (`foregroundBusy` had no caller until this line) */
        if(EC().foregroundBusy()) return;
        const n=EC().count(), n2=Math.max(0,Math.min(n-1,nx+_stepDir));
        if(n2===nx||n2===EC().index()) return;
        EC().readAhead(VAR,n2,nearBand()||band());
      }catch(_){}
    }
    const _view={x:1,y:0,z:0,th:Math.cos(87*R)};
    function refreshView(){ try{ const c=GE().camera.getCenter(), cla=c.lat*R, clo=c.lng*R;
      _view.x=Math.cos(cla)*Math.cos(clo); _view.y=Math.cos(cla)*Math.sin(clo); _view.z=Math.sin(cla); }catch(_){} }
    function visibleLL(lng,lat){ if(HOST.proj!=='globe') return true;
      const la=lat*R, lo=lng*R, cl=Math.cos(la);
      return (cl*Math.cos(lo)*_view.x + cl*Math.sin(lo)*_view.y + Math.sin(la)*_view.z) > _view.th; }

    /* ── the colour field: the model's OWN 9 km tiles ──────────────────────────────────────────
       ⚠ ONE alpha, not two. The old raster wrote a flat α=178 into every pixel of a canvas and then
       asked MapLibre for raster-opacity 0.72 on top, so the field was drawn at 0.50 everywhere and
       a 40 m/s jet was as washed out as a breeze. The SDK's wind scale carries a MEANINGFUL alpha
       (0 at calm, 1 from ~7 m/s up), which is what fades still air into the basemap; the slider is
       the only other multiplier and it defaults to 1. */
    /* ══ ⚠⚠⚠ (#R297) 「変えてから読み込まれるまでいったん地図が何もなくなるのを辞めろ」 ═══════════
       #R290 wrote the rule for the ECMWF rasters — 「`once('idle')` is not 「loaded」」 — and this is
       the same defect one source along. `isSourceLoaded` asks 「is there anything still in flight
       for this source」, and for a raster source that has just been added and has not been asked
       for a single tile yet the answer is YES, immediately. So the new slot was uncovered and the
       OLD one removed while the new one had nothing to draw: the colour field went away and came
       back when the tiles arrived, which is exactly the blank in the report.
       → a slot is only revealed once a TILE of that source has landed (`e.tile`) AND the source
       reports itself loaded. The old hour stays up until then, which is what #R284's two slots
       were built for. The timeout stays as the last resort — a source whose tiles are all
       off-screen never gets a tile event, and holding two slots for ever would be worse. */
    function _whenSrcLoaded(sid,then,maxMs){
      let done=false;
      const fin=()=>{ if(done) return; done=true;
        try{ GE().events.off('sourcedata',h); }catch(_){}
        try{ then(); }catch(_){} };
      const h=(e)=>{ if(e&&e.sourceId===sid&&e.tile&&e.isSourceLoaded) fin(); };
      try{ GE().events.on('sourcedata',h); }catch(_){ setTimeout(fin,600); return; }
      setTimeout(fin,maxMs||12000);
    }
    /* ══ ⚠⚠⚠ (#R298) NOTHING THAT IS NOT ON SCREEN QUEUES IN FRONT OF WHAT IS ═══════════════════
       「パーティクルは比較的すぐ表示されるが、背景のカラーが、時間を変えるとなかなか表示されない。」
       The SDK keeps ONE `omFileReader` (see the note on `serial()` in js/wx-ecmwf.js) and the
       colour tiles are decoded through that same one — so every read this layer starts is a read
       the tiles have to wait behind. On a time change THREE of them started before the colour had
       drawn a single tile: the neighbouring hour's prefetch (which re-points the shared reader at
       a DIFFERENT FILE, the most expensive thing that can happen to it), the wide-band read that
       follows the narrow one, and — whenever an ECMWF raster is also on — that module's cursor
       warm-up. All three are work for a picture the reader is not looking at yet, and the reader
       is watching the one they asked for not arrive.
       → they wait until the colour slot has been uncovered, plus a short grace so the tiles behind
       the first one land too. THE WAIT CANNOT BE FOREVER: it is the reveal that releases it, and
       the reveal has its own 12 s backstop, so a source that never paints still lets everything
       queued here run. ⚠ The particles' own first read is NOT deferred — it is the picture that
       arrives first, and holding it back would only make the layer slower to say anything. */
    let fieldPending=false, shownWaiters=[];
    function afterFieldShown(fn,graceMs){
      const run=()=>{ setTimeout(()=>{ try{ fn(); }catch(_){} },(graceMs==null?150:graceMs)); };
      if(!fieldPending){ run(); return; }
      shownWaiters.push(run);
    }
    function fieldShown(){ fieldPending=false;
      const w=shownWaiters; shownWaiters=[]; w.forEach(r=>{ try{ r(); }catch(_){} }); }
    function addField(key){
      if(!_imCanDraw()) return false;
      /* ══ ⚠⚠ (#R302 追記) 「同じ key なら建て直さない」は<b>一度も走れない行だった</b> ═══════════════
         #R302 はここに `if(key&&liveKey===key&&liveSlot>=0){ … return true; }` を入れ、「同じ時刻の
         二重発注を止めた」と書いた。**その条件は成立しえない。** `addField(key)` を呼ぶ場所は4つしか
         なく、**4つとも入る前に `liveKey!==key` を確かめている**:
             ensureField 本体（296）… 呼び出し元 446 が `key!==liveKey`、650 が `liveKey=''` を先に置く
             again()（299）………… `if(!on||liveKey===key) return;`
             idle（302）…………… `if(on&&liveKey!==key) addField(key)`
         そして `liveKey=key` はこの関数の**末尾で同期的に**書かれるので、成功した瞬間から梯子は自分で
         黙る。想定した「`load()` の `.then` と `idle` が同じ key で二度届く窓」は、#R276 追記が梯子に
         付けたこのガードによって**すでに閉じていた**。
         → 消した。**走れない行より悪いのは、走ると書いてある注記のほうである。**
         ⚠ 消した理由は本番のデプロイ後スモークではない。あの回（#261）は
         `tests/prod-smoke.spec.js:556` の風の画素が落ちたが、**13分後に同じコードを載せた #262 の
         デプロイでは同じ試験が通っている**ので、あれはタイルの着地待ち（`rasterOpacity>0` のあと 6 秒）
         の取りこぼしであって、このラウンドの変更ではない。
         ⚠ `liveKey`/`liveSlot` はそのまま——梯子が読んでおり、`removeField` が消す。 */
      slot=(shownSlot===0)?1:0;                    /* (#R298) 「free」 means 「not the one on screen」 */
      if(!EC().registerProtocol()) return false;   /* (#R288) — see the note in weatherEC.addSlot */
      const s=SLOT[slot], url=EC().omRasterUrl(VAR);
      if(!url) return false;
      try{
        if(GE().layers.has(s.lyr)) GE().layers.remove(s.lyr);
        if(GE().layers.hasSource(s.src)) GE().layers.removeSource(s.src);
        GE().layers.addSource(s.src,{type:'raster',url:url,maxzoom:12,tileSize:EC().TILE_PX});
        GE().layers.add({id:s.lyr,type:'raster',source:s.src,
          paint:{'raster-opacity':0,'raster-opacity-transition':{duration:260},'raster-fade-duration':0,'raster-resampling':'linear'}},EC().before());
      }catch(_){ return false; }
      const use=slot, mine=++fieldSeq;
      fieldPending=true;
      const reveal=()=>{
        /* (#R298) overtaken by a later step: uncover nothing, and above all REMOVE nothing */
        if(!on||mine!==fieldSeq) return;
        try{
          EC().lift(s.lyr);                      /* the terminator must not dim the data — see EC.before */
          if(GE().layers.has(s.lyr)) GE().layers.setPaint(s.lyr,'raster-opacity',opacity);
          shownSlot=use;
          /* whatever is NOT the slot now showing goes — decided HERE rather than captured when this
             reveal was scheduled, because by now the other slot may hold a newer hour than this one */
          SLOT.forEach((o,i)=>{ if(i===use) return;
            try{ if(GE().layers.has(o.lyr)) GE().layers.remove(o.lyr); }catch(_){}
            try{ if(GE().layers.hasSource(o.src)) GE().layers.removeSource(o.src); }catch(_){} });
        }catch(_){}
        fieldShown();                            /* (#R298) …and now the deferred reads may run */
      };
      /* (#R290) the SOURCE says when it is showing — see the note on whenSourceLoaded above */
      _whenSrcLoaded(s.src,reveal,12000);
      liveKey=key; liveSlot=use;                 /* (#R302) …and WHICH slot it was built in */
      return true;
    }
    function removeField(){ SLOT.forEach(s=>{ try{ if(GE().layers.has(s.lyr)) GE().layers.remove(s.lyr); }catch(_){}
      try{ if(GE().layers.hasSource(s.src)) GE().layers.removeSource(s.src); }catch(_){} }); liveKey=''; liveSlot=-1;
      /* (#R298) nothing is on screen any more, and any reveal still in flight is superseded */
      shownSlot=-1; fieldSeq++; fieldPending=false; shownWaiters=[]; }
    function setOpacity(v){ opacity=Math.max(0,Math.min(1,+v)); if(!live()) return;
      SLOT.forEach(s=>{ try{ if(GE().layers.has(s.lyr)&&GE().layers.getPaint(s.lyr,'raster-opacity')>0) GE().layers.setPaint(s.lyr,'raster-opacity',opacity); }catch(_){} });
      try{ cv.style.opacity=String(Math.max(0.25,opacity)); }catch(_){}
    }

    /* ⚠⚠ (#R276 追記) THE FIELD LAYER HAS TO KEEP ASKING, AND THIS IS #R85's DEFECT COMING BACK.
       CAUGHT BY THIS ROUND'S OWN PRODUCTION TEST, four attempts, 75 s each: on the CI runner the
       data arrived and `hasLyr` never became true. `addField` refuses when `_imCanDraw()` is false —
       the style is not ready to accept a layer yet — and it was called ONCE, from `load()`. On a
       machine where the style settles after the field does, the wind then had particles and no
       colour for ever, with nothing retrying: 「粒子のみで色がつかない」, the exact report #R85
       answered with a retry ladder that this rewrite dropped.
       So the ladder is back, in the one place that owns the layer: poll for ~16 s AND hook the map's
       next idle, and stop the moment the slot is live (`liveKey===key`). */
    function ensureField(key){
      if(addField(key)) return;
      let n=0;
      const again=()=>{ if(!on||liveKey===key) return;
        if(addField(key)) return;
        if(n++<80) setTimeout(again,200); };
      setTimeout(again,200);
      try{ GE().events.once('idle',()=>{ if(on&&liveKey!==key) addField(key); }); }catch(_){}
    }
    /* ── the data ─────────────────────────────────────────────────────────────────────────────*/
    /* ⚠⚠ (#R288) THE PARTICLES ASK FOR THE LATITUDE BAND THEY ARE DRAWN IN — see the long note on
       IntMapECMWF.load. Same samples, same speeds, a sixth of the wait. The band spans every
       longitude, so only a north/south move can leave it. */
    function band(){ try{ const b=GE().camera.getBounds();
      return EC().bandFor(b.getSouth(),b.getNorth()); }catch(_){ return null; } }
    /* ══ ⚠⚠⚠ (#R297) 「風レイヤーが重すぎる。品質保ったまま爆速にしろ。」 ═══════════════════════════
       MEASURED on production, from switching the layer on to the first particle moving:
       **14.5 s** at the opening view and **74.9 s** zoomed in over Japan. None of it is drawing —
       the renderer measures a couple of milliseconds a frame. It is ONE READ: `bandFor` answers
       `null` whenever the view spans more than 120° of latitude, and the opening view is the globe,
       so the layer reads the whole planet — **13,199,360 samples, ~18 MB** — before anything moves.
       Measured directly, a global read costs 8–16 s and is BANDWIDTH-bound (its ranges are two
       contiguous blocks, so #R288's prefetch trick, which collapses many small ranges into one
       round trip, has nothing to collapse: A/B on production, 16.4 / 7.8 s plain against 7.8 / 9.4 s
       warmed — no difference).
       ⚠ AND IT BLOCKS THE COLOUR TOO. The SDK keeps ONE `omFileReader` (see the note on `serial()`
       in js/wx-ecmwf.js) and the raster tiles are read through the same one, so the tiles cannot
       decode until the field read is done. MEASURED: the colour slot was revealed at 15.9 s, i.e.
       right behind the field.
       → THE FIRST READ IS THE LATITUDES ON SCREEN, NOT THE PLANET. `bandNear` (#R290 追記) is the
       band around the centre the point readout already uses — about 2.2 M samples against 13.2 M —
       and it is banded, so it also gets the prefetch. The particles start on it; the full band the
       view actually covers is read immediately behind it and REPLACES it when it lands. Nothing is
       lost: the final frame is the same frame, at the same 9 km spacing, from the same file.
       ⚠ THE WIDE READ IS NOT SKIPPED. A frame that covers less than the view would leave the top
       and bottom of the screen without a field for ever, which is a worse picture, not a faster
       one — `bandCovers` is what asks for it and `keepFrame` is what swaps it in. */
    function nearBand(){ try{ const b=GE().camera.getBounds();
      return EC().bandNear(b.getSouth(),b.getNorth()); }catch(_){ return null; } }
    /* ══ ⚠⚠⚠ (#R299) THE WIDE READ IS A STAIRCASE, AND EVERY RUNG OF IT IS INTERRUPTIBLE ═════════
       「風レイヤーが重すぎる。品質保ったまま、起動から日時変更からすべてに至るまで爆速にしろ。」
       #R297 made the FIRST read the band around the view and put the band the view actually covers
       behind it. What it did not do is ask what that second band IS at the view the app opens on:
       `bandFor` answers `null` — the planet — for anything spanning more than 120° of latitude, and
       the opening view (z1.7) is the planet. So `widen()` asked for **13,199,360 samples (≈18 MB)**
       at boot AND AGAIN ON EVERY TIME CHANGE, because `heldBand(VAR)` is keyed on the hour and a
       new hour has no frame at all. A reader stepping the axis once a second was starting an 18 MB
       read once a second, down the one queue the colour tiles are decoded in (see `serial()` in
       js/wx-ecmwf.js) — which is why the colour 「なかなか表示されない」 is worst at world zoom.
       → the widening is a STAIRCASE. Each rung roughly DOUBLES the half-width of the band in hand,
       and a rung only starts once the map has been STILL and the axis has not moved for STILL_MS.
       ⚠ THE WIDE READ IS NOT SKIPPED. #R297's rule is unchanged and this is its ORDER, not its
       content: the last rung is `band()` itself, so a reader who stays where they are ends up with
       exactly the frame they would have had before — same file, same 9 km spacing, same samples,
       same colours. What a reader who is still scrubbing, or still panning, no longer pays for is
       eighteen megabytes of a picture they are about to replace.
       ⚠ `wideGen` is `seq` (js/wx-ecmwf.js) one level up: a rung scheduled for the hour that is
       going away does not start. `widening` is deliberately NOT cleared when the axis moves — the
       rung already in the queue finishes, and its own completion re-arms the staircase for whatever
       the current hour is by then, so two rungs can never be in flight at once. */
    /* ══ ⚠⚠⚠ (#R305) 「STILL」 HAS TO MEAN 「NOTHING HAS HAPPENED SINCE」, INCLUDING THE ARRIVAL ═══
       MEASURED after the queue was given a priority lane: a step went 7,050 → **2,393 ms**, and the
       step right after it went back to **7,343 ms**. The lane was working; what it could not do is
       take back a rung that had ALREADY STARTED, and one starts the instant a read lands, because
       `stillAt` was stamped when the READ WAS ASKED FOR. A read that takes 2.4 s has therefore been
       「still」 for 1.5 s by the time it answers, so the reader's own 900 ms of quiet is spent before
       they can see the picture they asked for, and the next step queues behind eighteen megabytes.
       → the clock restarts when the field ARRIVES as well as when it is asked for.
       ⚠ AND THE PLANET IS NOT WORTH THE SAME WAIT AS A BAND. At world zoom the target IS the globe
       (`bandFor` says so) and a globe read is 13,199,360 samples / ~8 s down the one reader. A rung
       that big is asked for only once the reader has been quiet for BIG_STILL_MS, so somebody
       stepping the axis every second never starts one, and somebody who has stopped still gets the
       whole picture — 1.6 s later than before, which is 1.6 s of a picture they are looking at
       rather than 8 s of one they are not. */
    const STILL_MS=900, BIG_STILL_MS=2500;
    let widening=false, widenT=0, wideGen=0, stillAt=0;
    function stir(axis){ stillAt=Date.now(); if(axis){ wideGen++; clearTimeout(widenT); widenT=0; } }
    /* ⚠ ONE RUNG: twice the half-width of what is in hand, centred on what still has to be covered,
       never NARROWER than what is in hand (a rung that dropped part of the frame would take the
       particles off the part of the screen it dropped — `heldBand` is what `randomLL` spawns
       inside), and `full` itself — which at world zoom IS the globe — as soon as the rung would
       span it, OR would cost most of it anyway.
       ⚠ THE COST OF A BAND IS NOT ITS WIDTH. The ECMWF domain is a REDUCED Gaussian grid: a row
       holds points in proportion to cos φ, so the points inside a band are proportional to
       sin n − sin s, and most of the planet's 6,599,680 of them are near the equator. A rung twice
       as wide as the opening band (±30° → ±60°) already holds **87%** of them — so reading that
       rung AND then the globe moves MORE bytes than reading the globe once, which is the opposite
       of what this is for. Past RUNG_MAX of the target's cost the target IS the next rung, which is
       why at world zoom the staircase is 「the band on screen, then the planet」 — exactly #R297's
       two reads, with the second one held back until the reader has stopped asking for something
       else. */
    const RUNG_MAX=0.6;
    const gpts=(s,n)=>Math.sin(n*R)-Math.sin(s*R);     /* ∝ the grid points between two latitudes */
    function wideStep(have,full){
      if(have===null) return full;                       /* the globe is in hand — nothing wider exists */
      /* nothing in hand at all: the rung is the narrow band the first read would have taken */
      if(!have||have.length!==4){ const nb=nearBand(); return nb||full; }
      const fs=full?full[1]:-90, fn=full?full[3]:90;
      const c=(Math.min(have[1],fs)+Math.max(have[3],fn))/2, half=Math.max(3,(have[3]-have[1])/2)*2;
      /* outward, so rounding can never shave a rung back inside the frame it is growing from */
      const s=Math.floor(Math.max(-90,Math.min(c-half,have[1]))*10)/10;
      const n=Math.ceil(Math.min(90,Math.max(c+half,have[3]))*10)/10;
      if(s<=fs+1e-6&&n>=fn-1e-6) return full;
      if(gpts(s,n)>=gpts(fs,fn)*RUNG_MAX) return full;
      return [-180,s,180,n];
    }
    /* did the rung actually enlarge what is in hand? the staircase re-arms on GROWTH, or a read
       that cannot land would be asked for again every STILL_MS for ever. */
    function wider(a,b){
      if(b===null) return a!==null;
      if(!b||b.length!==4) return false;
      if(!a||a.length!==4) return a!==null;
      return b[1]<a[1]-1e-6||b[3]>a[3]+1e-6;
    }
    function runWiden(gen){
      if(!live()||gen!==wideGen) return;
      const full=band();
      let have=false; try{ have=EC().heldBand(VAR); }catch(_){ return; }
      try{ if(EC().bandCovers(have,full)) return; }catch(_){ return; }
      const want=wideStep(have,full);
      /* 「still」 means the last moveend AND the last time request AND the last ARRIVAL are all
         behind us — for a rung that reads the planet, by the longer of the two windows (#R305) */
      const need=(want===null)?BIG_STILL_MS:STILL_MS;
      const rest=moving?need:(need-(Date.now()-stillAt));
      if(rest>0){ clearTimeout(widenT); widenT=setTimeout(()=>{ widenT=0; runWiden(gen); },rest); return; }
      widening=true;
      /* (#R298) …and BEHIND the colour, not in front of it — see the note on `afterFieldShown`.
         The wide read is still started immediately in the sense that matters (nothing else can
         claim the reader in the meantime); it just does not take the one reader away from the
         tiles the reader is waiting to see. */
      afterFieldShown(()=>{
        if(!live()||gen!==wideGen){ widening=false; if(live()) widen(); return; }
        /* (#R305) a rung is this module's own read, not the reader's — it goes in the low-priority
           lane so a time step or a pan started while it is still QUEUED is served first */
        EC().load(VAR,null,want,true).then(f=>{ widening=false;
          if(live()&&f&&renderer){ const sf=EC().sampler(VAR); if(sf){ _lastField=sf; _lastFieldAt=EC().validTime(); renderer.setField(sf); } }
          /* (#R299) …and the next rung, which `widen` holds back until the map is still again */
          let now=false; try{ now=EC().heldBand(VAR); }catch(_){}
          if(live()&&wider(have,now)) widen();
        }).catch(()=>{ widening=false; });
      });
    }
    function widen(){
      if(widening||!live()) return;
      const want=band();
      try{ if(EC().bandCovers(EC().heldBand(VAR),want)) return; }catch(_){ return; }
      clearTimeout(widenT); widenT=0;
      runWiden(wideGen);
    }
    /* ══ ⚠⚠⚠ (#R298) ONE FAILED READ IS NOT 「データを取得できませんでした」 ═══════════════════════
       「「風データを取得できませんでした。」←ふざけるな。」 `EC().load` answers falsy for several
       reasons that are not 「the data is unavailable」: the metadata has not landed yet, the 340 kB
       tile SDK has not landed yet, a ranged request came back empty once — and, by design, the
       read was OVERTAKEN by a newer one (`if (seq === mine)` in js/wx-ecmwf.js keeps only the
       current frame). Every one of those raised the toast, and the last is GUARANTEED for a reader
       who steps the axis twice, which is the reader who saw this message.
       → a short ladder, and the toast only once every rung of it has failed. Nothing is hidden
       while it runs: the previous hour keeps flying (the `_lastField` rule below) and the legend
       keeps saying 「読み込み中…」, because a layer that says nothing at all is the defect this
       project keeps paying for. */
    const FAIL_MS=[900,2000,4000];
    let failN=0, retryT=0;
    function load(opt){
      if(!EC()) return Promise.resolve(null);
      const want=()=>EC().stateKey(VAR,'');
      loading=true; lastErr='';
      try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){}
      return EC().ready().then(()=>{
        const key=want();
        /* (#R337) the COLOUR RASTER, and only while this layer is the one that is on. A reader who
           asked for streaks over the temperature field did not ask for the wind's colours over it. */
        if(on&&key&&key!==liveKey) ensureField(key);
        /* the narrow band unless a frame that already covers the view is in hand */
        let b=band();
        try{ if(!EC().bandCovers(EC().heldBand(VAR),b)) b=nearBand()||b; }catch(_){}
        return EC().load(VAR,null,b);
      }).then(f=>{
        loading=false;
        if(!f){ lastErr='load';
          /* (#R298) …and one rung of the ladder above is not a failure to report */
          const again=live()&&failN<FAIL_MS.length;
          if(again){ loading=true;                 /* still trying, and the legend has to say so */
            const ms=FAIL_MS[failN++];
            clearTimeout(retryT); retryT=setTimeout(()=>{ retryT=0; if(live()) load(opt); },ms); }
          /* ⚠ THE LEGEND HAS TO BE REDRAWN ON THE FAILURE PATH TOO, or a layer that could not load
             keeps printing 「読み込み中…」 for ever — which is the silent shape this project keeps
             paying for. The toast is the notification; the legend is the standing answer. */
          try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){}
          if(!again){ try{ satToast(L('Wind data unavailable','風データを取得できませんでした','Winddaten nicht verfügbar','Данные о ветре недоступны','Datos de viento no disponibles')); }catch(_){} }
          return null; }
        failN=0; if(retryT){ clearTimeout(retryT); retryT=0; }
        stillAt=Date.now();   /* (#R305) the reader's quiet window starts when they can SEE it */
        /* ══ ⚠⚠⚠ (#R298) A READ THAT WAS OVERTAKEN MUST NOT ERASE THE PARTICLES ═══════════════
           `EC().load` resolving with a frame does not mean THIS hour is the frame in hand: a
           superseded read is deliberately not kept (js/wx-ecmwf.js), so `sampler()` — which builds
           the key for the CURRENT index — can answer null on the very next line. That null went
           straight into `setField`, and the renderer reads null as 「draw nothing」 (js/wx-wind.js
           `tick` returns 0 before it touches a particle), so every streak on the map disappeared
           until some later hour finished decoding. 「読み込み次第差し替える」 means the field that is
           flying stays flying until there is a new one to put in its place. */
        if(renderer){ const fresh=EC().sampler(VAR);
          if(fresh){ _lastField=fresh; _lastFieldAt=EC().validTime(); }   /* the hour travels with the field */
          const sf=fresh||_lastField;
          if(sf) renderer.setField(sf);
          /* ══ ⚠⚠ (#R290) THE PREVIOUS HOUR DOES NOT SURVIVE INTO THE NEW ONE ═════════════════
             「時刻を変えたときに、前の時刻のパーティクルの残像がしばらくの間残るのをやめろ。」
             #R284 deliberately keeps the old hour animating while the new one downloads, so the
             map never goes blank — that part is right and stays. What it did not do is END the old
             hour when the new one arrived: every live particle was mid-flight on the OLD field and
             kept its position and its accumulated streak, so the picture the reader ended up with
             was the new hour's colours with the previous hour's trails drawn through them. On a
             step, the moment the new frame is in hand the particles are re-seeded and the trail
             texture is dropped — one frame, and everything on screen belongs to the hour on the
             label. (Not on the FIRST load: there is no previous hour to leave behind.) */
          if(opt&&opt.step){ try{ renderer.reseed(); }catch(_){} } }
        try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){}
        /* ⚠ (#R276 追記) THE NEXT HOUR IS WARMED ON A TIME CHANGE, NOT ON THE FIRST LOAD. 「時刻変更時
           は隣接フレームを先読みし」 is the instruction, and it is also the cheaper reading: warming a
           frame costs the same ranged reads as the one on screen, so doing it for a reader who has not
           touched the player spends their bandwidth on a picture they may never ask for — and it
           competes with the picture they DID ask for. `opt.step` is true only when the axis moved. */
        /* (#R290 追記2) …for the SAME band this layer reads. Warming the planet in front of a step
           that needs one band is how the wait got worse rather than better — see wx-ecmwf. */
        /* (#R298) …and behind the colour, for the reason in the note on `afterFieldShown`: this one
           points the shared reader at ANOTHER FILE, so started early it does not merely queue in
           front of the tiles, it takes the reader away from them. */
        /* ══ ⚠⚠⚠ (#R305) …AND 「the SAME band this layer reads」 IS NOT `band()` ═══════════════════
           #R290 追記2 already wrote the rule — 「Warming the planet in front of a step that needs one
           band is how the wait got worse rather than better」 — and then used `band()` to express it.
           `band()` is `bandFor`, which answers NULL (「the planet」) for any view spanning more than
           120° of latitude, i.e. for the view this app opens on. So at world zoom the warm-up asked
           for the whole planet, every step, while the read the reader was waiting for queued behind
           it. MEASURED before this line changed: **7,050 / 7,942 / 8,270 ms** per step at the
           opening view, against 45 ms for an hour already in hand.
           The band a step will ACTUALLY read is the one four lines above: a future hour has no frame
           at all, so `bandCovers` is false for it and the read is always `nearBand()`. Warming that
           is warming the bytes the next step will use, rather than seven times as many. */
        /* ══ ⚠⚠⚠ (#R310) WARMING THE BYTES LEFT THE OPEN, THE INDEX WALK AND THE DECODE TO THE STEP ═
           「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」(5回目)
           `prefetch` asks for exactly the right bytes for exactly the right hour and then keeps
           nothing but their presence in the block cache, so the step still paid ~2.1 s: MEASURED on
           the built page, three consecutive single steps at the opening view — **2,107 / 2,168 /
           2,204 ms**, against **45 ms** for an hour already decoded. And it could not be allowed to
           run early, because it went down the ONE reader in front of the picture on screen; it was
           deferred 2,500 ms, which a reader stepping every two seconds never reaches at all.
           → `readAhead` READS the hour (see js/wx-ecmwf.js): same bytes, same band, same direction,
           but the frame is decoded and held, so the step is a list lookup. It runs the moment the
           colour is on screen rather than 2,500 ms later, because with a reader per file it is no
           longer in front of anything, and a step that arrives while it is still running JOINS it.
           ⚠ STILL ONLY WHEN THE AXIS HAS MOVED (`opt.step`) — #R276 追記's rule, unchanged. */
        /* ══ ⚠⚠⚠ (#R314) IT WAS RELEASED BY THE COLOUR, AND THE COLOUR IS THE SLOW HALF ═══════════
           「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」(6回目)
           #R298 put every read this module starts on its own behind `afterFieldShown`, for one
           stated reason: 「this one points the shared reader at ANOTHER FILE, so started early it
           does not merely queue in front of the tiles, it takes the reader away from them.」
           #R310 then gave every file its own reader (`readerFor`, four of them) and pinned the
           singleton the TILES use, and wrote in its own note that 「with a reader per file it is no
           longer in front of anything」 — and left the gate standing anyway. THE GATE'S REASON HAS
           BEEN GONE FOR A ROUND: `load()` reads through `openReader(f).rd`, which is this file's
           own reader, and only falls back to `inst.omFileReader` when the pool refuses.
           MEASURED on the built page, opening view, one step, colour suppressed vs not:
               the particles' own field lands at      513 / 521 / 534 / 537 ms
               one colour tile (`omProtocol`) takes 1,266 / 1,381 / 1,772 ms
           so the release fired at ~1.4–1.9 s, +150 ms grace, and the read itself costs ~520 ms —
           the next hour was ready at about 2.1–2.6 s. A reader stepping every ~1.2 s never reached
           it, which is exactly the alternation the baseline shows:
               0 / 1,180 / 0 / 1,279 / 0 / 1,724 / 0 ms
           — every other step free, every other step paying the whole read.
           → it is released by the FIELD, which is the thing it is a read of. The read is still in
           the BACKGROUND lane (`serial(fn,true)`), so it still cannot get in front of anything the
           reader asks for; what changes is only that it stops waiting for a picture it does not
           depend on. ⚠ `widen` below stays behind the colour — a rung is a read of the SAME file
           the tiles are reading, so #R298's argument is still true of it. */
        if(opt&&opt.step){ try{ if(live()){ const n=EC().count(), nx=Math.max(0,Math.min(n-1,EC().index()+_stepDir));
          if(nx!==EC().index()) EC().readAhead(VAR,nx,nearBand()||band()).then(()=>afterFieldShown(()=>aheadMore(nx))); } }catch(_){} }
        /* (#R297) …and the rest of what is on screen, behind the picture that is already moving */
        setTimeout(widen,0);
        return f;
      }).catch(()=>{ loading=false; lastErr='load';
        try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){}
        return null; });
    }

    /* ── the renderer ─────────────────────────────────────────────────────────────────────────*/
    /* ══ ⚠⚠⚠ (#R302) 粒子1つが生まれ直すたびに、視野と帯を訊き直していた ═══════════════════════
       「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで爆速にしろ。」
       `randomLL` は寿命の尽きた粒子ごと・画面の外へ出た粒子ごとに呼ばれる。寿命は 1.2〜3.6 s で
       粒子は最大 6,000 なので、定常状態でも毎秒 2,500 回前後。その1回ごとに
       `GE().camera.getBounds()` と `EC().heldBand(VAR)` を訊いていて、後者は `stateKey()` を
       通る——つまり `Date.parse` が 2 回と `new URLSearchParams` が 2 回、粒子1つにつき。
       ⚠ どちらの答えも **1 フレームの中では変わらない**。カメラは 1 フレームに 1 回しか動かず、
       新しいフレームが `held` に入るのは promise の中＝`tick()` の外である。だから rAF の本体で
       1 回だけ捨て、そのフレームで最初に呼ばれたときに 1 回だけ訊く。撒き方・撒く範囲・
       やり直しの回数は 1 つも変えていない——同じ値を、同じ回数だけ読むのをやめただけ。
       ⚠ rAF の外から来る経路（`resize()` → js/wx-wind.js の `ensure()` → `spawn()`）でも
       壊れないよう、手元に無ければその場で訊く。次の rAF が捨てるので、1 フレームより長くは
       生きない。 */
    let _spawnCtx=null;
    function spawnCtx(){
      if(_spawnCtx) return _spawnCtx;
      let b=null; try{ b=GE().camera.getBounds(); }catch(_){}
      /* (#R297) …and inside the band that is actually loaded. While the first, narrow read is
         the only frame in hand (see `widen`), a particle spawned outside it samples NaN and is
         thrown away again on the next frame — so the band would look thin rather than full.
         The check is the field's own answer, which costs one grid lookup. */
      let hb=null; try{ hb=EC().heldBand(VAR); }catch(_){ hb=null; }
      _spawnCtx={b:b,hb:hb};
      return _spawnCtx;
    }
    function ensureRenderer(){
      if(renderer) return renderer;
      renderer=window.IntMapWindGL.create(cv,{
        perPixels:isMobile()?900:320,
        maxParts:isMobile()?2200:6000,
        project:(lng,lat)=>{ try{ return GE().coords.project([lng,lat]); }catch(_){ return null; } },
        visible:visibleLL,
        zoom:()=>{ try{ return GE().camera.getZoom(); }catch(_){ return 2; } },
        randomLL:()=>{
          /* (#R302) …both of them read once per FRAME rather than once per particle — see spawnCtx */
          const cx=spawnCtx(), b=cx.b, hb=cx.hb;
          for(let k=0;k<8;k++){
            let lo,la;
            if(b){ const w=b.getWest(),e=b.getEast(),s=Math.max(-89,b.getSouth()),n=Math.min(89,b.getNorth());
              lo=(e<w)?(w+(e+360-w)*Math.random()):(w+(e-w)*Math.random()); if(lo>180) lo-=360;
              la=s+(n-s)*Math.random(); }
            else { lo=Math.random()*360-180; la=Math.random()*178-89; }
            if(hb&&(la<hb[1]||la>hb[3])) continue;
            if(HOST.proj!=='globe'||visibleLL(lo,la)) return [lo,la];
          }
          return null;
        }
      });
      resize();
      return renderer;
    }
    function resize(){ const cont=document.getElementById('map-container'); if(!cont||!renderer) return;
      /* (#R302) a real size change re-seeds through `ensure()` → `spawn()`, from OUTSIDE the frame
         loop — so the frame's answers are dropped here rather than reused for a view that has just
         changed shape. Everything else about spawnCtx's window is unchanged. */
      _spawnCtx=null;
      renderer.resize(cont.clientWidth,cont.clientHeight,Math.min(2,window.devicePixelRatio||1)); }

    function step(ts){
      if(!live()) return;
      refreshView();
      _spawnCtx=null;                            /* (#R302) the view and the band are asked once a frame */
      try{ renderer&&renderer.tick(ts||performance.now(),moving); }catch(_){}
      raf=requestAnimationFrame(step);
    }

    function start(){
      on=true;
      setOpacity(opacity);
      /* (#R299) switching the layer on starts the quiet window the widening staircase waits for,
         and retires any rung left owed by a previous session of this layer */
      stir(true);
      load();
      _applyParts();   /* (#R313) the canvas and the frame loop follow the particle switch */
      try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){}
    }
    /* the ONE place that decides whether streaks are being drawn — `streaksWanted()` above is the
       whole condition. Called from start(), stop(), setParts() and setSolo(). */
    function _applyParts(){
      if(streaksWanted()){ ensureRenderer(); cv.style.display='block'; setOpacity(opacity);
        cancelAnimationFrame(raf); raf=requestAnimationFrame(step); }
      else { cancelAnimationFrame(raf); raf=0;
        /* the trails are pixels already on the canvas — hiding it is not enough, they would be
           there again the moment it is shown (#R284's blink, from the other direction) */
        if(renderer){ try{ renderer.clearTrails(); }catch(_){} }
        cv.style.display='none'; }
    }
    function partsAreOn(){ return partsOn; }
    function setParts(v){ partsOn=!!v;
      try{ localStorage.setItem(PARTS_KEY,partsOn?'1':'0'); }catch(_){}
      _applyParts();
      /* the legend body is rebuilt whole on every render (see _renderWindLegendBody), so the
         switch inside it re-reads this state rather than holding its own copy — which is what
         lets Atlas and the legend disagree about nothing. */
      try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){}
    }
    function stop(){
      on=false;
      removeField();                       /* the colour raster goes, always */
      /* ⚠ (#R337) THE STREAKS MAY STILL BE WANTED BY ANOTHER LAYER. `_applyParts` is the one place
         that decides whether they are drawn, and the teardown below only runs when NOTHING wants
         the field any more — otherwise switching the wind layer off would silently stop an overlay
         the reader turned on in a different legend. */
      _applyParts();
      if(!soloOn) _quiesce();
      try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){}
    }
    /* everything this module has in flight, given up: the retry ladder, the widening staircase, the
       trails, the canvas and this module's claim on the shared frame. Reached when the LAST thing
       that wanted the field lets go of it — the layer switching off with no overlay asking for the
       streaks, or the overlay letting go while the layer is already off. */
    function _quiesce(){
      cancelAnimationFrame(raf); raf=0;
      /* (#R298) a switched-off layer is not still trying, and it is not still widening either — the
         deferred wide read is dropped with the waiters below, so its flag has to come down with it
         or the next `start()` would find `widening` true for ever and never read the full band */
      clearTimeout(retryT); retryT=0; failN=0; loading=false; widening=false;
      /* (#R299) …and no rung of the widening staircase is still scheduled or still owed */
      clearTimeout(widenT); widenT=0; wideGen++;
      if(renderer){ renderer.clearTrails(); }
      cv.style.display='none';
      try{ EC()&&EC().release(VAR); }catch(_){}   /* only OUR frame — see IntMapECMWF.release */
    }
    /* ⚠ (#R337) 「something other than this layer wants the streaks」. The caller pushes the
       EFFECTIVE answer (its own box AND its own layer being on); this module does not read another
       layer's state, it is told. Idempotent — the same value twice does nothing. */
    function soloAreOn(){ return soloOn; }
    function setSolo(v){ v=!!v; if(v===soloOn) return;
      soloOn=v;
      _applyParts();
      if(soloOn){ if(!on){ stir(true); load(); } }   /* nothing was reading the field — start */
      else if(!on) _quiesce();
      try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){}
    }

    /* the forecast axis is shared with every ECMWF raster: a step there moves the wind too */
    /* ══ ⚠⚠⚠ (#R284) THE PARTICLES ARE NOT BLANKED WHILE THE NEXT HOUR LOADS ═══════════════
       「点滅してしまうバグが発生する。」 — this handler opened with `renderer.setField(null)`, which stops every
       particle dead, and the slider fired it on EVERY PIXEL of a drag. So the animation went out
       and came back forty times in one gesture: that is the blink, and it was not a rendering bug
       at all but an instruction to erase, repeated.
       The field a particle reads is a CLOSURE over the frame it was made from (`sampler()` captures
       `held.grid` / `held.data`), so the old hour keeps animating correctly until the new one lands
       and replaces it — the same 「never show nothing」 rule the colour raster's two slots follow.
       ⚠ `index` is the cheap event (#R284): the legend's own clock follows the finger; only the
       settled `time` costs a download. */
    function touchWindTime(){ try{ const E=EC(); if(!E) return;
      const v=document.getElementById('wind-validtime'); const vt=E.validTime();
      if(v&&vt) v.textContent=L('valid','有効時刻','gültig','действ.','válido')+' '+E.fmt(vt)+' · '+relTxt(vt);
      const sl=document.getElementById('wind-time'); if(sl&&document.activeElement!==sl) sl.value=String(E.index());
    }catch(_){} }
    /* (#R290) the layer name is 「風」 — see the note in js/data-layers.js where the row is built */
    try{ (window.IntMapECMWF||{on:()=>{}}).on(ev=>{
      /* (#R299) `index` is the EARLIEST word that a new hour is being asked for — it fires under
         the finger, `time` only once the axis has settled, and `meta` when a new model run re-bases
         the axis under both. All three restart the widening staircase, so a rung aimed at the hour
         the reader is leaving never starts — see the note on `widen`. */
      if(ev.type==='index'||ev.type==='time'||ev.type==='meta') stir(true);
      /* (#R305) the direction of travel, from the axis itself — see `_stepDir` */
      if(ev.type==='index'||ev.type==='time'){ try{ const i=EC().index();
        /* (#R314) …and how many of those in a row went the SAME way, which is the evidence
           `aheadMore` asks for. It is counted BEFORE `_stepDir` is updated on the next line,
           because 「the same direction」 means the one the PREVIOUS step went in. */
        if(_lastIdx>=0&&i!==_lastIdx){ const d=(i>_lastIdx)?1:-1;
          _runN=(d===_stepDir&&(Date.now()-_runAt)<TRAVEL_MS)?_runN+1:1; _runAt=Date.now(); }
        if(_lastIdx>=0&&i!==_lastIdx) _stepDir=(i>_lastIdx)?1:-1;
        _lastIdx=i; }catch(_){} }
      if(ev.type==='index'){ touchWindTime(); return; }
      try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){}
      if(!live()) return;   /* (#R337) the streaks follow the axis even when only they are up */
      if(ev.type==='time'||ev.type==='meta'){ load({step:ev.type==='time'}); } }); }catch(_){}
    /* the forecast axis exists without the tile SDK — fetch it so the legend can name the run and
       the hour the moment the layer is switched on, rather than after a 340 kB script lands */
    try{ (window.IntMapECMWF||{meta:()=>Promise.resolve()}).meta().then(()=>{ try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){} }).catch(()=>{}); }catch(_){}

    /* ══ ⚠⚠⚠ (#R314) THE POINTER ARRIVING ON THE ROW IS THE EARLIEST HONEST SIGNAL ════════════════
       MEASURED (see the note on `IntMapECMWF.warm`): 1.36 s of a 3.65 s cold switch-on is spent
       before a single byte of forecast data is asked for — the 340 kB SDK, the first wasm
       instantiation and the open of the file the axis is already sitting on. None of it depends on
       the click, and all of it can be done while the reader is still moving the pointer towards the
       checkbox. `warm()` is idempotent and answers false once it has run, so the listeners take
       themselves off after the first weather row anyone points at.
       ⚠ IT IS THE ROW, NOT THE PANEL. A reader scrolling past 「地形」 has not said anything about
       the weather; a pointer that has come to rest on 「風」 has. The rows are matched by the id of
       their own checkbox (`dl-wind`, `dl-ec-…`), which is 「THE PUBLIC NAME OF A LAYER IS ITS ROW
       ID」 — the rule js/weather.js already states where the ECMWF rows are mounted.
       ⚠ `focusin` IS NOT DECORATION: a reader tabbing to the checkbox never fires `pointerover`,
       and on a touch screen `pointerover` arrives with the tap — a few hundred milliseconds before
       `change`, which is still the SDK's script request leaving that much earlier. */
    try{
      const WXROW=/^dl-(wind|ec-)/;
      function _wxWarmOff(){ ['pointerover','focusin'].forEach(n=>{ try{ document.removeEventListener(n,_wxWarmSniff,true); }catch(_){} }); }
      function _wxWarmSniff(e){
        const t=e&&e.target; if(!t||!t.closest) return;
        const row=t.closest('.lyr-row'); if(!row) return;
        const inp=row.querySelector('input[id^="dl-"]'); if(!inp||!WXROW.test(inp.id)) return;
        try{ if(EC()&&EC().warm&&EC().warm()) _wxWarmOff(); }catch(_){}
      }
      ['pointerover','focusin'].forEach(n=>{ try{ document.addEventListener(n,_wxWarmSniff,true); }catch(_){} });
    }catch(_){}

    window.addEventListener('resize',()=>{ if(live()) resize(); });
    if(GE().hasRenderer()){
      /* (#R299) a map that is moving is not 「still」, and the staircase waits for still — see widen */
      GE().events.on('movestart',()=>{ moving=true; stir(false); });
      GE().events.on('moveend',()=>{ moving=false; stir(false); if(on){ resize();
        /* the view left the band that was read — the particles would sample NaN there, so read the
           new one. `bandCovers` is what stops this firing on every small pan. */
        try{ if(!EC().bandCovers(EC().heldBand(VAR),band())) load(); }catch(_){}
      } });
      /* a style swap drops custom sources — put the field back rather than leaving only streaks */
      GE().events.on('styledata',()=>{ if(!on) return; setTimeout(()=>{ if(on&&!GE().layers.has(SLOT[0].lyr)&&!GE().layers.has(SLOT[1].lyr)){ liveKey=''; shownSlot=-1; load(); } },120); });
      /* …and if the data is already here but the layer is not, put it back rather than waiting for a
         style event that may never come (the #R85 defect above, seen from the other side) */
      GE().events.on('idle',()=>{ if(!on) return;
        try{ if(GE().layers.has(SLOT[0].lyr)||GE().layers.has(SLOT[1].lyr)) return; }catch(_){ return; }
        /* (#R298) …and neither slot is on screen, whatever the last reveal thought */
        const key=EC()&&EC().stateKey(VAR,''); if(key){ liveKey=''; shownSlot=-1; ensureField(key); } });
      /* js/night-side.js re-adds its terminator on a timer and lands above whatever is there, so the
         field re-asserts its place whenever the style settles rather than only when it is created */
      GE().events.on('idle',()=>{ if(!on) return; SLOT.forEach(s=>{ try{ EC().lift(s.lyr); }catch(_){} }); });
    }

    /* ══ THE WIND LEGEND, WHICH NOW NAMES ITS OWN MODEL ═════════════════════════════════════════
       「「Open-Meteo GFS」という誤表示を修正する。」 The line under this ramp said Open-Meteo GFS for
       eleven rounds. The field was never GFS: Open-Meteo's forecast endpoint with no `models=`
       parameter is the BEST-MATCH blend, and since this round the wind is not that endpoint at all —
       it is ECMWF IFS HRES at ≈9 km. The name, the run hour and the valid hour are read from the
       model, so they cannot be wrong about it again.

       The ramp is the SDK's own wind colour table, so 「凡例の最大値と実際のLUTも一致させる」 holds by
       construction: if Open-Meteo re-scales the ramp, this legend re-scales with it. Ticks are in the
       reader's chosen wind unit.

       ⚠ The player here and the one in the ECMWF legend are TWO VIEWS OF ONE STATE, not two clocks —
       both call IntMapECMWF, and both re-render from its change event. Their control ids differ
       (`wind-time` / `ec-time`) because the duplicate-id pair this round removed is exactly what a
       second copy of the same markup produces. */
    function relTxt(iso){
      try{ const dh=Math.round((Date.parse(/[zZ]$/.test(iso)?iso:iso+'Z')-Date.now())/3600000);
        if(dh===0) return L('now','現在','jetzt','сейчас','ahora');
        return (dh>0?'+':'')+dh+' '+L('h','時間','h','ч','h'); }catch(_){ return ''; }
    }
    window._renderWindLegendBody=function(body){
      const E=EC();
      const dark=(document.documentElement.getAttribute('data-theme')||'')!=='light';
      const lg=E&&E.legend(VAR,dark);
      const f=(()=>{ try{ return window.windUnitFactor(); }catch(_){ return 1; } })();
      const ul=(()=>{ try{ return window.windUnitLabel(); }catch(_){ return 'm/s'; } })();
      let bar='';
      if(lg){
        /* (#R297) the key reads to 30 m/s — see IntMapECMWF.legend. `capped` is true when the ramp
           continues past the last tick, and the 「+」 is what says so. */
        const ticks=[0,0.25,0.5,0.75,1].map(k=>({pos:k*100,txt:Math.round((lg.min+(lg.max-lg.min)*k)*f)+((k===1&&lg.capped)?'+':'')}));
        bar='<div class="ecl-bar" style="background:'+lg.css+';"></div>'
          +'<div class="ecl-ticks">'+ticks.map(k=>'<span style="left:'+k.pos.toFixed(1)+'%">'+k.txt+'</span>').join('')+'</div>';
      }
      /* ⚠ (#R313) the particle switch, in the legend — not in the Layers panel. #R16's rule is that
         a control that belongs to ONE layer lives in that layer's legend (see docs/MAP-LAYERS.md
         §7.10); the Layers panel stays a list of layers. Same shape as the 「At real altitude」 box
         the planes legend carries. `checked` is read from the module state on every render because
         this whole body is replaced by innerHTML below — the box never holds the answer itself. */
      const parts='<label class="kl-period wind-parts-row" style="margin:7px 0 2px;cursor:pointer;">'
        +'<input type="checkbox" id="wind-parts-sw"'+(partsOn?' checked':'')+' style="accent-color:var(--primary-color);margin:0;cursor:pointer;">'
        +'<span style="font-size:11px;color:var(--text-muted);">'+L('Particles','パーティクル','Partikel','Частицы','Partículas')+'</span></label>';
      const units='<div class="kl-period" style="margin:7px 0 2px;"><label>'+L('Units','単位','Einheiten','Единицы','Unidades')+'</label>'
        +'<select id="wind-unit-sel">'+(window.WIND_UNITS||[]).map(u=>'<option value="'+u[0]+'"'+(u[0]===window.windUnit?' selected':'')+'>'+u[1]+'</option>').join('')+'</select></div>';
      const vt=E?E.validTime():'', ref=E?E.referenceTime():'';
      /* (#R290) the layer's own discrete clock — window.IntMapWxPlayer.timeUI, the one declaration */
      const player=window.IntMapWxPlayer.timeUI('wind-time',E,L);
      const model='<div class="ecl-model">'+(E?E.MODEL:'ECMWF IFS HRES')+' · '+(E?E.RESOLUTION_KM:9)+' km · '+ul
        +(ref?(' · '+L('run','初期時刻','Lauf','прогон','pasada')+' '+E.fmt(ref,{hour:'2-digit',minute:'2-digit',month:'short',day:'numeric',timeZone:'UTC'})+' UTC'):'')+'</div>';
      const valid='<div id="wind-validtime" class="dl-hint">'+(vt
        ? (L('valid','有効時刻','gültig','действ.','válido')+' '+E.fmt(vt)+' · '+relTxt(vt))
        : (loading?L('Loading the wind model…','風モデルを読み込み中…','Windmodell wird geladen…','Загрузка модели ветра…','Cargando el modelo de viento…')
                  :L('Wind data unavailable','風データを取得できませんでした','Winddaten nicht verfügbar','Данные о ветре недоступны','Datos de viento no disponibles')))+'</div>';
      body.innerHTML=bar+units+parts+player+model+valid;
      const psw=body.querySelector('#wind-parts-sw');
      if(psw) psw.onchange=()=>{ setParts(psw.checked); };   /* (#R313) the switch reports; the module decides */
      const sel=body.querySelector('#wind-unit-sel');
      if(sel) sel.onchange=()=>{ window.windUnit=sel.value; try{ localStorage.setItem('intmap_wind_unit',window.windUnit); }catch(_){}
        try{ window.dispatchEvent(new Event('intmap-units')); }catch(_){}
        window._updateWindLegend(); try{ window.renderCoordReadout&&window.renderCoordReadout(); }catch(_){} };
      window.IntMapWxPlayer.wireTimeUI(body,'wind-time',E);
      try{ window._tileLegends&&window._tileLegends(); }catch(_){}
    };
    window.addEventListener('intmap-units',()=>{ try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){} });
    window.addEventListener('intmap-lang',()=>{ try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){} });

    /* ══ ⚠⚠⚠ (#R322) THE ONE THING `stop()` DELIBERATELY KEEPS, AND NOBODY EVER GAVE BACK ═══════
       `stop()` leaves `renderer` alive on purpose — it holds two textures, two framebuffers, two
       vertex buffers and two shader programs, and re-creating them would make every toggle of the
       wind layer cost a WebGL rebuild. That is the right trade for SUSPEND. It is not the right
       trade for ever: js/wx-wind.js has had a `dispose()` since #R276 that deletes exactly those
       objects, and MEASURED this round, nothing in the repository ever called it — the whole of
       js/weather.js does not contain the word. Switch the wind on once and the GL objects live as
       long as the tab.

       So the capability names the three states the runtime already has verbs for (js/runtime.js):
         activate  start()                       — the layer is on
         suspend   stop()                        — off, and the renderer is KEPT for a fast return
         dispose   stop() + renderer.dispose()   — the GPU objects go back
       `toggle()` is unchanged for every existing caller; it now goes through the register, so the
       runtime — not this closure — is what knows whether the wind is running. */
    function disposeWind(){
      stop();
      /* ⚠ (#R337) …unless the streaks are still on screen for another layer. `stop()` has already
         given the colour raster back; these GL objects are still being drawn with. */
      if(soloOn) return;
      if(renderer){ try{ renderer.dispose(); }catch(_){} renderer=null; }
      /* the canvas keeps its backing store until something else needs it; 1×1 releases it now */
      try{ cv.width=1; cv.height=1; }catch(_){}
    }
    try{
      const RT=window.IntMapRuntime;
      if(RT&&RT.define) RT.define('wx.wind',{ activate:()=>start(), suspend:()=>stop(), dispose:disposeWind });
    }catch(_){}

    return {
      /* ⚠ the register is the owner when it is there; the direct call is the fallback for a host
         that has no runtime (the compare pane builds one of these before app-body publishes it). */
      toggle(v){ const RT=window.IntMapRuntime;
        if(RT&&RT.stateOf&&RT.stateOf('wx.wind')!==null){ v?RT.activate('wx.wind'):RT.suspend('wx.wind'); return; }
        v?start():stop(); },
      on:()=>on, stop, dispose:disposeWind, refetch:load, setOpacity,
      /* (#R313) the streaks alone. `on()` is still the LAYER; these two are the animation inside it,
         and they are the only door — the legend switch, Atlas and the tests all come through here. */
      particles:partsAreOn, setParticles:setParts,
      /* (#R337) 「気温レイヤーでも、風レイヤーのパーティクルをオンオフできるトグルを付けて。」 the
         streaks WITHOUT this layer's colour raster, for a legend that is not this layer's. Same
         shape as the pair above: one reader, one writer, and no second copy of the state. */
      solo:soloAreOn, setSolo,
      /* (#R298) the colour slot's own signal, published because the ECMWF rasters share ONE reader
         with this layer and their cursor warm-up has to queue behind the same picture — see the
         note on `afterFieldShown` above and `warmReadout` in the weatherEC module */
      afterFieldShown,
      /* ══ ⚠⚠ (#R293) THE NUMBER SURVIVES A TIME STEP, AND IT SAYS WHICH HOUR IT IS FROM ═══════
         「変えてから読み込まれるまでいったん地図が何もなくなるのを辞めろ。読み込み次第差し替える
           形式にしろ。」 MEASURED across one step on the built app, polling every 150 ms for 12 s:
         the COLOUR FIELD never goes away (#R284's two slots, 0 of 60 samples blank) and the
         PARTICLES do not either (each one reads a closure over the frame it was made from). What
         did go away was this: `sampler()` builds the key for the CURRENT index and answers null
         until that hour is decoded — 15 of 80 samples, 0 → 2,144 ms — so the readout blanked while
         the picture under it kept moving.
         → the last field that answered is kept, and used while the new hour is still downloading.
         ⚠ IT CARRIES ITS OWN HOUR. `time` is the validTime of the frame the number came OUT OF,
         not whatever the axis has moved to — a value labelled with an hour it was not measured in
         is #R269's defect in miniature, and this is the one place that could produce it. */
      sampleAt:(lng,lat)=>{ const E=window.IntMapECMWF; if(!E) return null;
        const live=E.sampler(VAR);
        const s=live||_lastField; if(!s) return null;
        const at=live?E.validTime():_lastFieldAt;
        const uv=[0,0]; s.uv(lat,lng,uv);
        if(!(uv[0]===uv[0])) return null;
        return { speed:Math.hypot(uv[0],uv[1]), dir:(Math.atan2(-uv[0],-uv[1])/R+360)%360, time:at }; },
      dataTime:()=>{ try{ return window.IntMapECMWF.validTime(); }catch(_){ return null; } },
      model:()=>{ const E=window.IntMapECMWF; if(!E) return null;
        return { name:E.MODEL, resolutionKm:E.RESOLUTION_KM, referenceTime:E.referenceTime(), validTime:E.validTime(), variable:VAR }; },
      loading:()=>loading,
      /* (#R298) the colour slot the READER is looking at, which is what every probe of this asks —
         `shownSlot` is −1 only while the first one has yet to be uncovered, and then the slot being
         built is the honest answer */
      _dbg:()=>{ let hasLyr=false,op=null; const s=SLOT[shownSlot>=0?shownSlot:slot];
        try{ hasLyr=!!GE().layers.has(s.lyr); if(hasLyr) op=GE().layers.getPaint(s.lyr,'raster-opacity'); }catch(_){}
        const smp=window.IntMapECMWF&&window.IntMapECMWF.sampler(VAR);
        const st=renderer?renderer.stats():{};
        return Object.assign({ on, particles:partsOn, hasField:!!smp, hasLyr, rasterOpacity:op, loading, lastErr,
          model:(window.IntMapECMWF||{}).MODEL, validTime:(window.IntMapECMWF?window.IntMapECMWF.validTime():''),
          referenceTime:(window.IntMapECMWF?window.IntMapECMWF.referenceTime():''),
          styleLoaded:(()=>{try{return GE().ready();}catch(_){return null;}})() }, st); }
    };
  })();
};

window.IntMapModules.weatherEC=function(HOST){
 const GE=()=>window.IntMapGeoEngine;
  const IC=window.IntMapWxPlayer.IC, _b=window.IntMapWxPlayer.b;   /* (#R284) …the same declaration */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  const satToast=HOST.satToast, t=HOST.t;
  window.IntMapWeatherEC=(function(){
    if(!GE().hasRenderer()) return { open(){}, toggle(){} };
    const L=window.IntMapLang.pick(()=>HOST.lang);
    const LA=window.IntMapLang.pickArgs();
    /* ══ ⚠⚠⚠ (#R356) WHICH MODEL A LAYER READS IS THE LAYER'S OWN ANSWER ═══════════════════════
       `EC()` used to be `window.IntMapECMWF` and there was nothing else it could be. It is now
       「the instance THIS layer is reading」, because 「モデル選択はレイヤーごとに保持」: a reader
       comparing GFS precipitation against ECMWF pressure has two layers on two models, and one
       shared accessor would have made that impossible to express.
       ⚠ THE ARGUMENT IS THE LAYER, NOT THE MODEL ID. Passing the id would let a caller ask for a
       model this layer is not on, which is precisely the state the legend must never be able to
       describe. Called with nothing it is the default model, which is what the module-wide
       operations (metadata, the share hook) legitimately mean.
       ⚠ AND IT FALLS BACK TO `window.IntMapECMWF`, NOT TO null: js/wx-engine's registry is eager,
       but if it were ever missing the layer must still draw the model it drew before. */
    const WXM=()=>window.IntMapWxModels;
    const ENG=()=>window.IntMapWxEngine;
    const EC=(cfg)=>{
      try{
        const id=cfg&&state[cfg.id]&&state[cfg.id].model;
        const e=ENG()&&ENG().model(id||null);
        if(e) return e;
      }catch(_){}
      return window.IntMapECMWF;
    };
    /* the models a reader may pick for a SURFACE field, in the registry's own order */
    const MODEL_CHOICES=()=>{ try{ return WXM().all().filter(m=>m.map&&m.roles.indexOf('surface')>=0); }catch(_){ return []; } };
    /* ⚠ EVERY VARIABLE HERE IS ONE THE FEED ACTUALLY PUBLISHES, and `mountRows` re-checks that
       against the live `latest.json` before building a row. `sea_surface_temperature` was in this
       table until #R276 and is NOT in the feed's 35-name variable list, so that layer asked the
       reader for a child that does not exist and drew nothing at all, silently, for nine rounds.
       Ocean temperature is still on the map — it is the GHRSST MUR layer in js/data-layers.js,
       which is an observation rather than a model field. `wind_gusts_10m` takes the freed row. */
    const LAYERS=[
      /* ══ ⚠⚠⚠ (#R288) ONE TEMPERATURE LAYER, TWO SOURCES ═══════════════════════════════════════
         「名前は単に気温に。気温（2m・再解析）レイヤーも統合し、一つのレイヤー、同じ色分け、
           グラフィックに。ソースだけ切り替えられる仕様に。」
         There were two rows for air temperature — this one and js/data-layers.js's GIBS MERRA-2
         raster — with two legends, two date controls and two colour schemes for one quantity. They
         are one row now.
         ⚠⚠ (#R293) 「気温レイヤーで、MERRA-2 再解析は削除。」 THE SECOND SOURCE IS GONE, and so is
         everything that only existed to serve it: the source picker, the month clock the master
         clock wrote into it, and js/wx-reanalysis.js itself (measured: no other caller). An
         unreachable branch that still looks like a feature is what CONSTITUTION forbids, so it is
         removed rather than left switched off. This layer is the ECMWF IFS field and nothing else. */
      {id:'ec-temp',    variable:'temperature_2m',      type:'raster', op:1,    kind:'temp',
       label:LA('Temperature','気温','Temperatur','Температура','Temperatura'),
       desc:LA('Air temperature 2 m above the ground.','地上2mの気温。','Lufttemperatur 2 m über Grund.','Температура воздуха на высоте 2 м.','Temperatura del aire a 2 m del suelo.')},
      {id:'ec-precip',  variable:'precipitation',       type:'raster', op:1,    kind:'raw',
       label:LA('Precipitation (forecast)','降水量（予報）','Niederschlag (Vorhersage)','Осадки (прогноз)','Precipitación (pronóstico)'),
       desc:LA('Total precipitation forecast for the hour ending at the valid time.','有効時刻までの1時間降水量の予測。','Niederschlagsmenge der Stunde bis zur Gültigkeitszeit.','Осадки за час до указанного времени.','Precipitación de la hora que termina en la hora de validez.')},
      {id:'ec-wind',    variable:'wind_u_component_10m',type:'arrows', op:0.85, kind:'wind',
       label:LA('Wind 10 m arrows','風 10m 矢羽根','Wind 10 m, Pfeile','Ветер 10 м, стрелки','Viento 10 m, flechas'),
       desc:LA('Wind direction arrows at 10 m, coloured by speed.','高度10mの風向を矢印で、速さで色分け。','Windrichtung in 10 m, nach Geschwindigkeit eingefärbt.','Направление ветра на 10 м, цвет по скорости.','Dirección del viento a 10 m, coloreada por velocidad.')},
      {id:'ec-gust',    variable:'wind_gusts_10m',      type:'raster', op:1,    kind:'wind',
       label:LA('Wind gusts','最大瞬間風速','Windböen','Порывы ветра','Rachas de viento'),
       desc:LA('Strongest gust expected in the hour ending at the valid time.','有効時刻までの1時間に予想される最大瞬間風速。','Stärkste erwartete Bö in der Stunde bis zur Gültigkeitszeit.','Максимальный ожидаемый порыв за час.','Racha máxima prevista en la hora indicada.')},
      {id:'ec-cloud',   variable:'cloud_cover',         type:'raster', op:1,    kind:'raw',
       label:LA('Cloud cover','雲量','Bewölkung','Облачность','Nubosidad'),
       desc:LA('Fraction of the sky covered by cloud.','空に占める雲の割合。','Anteil des von Wolken bedeckten Himmels.','Доля неба, закрытая облаками.','Fracción del cielo cubierta por nubes.')},
      {id:'ec-dew',     variable:'dew_point_2m',        type:'raster', op:1,    kind:'temp',
       label:LA('Dew point / humidity','露点・湿度','Taupunkt / Feuchte','Точка росы / влажность','Punto de rocío / humedad'),
       desc:LA('Temperature at which the air would saturate — the moisture field.','空気が飽和する温度＝水蒸気量の指標。','Temperatur, bei der die Luft sättigt — das Feuchtefeld.','Температура насыщения воздуха — поле влажности.','Temperatura de saturación del aire — el campo de humedad.')},
      /* ══ ⚠⚠⚠ (#R438) THE ISOBARS ARE A CONTROL ON THE PRESSURE LAYER, NOT A LAYER BESIDE IT ═════
         「等圧線レイヤーを取り込み、トグルでオンオフできるように。」 — 取り込み, and the standalone row
         goes with it (asked and answered: 「気圧に取り込み・独立行は廃止」).
         `sub` is the whole of it: this row still has a state entry, a model, an opacity, two map
         slots and a place in `activeLayers()`, so every mechanism — the two-slot swap, `applyTime`,
         `commit`, the share hook, `pruneMissing` — goes on working on it UNCHANGED. What `sub` takes
         away is the two things a reader sees: the Layers-panel row and the legend box. It is switched
         by a checkbox inside `ec-slp`'s legend, follows `ec-slp`'s model, and goes off with it.
         ⚠ THE STYLE-LAYER IDS ARE UNCHANGED (`ec-isobars-0`, `ec-isobars-1`, `…-lbl`). Nothing about
         the map or the tiles moves in this round; what moves is where the switch lives. */
      {id:'ec-isobars', variable:'pressure_msl',        type:'isobars',op:0.9,  kind:'raw', sub:'ec-slp',
       label:LA('Isobars','等圧線','Isobaren','Изобары','Isobaras'),
       desc:LA('Lines of equal sea-level pressure, labelled in hPa.','海面気圧が等しい線。数値は hPa。','Linien gleichen Luftdrucks, in hPa beschriftet.','Линии равного давления, подписи в гПа.','Líneas de igual presión al nivel del mar, en hPa.')},
      {id:'ec-slp',     variable:'pressure_msl',        type:'raster', op:1,    kind:'raw',
       label:LA('Sea-level pressure','海面気圧','Luftdruck (Meereshöhe)','Давление на уровне моря','Presión al nivel del mar'),
       desc:LA('Air pressure reduced to sea level — highs, lows and the storm centre.','海面更正気圧。高気圧・低気圧・台風の中心。','Auf Meereshöhe reduzierter Luftdruck — Hoch, Tief, Sturmzentrum.','Давление, приведённое к уровню моря.','Presión reducida al nivel del mar — altas, bajas y el centro de la tormenta.')},
      {id:'ec-cape',    variable:'cape',                type:'raster', op:1,    kind:'raw',
       label:LA('CAPE instability','CAPE 不安定度','CAPE-Instabilität','Неустойчивость CAPE','Inestabilidad CAPE'),
       desc:LA('Convective available potential energy: how much lift a thunderstorm could draw on.','対流有効位置エネルギー。積乱雲が使える浮力の量。','Konvektiv verfügbare potentielle Energie — das Gewitterpotential.','Доступная конвективная энергия — потенциал гроз.','Energía potencial convectiva disponible: el combustible de las tormentas.')}
    ];
    const ecLbl=(l)=>L.arr(l.label);
    const ecDesc=(l)=>L.arr(l.desc);
    /* ══ ⚠⚠⚠ (#R356) THREE STATES, BECAUSE A LEGEND MUST DESCRIBE THE PICTURE ══════════════════
       「新しいGFSを読み込んでいる最中に、地図はECMWFのままなのに凡例だけGFSと表示する状態を作っては
        いけない。」 A single `state[id].model` cannot say that: the moment a reader picks GFS the
       field is still ECMWF, and every legend, model line, valid time and point value built from
       「what was asked for」 is a sentence about a picture that is not on the screen — for as long as
       the load takes, which is seconds on a cold hour.
         model      what the reader asked for      (the <select> shows this)
         loading    what is being built right now  (null when nothing is in flight)
         displayed  what is actually painted       (⚠ EVERYTHING THE READER IS TOLD COMES FROM HERE)
       `displayed` is written in ONE place — the reveal inside `applyTime`, the same moment the new
       slot's opacity goes up and the old slot is dropped — so the words and the pixels change in the
       same turn. Nothing else may assign it; see the note on `commit()`. */
    const state={};   /* id → {on, op, model, loading, displayed} */
    LAYERS.forEach(l=>state[l.id]={on:false, op:l.op,
      model:(function(){ try{ return WXM().defaultId(); }catch(_){ return 'ecmwf_ifs'; } })(),
      loading:null, displayed:null});
    let mounted=false, rowsMounted=false;

    /* what is on the screen for this layer, or null if nothing is. ⚠ Read this, never `state.model`,
       when building anything a reader will read. */
    function displayed(cfg){ return (state[cfg.id]&&state[cfg.id].displayed)||null; }
    /* the one writer. Called from the reveal, with the model and hour the slot was BUILT from —
       not the ones that are current by the time it fires, which a later change may already have
       moved on from (that is what `_seq` guards). */
    const waiters={};   /* layer id → [fn], drained by commit() — see whenCommitted */
    function commit(cfg,prov){ if(!state[cfg.id]) return; state[cfg.id].displayed=prov; state[cfg.id].loading=null;
      /* (#R376) a waiter that says 「not mine」 stays in the queue — see whenCommitted */
      const w=waiters[cfg.id];
      if(w&&w.length) w.slice().forEach(f=>{ let done=false; try{ done=f(prov); }catch(_){ done=true; }
        if(done){ const i=w.indexOf(f); if(i>=0) w.splice(i,1); } }); }
    /* ⚠⚠ (#R356) 「Atlasが操作したと言いながら、実際には別モデル・別時刻・別レイヤーが表示されている
       状態を許可しない。」 A caller that wants to REPORT the change has to wait for the picture, not
       for the request — so `setModel` resolves from here, at the same commit the legend reads.
       ⚠ It resolves with `null` on timeout rather than rejecting: 「まだ出ていない」 is an answer the
       caller must be able to state, and an exception would be reported as a failure of the ACTION
       when what actually happened is that a slow feed has not landed yet. */
    /* ⚠⚠⚠ (#R376) A WAITER MUST ONLY BE WOKEN BY THE COMMIT IT IS WAITING FOR. The first version
       resolved on the NEXT commit of any kind, and MEASURED in production that produced a false
       failure: switch to GFS while a switch to ICON is still in flight, and ICON's commit resolved
       GFS's waiter with ICON's provenance — so `setModel` compared `p.modelId !== 'ncep_gfs013'`
       and reported `not_painted_yet` about a switch that went on to succeed four seconds later.
       ⚠ The fix is NOT to drop the comparison. It is what stops a waiter accepting somebody else's
       picture; what was wrong is that a non-matching commit CONSUMED the waiter instead of being
       ignored by it. A waiter now stays in the queue until its own model lands, or it times out. */
    function whenCommitted(cfg,wantModelId,ms){
      return new Promise(res=>{
        const list=waiters[cfg.id]=waiters[cfg.id]||[];
        const f=(p)=>{
          if(wantModelId&&(!p||p.modelId!==wantModelId)) return false;   /* not mine — keep waiting */
          res(p||null); return true;
        };
        list.push(f);
        setTimeout(()=>{ const i=list.indexOf(f); if(i>=0){ list.splice(i,1); res(null); } },ms||15000);
      });
    }

    function omUrl(cfg,extra){ return EC(cfg).omUrl(cfg.variable,extra); }

    /* ══ ⚠⚠ (#R284) TWO SLOTS PER LAYER, SO A FORECAST STEP NEVER SHOWS AN EMPTY MAP ═══════════
       A time step used to `removeLayer()` and then add the same ids back against the new hour's
       file — and the interval between those two is a hole with nothing in it, for as long as the
       new tiles take to arrive. The animated wind field has alternated between two slots since
       #R276 for exactly this reason; the raster/contour layers were still doing the remove-first
       version, which is the other half of 「点滅してしまうバグが発生する」 whenever more than the wind
       is on. The new hour is built in the free slot at zero opacity and the old one is dropped only
       once the map has settled, so there is always a picture.
       ⚠ THE PUBLIC NAME OF A LAYER IS ITS ROW ID (`dl-ec-cape`), NOT ITS MapLibre id — checked
       before this was written: nothing outside this module names `ec-cape` as a style layer. */
    const slotIds=(cfg,s)=>[cfg.id+'-'+s, cfg.id+'-'+s+'-lbl'];
    const curIds=(cfg)=>slotIds(cfg,cfg._s|0);
    /* ══ ⚠⚠⚠ (#R398) THE ISOBAR TILE WAS NEVER ASKED FOR ISOBARS ═══════════════════════════════
       The SDK's vector protocol draws what the URL asks it to: `arrows=true` lays out wind arrows,
       `contours=true` traces the contours, and a url with NEITHER produces a tile that contains
       only the SDK's `grid` message. `ec-isobars` has always sent the bare url, so its two style
       layers — the line and its label — have been reading a `contours` source-layer that was never
       written. MEASURED on one file, one view, two sources side by side:

           …?variable=pressure_msl                     0 features
           …?variable=pressure_msl&contours=true      900 features, value "100500"

       i.e. 「等圧線」 has drawn NOTHING since the row existed, for a reason that has nothing to do
       with this round's unit defect — the layer was visible, its source loaded, its tiles fetched,
       and every one of them was empty. Both halves had to be true for a line to appear: the tile
       must be asked for contours, and the levels it is contoured at (the breakpoints of the ramp
       the renderer is given) must be in the field's own unit. The second is FIELD_UNITS.
       ⚠ `stateKey` keeps only the SDK's DATA_RELEVANT_PARAMS (`variable`), so this changes what is
       DRAWN and nothing about what is read or cached — the same note `omRasterUrl` carries. */
    /* ⚠⚠⚠ (#R438) …AND THE LEVELS IT CONTOURS AT ARE NOW SAID OUT LOUD. With no `intervals` the SDK
       contours at the BREAKPOINTS of the ramp it was given, and this round replaces the pressure
       ramp with Windy's — resampled to 0.1 hPa, which is 1,801 breakpoints. Left alone, the colour
       change would have asked the contourer for eighteen hundred lines over a field that spans
       eighty: the two are one decision. `isobarIntervals()` answers 4 hPa expressed in the file's
       own unit (js/wx-ecmwf.js ISOBAR_STEP_HPA × FIELD_UNITS.per), which is the interval a printed
       surface chart uses and the one the reference draws. */
    const _tileExtra=(cfg)=>cfg.type==='arrows'?'&arrows=true'
      :cfg.type==='isobars'?('&contours=true&intervals='+EC(cfg).isobarIntervals()):'';
    /* ⚠⚠ (#R398) THE ISOBAR LABEL IS THE CONTOUR LEVEL, AND THE LEVEL IS IN THE FILE'S UNIT.
       The SDK writes `properties.value` as the value it contoured at, and it contours at the
       breakpoints of the ramp it was given — which is the ramp in FIELD units (js/wx-ecmwf.js
       `FIELD_UNITS`). So a `pressure_msl` label would read 「101000」 unless it is divided by the
       same `per` the readout and the key are divided by. Asked for rather than written down: a
       literal 100 here would be a fourth copy of 「気圧は hPa」 and the first one to go stale.
       ⚠ A VARIABLE WITH NO ENTRY KEEPS THE EXPRESSION IT HAD — `['get','value']`, unchanged. */
    const _contourLabel=(cfg)=>{
      let fu=null; try{ fu=EC(cfg).fieldUnit&&EC(cfg).fieldUnit(cfg.variable); }catch(_){}
      return fu ? ['to-string',['round',['/',['to-number',['get','value'],0],fu.per]]] : ['get','value'];
    };
    function addSlot(cfg,s){
      const sid=cfg.id+'-'+s+'-src', lid=cfg.id+'-'+s, lbl=lid+'-lbl';
      const before=EC(cfg).before();
      /* ⚠⚠ (#R288) NO `om://` URL BEFORE THE PROTOCOL EXISTS. `state[id].on` is set synchronously
         by `toggle`, and the styledata/idle re-add hooks below fire off that flag — so a layer
         could be rebuilt while the 340 kB tile SDK was still downloading, handing MapLibre a
         scheme with no handler. It then fetches it natively, which is a CSP violation and never a
         tile. The retry ladders already re-call this, so refusing is the whole fix. */
      if(!EC(cfg).registerProtocol()) return false;
      const url=omUrl(cfg,_tileExtra(cfg));
      if(!url) return false;
      try{
        if(cfg.type==='isobars'){
          if(!GE().layers.hasSource(sid)) GE().layers.addSource(sid,{type:'vector',url:url});
          if(!GE().layers.has(lid)) GE().layers.add({id:lid,type:'line',source:sid,'source-layer':'contours',layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':'rgba(255,255,255,0.9)','line-width':1.1,'line-opacity':cfg.op}},before);
          /* ⚠⚠ (#R398) `point`, NOT `line`. 「等圧線…数値は hPa」 promises a labelled contour, and
             with `symbol-placement:'line'` MapLibre places NONE on these tiles — MEASURED on the
             live contour source, one view, four probes on the same features:
                 placement 'line'         0 labels        placement 'line-center'  0 labels
                 …with text-allow-overlap 0 labels        placement 'point'       25 labels
             and unchanged at tile_size 512 / 1024 / 2048, so it is not the MVT extent. The SDK
             emits each contour as many short parts (median 16 screen px at z3.4), and a part that
             short can never host text laid along it. `point` anchors one label per part and lets
             the collision grid thin them, which is how a printed isobar chart labels its lines
             anyway — upright, not bent along the curve. The 'line' variant was never observable
             before this round because the source carried no contours at all. */
          if(!GE().layers.has(lbl)) GE().layers.add({id:lbl,type:'symbol',source:sid,'source-layer':'contours',layout:{visibility:'none','symbol-placement':'point','text-field':_contourLabel(cfg),'text-font':['literal',['Noto Sans Regular']],'text-size':window.IntMapLabelScale.sub(0.82)},paint:{'text-color':'#fff','text-halo-color':'rgba(0,0,0,0.7)','text-halo-width':1.2}},before);
        } else if(cfg.type==='arrows'){
          if(!GE().layers.hasSource(sid)) GE().layers.addSource(sid,{type:'vector',url:url});
          if(!GE().layers.has(lid)) GE().layers.add({id:lid,type:'line',source:sid,'source-layer':'wind-arrows',layout:{visibility:'none','line-cap':'round'},paint:{'line-width':1.8,'line-opacity':cfg.op,'line-color':['interpolate',['linear'],['to-number',['get','value'],0],0,'#5b8ff9',6,'#36cfc9',12,'#73d13d',18,'#ffd666',26,'#ff7a45',36,'#cf1322']}},before);
        } else {
          /* ⚠ (#R356) `EC(cfg)`, NOT `EC()`. #R325 gave the raster sources their own url builder
             while this round gave each layer its own model, and the two met in this line: with the
             default instance here a layer set to GFS would have drawn its COLOUR from the ECMWF
             file while its legend, its point value and its particles read GFS. That is the one
             thing 「地図、粒子、凡例、地点値が同じ表示状態を参照」 forbids, and it survived the
             rebase silently because both halves are correct on their own. */
          if(!GE().layers.hasSource(sid)) GE().layers.addSource(sid,{type:'raster',url:EC(cfg).omRasterUrl(cfg.variable),maxzoom:12,tileSize:EC(cfg).TILE_PX});
          if(!GE().layers.has(lid)) GE().layers.add({id:lid,type:'raster',source:sid,layout:{visibility:'none'},paint:{'raster-opacity':cfg.op,'raster-opacity-transition':{duration:220},'raster-fade-duration':0}},before);
        }
        slotIds(cfg,s).forEach(l=>{ try{ EC(cfg).lift(l); }catch(_){} });
        return true;
      }catch(e){ try{ console.warn('ECMWF add fail',cfg.id,e); }catch(_){} return false; }
    }
    function dropSlot(cfg,s){ slotIds(cfg,s).forEach(l=>{ try{ if(GE().layers.has(l)) GE().layers.remove(l); }catch(_){} });
      try{ const sid=cfg.id+'-'+s+'-src'; if(GE().layers.hasSource(sid)) GE().layers.removeSource(sid); }catch(_){} }
    /* ══ ⚠⚠⚠ (#R438) THE CONTOURS GO ON TOP OF THE FIELD THEY ARE CONTOURS OF ═══════════════════
       Every ECMWF layer is placed at the SAME anchor (`IntMapECMWF.before()`), so between two of
       them the order is simply 「who was added last」 — and `lift` cannot fix it, because it declines
       to move anything that is already above the night shading (see its note).
       MEASURED on the built page with both on: `ec-isobars-0, ec-isobars-0-lbl, ec-slp-0`, i.e. the
       OPAQUE sea-level-pressure raster on top of 3,299 contour features that had been fetched,
       parsed and drawn. Nothing was broken in any way a source-shape check could see — the tiles
       were right, the levels were right, the labels were right, and not one line was visible.
       This is the #R398 shape from the other side, and only a screenshot found it.
       → after anything (re)builds a PARENT's slot, its live sub-layers are moved back on top, in
       their own order (line, then labels). It runs only when a sub-layer is actually on, so a
       reader with no contours up pays nothing. */
    function raiseSubs(parentId){
      try{ LAYERS.forEach(l=>{ if(!l.sub||(parentId&&l.sub!==parentId)) return;
        if(!(state[l.id]&&state[l.id].on)) return;
        curIds(l).forEach(id=>{ try{ EC(l).toTop(id); }catch(_){} }); }); }catch(_){}
    }
    function addLayer(cfg){ return addSlot(cfg,cfg._s|0); }
    function removeLayer(cfg){ dropSlot(cfg,0); dropSlot(cfg,1); }
    function setVisSlot(cfg,s,on){ slotIds(cfg,s).forEach(l=>{ try{ if(GE().layers.has(l)) GE().layers.setLayout(l,'visibility',on?'visible':'none'); }catch(_){} }); }
    function setVis(cfg,on){ setVisSlot(cfg,cfg._s|0,on); if(!on) setVisSlot(cfg,1-(cfg._s|0),false); }
    function setOpSlot(cfg,s,op){ const lid=cfg.id+'-'+s;
      try{ if(cfg.type==='isobars'||cfg.type==='arrows'){ if(GE().layers.has(lid)) GE().layers.setPaint(lid,'line-opacity',op); }
        else if(GE().layers.has(lid)) GE().layers.setPaint(lid,'raster-opacity',op); }catch(_){} }
    function setOp(cfg,op){ setOpSlot(cfg,cfg._s|0,op); }
    const liveLayer=(cfg)=>{ try{ return GE().layers.has(cfg.id+'-'+(cfg._s|0)); }catch(_){ return false; } };

    /* ══ ⚠⚠⚠ (#R337) THE WIND'S STREAKS, ASKED FOR FROM THE TEMPERATURE LEGEND ════════════════
       「気温レイヤーでも、風レイヤーのパーティクルをオンオフできるトグルを付けて。」
       This module owns the PREFERENCE; js/weather.js's wind module owns the streaks. What crosses
       between them is one effective boolean — 「this box is ticked AND the layer it belongs to is
       on」 — pushed through `Wind.setSolo`. Neither module reads the other's state, so there is no
       second copy of either answer to drift.
       ⚠ DEFAULT OFF. The streaks are drawn from the wind field, which is two more variables (u AND
       v) that a reader with only a temperature raster up has never downloaded. Nothing about this
       layer changes for a reader who does not touch the box; an absent key reads as off.
       ⚠ PUSHED FROM `syncLegend`, NOT FROM THE CHECKBOX HANDLER ALONE. The temperature layer can go
       off without anyone touching this box — the reader unchecks the row, a session restore turns
       it off, or `toggle`'s own catch turns it off because ECMWF could not be reached — and every
       one of those paths already goes through `syncLegend`. */
    /* ⚠⚠ (#R438) THREE LAYERS ASK FOR THE STREAKS NOW, AND EACH REMEMBERS ITS OWN ANSWER ════════
       「最大瞬間風速レイヤーにもパーティクルをつけて」「気圧レイヤーもパーティクルつけて」
       #R337 wrote this as one boolean because there was one layer that could ask. A single flag
       cannot answer three: a reader who wants streaks over the pressure field and not over the
       temperature field has to be able to say so, and 「the box is ticked」 has to survive switching
       between them. So the preference is per LAYER — its own key, its own default — and what
       crosses to js/weather.js's wind module is still ONE effective boolean, because that module
       only draws one set of streaks.
       ⚠ `ec-temp` KEEPS ITS ORIGINAL KEY. A reader who ticked that box before this round has it
       stored under `intmap_wx_temp_parts`; renaming it would silently untick it for everybody.
       ⚠ DEFAULT OFF for all three, for #R337's reason: the streaks are two more variables (u AND v)
       that a reader with only a raster up has never downloaded. */
    const PARTS_KEYS={'ec-temp':'intmap_wx_temp_parts','ec-gust':'intmap_wx_gust_parts','ec-slp':'intmap_wx_slp_parts'};
    const PARTS_IDS=Object.keys(PARTS_KEYS);
    const parts=Object.create(null);
    PARTS_IDS.forEach(id=>{ let v=false; try{ v=(localStorage.getItem(PARTS_KEYS[id])==='1'); }catch(_){} parts[id]=v; });
    const partsOn=(id)=>!!parts[id];
    /* ⚠ THE OR OVER EVERY ASKING LAYER. `Wind.setSolo` is 「something other than the Wind layer wants
       the streaks」 and is idempotent, so the effective answer is 「any layer whose box is ticked is
       on」 — pushing per-layer would let the last one to change speak for all of them. */
    function pushWindSolo(){ try{ const W=window.Wind;
      if(W&&W.setSolo) W.setSolo(PARTS_IDS.some(id=>parts[id]&&state[id]&&state[id].on)); }catch(_){} }
    function setParts(id,v){ if(!(id in PARTS_KEYS)) return;
      parts[id]=!!v;
      try{ localStorage.setItem(PARTS_KEYS[id],parts[id]?'1':'0'); }catch(_){}
      pushWindSolo();
      /* the legend body is rebuilt whole on every render, so re-rendering is how the box catches up
         when Atlas — not the box — was the one that answered */
      try{ if(state[id]&&state[id].on) renderLegend(); }catch(_){} }
    /* ══ ⚠⚠ (#R438) THE ISOBARS, AS A SWITCH ON THE PRESSURE LEGEND ══════════════════════════════
       The preference is 「draw contours over the pressure field」; whether anything is actually on the
       map is that AND the pressure layer being on, which is `syncSubs`. Same shape as the streaks
       above and for the same reason — one place decides, everything else reports. */
    const ISO_KEY='intmap_wx_isobars';
    let isoOn=false; try{ isoOn=(localStorage.getItem(ISO_KEY)==='1'); }catch(_){}
    const isobarsOn=()=>isoOn;
    function setIsobars(v){ isoOn=!!v;
      try{ localStorage.setItem(ISO_KEY,isoOn?'1':'0'); }catch(_){}
      syncSubs();
      try{ if(state['ec-slp']&&state['ec-slp'].on) renderLegend(); }catch(_){} }
    /* ⚠ (#R337) THE ONE DOOR. The legend box, Atlas's dispatch and Atlas's inline toggle all come
       through here, so no two of them can hold different ideas of the state — the same shape
       `window._imNatoStyle` uses in js/data-layers.js: no argument READS, an argument WRITES. */
    /* (#R438) …one door PER QUESTION. `_imWxParts` takes the layer; `_imWxTempParts` is what #R337
       published and half a dozen callers name, so it stays as the temperature layer's door onto it
       rather than becoming a second answer. */
    window._imWxParts=(id,v)=>{ if(v==null) return partsOn(id); setParts(id,v); return partsOn(id); };
    window._imWxTempParts=(v)=>{ if(v==null) return partsOn('ec-temp'); setParts('ec-temp',v); return partsOn('ec-temp'); };
    window._imWxIsobars=(v)=>{ if(v==null) return isobarsOn(); setIsobars(v); return isobarsOn(); };
    /* ⚠ (#R438) A SUB-LAYER IS ON ONLY WHILE ITS PARENT IS, AND ALWAYS ON ITS PARENT'S MODEL.
       Called from every path that can change either half — the parent's toggle, the isobar box, and
       `setModel` — so there is no state in which the contours are drawn over a raster they do not
       belong to. It recurses no further than one step: a sub-layer's own `toggle` does not call it. */
    function subWant(l){ if(l.id==='ec-isobars') return !!(isoOn&&state['ec-slp']&&state['ec-slp'].on); return false; }
    function syncSubs(){ LAYERS.filter(l=>l.sub).forEach(l=>{ const st=state[l.id]; if(!st) return;
      const want=subWant(l), p=state[l.sub];
      if(p&&st.model!==p.model){ st.model=p.model; if(st.on&&want) applyTime(l); }
      if(!!st.on!==want) toggle(l.id,want); }); }
    function toggle(id,on){ const cfg=LAYERS.find(l=>l.id===id); if(!cfg) return;
      state[id].on=on;
      syncLegend();
      /* (#R438) whatever this row owns follows it — the isobars go off with the pressure raster */
      if(!cfg.sub) syncSubs();
      if(!on){ setVis(cfg,false); return; }
      /* (#R290) 「気温レイヤーをオンにしたときも海岸線・湖岸線を自動オン。」 — the same latch the wind
         uses (js/coast-line.js `_imCoastAuto`), for the same reason: a full-planet colour field
         hides the basemap, and the coast is what tells the reader where they are looking. It fires
         ONCE per session, so it is a default rather than a coupling — a reader who switches the
         coast back off keeps it off. One layer draws both the sea and the lake shores.
         ⚠ THE TEMPERATURE LAYER, NOT EVERY RASTER. The argument would fit the other eight too; the
         instruction names this one, and widening it is a change nobody asked for. */
      if(id==='ec-temp'){ try{ window._imCoastAuto&&window._imCoastAuto(); }catch(_){} }
      EC(cfg).ready().then(()=>{
        /* ⚠ (#R276 追記) A RETRY LADDER, not a single `once('idle')`. `addLayer` can refuse for two
           different reasons — the style cannot accept a layer yet, or the metadata has not arrived so
           `omUrl` is empty — and only the first of them is an idle away. Poll for ~16 s as well, and
           stop as soon as the layer exists. (The prefetch moved to the time change, where the
           instruction puts it: see the note in the wind module.) */
        let n=0;
        const go=()=>{ if(!state[id].on) return;
          if(_imCanDraw()&&addLayer(cfg)){ setVis(cfg,true); setOp(cfg,state[id].op); raiseSubs(id); renderLegend(); warmReadout();
            /* (#R356) the FIRST paint commits the same way a later one does — when the source has
               actually loaded, not when the layer was asked for. Until then `displayed` is null and
               the legend says 「読み込み中」 rather than naming an hour nothing is showing yet. */
            const src=EC(cfg);
            const prov=WXM().provenance({modelId:src.DOMAIN, validTime:src.validTime(),
              referenceTime:src.referenceTime(), variable:cfg.variable});
            whenSourceLoaded(cfg.id+'-'+(cfg._s|0)+'-src',()=>{ if(!state[id].on) return; commit(cfg,prov); renderOne(cfg); },12000);
            return; }
          if(n++<80) setTimeout(go,200);
        };
        go();
        try{ GE().events.once('idle',()=>{ if(state[id].on&&!liveLayer(cfg)) go(); }); }catch(_){}
      }).catch(()=>{
        try{ satToast(L('Could not load ECMWF weather','ECMWFデータを読み込めませんでした','ECMWF-Wetterdaten konnten nicht geladen werden','Не удалось загрузить данные ECMWF','No se pudieron cargar los datos meteorológicos del ECMWF')); }catch(_){}
        state[id].on=false;
        const cb=document.getElementById('dl-'+id); if(cb){ cb.checked=false; const r=cb.closest('.lyr-row'); if(r) r.classList.remove('on'); }
        syncLegend();
        /* (#R438) a parent that could not be reached takes its sub-layers down with it */
        if(!cfg.sub) syncSubs();
      });
    }
    window.toggleWeatherLayer=toggle;

    /* ══ ⚠⚠⚠ (#R356) CHANGING MODEL KEEPS THE INSTANT, AND CHANGES NOTHING UNTIL IT CAN ═════════
       Three rules, and a naive implementation gets all three wrong.

       ① THE HOUR IS AN INSTANT, NOT AN INDEX. MEASURED on the live feed: ECMWF IFS HRES is 109
          hourly steps to +6 d, GFS 0.13 is 209 to +16 d, ICON is 93 to +5 d. Index 30 is thirty
          hours into one axis and something else entirely in another, so the new model is moved to
          the valid time NEAREST the one the reader is looking at — the same rule js/wx-ecmwf.js
          already applies when a new RUN re-bases an axis (#R276). A model change is that event
          with a bigger step, and it is exactly as wrong to answer it by index.

       ② A MODEL THAT CANNOT DRAW THIS LAYER IS REFUSED, WITH A REASON. MEASURED: GFS 0.13 publishes
          no `pressure_msl`, no `cape` and no `dew_point_2m`. Switching anyway would empty the map
          while the legend went on describing a field that is not there — the ec-sst failure of
          #R276, which drew nothing for nine rounds, made from a different ingredient. The option is
          disabled in the picker AND refused here, because the picker was built from metadata that
          may have arrived since.

       ③ THE OLD PICTURE STAYS UP. The new model is built into the free slot by `applyTime`, exactly
          as a new hour is, and `displayed` moves only when that slot is uncovered. Between the click
          and the picture the legend keeps describing what is on the map, with 「切替中」 next to it. */
    /* ⚠ IT RESOLVES WITH WHAT HAPPENED, and it resolves LATE — after the picture, not after the
       request. Every branch answers `{ok, code}` so a caller (Atlas, the share restore) can say
       which of the six outcomes it got instead of inferring one from a bare boolean. */
    function setModel(id,modelId){
      const cfg=LAYERS.find(l=>l.id===id);
      if(!cfg||!state[id]) return Promise.resolve({ok:false,code:'no_such_layer'});
      if(!modelId) return Promise.resolve({ok:false,code:'no_model_given'});
      if(modelId===state[id].model) return Promise.resolve({ok:true,code:'already',modelId});
      const inst=ENG()&&ENG().model(modelId);
      if(!inst) return Promise.resolve({ok:false,code:'unknown_model'});
      const row=WXM().get(modelId), name=row?row.nameKey:modelId;
      const back=()=>{ state[id].loading=null; renderOne(cfg);
        const sel=document.querySelector('.ec-model[data-for="'+id+'"]'); if(sel) sel.value=state[id].model; };
      /* what the reader is looking at right now — the DISPLAYED hour, not the requested one */
      const d=displayed(cfg);
      const wasAt=(d&&d.validTime)||EC(cfg).validTime()||'';
      state[id].loading={modelId:modelId, modelName:name};
      renderOne(cfg);
      return inst.meta().then(()=>{
        const a=availFor(cfg,modelId);
        if(!a.ok){ back(); try{ satToast(name+' — '+whyNot(a.code)); }catch(_){}
          return {ok:false,code:a.code,modelId,modelName:name}; }
        state[id].model=modelId;
        if(wasAt){ const ms=Date.parse(/[zZ]$/.test(wasAt)?wasAt:wasAt+'Z');
          /* ⚠ quiet: this is not a time change the reader made, and waking every layer on the new
             model to rebuild would be a read nobody asked for. The build below is the one read. */
          if(isFinite(ms)) inst.setIndex(inst.nearestTo(ms),{quiet:true}); }
        wireModel(inst);
        /* ⚠ (#R438) A SUB-LAYER READS ITS PARENT'S MODEL. Without this the isobars would go on
           contouring the model they were switched on with while the raster under them had moved to
           another one — two models in one picture, which is exactly what 「地図、粒子、凡例、地点値が
           同じ表示状態を参照」 forbids. `syncSubs` copies it and rebuilds the slot when it is on. */
        syncSubs();
        if(!state[id].on){ state[id].loading=null; renderOne(cfg);
          /* the layer is off: the model is chosen and will be used the moment it is switched on.
             That is a true outcome and it is NOT 「表示されている」, so it says which one it is. */
          return {ok:true,code:'chosen_layer_off',modelId,modelName:name}; }
        applyTime(cfg);
        return whenCommitted(cfg,modelId).then(p=>(p&&p.modelId===modelId)
          ? {ok:true,code:'displayed',modelId,modelName:name,validTime:p.validTime,runTime:p.runTime}
          : {ok:false,code:'not_painted_yet',modelId,modelName:name});
      }).catch(()=>{ back();
        try{ satToast(name+' — '+L('could not be reached','取得できませんでした','nicht erreichbar','недоступна','no se pudo obtener')); }catch(_){}
        return {ok:false,code:'unreachable',modelId,modelName:name}; });
    }

    /* ⚠⚠ (#R356) ONE SUBSCRIPTION PER MODEL, AND IT ONLY WAKES THE LAYERS ON THAT MODEL. A single
       `EC().on(...)` was right while there was one axis. With three, an hour change on GFS must not
       rebuild the ECMWF rasters: that would be three reads for one click, down one shared reader,
       and a legend that flickers through an hour nobody chose. */
    const wired=Object.create(null);
    function layersOn(modelId){ return activeLayers().filter(l=>state[l.id].model===modelId); }
    function wireModel(inst){
      if(!inst||!inst.DOMAIN||wired[inst.DOMAIN]) return; wired[inst.DOMAIN]=1;
      inst.on(ev=>{
        const mine=layersOn(inst.DOMAIN);
        if(ev.type==='index'){ touchTime(mine); return; }
        if(ev.type==='time'){ mine.forEach(c=>applyTime(c)); mine.forEach(renderOne); }
        else if(ev.type==='play'||ev.type==='meta'){ mine.forEach(renderOne); }
      });
    }

    function anyOn(){ return LAYERS.some(l=>state[l.id].on); }
    function activeLayers(){ return LAYERS.filter(l=>state[l.id].on); }
    /* ⚠ (#R438) THE MAP'S LIST AND THE READER'S LIST ARE NOT THE SAME LIST. `activeLayers` drives
       everything that touches the map — the slots, `applyTime`, the prefetch, the model wiring —
       and a sub-layer belongs in all of it. `legendLayers` drives everything a reader SEES, and a
       sub-layer has no box: its switch lives inside its parent's legend. */
    function legendLayers(){ return activeLayers().filter(l=>!l.sub); }
    /* ══ ⚠⚠ (#R290) THE FIELD THE READOUT NEEDS IS WARMED WITH THE PICTURE ═══════════════════
       The colour tiles are decoded inside the SDK; the NUMBER under the cursor comes from a
       decoded field this module has to hold (js/wx-ecmwf.js `valueNow`). Asking for it only when
       a reader hovers means the first hover waits for the whole read — MEASURED at 13.6 s in a
       cold browser. It is the same latitude band the wind already reads, for the variable that is
       actually on top, so it is started when the layer is switched on and when the hour changes,
       and it is a no-op when that frame is already in hand. */
    /* ⚠ (#R290 追記) …AND IT WAITS, for the reason in js/wx-ecmwf.js's note on `prefetch`: this read
       shares the module's one queue with the field the particles are flying on, and it is a number
       in a corner. Deferred until the axis has been still, and a further step replaces the pending
       schedule. Measured: with a raster on, a wind step went from 10.5 s to about a second. */
    /* ⚠⚠ (#R298) …AND BEHIND THE WIND'S COLOUR FIELD WHEN THAT LAYER IS ON. A fixed 2,500 ms
       answers 「has the axis been still」 and says nothing at all about whether the picture the
       reader asked for has arrived — so on a slow read the timer fires into the one reader both
       layers share (js/wx-ecmwf.js `serial`) while the colour is still decoding through it. The
       wind publishes the moment its slot is uncovered, so the wait is on THAT when there is a wind
       layer to wait for; with none on there is no signal, and the timer is the whole answer, as
       before. The schedule above is unchanged: this is a second condition, not a longer delay. */
    let warmT=0;
    function warmReadout(){ clearTimeout(warmT); warmT=setTimeout(warmReadoutNow,2500); }
    function warmReadoutNow(){
      try{ const W=window.Wind;
        if(W&&W.on&&W.on()&&W.afterFieldShown){ W.afterFieldShown(warmReadNow); return; } }catch(_){}
      warmReadNow();
    }
    function warmReadNow(){
      try{ const cfg=LAYERS.filter(l=>state[l.id].on&&l.type==='raster').pop();
        if(!cfg) return;
        /* ⚠ (#R290 追記) `bandNear` — this frame exists for the cursor readout, not for the picture,
           and a globe-sized request here evicts the wind's field (see FRAME_SAMPLES). */
        let band=null; try{ const b=GE().camera.getBounds(); band=EC(cfg).bandNear(b.getSouth(),b.getNorth()); }catch(_){}
        EC(cfg).load(cfg.variable,null,band).catch(()=>{});
      }catch(_){}
    }

    /* ── the forecast step changed: build the new hour beside the old one, then swap ───────────
       ⚠ (#R288) `only` rebuilds ONE layer — the source switch and the reanalysis month are the same
       operation as a time step (a new picture in the free slot, revealed once it has painted), so
       they share this rather than growing a second, subtly different swap. */
    /* ══ ⚠⚠⚠ (#R290) 「読み込み次第差し替える」 — AND `idle` IS NOT 「読み込んだ」 ═══════════════
       「気象系のレイヤーで時間を選択したとき、変えてから読み込まれるまでいったん地図が何もなくなるのを
         辞めろ。読み込み次第差し替える形式にしろ。」

       The two-slot swap (#R284) is right: the new hour is built beside the old one and the old one
       is dropped only when the new one is showing. What was wrong is WHEN it decided the new one
       was showing — `once('idle')`, plus a 2,500 ms backstop that fired whether or not anything
       had arrived. `idle` means 「the map has nothing left to draw for the tiles it HAS」, and a
       source whose first tile has not come back yet has nothing to draw, so on a slow read the
       reveal ran immediately, removed the old slot, and left the reader looking at the basemap
       for the rest of the download. That is 「いったん地図が何もなくなる」, and it was the backstop
       and the idle BOTH firing early rather than either firing late.
       → the signal is the SOURCE's own: `sourcedata` with `isSourceLoaded` for that source id.
       The backstop is long and exists only so a source that never loads cannot strand two slots;
       until it fires the old picture stays up, which is the whole point. */
    /* ══ ⚠⚠⚠ (#R298) 「まだ1枚も頼まれていない」 SOURCE ALSO REPORTS ITSELF LOADED ═══════════════
       #R297 fixed exactly this one source along — the animated field's `_whenSrcLoaded` — and left
       this copy on `isSourceLoaded` alone. `isSourceLoaded` answers 「is anything in flight for this
       source」, and for a source that was added a moment ago and has not been ASKED for a tile yet
       the answer is yes-it-is-loaded, immediately. So a time step on the raster / isobar / arrow
       layers uncovered an empty slot and removed the one holding the picture: 「時間を選択したとき、
       変えてから読み込まれるまでいったん地図から何もなくなる」, still true here after #R297.
       → a TILE has to have landed as well. `sourcedata` carries a tile for VECTOR sources too, so
       the isobars and the arrows are covered by the same condition; the 12 s backstop stays,
       because a source whose tiles are all off-screen never gets a tile event at all. */
    function whenSourceLoaded(sid,then,maxMs){
      let done=false;
      const fin=()=>{ if(done) return; done=true;
        try{ GE().events.off('sourcedata',h); }catch(_){}
        try{ then(); }catch(_){} };
      const h=(e)=>{ if(e&&e.sourceId===sid&&e.tile&&e.isSourceLoaded) fin(); };
      try{ GE().events.on('sourcedata',h); }catch(_){ setTimeout(fin,600); return; }
      /* already in? MapLibre will not re-fire for a source that finished before we subscribed */
      try{ if(GE().layers.sourceData&&GE().layers.sourceData(sid)) { /* geojson only — rasters fall through */ } }catch(_){}
      setTimeout(fin,maxMs||12000);
    }
    function applyTime(only){
      (only?[only]:activeLayers()).forEach(cfg=>{
        const old=cfg._s|0, nu=1-old;
        dropSlot(cfg,nu);                       /* whatever a superseded step left there */
        /* ⚠⚠ (#R298) …AND THE STEP IT LEFT BEHIND MUST NOT STILL BE HOLDING THE SWAP. Two steps in
           a row both compute `nu` from `cfg._s`, which the first one has not moved yet (it moves on
           the reveal), so both build into the SAME slot — and the first reveal, when its handler
           fires on the rebuilt source, would then drop the slot the reader is looking at while the
           second build has nothing painted. Both slots gone is a blank map. The token is what an
           overtaken reveal checks: it uncovers nothing and drops nothing. */
        const mine=cfg._seq=(cfg._seq|0)+1;
        let n=0;
        const go=()=>{ if(!state[cfg.id].on||mine!==cfg._seq) return;
          if(!(_imCanDraw()&&addSlot(cfg,nu))){ if(n++<40) setTimeout(go,200); return; }
          /* ⚠⚠⚠ (#R356) THE PROVENANCE IS TAKEN FROM THE INSTANCE THAT BUILT THIS SLOT, HERE, and
             carried into the reveal — not read again when the reveal fires. By then the reader may
             have changed model or hour again, and describing the new request while uncovering the
             old picture is the exact defect the three states exist to prevent. `mine !== cfg._seq`
             already stops a superseded build from revealing; this stops a surviving one from being
             labelled with somebody else's answer. */
          const src=EC(cfg);
          const prov=WXM().provenance({modelId:src.DOMAIN, validTime:src.validTime(),
            referenceTime:src.referenceTime(), variable:cfg.variable});
          setVisSlot(cfg,nu,true); setOpSlot(cfg,nu,0);
          const reveal=()=>{ if(!state[cfg.id].on||mine!==cfg._seq) return;
            if((cfg._s|0)!==nu){ cfg._s=nu; }
            setOpSlot(cfg,nu,state[cfg.id].op);
            dropSlot(cfg,old);
            /* (#R438) a new slot goes in at the shared anchor, i.e. on top — so the contours have to
               be put back over the field they belong to. See `raiseSubs`. */
            raiseSubs(cfg.id);
            /* the pixels and the words change in the same turn */
            commit(cfg,prov); renderOne(cfg); };
          whenSourceLoaded(cfg.id+'-'+nu+'-src',reveal,12000);
        };
        go(); });
      renderLegend();
      /* (#R288) BOTH neighbours, not just the next one. A reader who has stepped forward is as
         likely to step back, and a warmed frame costs 1.0–1.6 s against 8.7 s cold (#R276's
         measurement) — the block cache is shared, so warming the one behind is the difference
         between an instant step back and another full read. */
      /* ══ ⚠⚠⚠ (#R302) THIS WARM-UP WAS WARMING THE WHOLE PLANET, EVERY TIME ═══════════════════
         「日時変更…に至るまで爆速にしろ。」 `prefetch` takes the bounds as its THIRD argument and
         this call has never passed one, so js/wx-ecmwf.js `_prefetchNow` saw `band = null` and
         `prefetchVariable(v, null)` warmed each variable in full — the globe. #R290 追記2 measured
         what that costs when the read that follows is a latitude band: about 80 MB queued in front
         of a step that needs 1.6 MB, and a new hour that had **still not arrived after 39 s**. The
         wind's own call one module along already passes `band()`; this one was left behind, and it
         is the one that runs whenever an ECMWF raster is on.
         → the same band the read will use, obtained the way this file already obtains it. `null`
         still means the planet, which is what a reader at world zoom is going to read anyway.
         ⚠⚠ AND THE WIND'S TWO VARIABLES ONLY BELONG HERE WHEN THE WIND IS ON. They were appended
         unconditionally, so a reader with only the temperature raster up paid for u AND v — two
         more variables, the most expensive pair in the feed (the reader derives speed from both) —
         on every single time change, for a picture that is not on the map. */
      /* ⚠⚠ (#R356) THE WARM-UP IS PER MODEL NOW, AND IT ASKS EACH MODEL ONLY FOR THE VARIABLES THE
         LAYERS ON IT ACTUALLY USE. Asking one instance for every active layer's variable would ask
         ECMWF for a field a GFS layer is drawing — a read of the right name against the wrong axis,
         which decodes fine and warms nothing the reader is about to see. And the neighbour hour is
         each model's OWN next step: +1 on a 3-hourly axis is three hours, on an hourly axis one.
         ⚠ #R337's WIDER CONDITION IS KEPT, NOT REPLACED. The two halves met in this block during
         the rebase and picking either one alone would have been a silent regression: #R337 widened
         「the wind is on」 to 「the streaks are being drawn at all」 because the temperature legend can
         ask for them without the wind LAYER, and that is orthogonal to which model each layer reads. */
      try{ const W=window.Wind;
        const byModel=Object.create(null);
        activeLayers().forEach(c=>{ const m=state[c.id].model; (byModel[m]=byModel[m]||[]).push(c.variable); });
        if(W&&((W.on&&W.on())||(W.solo&&W.solo()))){ const wm=(window.IntMapECMWF&&window.IntMapECMWF.DOMAIN)||WXM().defaultId();
          (byModel[wm]=byModel[wm]||[]).push('wind_u_component_10m','wind_v_component_10m'); }
        let pbS=null,pbN=null; try{ const b=GE().camera.getBounds(); pbS=b.getSouth(); pbN=b.getNorth(); }catch(_){}
        Object.keys(byModel).forEach(m=>{
          const inst=ENG()&&ENG().model(m); if(!inst) return;
          const i=inst.index(), n=inst.count();
          let pb=null; try{ if(pbS!=null) pb=inst.bandFor(pbS,pbN); }catch(_){}
          /* ⚠ (#R290 追記2) ONE schedule survives per instance (the call is debounced and replaces
             the pending one), so ask for the neighbour a reader is most likely to want. */
          inst.prefetch(byModel[m],Math.min(n-1,i+1),pb);
        }); }catch(_){}
      warmReadout();
    }

    /* ── UNITS ───────────────────────────────────────────────────────────────────────────────
       A legend that prints °C to a reader who chose °F is the same defect as a legend whose maximum
       disagrees with its ramp — the number does not mean what the reader thinks it means. */
    function convert(kind,v){
      if(kind==='temp'){ return (window.imUnitTemp==='f') ? (v*9/5+32) : v; }
      if(kind==='wind'){ try{ return v*window.windUnitFactor(); }catch(_){ return v; } }
      return v;
    }
    function unitOf(kind,native){
      if(kind==='temp') return (window.imUnitTemp==='f')?'°F':'°C';
      if(kind==='wind'){ try{ return window.windUnitLabel(); }catch(_){ return native; } }
      return native;
    }
    function nice(v){ const a=Math.abs(v); return a>=100?Math.round(v):a>=10?(Math.round(v*10)/10):(Math.round(v*100)/100); }

    /* ══ ⚠⚠⚠ (#R284) ONE LEGEND PER LAYER, EACH UNDER ITS OWN NAME ═══════════════════════════════
       「CAPE 不安定度（ECMWF）レイヤーの凡例名がECMWF気象になっている。また、凡例がない。その他の
         ECMWF系レイヤーも、凡例名がECMWF気象になっている。ECMWFレイヤーはなぜか凡例が連結してしまう。」

       All four sentences describe ONE box. MEASURED on the built page at 1280×800 with three ECMWF
       layers on: a single `#data-legend-ecmwf` whose `<h4>` read 「ECMWF weather」 and whose body held
       three stacked `.ecl-item`s — 354 px of concatenated ramps under a title that names none of
       them. And at a narrow width `ensureLegendMinimize` auto-collapses a floating legend, which
       hides every child except the `<h4>` — so the whole box became the two words 「ECMWF 気象」 and
       the ramp was gone: 「凡例がない」, exactly.

       So an ECMWF layer's legend is now the same thing every other layer's legend is: ITS OWN BOX,
       titled with ITS OWN name, holding ITS OWN ramp, numbers and description. Turning two on gives
       two boxes that the existing tiler stacks; collapsing one leaves the layer's real name on
       screen rather than the family's.

       The forecast axis is a CONTROL shared by all of them, not a key to any one of them, so it is
       its own small box — 「ECMWF 予報時刻」 — and it is up only while at least one ECMWF layer is on. */
    function barBody(cfg){
      const dark=(document.documentElement.getAttribute('data-theme')||'')!=='light';
      const lg=EC(cfg).legend(cfg.variable,dark);
      if(!lg) return '<div class="ecl-desc">'+ecDesc(cfg)+'</div>';
      const u=unitOf(cfg.kind,lg.unit);
      /* (#R297) …and the same 「+」 rule as the wind box when the ramp runs past the last tick */
      const ticks=[0,0.25,0.5,0.75,1].map(f=>{ const v=lg.min+(lg.max-lg.min)*f;
        return { pos:f*100, txt:nice(convert(cfg.kind,v))+((f===1&&lg.capped)?'+':'') }; });
      return '<div class="ecl-unitline">'+u+'</div>'
        +'<div class="ecl-bar" style="background:'+lg.css+';"></div>'
        +'<div class="ecl-ticks">'+ticks.map(k=>'<span style="left:'+k.pos.toFixed(1)+'%">'+k.txt+'</span>').join('')+'</div>'
        +'<div class="ecl-desc">'+ecDesc(cfg)+'</div>';
    }

    const boxes={};            /* layer id → its own legend element */
    const dragHandle=()=>'<span class="dl-drag" title="'+L('Drag to move','ドラッグして移動','Zum Verschieben ziehen','Потяните, чтобы переместить','Arrastre para mover')+'">⋮⋮</span>';
    function newBox(id){
      const mc=document.getElementById('map-container')||document.body;
      const el=document.createElement('div'); el.className='data-legend'; el.id='data-legend-'+id;
      el.style.bottom='140px'; el.style.display='none';
      mc.appendChild(el);
      try{ window._wireLegendDrag&&window._wireLegendDrag(el); }catch(_){}
      return el;
    }
    function boxFor(cfg){ return boxes[cfg.id]||(boxes[cfg.id]=newBox(cfg.id)); }
    function closeBtn(el){ const x=el.querySelector('.layer-popup-x');
      if(x) x.onclick=()=>{ el.style.display='none'; try{ window._tileLegends&&window._tileLegends(); }catch(_){} }; }

    function relTxt(iso){
      try{ const dh=Math.round((Date.parse(/[zZ]$/.test(iso)?iso:iso+'Z')-Date.now())/3600000);
        if(dh===0) return L('now','現在','jetzt','сейчас','ahora');
        return (dh>0?'+':'')+dh+' '+L('h','時間','h','ч','h'); }catch(_){ return ''; }
    }
    /* ══ ⚠⚠⚠ (#R290) …AND IT HAS ONE AGAIN, IN EACH LEGEND ═══════════════════════════════════
       「ECMWF系レイヤーで、時間選択をChronosに受け流さなくてよい。個別の時間選択UIを使え。」

       #R288 removed the floating 「ECMWF 予報時刻」 box (which opened by itself — that part stays
       removed) and routed the forecast hour through the app-wide clock instead. The reader has
       now said what they wanted the other half to be: the hour belongs to the LAYER, in the
       layer's own legend, and it does not move the news, the borders or the terminator with it.
       This line is therefore a READING of which instant the picture is of, and the control that
       changes it is directly above it — `window.IntMapWxPlayer.timeUI`, whose steps are the
       model's own published valid times and nothing between them. `openClock()`, which used to
       open Chronos on its forecast tab, is gone with the button that called it. */
    /* ⚠⚠⚠ (#R356) EVERY WORD BELOW IS BUILT FROM `displayed(cfg)`, NOT FROM `state.model`.
       That is the whole difference between 「凡例は絵を説明している」 and 「凡例は要求を復唱している」.
       Before a layer has ever painted, `displayed` is null and these say so — 「読み込み中」 is a
       state the reader can be in, and inventing a valid time for it would be a lie with a
       timestamp on it. */
    function whenLine(cfg){
      const d=displayed(cfg);
      if(!d||!d.validTime) return L('loading…','読み込み中…','wird geladen…','загрузка…','cargando…');
      return L('valid','有効時刻','gültig','действ.','válido')+' '+EC(cfg).fmt(d.validTime)+' · '+relTxt(d.validTime);
    }
    const esc=(s)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    /* Why a model is not offered for THIS layer, in words a reader can act on. The codes come from
       js/wx-models.js `availability()`; there is no default branch, because a reason nobody wrote
       is a reason nobody can fix. */
    function whyNot(code){
      if(code==='no_such_variable') return L('no data for this layer','このレイヤーのデータなし','keine Daten für diese Ebene','нет данных для этого слоя','sin datos para esta capa');
      if(code==='no_such_level') return L('level not published','この気圧面は未提供','Druckfläche nicht verfügbar','уровень не публикуется','nivel no publicado');
      if(code==='outside_coverage') return L('outside this model’s area','このモデルの範囲外','außerhalb des Modellgebiets','вне области модели','fuera del área del modelo');
      if(code==='no_metadata') return L('not answering','応答なし','antwortet nicht','нет ответа','sin respuesta');
      return L('unavailable','利用できません','nicht verfügbar','недоступно','no disponible');
    }
    /* Can this layer be drawn from this model RIGHT NOW? The registry answers from the model's own
       live `latest.json`, so a variable an upstream centre does not publish is refused here rather
       than becoming an empty map — the exact failure `pruneMissing` was written for in #R276, now
       asked once per (layer, model) pair instead of once per layer. */
    /* ⚠ (#R376) `peek`, NOT `model`. This runs for every offered model on every legend render, and
       through `model()` it BUILT each of them just to ask a question about metadata that may not
       have arrived yet. A model nobody has read from has no metadata, so the honest answer is
       `no_metadata` — which the picker already treats as 「do not disable」. */
    function availFor(cfg,modelId){
      try{
        const inst=ENG()&&(ENG().peek?ENG().peek(modelId):ENG().model(modelId));
        const meta=inst&&inst.metaSync();
        return WXM().availability({modelId:modelId, meta:meta, variable:cfg.variable, role:'surface'});
      }catch(_){ return {ok:true}; }
    }
    /* ⚠⚠ (#R376) …AND THE PICKER HAS TO BE ABLE TO SAY 「この変数は無い」 BEFORE IT IS CLICKED.
       With `availFor` no longer building instances, every option would stay enabled until something
       else happened to read that model — MEASURED in production BEFORE this fix: the GFS option on
       the sea-level-pressure legend was only disabled because a probe had already fetched GFS
       metadata; in a fresh session it was not. So opening a weather legend fetches the offered
       models' `latest.json` ONCE (3 kB each, through IntMapWx's one cache) and re-renders when they
       land. ⚠ A session that never opens a weather legend still fetches nothing. */
    let metaWarmed=false;
    function warmModelMeta(){
      if(metaWarmed) return; metaWarmed=true;
      MODEL_CHOICES().forEach(m=>{ try{
        const inst=ENG()&&ENG().model(m.id); if(!inst||inst.metaSync()) return;
        inst.meta().then(()=>{ if(anyOn()) renderLegend(); }).catch(()=>{});
      }catch(_){} });
    }
    function modelLine(cfg){
      const st=state[cfg.id]||{}, d=displayed(cfg);
      const opts=MODEL_CHOICES().map(m=>{
        const a=availFor(cfg,m.id), off=(a.ok===false&&a.code!=='no_metadata');
        return '<option value="'+esc(m.id)+'"'+(m.id===st.model?' selected':'')+(off?' disabled':'')
          +'>'+esc(m.nameKey)+(off?(' — '+whyNot(a.code)):'')+'</option>';
      }).join('');
      const sel='<div class="ecl-modelpick"><label>'+L('Model','モデル','Modell','Модель','Modelo')
        +'<select class="ec-model" data-for="'+esc(cfg.id)+'">'+opts+'</select></label></div>';
      /* ⚠ the LINE below describes the field on the map. While a different model is being built it
         still describes the OLD one, and the note says which way it is going — 「切替中」 is the
         honest sentence for the seconds between the click and the picture. */
      if(!d) return sel+'<div class="ecl-model">'+L('loading…','読み込み中…','wird geladen…','загрузка…','cargando…')+'</div>';
      const busy=st.loading&&st.loading.modelId&&st.loading.modelId!==d.modelId;
      const swap=busy?(' · '+L('switching to','切替中',' wechselt zu','переключение на','cambiando a')+' '+esc(st.loading.modelName)+'…'):'';
      return sel+'<div class="ecl-model">'+esc(d.modelName)+' · '+d.nativeResolutionKm+' km'
        +(d.runTime?(' · '+L('run','初期時刻','Lauf','прогон','pasada')+' '+EC(cfg).fmt(d.runTime,{hour:'2-digit',minute:'2-digit',month:'short',day:'numeric',timeZone:'UTC'})+' UTC'):'')
        +swap+'</div>';
    }
    /* ══ ⚠⚠⚠ (#R290) THE OPACITY CONTROL WAS IN A PANEL THAT HIDES IT ═══════════════════════════
       「気温レイヤーに透明度選択がない。」 MEASURED on the built page: `#lyrrow-ec-temp` DOES contain
       an `<input class="ec-op">`, and its computed `display` is **none** — with the layer on and
       the row `.on`. css/intmap.css has hidden every slider in the Layers panel since #R16
       («ABSOLUTE RULE — NO sliders / date-pickers / filters anywhere in the Layers panel. Every
       such control lives in that layer's LEGEND only»), and the ECMWF rows were never given the
       legend half of that rule. So the slider existed, was wired, held the right value — and no
       reader could reach it, for any of the nine ECMWF layers.
       → the control moves to the legend, in the same `.dl-op-row` shape every other layer's
       opacity uses (js/data-layers.js `ensureLegendOpacity`), so it looks and behaves identically. */
    function opRow(cfg){
      const v=state[cfg.id].op;
      return '<div class="dl-op-row">'+L('Opacity','不透明度','Deckkraft','Непрозрачность','Opacidad')
        +'<input type="range" class="ec-oplg" data-for="'+cfg.id+'" min="0" max="1" step="0.05" value="'+v+'">'
        +'<span class="dl-op-val">'+Math.round(v*100)+'%</span></div>';
    }
    /* ⚠ (#R337) the wind's streaks over THIS layer — the switch belongs in this legend by #R16's
       rule (docs/MAP-LAYERS.md §7.10: a control that belongs to one layer lives in that layer's
       legend, never in the Layers panel), and it is a different question from the wind legend's own
       「パーティクル」 box: that one is 「does the Wind layer animate」, this one is 「draw the wind over
       what I am looking at」. Same markup as the wind's, so the two read as one kind of control.
       ⚠ THE BOX NEVER HOLDS THE ANSWER. This body is replaced whole by innerHTML on every render,
       so `checked` is read from the module on each pass — the same rule the wind legend follows. */
    /* (#R438) …and the same box is now on the gust and the sea-level-pressure legends, because the
       question 「draw the moving air over what I am looking at」 is the same question there. */
    function windPartsRow(cfg){
      if(!(cfg.id in PARTS_KEYS)) return '';
      return '<label class="kl-period wind-parts-row" style="margin:7px 0 2px;cursor:pointer;">'
        +'<input type="checkbox" class="ec-wind-parts" data-for="'+esc(cfg.id)+'"'+(partsOn(cfg.id)?' checked':'')+' style="accent-color:var(--primary-color);margin:0;cursor:pointer;">'
        +'<span style="font-size:11px;color:var(--text-muted);">'
        +L('Wind particles','風のパーティクル','Wind-Partikel','Частицы ветра','Partículas de viento')
        +'</span></label>';
    }
    /* ⚠ (#R438) THE ISOBARS' SWITCH, in the legend of the field they are contours OF — #R16's rule
       again (docs/MAP-LAYERS.md §7.10). It reads the module on every render for the same reason the
       box above does: the body is replaced whole, so the checkbox can never be the answer. */
    function isobarRow(cfg){
      if(cfg.id!=='ec-slp') return '';
      const iso=LAYERS.find(l=>l.id==='ec-isobars');
      if(!iso) return '';
      return '<label class="kl-period wx-iso-row" style="margin:7px 0 2px;cursor:pointer;">'
        +'<input type="checkbox" class="ec-isobars-box"'+(isobarsOn()?' checked':'')+' style="accent-color:var(--primary-color);margin:0;cursor:pointer;">'
        +'<span style="font-size:11px;color:var(--text-muted);">'
        +esc(ecLbl(iso))+' · '+EC(cfg).ISOBAR_STEP_HPA+' hPa'
        +'</span></label>';
    }
    function renderOne(cfg){
      if(cfg.sub) return;   /* (#R438) a sub-layer has no legend box of its own — see the note on `sub` */
      const el=boxFor(cfg);
      const clock=window.IntMapWxPlayer.timeUI('ec-time-'+cfg.id,EC(cfg),L);
      el.innerHTML=dragHandle()
        +'<button class="layer-popup-x" title="'+t('close')+'">×</button>'
        +'<h4>'+ecLbl(cfg)+'</h4>'
        +'<div class="ecl-one">'+barBody(cfg)+opRow(cfg)+isobarRow(cfg)+windPartsRow(cfg)+modelLine(cfg)+clock
        +'<div class="ecl-when" data-for="'+cfg.id+'">'+whenLine(cfg)+'</div>'
        +'</div>';
      closeBtn(el);
      const op=el.querySelector('.ec-oplg');
      if(op) op.oninput=()=>{ const v=+op.value; state[cfg.id].op=v; setOp(cfg,v);
        const lbl=el.querySelector('.dl-op-val'); if(lbl) lbl.textContent=Math.round(v*100)+'%';
        const row=document.querySelector('.ec-op[data-for="'+cfg.id+'"]'); if(row) row.value=String(v); };
      /* (#R337) the switch reports; the module decides — the same door the wind legend uses */
      const wp=el.querySelector('.ec-wind-parts');
      if(wp) wp.onchange=()=>{ setParts(cfg.id,wp.checked); };
      const ib=el.querySelector('.ec-isobars-box');
      if(ib) ib.onchange=()=>{ setIsobars(ib.checked); };
      /* ⚠ (#R356) `EC(cfg)`, not `EC()` — this legend's clock is the axis of the model THIS layer
         reads, and with a model per layer those are different axes. */
      if(clock) window.IntMapWxPlayer.wireTimeUI(el,'ec-time-'+cfg.id,EC(cfg));
      /* (#R356) the model picker. One per legend, because the model belongs to the LAYER. */
      const msel=el.querySelector('.ec-model');
      if(msel) msel.onchange=()=>{ setModel(cfg.id,msel.value); };
    }
    function renderLegend(){
      warmModelMeta();
      activeLayers().forEach(renderOne);
      try{ window._tileLegends&&window._tileLegends(); }catch(_){}
    }
    function syncLegend(){ const show=legendLayers().length>0;
      pushWindSolo();   /* (#R337) every path that changes a layer's on-state comes through here */
      LAYERS.forEach(l=>{ const el=boxes[l.id]; if(el&&!(state[l.id]&&state[l.id].on)) el.style.display='none'; });
      if(show){ legendLayers().forEach(l=>{ boxFor(l).style.display='block'; }); renderLegend(); }
      /* the tiler owns where the legends sit; opening or closing one moves every box below it */
      try{ window._tileLegends&&window._tileLegends(); }catch(_){} }
    window._ecSyncTimeLegend=syncLegend;
    /* (#R293) the master clock moved, so the 「いつの絵か」 line and the transport have to be re-read.
       The AXIS itself is moved by js/wx-ecmwf.js's own subscription — one writer, and this is the
       reader. (#R288's `applyMonth` wiring went with the reanalysis source it existed for.) */
    (function wireClock(n){ try{ const C=window.IntMapTime;
      if(C&&C.on){ C.on(()=>{ try{ if(anyOn()){ touchTime(); } }catch(_){} }); return; }
    }catch(_){}
      if((n|0)<60) setTimeout(()=>wireClock((n|0)+1),200); })(0);

    /* ── the Layers-panel rows ───────────────────────────────────────────────────────────────── */
    function relabelRows(){ LAYERS.forEach(l=>{ const s=document.querySelector('#lyrrow-'+l.id+' .ec-lbl'); if(s) s.textContent=ecLbl(l); }); if(anyOn()) renderLegend(); }
    function mountRows(){
      const dd=document.getElementById('layer-dropdown'); if(!dd||rowsMounted) return;
      rowsMounted=true;
      LAYERS.forEach(l=>{
        if(l.sub) return;   /* (#R438) a sub-layer's switch lives in its parent's legend, not here */
        if(document.getElementById('lyrrow-'+l.id)) return;
        const w=document.createElement('div'); w.className='lyr-row'; w.id='lyrrow-'+l.id;
        w.innerHTML='<label class="layer-option"><input type="checkbox" id="dl-'+l.id+'"> <span class="ec-lbl">'+ecLbl(l)+'</span></label><input type="range" class="lyr-op ec-op" data-for="'+l.id+'" min="0" max="1" step="0.05" value="'+state[l.id].op+'">';
        dd.appendChild(w);
        const cb=w.querySelector('#dl-'+l.id), op=w.querySelector('.ec-op');
        cb.addEventListener('change',()=>{ w.classList.toggle('on',cb.checked); toggle(l.id,cb.checked); });
        op.addEventListener('input',()=>{ state[l.id].op=+op.value; const cfg=LAYERS.find(x=>x.id===l.id); if(cfg) setOp(cfg,+op.value); });
      });
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){}
      /* ⚠ the metadata is a 3 kB JSON and needs no SDK, so the forecast axis is real from boot;
         the 340 kB tile SDK is only fetched when a layer is actually switched on. */
      EC().meta().then(()=>{ pruneMissing(); if(anyOn()) renderLegend(); }).catch(()=>{});
    }
    /* A variable the feed stopped publishing takes its row with it, instead of leaving a checkbox
       that paints nothing — which is exactly how ec-sst survived nine rounds. */
    /* ⚠ (#R356) 「THE FEED」 IS NOW MORE THAN ONE FEED. This asked the default model and removed the
       row if THAT model had stopped publishing the variable. With a picker on every legend that is
       the wrong question: a field ECMWF drops but ICON still publishes is a row the reader can
       still draw, and deleting it would take the choice away without saying so. The row goes only
       when NO model on offer has the variable — which is the condition ec-sst actually met.
       ⚠ Only models whose metadata has ARRIVED get a vote. A model that has not answered yet is not
       evidence of absence, so an un-fetched model never causes a row to be deleted. */
    function pruneMissing(){
      const E=EC(); if(!E.metaSync()) return;
      const metas=[];
      /* (#R376) peek: a model nobody has read from is not evidence that a variable is gone */
      MODEL_CHOICES().forEach(m=>{ try{ const i=ENG().peek?ENG().peek(m.id):ENG().model(m.id), md=i&&i.metaSync(); if(md) metas.push(i); }catch(_){} });
      if(!metas.length) metas.push(E);
      LAYERS.slice().forEach(l=>{ if(metas.some(i=>i.has(l.variable))) return;
        const row=document.getElementById('lyrrow-'+l.id); if(row) row.remove();
        const i=LAYERS.indexOf(l); if(i>=0) LAYERS.splice(i,1);
        delete state[l.id];
      });
    }

    /* re-attach after a style swap */
    GE().events.on('styledata',()=>{ if(anyOn()){ setTimeout(()=>{ if(!_imCanDraw())return; let put=false;
      activeLayers().forEach(cfg=>{ if(addLayer(cfg)){ setVis(cfg,true); setOp(cfg,state[cfg.id].op); put=true; } });
      if(put) raiseSubs(); },80); } });
    /* ⚠⚠ (#R438) `lift` FIRST — it is the rescue from under the night shading (#R299) and it moves
       nothing that is already above it — and the sub-layers go back on top ONLY IF ONE OF THEM
       ACTUALLY MOVED. `raiseSubs` moves layers, moving a layer makes the map draw again, and a draw
       ends in another `idle`: raising unconditionally here is an infinite loop, at two moveLayer
       calls a frame, for as long as the contours are on. `lift`'s own boolean is what breaks it —
       once everything is above the shading it is false for ever and this costs nothing. */
    GE().events.on('idle',()=>{ if(!anyOn()) return; let moved=false;
      activeLayers().forEach(cfg=>curIds(cfg).forEach(l=>{ try{ if(EC(cfg).lift(l)) moved=true; }catch(_){} }));
      if(moved) raiseSubs(); });
    /* ⚠ (#R284) `index` fires on EVERY slider pixel and `time` once the drag has settled — see
       IntMapECMWF.setIndex. `index` therefore updates the one thing that must feel instant, IN
       PLACE: re-rendering the box would replace the button under the reader's finger.
       ⚠ (#R288) …and that thing is each layer's own 「いつの絵か」 line, because the separate clock
       box that used to hold a copy of it is gone. */
    function touchTime(only){ try{
      (only||activeLayers()).forEach(cfg=>{ const el=boxes[cfg.id]; if(!el) return;
        const w=el.querySelector('.ecl-when'); if(w) w.textContent=whenLine(cfg); });
    }catch(_){} }
    /* (#R356) the default model is wired at start-up; every other one is wired the first time a
       layer is actually put on it (`setModel`), so a session that never switches subscribes once. */
    wireModel(EC());

    mountRows(); setTimeout(mountRows,1500);
    window.addEventListener('intmap-lang',relabelRows);
    window.addEventListener('intmap-units',()=>{ if(anyOn()) renderLegend(); });

    /* ── the share link ──────────────────────────────────────────────────────────────────────
       「共有URLに、選択中の気象レイヤー、ECMWF有効時刻、透明度を保存し、同じ表示を復元できるように」
       The CHECKBOXES are already carried by the `l=` parameter (they are ordinary dl-* ids). What was
       not carried is the forecast hour and the opacities, and an hour is the difference between two
       different pictures of the weather. The valid time travels as an INSTANT, not as an index: the
       reader who opens the link may be on a newer model run whose index 6 is a different hour. */
    try{ const io=shareIO();
      if(window.IntMapShareState&&window.IntMapShareState.register) window.IntMapShareState.register('weatherEC',io);
      else { window._imShareEarly=window._imShareEarly||[]; window._imShareEarly.push(['weatherEC',io]); } }catch(_){}
    function shareIO(){ return {
      get(){ const o={}; const ops={}; const mdl={};
        LAYERS.forEach(l=>{ if(state[l.id].on&&state[l.id].op!==l.op) ops[l.id]=+state[l.id].op.toFixed(2); });
        /* ⚠ (#R356) 「共有URLに…選択モデル」 — only where it DIFFERS from the default, so an old link
           and a link from a reader who never touched the picker stay byte-identical to what they
           were before this round. A key that is always present is a key that has to be parsed by
           every reader of every old URL. */
        try{ const def=WXM().defaultId();
          LAYERS.forEach(l=>{ if(state[l.id].on&&state[l.id].model&&state[l.id].model!==def) mdl[l.id]=state[l.id].model; }); }catch(_){}
        const vt=EC().validTime(); if(vt&&EC().index()!==EC().nowIndex()) o.t=vt;
        if(Object.keys(ops).length) o.op=ops;
        if(Object.keys(mdl).length) o.m=mdl;
        /* ⚠ (#R438) THE TWO SWITCHES THAT ARE NO LONGER CHECKBOXES HAVE TO TRAVEL HERE. The `l=`
           parameter carries `dl-*` ids, and the isobars and the per-layer streaks are not rows any
           more — so a link that showed contours over the pressure field would open without them.
           Written only when they are ON, so an old link and a link from a reader who never touched
           either switch stay byte-identical to what they were before this round. */
        if(isoOn&&state['ec-slp']&&state['ec-slp'].on) o.iso=1;
        const pr=PARTS_IDS.filter(id=>parts[id]&&state[id]&&state[id].on);
        if(pr.length) o.wp=pr.join(',');
        try{ const ws=document.getElementById('op-wind'); const wo=ws?+ws.value:1; if(isFinite(wo)&&wo!==1) o.wo=+wo.toFixed(2); }catch(_){}
        return Object.keys(o).length?o:null; },
      set(v){ if(!v) return;
        EC().meta().then(()=>{
          if(v.t){ const ms=Date.parse(/[zZ]$/.test(v.t)?v.t:v.t+'Z'); if(isFinite(ms)) EC().setIndex(EC().nearestTo(ms)); }
          if(v.op) Object.keys(v.op).forEach(id=>{ if(!state[id]) return; state[id].op=+v.op[id];
            const sl=document.querySelector('.ec-op[data-for="'+id+'"]'); if(sl) sl.value=state[id].op;
            const cfg=LAYERS.find(l=>l.id===id); if(cfg) setOp(cfg,state[id].op); });
          /* ⚠⚠ (#R356) A MODEL THAT NO LONGER EXISTS IS SAID OUT LOUD, not silently swapped. 「復元時に
             データが公開終了していた場合は、最も近い時刻へ黙って変更せず、復元できなかった項目と代替候補
             を明示」 — the same rule for models. `setModel` refuses with a reason and puts the picker
             back on the model that IS drawing, which is the honest end state. */
          if(v.m) Object.keys(v.m).forEach(id=>{ if(!state[id]) return; setModel(id,v.m[id]); });
          /* (#R438) …and the two that are not checkboxes. `setIsobars`/`setParts` are the same one
             door the legend box and Atlas use, so a restore cannot leave the switch and the picture
             disagreeing. ⚠ `l=` has already ticked the parent rows by the time this runs. */
          if(v.iso!=null) setIsobars(!!(+v.iso));
          if(v.wp!=null) String(v.wp).split(',').forEach(id=>{ if(id in PARTS_KEYS) setParts(id,true); });
          if(v.wo!=null){ const s=document.getElementById('op-wind'); if(s){ s.value=v.wo; s.dispatchEvent(new Event('input',{bubbles:true})); } }
        }).catch(()=>{});
      } }; }

    return { open(){ if(!anyOn()) return; legendLayers().forEach(l=>{ boxFor(l).style.display='block'; }); renderLegend(); },
      toggle, setOp:(id,op)=>{ const c=LAYERS.find(l=>l.id===id); if(c) setOp(c,op); },
      layerFor:(id)=>LAYERS.find(l=>l.id===id)||null,
      activeVariable:()=>{ const a=activeLayers().filter(l=>l.type==='raster'); return a.length?a[a.length-1]:null; },
      /* (#R356) the model a layer reads, for Atlas and for the readout. ⚠ `modelOf` answers with
         what is DISPLAYED, `setModel` asks for a change — they are deliberately different words for
         the two different questions, so a caller cannot read one and mean the other. */
      setModel, models:()=>MODEL_CHOICES().map(m=>({id:m.id,name:m.nameKey,km:m.km})),
      /* ⚠⚠ (#R376) THE INSTANCE A LAYER READS. js/map-readout.js sampled window.IntMapECMWF —
         the DEFAULT model — so after a layer was switched to ICON the cursor still printed
         ECMWF numbers, with ECMWF's valid time beside them, over an ICON picture. That is
         「地図・粒子・凡例・地点値が同じ表示状態を参照」 broken at the one place it is easiest
         not to notice, because a plausible number is not a visibly wrong one. */
      engineFor:(id)=>{ const c=LAYERS.find(l=>l.id===id); return c?EC(c):EC(); },
      modelOf:(id)=>{ const c=LAYERS.find(l=>l.id===id); const d=c&&displayed(c); return d?d.modelId:null; },
      provenanceOf:(id)=>{ const c=LAYERS.find(l=>l.id===id); return (c&&displayed(c))||null; },
      /* (#R438) the two switches that are not rows. Same read/write shape as everything else here;
         the published doors are `window._imWxParts` / `window._imWxIsobars`. */
      parts:partsOn, setParts, partsLayers:()=>PARTS_IDS.slice(),
      isobars:isobarsOn, setIsobars,
      _layers:LAYERS, _state:state };
  })();
};

window.IntMapModules.weatherPanel=function(HOST){
  const GE=()=>window.IntMapGeoEngine;
  const t=HOST.t, fmtTemp=HOST.fmtTemp;
  window.IntMapWeather=(function(){
    if(!GE().hasRenderer()) return { open(){} };
    const L=window.IntMapLang.pick(()=>HOST.lang);
    const LA=window.IntMapLang.pickArgs();
    function wx(code){ const M={
      0:{i:'☀️',d:LA('Clear sky','快晴','Klarer Himmel','Ясно','Despejado')},1:{i:'🌤',d:LA('Mainly clear','晴れ','Überwiegend klar','Преим. ясно','Mayormente despejado')},
      2:{i:'⛅',d:LA('Partly cloudy','一部曇り','Teilweise bewölkt','Переменная облачность','Parcialmente nublado')},3:{i:'☁️',d:LA('Overcast','曇り','Bedeckt','Пасмурно','Nublado')},
      45:{i:'🌫',d:LA('Fog','霧','Nebel','Туман','Niebla')},48:{i:'🌫',d:LA('Rime fog','着氷霧','Reifnebel','Изморозь','Niebla helada')},
      51:{i:'🌦',d:LA('Light drizzle','弱い霧雨','Leichter Niesel','Слабая морось','Llovizna débil')},53:{i:'🌦',d:LA('Drizzle','霧雨','Niesel','Морось','Llovizna')},55:{i:'🌧',d:LA('Heavy drizzle','強い霧雨','Starker Niesel','Сильная морось','Llovizna intensa')},
      61:{i:'🌧',d:LA('Light rain','弱い雨','Leichter Regen','Небольшой дождь','Lluvia débil')},63:{i:'🌧',d:LA('Rain','雨','Regen','Дождь','Lluvia')},65:{i:'🌧',d:LA('Heavy rain','強い雨','Starker Regen','Сильный дождь','Lluvia intensa')},
      66:{i:'🌧',d:LA('Freezing rain','着氷性の雨','Gefrierender Regen','Ледяной дождь','Lluvia helada')},67:{i:'🌧',d:LA('Freezing rain','着氷性の雨','Gefrierender Regen','Ледяной дождь','Lluvia helada')},
      71:{i:'🌨',d:LA('Light snow','弱い雪','Leichter Schnee','Небольшой снег','Nieve débil')},73:{i:'🌨',d:LA('Snow','雪','Schnee','Снег','Nieve')},75:{i:'❄️',d:LA('Heavy snow','大雪','Starker Schnee','Сильный снег','Nieve intensa')},77:{i:'❄️',d:LA('Snow grains','霧雪','Schneegriesel','Снежные зёрна','Granos de nieve')},
      80:{i:'🌦',d:LA('Light showers','弱いにわか雨','Leichte Schauer','Слабый ливень','Chubascos débiles')},81:{i:'🌦',d:LA('Showers','にわか雨','Schauer','Ливни','Chubascos')},82:{i:'⛈',d:LA('Heavy showers','激しいにわか雨','Starke Schauer','Сильные ливни','Chubascos intensos')},
      85:{i:'🌨',d:LA('Snow showers','にわか雪','Schneeschauer','Снежный ливень','Chubascos de nieve')},86:{i:'🌨',d:LA('Snow showers','にわか雪','Schneeschauer','Снежный ливень','Chubascos de nieve')},
      95:{i:'⛈',d:LA('Thunderstorm','雷雨','Gewitter','Гроза','Tormenta')},96:{i:'⛈',d:LA('Thunderstorm, hail','雹を伴う雷雨','Gewitter, Hagel','Гроза с градом','Tormenta, granizo')},99:{i:'⛈',d:LA('Thunderstorm, hail','雹を伴う雷雨','Gewitter, Hagel','Гроза с градом','Tormenta, granizo')} };
      /* ⚠ (#R241) THE ICON IS NOT A TRANSLATION, so it is no longer element 0 of a language array. */
      const e=M[code]; return e?{icon:e.i,desc:L.arr(e.d)}:{icon:'🌡',desc:'—'}; }
    /* (#R289) the sixteen points come from js/compass.js. 「日本語設定でも…NEと表示される」 was reported
       against the always-on readout; it was true of this popup too, and of four other panels. */
    const dir=(d)=>(d==null||isNaN(d))?'':window.IntMapCompass.point(d,HOST.lang,16);
    /* 「地図の単位設定を反映する」 — the wind figure follows the SAME unit pulldown the wind legend
       has (m/s · km/h · kn · mph), not a private km/h-plus-mph string of its own. */
    const wind=(kmh)=>{ if(kmh==null||isNaN(kmh)) return '—';
      try{ if(window.fmtWindSpeed) return window.fmtWindSpeed(kmh/3.6); }catch(_){}
      const m=window.imUnitMode||window.unitMode||'both'; const k=Math.round(kmh), mph=Math.round(kmh*0.621371);
      return m==='imperial'?(mph+' mph'):m==='metric'?(k+' km/h'):(k+' km/h ('+mph+' mph)'); };
    const dT=(c)=>{ if(c==null||isNaN(c)) return '—'; return ((window.imUnitTemp==='f')?Math.round(c*9/5+32):Math.round(c))+'°'; };
    const fF=(c)=>(c==null||isNaN(c))?'–':Math.round(c*9/5+32);
    let panel=null, styled=false, _lastLL=null;
    function ensureStyle(){ if(styled) return; styled=true; const s=document.createElement('style');
      s.textContent='#weather-panel{position:absolute;z-index:1750;width:300px;max-width:calc(100vw - 24px);background:var(--popup-bg);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.2));border-radius:16px;box-shadow:var(--shadow);backdrop-filter:saturate(180%) blur(18px);-webkit-backdrop-filter:saturate(180%) blur(18px);padding:14px 16px;font-size:12.5px;}'
        +'#weather-panel .wp-x{position:absolute;top:9px;right:11px;background:none;border:none;color:var(--text-muted);font-size:19px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:8px;}'
        +'#weather-panel .wp-x:hover{background:var(--input-bg);color:var(--text-main);}'
        +'#weather-panel .wp-rf{position:absolute;top:10px;right:39px;background:none;border:none;color:var(--text-muted);font-size:16px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:8px;}'
        +'#weather-panel .wp-rf:hover{background:var(--input-bg);color:var(--text-main);transform:rotate(90deg);transition:transform .2s;}'
        +'#weather-panel .wp-head{padding-right:58px;touch-action:none;user-select:none;}'
        +'#weather-panel .wp-cur{display:flex;align-items:center;gap:12px;margin:6px 0 4px;}'
        +'#weather-panel .wp-temp{font-size:30px;font-weight:700;line-height:1;}'
        +'#weather-panel .wp-ico{font-size:34px;line-height:1;}'
        +'#weather-panel .wp-grid{display:grid;grid-template-columns:1fr 1fr;gap:3px 12px;margin-top:8px;font-size:11.5px;color:var(--text-muted);}'
        +'#weather-panel .wp-grid b{color:var(--text-main);font-weight:600;}'
        +'#weather-panel .wp-days{display:flex;gap:4px;margin-top:11px;border-top:1px solid rgba(128,128,128,0.18);padding-top:9px;}'
        +'#weather-panel .wp-day{flex:1;text-align:center;font-size:10.5px;color:var(--text-muted);}'
        +'#weather-panel .wp-day .di{font-size:18px;margin:2px 0;}'
        +'#weather-panel .wp-day b{display:block;color:var(--text-main);font-size:11px;}'
        +'#weather-panel .wp-dayf{font-size:8.5px;color:var(--text-muted);margin-top:1px;line-height:1.2;}'
        +'@media(max-width:768px){#weather-panel{left:8px !important;right:8px;width:auto;top:auto !important;bottom:calc(var(--sheet-cover, var(--peek-h)) + 12px) !important;}}';
      document.head.appendChild(s); }
    function ensure(){ if(panel) return panel; ensureStyle(); panel=document.createElement('div'); panel.id='weather-panel'; panel.style.display='none';
      (document.getElementById('map-container')||document.body).appendChild(panel);
      try{ window._wireLegendDrag&&window._wireLegendDrag(panel); }catch(_){}
      return panel; }
    function close(){ if(panel) panel.style.display='none'; }
    function place(){ try{ if(panel&&panel.dataset.dragged) return; const mc=document.getElementById('map-container'); if(!mc) return; if(window.matchMedia&&window.matchMedia('(max-width:768px)').matches) return; panel.style.left=(mc.clientWidth-panel.offsetWidth-22)+'px'; panel.style.top='70px'; }catch(_){} }
    /* (#R183) ONE guarded weather client for the whole app — window.IntMapWx (js/wx-source.js).
       `_metNo` stays as a thin alias because the name appears in the #R72 notes and in tests. */
    const _metNo=(lat,lng)=>window.IntMapWx.metNo(lat,lng);
    /* the instant the numbers are FOR, on the reader's clock — see the note beside `upd` below */
    function fmtInstant(iso){
      try{ if(window.IntMapECMWF) return window.IntMapECMWF.fmt(iso,{hour:'2-digit',minute:'2-digit',month:'short',day:'numeric'}); }catch(_){}
      try{ return new Date(iso).toLocaleString(window.IntMapLang.locale(HOST.lang,'en-GB'),{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }catch(_){ return iso; }
    }

    /* ⚠ (#R276) THE MODEL IS NAMED, AND IT IS NAMED CORRECTLY. Open-Meteo's forecast endpoint with
       no `models=` parameter is the BEST-MATCH blend — it is not GFS, which is what this app printed
       under the wind legend for eleven rounds. `_src` says which SERVICE answered; this says which
       MODEL inside it did, and it comes from the response, never from a guess. */
    function modelName(j){
      if(!j) return '';
      const src=j._src||'Open-Meteo';
      if(src!=='Open-Meteo') return src;
      /* ⚠ NOT A TRANSLATION. 「Best match」 is Open-Meteo's own name for the no-`models=` default —
         the setting is called that in their console and their docs — and a model name that changes
         with the reader's language is a model name nobody can look up. It is data, like the ECMWF
         run hour beside it, so it is not an L(…) site and the positional audit does not count it. */
      const m=j.model;
      return 'Open-Meteo · '+((!m||m==='best_match')?'Best match':m);
    }
    async function open(lngLat,opt){ const p=ensure(); _lastLL=lngLat; p.style.display='block'; place();
      const lat=lngLat.lat, lng=lngLat.lng;
      const head=`<button class="wp-x" title="${t('close')}">×</button><button class="wp-rf" title="${L('Refresh','更新','Aktualisieren','Обновить','Actualizar')}">⟳</button><h4 class="wp-head" style="margin:0;font-weight:700;font-size:13.5px;cursor:move;">🌤 ${L('Weather','天気','Wetter','Погода','El tiempo')}</h4><div style="font-size:10.5px;color:var(--text-muted);margin-top:1px;">${lat.toFixed(3)}°, ${lng.toFixed(3)}°</div>`;
      p.innerHTML=head+`<div style="margin-top:12px;color:var(--text-muted);">${L('Loading…','読み込み中…','Wird geladen…','Загрузка…','Cargando…')}</div>`;
      p.querySelector('.wp-x').onclick=close; { const rf=p.querySelector('.wp-rf'); if(rf) rf.onclick=()=>open(_lastLL||lngLat,{fresh:true}); }
      try{
        /* ⚠ 「更新ボタンはキャッシュを確実に無効化する」 — the old ⟳ re-entered open(), which hit a
           private 10-minute per-location cache AND IntMapWx's 5-minute one, so pressing it could not
           possibly produce a newer number. `ttl:0` is what makes the button mean what it says. */
        const j=await window.IntMapWx.point(lat,lng,{days:5,uv:false,gusts:true,ttl:(opt&&opt.fresh)?0:300000});
        if(!j) throw new Error('all weather sources failed');
        const c=j.current||{}; const w=wx(c.weather_code);
        const days=(j.daily&&j.daily.time)||[]; const dn=L(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],['日','月','火','水','木','金','土'],['So','Mo','Di','Mi','Do','Fr','Sa'],['Вс','Пн','Вт','Ср','Чт','Пт','Сб'],['Do','Lu','Ma','Mi','Ju','Vi','Sá']);
        const _both=(window.imUnitTemp||'both')==='both';
        let dh=''; for(let i=0;i<days.length;i++){ const d=new Date(days[i]+'T00:00'); const dw=wx(j.daily.weather_code[i]);
          const mx=j.daily.temperature_2m_max[i], mn=j.daily.temperature_2m_min[i];
          const ff=_both?('<div class="wp-dayf">'+fF(mx)+'/'+fF(mn)+'°F</div>'):'';
          dh+=`<div class="wp-day"><div>${i===0?L('Today','今日','Heute','Сег.','Hoy'):dn[d.getDay()]}</div><div class="di">${dw.icon}</div><b>${dT(mx)}</b><div>${dT(mn)}</div>${ff}</div>`; }
        /* ⚠ 「「更新時刻」にはブラウザ時刻ではなくデータの有効時刻を表示する」 — `new Date()` said when
           the panel was drawn, which is never what the reader wants to know: an observation an hour
           old drawn a second ago printed the second. `current.time` is the instant the numbers are
           FOR, and both sources supply it. */
        const upd=c.time?fmtInstant(c.time):'—';
        const mslp=(c.pressure_msl!=null)?c.pressure_msl:(c.surface_pressure!=null?c.surface_pressure:null);
        p.innerHTML=head
          +`<div class="wp-cur"><span class="wp-ico">${w.icon}</span><span class="wp-temp">${fmtTemp(c.temperature_2m)}</span><span style="flex:1;font-size:12px;color:var(--text-muted);">${w.desc}</span></div>`
          +`<div class="wp-grid">`
          +`<span>${L('Feels like','体感','Gefühlt','Ощущается','Sensación')}<br><b>${fmtTemp(c.apparent_temperature)}</b></span>`
          +`<span>${L('Humidity','湿度','Luftf.','Влажность','Humedad')}<br><b>${c.relative_humidity_2m!=null?Math.round(c.relative_humidity_2m)+'%':'—'}</b></span>`
          +`<span>${L('Wind','風','Wind','Ветер','Viento')}<br><b>${wind(c.wind_speed_10m)} ${dir(c.wind_direction_10m)}</b></span>`
          +`<span>${L('Gusts','突風','Böen','Порывы','Rachas')}<br><b>${wind(c.wind_gusts_10m)}</b></span>`
          +`<span>${L('Pressure (MSL)','海面気圧','Druck (NN)','Давление (у.м.)','Presión (NM)')}<br><b>${mslp!=null?Math.round(mslp)+' hPa':'—'}</b></span>`
          +`<span>${L('Precip.','降水','Niederschl.','Осадки','Precip.')}<br><b>${c.precipitation!=null?c.precipitation+' mm':'—'}</b></span>`
          +`<span style="grid-column:1/-1;">${L('Valid at','有効時刻','Gültig','Действительно на','Válido a las')}<br><b>${upd}</b></span>`
          +`</div><div class="wp-days">${dh}</div>`
          +`<div style="margin-top:9px;font-size:9.5px;color:var(--text-muted);">${modelName(j)} · ${L('drag to move','ドラッグで移動','zum Verschieben ziehen','перетащите','arrastra para mover')}</div>`;
        p.querySelector('.wp-x').onclick=close; { const rf=p.querySelector('.wp-rf'); if(rf) rf.onclick=()=>open(_lastLL||lngLat,{fresh:true}); } place();
      }catch(e){ p.innerHTML=head+`<div style="margin-top:12px;color:#ff453a;">${L('Weather temporarily unavailable (both weather services could not be reached — possibly rate-limited). Try again in a few minutes.','天気を一時的に取得できません（両方の気象サービスに接続できませんでした。レート制限の可能性があります）。数分後に再試行してください。','Wetter vorübergehend nicht verfügbar (beide Wetterdienste unerreichbar). Bitte später erneut versuchen.','Погода временно недоступна (оба сервиса не отвечают). Повторите позже.','El tiempo no está disponible temporalmente (ninguno de los servicios respondió). Inténtalo de nuevo en unos minutos.')}</div>`; const x=p.querySelector('.wp-x'); if(x) x.onclick=close; }
    }
    return { open, close };
  })();
};
