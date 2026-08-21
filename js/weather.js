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
    function _timeUI(id,E,L){
      if(!E) return '';
      const n=E.count(); if(!n) return '';
      const i=E.index(), playing=!!E.isPlaying(), times=E.times(), now=E.nowIndex();
      const opt=(k)=>'<option value="'+k+'"'+(k===i?' selected':'')+'>'+E.fmt(times[k])
        +(k===now?(' · '+L('now','現在','jetzt','сейчас','ahora')):'')+'</option>';
      let o=''; for(let k=0;k<n;k++) o+=opt(k);
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
    const SLOT=[{src:'wind-field-a-src',lyr:'wind-field-a'},{src:'wind-field-b-src',lyr:'wind-field-b'}];
    let slot=0, liveKey='';
    let on=false, raf=0, moving=false, opacity=1, renderer=null, loading=false, lastErr='';
    /* (#R293) the last field that answered, and the hour it is of — see `sampleAt` below */
    let _lastField=null, _lastFieldAt=null;
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
    /* (#R290) the same rule the ECMWF rasters follow — see whenSourceLoaded in weatherEC below */
    function _whenSrcLoaded(sid,then,maxMs){
      let done=false;
      const fin=()=>{ if(done) return; done=true;
        try{ GE().events.off('sourcedata',h); }catch(_){}
        try{ then(); }catch(_){} };
      const h=(e)=>{ if(e&&e.sourceId===sid&&e.isSourceLoaded) fin(); };
      try{ GE().events.on('sourcedata',h); }catch(_){ setTimeout(fin,600); return; }
      setTimeout(fin,maxMs||12000);
    }
    function addField(key){
      if(!_imCanDraw()) return false;
      if(!EC().registerProtocol()) return false;   /* (#R288) — see the note in weatherEC.addSlot */
      const s=SLOT[slot], url=EC().omUrl(VAR);
      if(!url) return false;
      try{
        if(GE().layers.has(s.lyr)) GE().layers.remove(s.lyr);
        if(GE().layers.hasSource(s.src)) GE().layers.removeSource(s.src);
        GE().layers.addSource(s.src,{type:'raster',url:url,maxzoom:12});
        GE().layers.add({id:s.lyr,type:'raster',source:s.src,
          paint:{'raster-opacity':0,'raster-opacity-transition':{duration:260},'raster-fade-duration':0,'raster-resampling':'linear'}},EC().before());
      }catch(_){ return false; }
      const old=SLOT[1-slot];
      const reveal=()=>{ try{ if(!on) return;
        EC().lift(s.lyr);                        /* the terminator must not dim the data — see EC.before */
        if(GE().layers.has(s.lyr)) GE().layers.setPaint(s.lyr,'raster-opacity',opacity);
        if(GE().layers.has(old.lyr)) GE().layers.remove(old.lyr);
        if(GE().layers.hasSource(old.src)) GE().layers.removeSource(old.src);
      }catch(_){} };
      /* (#R290) the SOURCE says when it is showing — see the note on whenSourceLoaded above */
      _whenSrcLoaded(s.src,reveal,12000);
      slot=1-slot; liveKey=key;
      return true;
    }
    function removeField(){ SLOT.forEach(s=>{ try{ if(GE().layers.has(s.lyr)) GE().layers.remove(s.lyr); }catch(_){}
      try{ if(GE().layers.hasSource(s.src)) GE().layers.removeSource(s.src); }catch(_){} }); liveKey=''; }
    function setOpacity(v){ opacity=Math.max(0,Math.min(1,+v)); if(!on) return;
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
    function load(opt){
      if(!EC()) return Promise.resolve(null);
      const want=()=>EC().stateKey(VAR,'');
      loading=true; lastErr='';
      try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){}
      return EC().ready().then(()=>{
        const key=want();
        if(key&&key!==liveKey) ensureField(key);
        return EC().load(VAR,null,band());
      }).then(f=>{
        loading=false;
        if(!f){ lastErr='load';
          /* ⚠ THE LEGEND HAS TO BE REDRAWN ON THE FAILURE PATH TOO, or a layer that could not load
             keeps printing 「読み込み中…」 for ever — which is the silent shape this project keeps
             paying for. The toast is the notification; the legend is the standing answer. */
          try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){}
          try{ satToast(L('Wind data unavailable','風データを取得できませんでした','Winddaten nicht verfügbar','Данные о ветре недоступны','Datos de viento no disponibles')); }catch(_){}
          return null; }
        if(renderer){ const sf=EC().sampler(VAR); _lastField=sf||_lastField; _lastFieldAt=EC().validTime();
          renderer.setField(sf);
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
        if(opt&&opt.step){ try{ EC().prefetch(['wind_u_component_10m','wind_v_component_10m'],Math.min(EC().count()-1,EC().index()+1),band()); }catch(_){} }
        return f;
      }).catch(()=>{ loading=false; lastErr='load';
        try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){}
        return null; });
    }

    /* ── the renderer ─────────────────────────────────────────────────────────────────────────*/
    function ensureRenderer(){
      if(renderer) return renderer;
      renderer=window.IntMapWindGL.create(cv,{
        perPixels:isMobile()?900:320,
        maxParts:isMobile()?2200:6000,
        project:(lng,lat)=>{ try{ return GE().coords.project([lng,lat]); }catch(_){ return null; } },
        visible:visibleLL,
        zoom:()=>{ try{ return GE().camera.getZoom(); }catch(_){ return 2; } },
        randomLL:()=>{
          let b=null; try{ b=GE().camera.getBounds(); }catch(_){}
          for(let k=0;k<6;k++){
            let lo,la;
            if(b){ const w=b.getWest(),e=b.getEast(),s=Math.max(-89,b.getSouth()),n=Math.min(89,b.getNorth());
              lo=(e<w)?(w+(e+360-w)*Math.random()):(w+(e-w)*Math.random()); if(lo>180) lo-=360;
              la=s+(n-s)*Math.random(); }
            else { lo=Math.random()*360-180; la=Math.random()*178-89; }
            if(HOST.proj!=='globe'||visibleLL(lo,la)) return [lo,la];
          }
          return null;
        }
      });
      resize();
      return renderer;
    }
    function resize(){ const cont=document.getElementById('map-container'); if(!cont||!renderer) return;
      renderer.resize(cont.clientWidth,cont.clientHeight,Math.min(2,window.devicePixelRatio||1)); }

    function step(ts){
      if(!on) return;
      refreshView();
      try{ renderer&&renderer.tick(ts||performance.now(),moving); }catch(_){}
      raf=requestAnimationFrame(step);
    }

    function start(){
      on=true; cv.style.display='block';
      ensureRenderer();
      setOpacity(opacity);
      load();
      cancelAnimationFrame(raf); raf=requestAnimationFrame(step);
      try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){}
    }
    function stop(){
      on=false; cancelAnimationFrame(raf); raf=0;
      removeField();
      if(renderer){ renderer.clearTrails(); }
      cv.style.display='none';
      try{ EC()&&EC().release(VAR); }catch(_){}   /* only OUR frame — see IntMapECMWF.release */
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
      if(ev.type==='index'){ touchWindTime(); return; }
      try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){}
      if(!on) return;
      if(ev.type==='time'||ev.type==='meta'){ load({step:ev.type==='time'}); } }); }catch(_){}
    /* the forecast axis exists without the tile SDK — fetch it so the legend can name the run and
       the hour the moment the layer is switched on, rather than after a 340 kB script lands */
    try{ (window.IntMapECMWF||{meta:()=>Promise.resolve()}).meta().then(()=>{ try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){} }).catch(()=>{}); }catch(_){}

    window.addEventListener('resize',()=>{ if(on) resize(); });
    if(GE().hasRenderer()){
      GE().events.on('movestart',()=>{ moving=true; });
      GE().events.on('moveend',()=>{ moving=false; if(on){ resize();
        /* the view left the band that was read — the particles would sample NaN there, so read the
           new one. `bandCovers` is what stops this firing on every small pan. */
        try{ if(!EC().bandCovers(EC().heldBand(VAR),band())) load(); }catch(_){}
      } });
      /* a style swap drops custom sources — put the field back rather than leaving only streaks */
      GE().events.on('styledata',()=>{ if(!on) return; setTimeout(()=>{ if(on&&!GE().layers.has(SLOT[0].lyr)&&!GE().layers.has(SLOT[1].lyr)){ liveKey=''; load(); } },120); });
      /* …and if the data is already here but the layer is not, put it back rather than waiting for a
         style event that may never come (the #R85 defect above, seen from the other side) */
      GE().events.on('idle',()=>{ if(!on) return;
        try{ if(GE().layers.has(SLOT[0].lyr)||GE().layers.has(SLOT[1].lyr)) return; }catch(_){ return; }
        const key=EC()&&EC().stateKey(VAR,''); if(key){ liveKey=''; ensureField(key); } });
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
        const ticks=[0,0.25,0.5,0.75,1].map(k=>({pos:k*100,txt:Math.round((lg.min+(lg.max-lg.min)*k)*f)}));
        bar='<div class="ecl-bar" style="background:'+lg.css+';"></div>'
          +'<div class="ecl-ticks">'+ticks.map(k=>'<span style="left:'+k.pos.toFixed(1)+'%">'+k.txt+'</span>').join('')+'</div>';
      }
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
      body.innerHTML=bar+units+player+model+valid;
      const sel=body.querySelector('#wind-unit-sel');
      if(sel) sel.onchange=()=>{ window.windUnit=sel.value; try{ localStorage.setItem('intmap_wind_unit',window.windUnit); }catch(_){}
        try{ window.dispatchEvent(new Event('intmap-units')); }catch(_){}
        window._updateWindLegend(); try{ window.renderCoordReadout&&window.renderCoordReadout(); }catch(_){} };
      window.IntMapWxPlayer.wireTimeUI(body,'wind-time',E);
      try{ window._tileLegends&&window._tileLegends(); }catch(_){}
    };
    window.addEventListener('intmap-units',()=>{ try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){} });
    window.addEventListener('intmap-lang',()=>{ try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){} });

    return {
      toggle(v){ v?start():stop(); }, on:()=>on, stop, refetch:load, setOpacity,
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
      _dbg:()=>{ let hasLyr=false,op=null; const s=SLOT[1-slot];
        try{ hasLyr=!!GE().layers.has(s.lyr); if(hasLyr) op=GE().layers.getPaint(s.lyr,'raster-opacity'); }catch(_){}
        const smp=window.IntMapECMWF&&window.IntMapECMWF.sampler(VAR);
        const st=renderer?renderer.stats():{};
        return Object.assign({ on, hasField:!!smp, hasLyr, rasterOpacity:op, loading, lastErr,
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
    const EC=()=>window.IntMapECMWF;
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
       label:LA('Precipitation (ECMWF)','降水量（ECMWF）','Niederschlag (ECMWF)','Осадки (ECMWF)','Precipitación (ECMWF)'),
       desc:LA('Total precipitation forecast for the hour ending at the valid time.','有効時刻までの1時間降水量の予測。','Niederschlagsmenge der Stunde bis zur Gültigkeitszeit.','Осадки за час до указанного времени.','Precipitación de la hora que termina en la hora de validez.')},
      {id:'ec-wind',    variable:'wind_u_component_10m',type:'arrows', op:0.85, kind:'wind',
       label:LA('Wind 10 m arrows (ECMWF)','風 10m 矢羽根（ECMWF）','Wind 10 m, Pfeile (ECMWF)','Ветер 10 м, стрелки (ECMWF)','Viento 10 m, flechas (ECMWF)'),
       desc:LA('Wind direction arrows at 10 m, coloured by speed.','高度10mの風向を矢印で、速さで色分け。','Windrichtung in 10 m, nach Geschwindigkeit eingefärbt.','Направление ветра на 10 м, цвет по скорости.','Dirección del viento a 10 m, coloreada por velocidad.')},
      {id:'ec-gust',    variable:'wind_gusts_10m',      type:'raster', op:1,    kind:'wind',
       label:LA('Wind gusts (ECMWF)','最大瞬間風速（ECMWF）','Windböen (ECMWF)','Порывы ветра (ECMWF)','Rachas de viento (ECMWF)'),
       desc:LA('Strongest gust expected in the hour ending at the valid time.','有効時刻までの1時間に予想される最大瞬間風速。','Stärkste erwartete Bö in der Stunde bis zur Gültigkeitszeit.','Максимальный ожидаемый порыв за час.','Racha máxima prevista en la hora indicada.')},
      {id:'ec-cloud',   variable:'cloud_cover',         type:'raster', op:1,    kind:'raw',
       label:LA('Cloud cover (ECMWF)','雲量（ECMWF）','Bewölkung (ECMWF)','Облачность (ECMWF)','Nubosidad (ECMWF)'),
       desc:LA('Fraction of the sky covered by cloud.','空に占める雲の割合。','Anteil des von Wolken bedeckten Himmels.','Доля неба, закрытая облаками.','Fracción del cielo cubierta por nubes.')},
      {id:'ec-dew',     variable:'dew_point_2m',        type:'raster', op:1,    kind:'temp',
       label:LA('Dew point / humidity (ECMWF)','露点・湿度（ECMWF）','Taupunkt / Feuchte (ECMWF)','Точка росы / влажность (ECMWF)','Punto de rocío / humedad (ECMWF)'),
       desc:LA('Temperature at which the air would saturate — the moisture field.','空気が飽和する温度＝水蒸気量の指標。','Temperatur, bei der die Luft sättigt — das Feuchtefeld.','Температура насыщения воздуха — поле влажности.','Temperatura de saturación del aire — el campo de humedad.')},
      {id:'ec-isobars', variable:'pressure_msl',        type:'isobars',op:0.9,  kind:'raw',
       label:LA('Isobars (ECMWF)','等圧線（ECMWF）','Isobaren (ECMWF)','Изобары (ECMWF)','Isobaras (ECMWF)'),
       desc:LA('Lines of equal sea-level pressure, labelled in hPa.','海面気圧が等しい線。数値は hPa。','Linien gleichen Luftdrucks, in hPa beschriftet.','Линии равного давления, подписи в гПа.','Líneas de igual presión al nivel del mar, en hPa.')},
      {id:'ec-slp',     variable:'pressure_msl',        type:'raster', op:1,    kind:'raw',
       label:LA('Sea-level pressure (ECMWF)','海面気圧（ECMWF）','Luftdruck (Meereshöhe) (ECMWF)','Давление на уровне моря (ECMWF)','Presión al nivel del mar (ECMWF)'),
       desc:LA('Air pressure reduced to sea level — highs, lows and the storm centre.','海面更正気圧。高気圧・低気圧・台風の中心。','Auf Meereshöhe reduzierter Luftdruck — Hoch, Tief, Sturmzentrum.','Давление, приведённое к уровню моря.','Presión reducida al nivel del mar — altas, bajas y el centro de la tormenta.')},
      {id:'ec-cape',    variable:'cape',                type:'raster', op:1,    kind:'raw',
       label:LA('CAPE instability (ECMWF)','CAPE 不安定度（ECMWF）','CAPE-Instabilität (ECMWF)','Неустойчивость CAPE (ECMWF)','Inestabilidad CAPE (ECMWF)'),
       desc:LA('Convective available potential energy: how much lift a thunderstorm could draw on.','対流有効位置エネルギー。積乱雲が使える浮力の量。','Konvektiv verfügbare potentielle Energie — das Gewitterpotential.','Доступная конвективная энергия — потенциал гроз.','Energía potencial convectiva disponible: el combustible de las tormentas.')}
    ];
    const ecLbl=(l)=>L.arr(l.label);
    const ecDesc=(l)=>L.arr(l.desc);
    const state={};   /* id → {on, op, src, month} */
    LAYERS.forEach(l=>state[l.id]={on:false, op:l.op});
    let mounted=false, rowsMounted=false;

    function omUrl(cfg,extra){ return EC().omUrl(cfg.variable,extra); }

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
    function addSlot(cfg,s){
      const sid=cfg.id+'-'+s+'-src', lid=cfg.id+'-'+s, lbl=lid+'-lbl';
      const before=EC().before();
      /* ⚠⚠ (#R288) NO `om://` URL BEFORE THE PROTOCOL EXISTS. `state[id].on` is set synchronously
         by `toggle`, and the styledata/idle re-add hooks below fire off that flag — so a layer
         could be rebuilt while the 340 kB tile SDK was still downloading, handing MapLibre a
         scheme with no handler. It then fetches it natively, which is a CSP violation and never a
         tile. The retry ladders already re-call this, so refusing is the whole fix. */
      if(!EC().registerProtocol()) return false;
      const url=omUrl(cfg,cfg.type==='arrows'?'&arrows=true':'');
      if(!url) return false;
      try{
        if(cfg.type==='isobars'){
          if(!GE().layers.hasSource(sid)) GE().layers.addSource(sid,{type:'vector',url:url});
          if(!GE().layers.has(lid)) GE().layers.add({id:lid,type:'line',source:sid,'source-layer':'contours',layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':'rgba(255,255,255,0.9)','line-width':1.1,'line-opacity':cfg.op}},before);
          if(!GE().layers.has(lbl)) GE().layers.add({id:lbl,type:'symbol',source:sid,'source-layer':'contours',layout:{visibility:'none','symbol-placement':'line','text-field':['get','value'],'text-size':window.IntMapLabelScale.sub(0.82)},paint:{'text-color':'#fff','text-halo-color':'rgba(0,0,0,0.7)','text-halo-width':1.2}},before);
        } else if(cfg.type==='arrows'){
          if(!GE().layers.hasSource(sid)) GE().layers.addSource(sid,{type:'vector',url:url});
          if(!GE().layers.has(lid)) GE().layers.add({id:lid,type:'line',source:sid,'source-layer':'wind-arrows',layout:{visibility:'none','line-cap':'round'},paint:{'line-width':1.8,'line-opacity':cfg.op,'line-color':['interpolate',['linear'],['to-number',['get','value'],0],0,'#5b8ff9',6,'#36cfc9',12,'#73d13d',18,'#ffd666',26,'#ff7a45',36,'#cf1322']}},before);
        } else {
          if(!GE().layers.hasSource(sid)) GE().layers.addSource(sid,{type:'raster',url:url,maxzoom:12});
          if(!GE().layers.has(lid)) GE().layers.add({id:lid,type:'raster',source:sid,layout:{visibility:'none'},paint:{'raster-opacity':cfg.op,'raster-opacity-transition':{duration:220},'raster-fade-duration':0}},before);
        }
        slotIds(cfg,s).forEach(l=>{ try{ EC().lift(l); }catch(_){} });
        return true;
      }catch(e){ try{ console.warn('ECMWF add fail',cfg.id,e); }catch(_){} return false; }
    }
    function dropSlot(cfg,s){ slotIds(cfg,s).forEach(l=>{ try{ if(GE().layers.has(l)) GE().layers.remove(l); }catch(_){} });
      try{ const sid=cfg.id+'-'+s+'-src'; if(GE().layers.hasSource(sid)) GE().layers.removeSource(sid); }catch(_){} }
    function addLayer(cfg){ return addSlot(cfg,cfg._s|0); }
    function removeLayer(cfg){ dropSlot(cfg,0); dropSlot(cfg,1); }
    function setVisSlot(cfg,s,on){ slotIds(cfg,s).forEach(l=>{ try{ if(GE().layers.has(l)) GE().layers.setLayout(l,'visibility',on?'visible':'none'); }catch(_){} }); }
    function setVis(cfg,on){ setVisSlot(cfg,cfg._s|0,on); if(!on) setVisSlot(cfg,1-(cfg._s|0),false); }
    function setOpSlot(cfg,s,op){ const lid=cfg.id+'-'+s;
      try{ if(cfg.type==='isobars'||cfg.type==='arrows'){ if(GE().layers.has(lid)) GE().layers.setPaint(lid,'line-opacity',op); }
        else if(GE().layers.has(lid)) GE().layers.setPaint(lid,'raster-opacity',op); }catch(_){} }
    function setOp(cfg,op){ setOpSlot(cfg,cfg._s|0,op); }
    const liveLayer=(cfg)=>{ try{ return GE().layers.has(cfg.id+'-'+(cfg._s|0)); }catch(_){ return false; } };

    function toggle(id,on){ const cfg=LAYERS.find(l=>l.id===id); if(!cfg) return;
      state[id].on=on;
      syncLegend();
      if(!on){ setVis(cfg,false); return; }
      /* (#R290) 「気温レイヤーをオンにしたときも海岸線・湖岸線を自動オン。」 — the same latch the wind
         uses (js/coast-line.js `_imCoastAuto`), for the same reason: a full-planet colour field
         hides the basemap, and the coast is what tells the reader where they are looking. It fires
         ONCE per session, so it is a default rather than a coupling — a reader who switches the
         coast back off keeps it off. One layer draws both the sea and the lake shores.
         ⚠ THE TEMPERATURE LAYER, NOT EVERY RASTER. The argument would fit the other eight too; the
         instruction names this one, and widening it is a change nobody asked for. */
      if(id==='ec-temp'){ try{ window._imCoastAuto&&window._imCoastAuto(); }catch(_){} }
      EC().ready().then(()=>{
        /* ⚠ (#R276 追記) A RETRY LADDER, not a single `once('idle')`. `addLayer` can refuse for two
           different reasons — the style cannot accept a layer yet, or the metadata has not arrived so
           `omUrl` is empty — and only the first of them is an idle away. Poll for ~16 s as well, and
           stop as soon as the layer exists. (The prefetch moved to the time change, where the
           instruction puts it: see the note in the wind module.) */
        let n=0;
        const go=()=>{ if(!state[id].on) return;
          if(_imCanDraw()&&addLayer(cfg)){ setVis(cfg,true); setOp(cfg,state[id].op); renderLegend(); warmReadout(); return; }
          if(n++<80) setTimeout(go,200);
        };
        go();
        try{ GE().events.once('idle',()=>{ if(state[id].on&&!liveLayer(cfg)) go(); }); }catch(_){}
      }).catch(()=>{
        try{ satToast(L('Could not load ECMWF weather','ECMWFデータを読み込めませんでした','ECMWF-Wetterdaten konnten nicht geladen werden','Не удалось загрузить данные ECMWF','No se pudieron cargar los datos meteorológicos del ECMWF')); }catch(_){}
        state[id].on=false;
        const cb=document.getElementById('dl-'+id); if(cb){ cb.checked=false; const r=cb.closest('.lyr-row'); if(r) r.classList.remove('on'); }
        syncLegend();
      });
    }
    window.toggleWeatherLayer=toggle;
    function anyOn(){ return LAYERS.some(l=>state[l.id].on); }
    function activeLayers(){ return LAYERS.filter(l=>state[l.id].on); }
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
    let warmT=0;
    function warmReadout(){ clearTimeout(warmT); warmT=setTimeout(warmReadoutNow,2500); }
    function warmReadoutNow(){
      try{ const cfg=LAYERS.filter(l=>state[l.id].on&&l.type==='raster').pop();
        if(!cfg) return;
        /* ⚠ (#R290 追記) `bandNear` — this frame exists for the cursor readout, not for the picture,
           and a globe-sized request here evicts the wind's field (see FRAME_SAMPLES). */
        let band=null; try{ const b=GE().camera.getBounds(); band=EC().bandNear(b.getSouth(),b.getNorth()); }catch(_){}
        EC().load(cfg.variable,null,band).catch(()=>{});
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
    function whenSourceLoaded(sid,then,maxMs){
      let done=false;
      const fin=()=>{ if(done) return; done=true;
        try{ GE().events.off('sourcedata',h); }catch(_){}
        try{ then(); }catch(_){} };
      const h=(e)=>{ if(e&&e.sourceId===sid&&e.isSourceLoaded) fin(); };
      try{ GE().events.on('sourcedata',h); }catch(_){ setTimeout(fin,600); return; }
      /* already in? MapLibre will not re-fire for a source that finished before we subscribed */
      try{ if(GE().layers.sourceData&&GE().layers.sourceData(sid)) { /* geojson only — rasters fall through */ } }catch(_){}
      setTimeout(fin,maxMs||12000);
    }
    function applyTime(only){
      (only?[only]:activeLayers()).forEach(cfg=>{
        const old=cfg._s|0, nu=1-old;
        dropSlot(cfg,nu);                       /* whatever a superseded step left there */
        let n=0;
        const go=()=>{ if(!state[cfg.id].on) return;
          if(!(_imCanDraw()&&addSlot(cfg,nu))){ if(n++<40) setTimeout(go,200); return; }
          setVisSlot(cfg,nu,true); setOpSlot(cfg,nu,0);
          const reveal=()=>{ if(!state[cfg.id].on) return;
            if((cfg._s|0)!==nu){ cfg._s=nu; }
            setOpSlot(cfg,nu,state[cfg.id].op);
            dropSlot(cfg,old); };
          whenSourceLoaded(cfg.id+'-'+nu+'-src',reveal,12000);
        };
        go(); });
      renderLegend();
      /* (#R288) BOTH neighbours, not just the next one. A reader who has stepped forward is as
         likely to step back, and a warmed frame costs 1.0–1.6 s against 8.7 s cold (#R276's
         measurement) — the block cache is shared, so warming the one behind is the difference
         between an instant step back and another full read. */
      try{ const vars=activeLayers().map(c=>c.variable).concat(['wind_u_component_10m','wind_v_component_10m']);
        const i=EC().index(), n=EC().count();
        /* ⚠ (#R290 追記2) ONE schedule survives (the call is debounced and replaces the pending one),
           so ask for the neighbour a reader is most likely to want — the next hour. */
        EC().prefetch(vars,Math.min(n-1,i+1)); }catch(_){}
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
      const lg=EC().legend(cfg.variable,dark);
      if(!lg) return '<div class="ecl-desc">'+ecDesc(cfg)+'</div>';
      const u=unitOf(cfg.kind,lg.unit);
      const ticks=[0,0.25,0.5,0.75,1].map(f=>{ const v=lg.min+(lg.max-lg.min)*f; return { pos:f*100, txt:nice(convert(cfg.kind,v)) }; });
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
    function whenLine(cfg){
      const E=EC();
      const vt=E.validTime();
      if(!vt) return L('loading…','読み込み中…','wird geladen…','загрузка…','cargando…');
      return L('valid','有効時刻','gültig','действ.','válido')+' '+E.fmt(vt)+' · '+relTxt(vt);
    }
    function modelLine(cfg){
      const E=EC();
      const ref=E.referenceTime();
      return '<div class="ecl-model">'+E.MODEL+' · '+E.RESOLUTION_KM+' km'
        +(ref?(' · '+L('run','初期時刻','Lauf','прогон','pasada')+' '+E.fmt(ref,{hour:'2-digit',minute:'2-digit',month:'short',day:'numeric',timeZone:'UTC'})+' UTC'):'')+'</div>';
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
    function renderOne(cfg){
      const el=boxFor(cfg);
      const clock=window.IntMapWxPlayer.timeUI('ec-time-'+cfg.id,EC(),L);
      el.innerHTML=dragHandle()
        +'<button class="layer-popup-x" title="'+t('close')+'">×</button>'
        +'<h4>'+ecLbl(cfg)+'</h4>'
        +'<div class="ecl-one">'+barBody(cfg)+opRow(cfg)+modelLine(cfg)+clock
        +'<div class="ecl-when" data-for="'+cfg.id+'">'+whenLine(cfg)+'</div>'
        +'</div>';
      closeBtn(el);
      const op=el.querySelector('.ec-oplg');
      if(op) op.oninput=()=>{ const v=+op.value; state[cfg.id].op=v; setOp(cfg,v);
        const lbl=el.querySelector('.dl-op-val'); if(lbl) lbl.textContent=Math.round(v*100)+'%';
        const row=document.querySelector('.ec-op[data-for="'+cfg.id+'"]'); if(row) row.value=String(v); };
      if(clock) window.IntMapWxPlayer.wireTimeUI(el,'ec-time-'+cfg.id,EC());
    }
    function renderLegend(){
      activeLayers().forEach(renderOne);
      try{ window._tileLegends&&window._tileLegends(); }catch(_){}
    }
    function syncLegend(){ const show=anyOn();
      LAYERS.forEach(l=>{ const el=boxes[l.id]; if(el&&!(state[l.id]&&state[l.id].on)) el.style.display='none'; });
      if(show){ activeLayers().forEach(l=>{ boxFor(l).style.display='block'; }); renderLegend(); }
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
    function pruneMissing(){
      const E=EC(); if(!E.metaSync()) return;
      LAYERS.slice().forEach(l=>{ if(E.has(l.variable)) return;
        const row=document.getElementById('lyrrow-'+l.id); if(row) row.remove();
        const i=LAYERS.indexOf(l); if(i>=0) LAYERS.splice(i,1);
        delete state[l.id];
      });
    }

    /* re-attach after a style swap */
    GE().events.on('styledata',()=>{ if(anyOn()){ setTimeout(()=>{ if(!_imCanDraw())return; activeLayers().forEach(cfg=>{ if(addLayer(cfg)){ setVis(cfg,true); setOp(cfg,state[cfg.id].op); } }); },80); } });
    GE().events.on('idle',()=>{ if(!anyOn()) return; activeLayers().forEach(cfg=>curIds(cfg).forEach(l=>{ try{ EC().lift(l); }catch(_){} })); });
    /* ⚠ (#R284) `index` fires on EVERY slider pixel and `time` once the drag has settled — see
       IntMapECMWF.setIndex. `index` therefore updates the one thing that must feel instant, IN
       PLACE: re-rendering the box would replace the button under the reader's finger.
       ⚠ (#R288) …and that thing is each layer's own 「いつの絵か」 line, because the separate clock
       box that used to hold a copy of it is gone. */
    function touchTime(){ try{
      activeLayers().forEach(cfg=>{ const el=boxes[cfg.id]; if(!el) return;
        const w=el.querySelector('.ecl-when'); if(w) w.textContent=whenLine(cfg); });
    }catch(_){} }
    EC().on(ev=>{ if(ev.type==='index'){ touchTime(); return; }
      if(ev.type==='time'){ if(anyOn()) applyTime(); renderLegend(); }
      else if(ev.type==='play'||ev.type==='meta'){ if(anyOn()) renderLegend(); } });

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
      get(){ const o={}; const ops={};
        LAYERS.forEach(l=>{ if(state[l.id].on&&state[l.id].op!==l.op) ops[l.id]=+state[l.id].op.toFixed(2); });
        const vt=EC().validTime(); if(vt&&EC().index()!==EC().nowIndex()) o.t=vt;
        if(Object.keys(ops).length) o.op=ops;
        try{ const ws=document.getElementById('op-wind'); const wo=ws?+ws.value:1; if(isFinite(wo)&&wo!==1) o.wo=+wo.toFixed(2); }catch(_){}
        return Object.keys(o).length?o:null; },
      set(v){ if(!v) return;
        EC().meta().then(()=>{
          if(v.t){ const ms=Date.parse(/[zZ]$/.test(v.t)?v.t:v.t+'Z'); if(isFinite(ms)) EC().setIndex(EC().nearestTo(ms)); }
          if(v.op) Object.keys(v.op).forEach(id=>{ if(!state[id]) return; state[id].op=+v.op[id];
            const sl=document.querySelector('.ec-op[data-for="'+id+'"]'); if(sl) sl.value=state[id].op;
            const cfg=LAYERS.find(l=>l.id===id); if(cfg) setOp(cfg,state[id].op); });
          if(v.wo!=null){ const s=document.getElementById('op-wind'); if(s){ s.value=v.wo; s.dispatchEvent(new Event('input',{bubbles:true})); } }
        }).catch(()=>{});
      } }; }

    return { open(){ if(!anyOn()) return; activeLayers().forEach(l=>{ boxFor(l).style.display='block'; }); renderLegend(); },
      toggle, setOp:(id,op)=>{ const c=LAYERS.find(l=>l.id===id); if(c) setOp(c,op); },
      layerFor:(id)=>LAYERS.find(l=>l.id===id)||null,
      activeVariable:()=>{ const a=activeLayers().filter(l=>l.type==='raster'); return a.length?a[a.length-1]:null; },
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
