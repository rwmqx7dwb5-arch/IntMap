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

window.IntMapModules.wind=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
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
    function addField(key){
      if(!_imCanDraw()) return false;
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
      try{ GE().events.once('idle',reveal); }catch(_){}
      setTimeout(reveal,2500);                    /* backstop: 'idle' can be far away on a busy map */
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
    function load(opt){
      if(!EC()) return Promise.resolve(null);
      const want=()=>EC().stateKey(VAR,'');
      loading=true; lastErr='';
      try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){}
      return EC().ready().then(()=>{
        const key=want();
        if(key&&key!==liveKey) ensureField(key);
        return EC().load(VAR);
      }).then(f=>{
        loading=false;
        if(!f){ lastErr='load';
          /* ⚠ THE LEGEND HAS TO BE REDRAWN ON THE FAILURE PATH TOO, or a layer that could not load
             keeps printing 「読み込み中…」 for ever — which is the silent shape this project keeps
             paying for. The toast is the notification; the legend is the standing answer. */
          try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){}
          try{ satToast(L('Wind data unavailable','風データを取得できませんでした','Winddaten nicht verfügbar','Данные о ветре недоступны','Datos de viento no disponibles')); }catch(_){}
          return null; }
        if(renderer) renderer.setField(EC().sampler(VAR));
        try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){}
        /* ⚠ (#R276 追記) THE NEXT HOUR IS WARMED ON A TIME CHANGE, NOT ON THE FIRST LOAD. 「時刻変更時
           は隣接フレームを先読みし」 is the instruction, and it is also the cheaper reading: warming a
           frame costs the same ranged reads as the one on screen, so doing it for a reader who has not
           touched the player spends their bandwidth on a picture they may never ask for — and it
           competes with the picture they DID ask for. `opt.step` is true only when the axis moved. */
        if(opt&&opt.step){ try{ EC().prefetch(['wind_u_component_10m','wind_v_component_10m'],Math.min(EC().count()-1,EC().index()+1)); }catch(_){} }
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
    try{ (window.IntMapECMWF||{on:()=>{}}).on(ev=>{
      try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){}
      if(!on) return;
      if(ev.type==='time'||ev.type==='meta'){ if(renderer) renderer.setField(null); load({step:ev.type==='time'}); } }); }catch(_){}
    /* the forecast axis exists without the tile SDK — fetch it so the legend can name the run and
       the hour the moment the layer is switched on, rather than after a 340 kB script lands */
    try{ (window.IntMapECMWF||{meta:()=>Promise.resolve()}).meta().then(()=>{ try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){} }).catch(()=>{}); }catch(_){}

    window.addEventListener('resize',()=>{ if(on) resize(); });
    if(GE().hasRenderer()){
      GE().events.on('movestart',()=>{ moving=true; });
      GE().events.on('moveend',()=>{ moving=false; if(on){ resize(); } });
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
      const n=E?E.count():0, i=E?E.index():0, vt=E?E.validTime():'', ref=E?E.referenceTime():'';
      const playing=!!(E&&E.isPlaying());
      const player=n?('<div class="ecl-player">'
        +'<button class="ecl-b" data-act="first" title="'+L('First step','最初の時刻','Erster Schritt','Первый шаг','Primer paso')+'">⏮</button>'
        +'<button class="ecl-b" data-act="prev" title="'+L('Previous hour','前の時刻','Vorherige Stunde','Предыдущий час','Hora anterior')+'">◀</button>'
        +'<button class="ecl-b" data-act="play" title="'+(playing?L('Pause','一時停止','Pause','Пауза','Pausa'):L('Play','再生','Abspielen','Воспроизвести','Reproducir'))+'">'+(playing?'⏸':'▶')+'</button>'
        +'<button class="ecl-b" data-act="next" title="'+L('Next hour','次の時刻','Nächste Stunde','Следующий час','Hora siguiente')+'">▶</button>'
        +'<button class="ecl-b" data-act="now" title="'+L('Back to now','現在に戻る','Zurück zu jetzt','К текущему времени','Volver a ahora')+'">⦿</button></div>'
        +'<input type="range" id="wind-time" min="0" max="'+Math.max(0,n-1)+'" step="1" value="'+i+'" style="width:100%;accent-color:var(--primary-color);">'):'';
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
      const sl=body.querySelector('#wind-time');
      if(sl) sl.oninput=()=>{ E.pause(); E.setIndex(+sl.value); };
      try{ window._tileLegends&&window._tileLegends(); }catch(_){}
      body.querySelectorAll('.ecl-b').forEach(b=>{ b.onclick=()=>{ const a=b.getAttribute('data-act');
        if(a==='first'){ E.pause(); E.setIndex(0); }
        else if(a==='prev'){ E.pause(); E.step(-1); }
        else if(a==='next'){ E.pause(); E.step(1); }
        else if(a==='now'){ E.pause(); E.setIndex(E.nowIndex()); }
        else if(a==='play') E.togglePlay(); }; });
    };
    window.addEventListener('intmap-units',()=>{ try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){} });
    window.addEventListener('intmap-lang',()=>{ try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){} });

    return {
      toggle(v){ v?start():stop(); }, on:()=>on, stop, refetch:load, setOpacity,
      /* the number under the cursor comes from the SAME field the picture is drawn from */
      sampleAt:(lng,lat)=>{ const s=window.IntMapECMWF&&window.IntMapECMWF.sampler(VAR); if(!s) return null;
        const uv=[0,0]; s.uv(lat,lng,uv);
        if(!(uv[0]===uv[0])) return null;
        return { speed:Math.hypot(uv[0],uv[1]), dir:(Math.atan2(-uv[0],-uv[1])/R+360)%360, time:window.IntMapECMWF.validTime() }; },
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
      {id:'ec-temp',    variable:'temperature_2m',      type:'raster', op:1,    kind:'temp',
       label:LA('Temperature 2 m (ECMWF)','気温 2m（ECMWF）','Temperatur 2 m (ECMWF)','Температура 2 м (ECMWF)','Temperatura 2 m (ECMWF)'),
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
    const state={};   /* id → {on, op} */
    LAYERS.forEach(l=>state[l.id]={on:false, op:l.op});
    let mounted=false, legendEl=null, rowsMounted=false;

    function omUrl(cfg,extra){ return EC().omUrl(cfg.variable,extra); }

    function addLayer(cfg){
      const sid=cfg.id+'-src'; const before=EC().before(); const url=omUrl(cfg,cfg.type==='arrows'?'&arrows=true':'');
      if(!url) return false;
      try{
        if(cfg.type==='isobars'){
          if(!GE().layers.hasSource(sid)) GE().layers.addSource(sid,{type:'vector',url:url});
          if(!GE().layers.has(cfg.id)) GE().layers.add({id:cfg.id,type:'line',source:sid,'source-layer':'contours',layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':'rgba(255,255,255,0.9)','line-width':1.1,'line-opacity':cfg.op}},before);
          if(!GE().layers.has(cfg.id+'-lbl')) GE().layers.add({id:cfg.id+'-lbl',type:'symbol',source:sid,'source-layer':'contours',layout:{visibility:'none','symbol-placement':'line','text-field':['get','value'],'text-size':window.IntMapLabelScale.sub(0.82)},paint:{'text-color':'#fff','text-halo-color':'rgba(0,0,0,0.7)','text-halo-width':1.2}},before);
        } else if(cfg.type==='arrows'){
          if(!GE().layers.hasSource(sid)) GE().layers.addSource(sid,{type:'vector',url:url});
          if(!GE().layers.has(cfg.id)) GE().layers.add({id:cfg.id,type:'line',source:sid,'source-layer':'wind-arrows',layout:{visibility:'none','line-cap':'round'},paint:{'line-width':1.8,'line-opacity':cfg.op,'line-color':['interpolate',['linear'],['to-number',['get','value'],0],0,'#5b8ff9',6,'#36cfc9',12,'#73d13d',18,'#ffd666',26,'#ff7a45',36,'#cf1322']}},before);
        } else {
          if(!GE().layers.hasSource(sid)) GE().layers.addSource(sid,{type:'raster',url:url,maxzoom:12});
          if(!GE().layers.has(cfg.id)) GE().layers.add({id:cfg.id,type:'raster',source:sid,layout:{visibility:'none'},paint:{'raster-opacity':cfg.op,'raster-opacity-transition':{duration:220},'raster-fade-duration':0}},before);
        }
        [cfg.id,cfg.id+'-lbl'].forEach(l=>{ try{ EC().lift(l); }catch(_){} });
        return true;
      }catch(e){ try{ console.warn('ECMWF add fail',cfg.id,e); }catch(_){} return false; }
    }
    function removeLayer(cfg){ [cfg.id,cfg.id+'-lbl'].forEach(l=>{ try{ if(GE().layers.has(l)) GE().layers.remove(l); }catch(_){} }); try{ if(GE().layers.hasSource(cfg.id+'-src')) GE().layers.removeSource(cfg.id+'-src'); }catch(_){} }
    function setVis(cfg,on){ [cfg.id,cfg.id+'-lbl'].forEach(l=>{ try{ if(GE().layers.has(l)) GE().layers.setLayout(l,'visibility',on?'visible':'none'); }catch(_){} }); }
    function setOp(cfg,op){ try{ if(cfg.type==='isobars'||cfg.type==='arrows'){ if(GE().layers.has(cfg.id)) GE().layers.setPaint(cfg.id,'line-opacity',op); } else if(GE().layers.has(cfg.id)) GE().layers.setPaint(cfg.id,'raster-opacity',op); }catch(_){} }

    function toggle(id,on){ const cfg=LAYERS.find(l=>l.id===id); if(!cfg) return;
      state[id].on=on;
      syncLegend();
      if(!on){ setVis(cfg,false); return; }
      EC().ready().then(()=>{
        /* ⚠ (#R276 追記) A RETRY LADDER, not a single `once('idle')`. `addLayer` can refuse for two
           different reasons — the style cannot accept a layer yet, or the metadata has not arrived so
           `omUrl` is empty — and only the first of them is an idle away. Poll for ~16 s as well, and
           stop as soon as the layer exists. (The prefetch moved to the time change, where the
           instruction puts it: see the note in the wind module.) */
        let n=0;
        const go=()=>{ if(!state[id].on) return;
          if(_imCanDraw()&&addLayer(cfg)){ setVis(cfg,true); setOp(cfg,state[id].op); renderLegend(); return; }
          if(n++<80) setTimeout(go,200);
        };
        go();
        try{ GE().events.once('idle',()=>{ if(state[id].on&&!GE().layers.has(cfg.id)) go(); }); }catch(_){}
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

    /* ── the forecast step changed: rebuild every live source ────────────────────────────────── */
    function applyTime(){
      /* ⚠ (#R276 追記) the rebuild removes the layer FIRST, so a refusal would leave nothing on the
         map — the same shape as the wind field's. Retry until it lands. */
      activeLayers().forEach(cfg=>{ removeLayer(cfg);
        let n=0;
        const go=()=>{ if(!state[cfg.id].on) return;
          if(_imCanDraw()&&addLayer(cfg)){ setVis(cfg,true); setOp(cfg,state[cfg.id].op); return; }
          if(n++<40) setTimeout(go,200); };
        go(); });
      renderLegend();
      try{ const nx=Math.min(EC().count()-1,EC().index()+1);
        EC().prefetch(activeLayers().map(c=>c.variable).concat(['wind_u_component_10m','wind_v_component_10m']),nx); }catch(_){}
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

    /* ── the legend: the layer's own name, its own ramp, its own numbers ─────────────────────
       「CAPE 不安定度（ECMWF）レイヤーの凡例名がECMWF気象になっている。また、凡例がない。説明もない。」
       Every bar below is built from `IntMapECMWF.legend(variable)`, which reads the SDK's own colour
       table — the same table the tiles were painted with — so the ramp, its end points and its unit
       cannot drift away from the picture. */
    function barFor(cfg){
      const dark=(document.documentElement.getAttribute('data-theme')||'')!=='light';
      const lg=EC().legend(cfg.variable,dark);
      const name=ecLbl(cfg).replace(/\s*\(ECMWF\)\s*$/,'');
      if(!lg) return '<div class="ecl-item"><div class="ecl-name">'+name+'</div><div class="ecl-desc">'+ecDesc(cfg)+'</div></div>';
      const u=unitOf(cfg.kind,lg.unit);
      const ticks=[0,0.25,0.5,0.75,1].map(f=>{ const v=lg.min+(lg.max-lg.min)*f; return { pos:f*100, txt:nice(convert(cfg.kind,v)) }; });
      return '<div class="ecl-item"><div class="ecl-name">'+name+' <span class="ecl-unit">'+u+'</span></div>'
        +'<div class="ecl-bar" style="background:'+lg.css+';"></div>'
        +'<div class="ecl-ticks">'+ticks.map(k=>'<span style="left:'+k.pos.toFixed(1)+'%">'+k.txt+'</span>').join('')+'</div>'
        +'<div class="ecl-desc">'+ecDesc(cfg)+'</div></div>';
    }

    function ensureLegend(){
      if(legendEl) return legendEl;
      const mc=document.getElementById('map-container')||document.body;
      legendEl=document.createElement('div'); legendEl.className='data-legend'; legendEl.id='data-legend-ecmwf';
      legendEl.style.bottom='140px'; legendEl.style.display='none';
      mc.appendChild(legendEl);
      try{ window._wireLegendDrag&&window._wireLegendDrag(legendEl); }catch(_){}
      return legendEl;
    }
    function relTxt(iso){
      try{ const dh=Math.round((Date.parse(/[zZ]$/.test(iso)?iso:iso+'Z')-Date.now())/3600000);
        if(dh===0) return L('now','現在','jetzt','сейчас','ahora');
        return (dh>0?'+':'')+dh+' '+L('h','時間','h','ч','h'); }catch(_){ return ''; }
    }
    function renderLegend(){
      const el=ensureLegend();
      const E=EC(); const n=E.count(), i=E.index();
      const vt=E.validTime(), ref=E.referenceTime();
      const playing=E.isPlaying();
      const head='<span class="dl-drag" title="'+L('Drag to move','ドラッグして移動','Zum Verschieben ziehen','Потяните, чтобы переместить','Arrastre para mover')+'">⋮⋮</span>'
        +'<button class="layer-popup-x" id="ec-legend-x" title="'+t('close')+'">×</button>'
        +'<h4>'+L('ECMWF weather','ECMWF 気象','ECMWF-Wetter','Погода ECMWF','Meteorología ECMWF')+'</h4>'
        +'<div class="ecl-model">'+E.MODEL+' · '+E.RESOLUTION_KM+' km · '
        +L('run','初期時刻','Lauf','прогон','pasada')+' '+(ref?E.fmt(ref,{hour:'2-digit',minute:'2-digit',month:'short',day:'numeric',timeZone:'UTC'})+' UTC':'—')+'</div>';
      const player='<div class="ecl-player">'
        +'<button class="ecl-b" data-act="first" title="'+L('First step','最初の時刻','Erster Schritt','Первый шаг','Primer paso')+'">⏮</button>'
        +'<button class="ecl-b" data-act="prev" title="'+L('Previous hour','前の時刻','Vorherige Stunde','Предыдущий час','Hora anterior')+'">◀</button>'
        +'<button class="ecl-b ecl-play" data-act="play" title="'+(playing?L('Pause','一時停止','Pause','Пауза','Pausa'):L('Play','再生','Abspielen','Воспроизвести','Reproducir'))+'">'+(playing?'⏸':'▶')+'</button>'
        +'<button class="ecl-b" data-act="next" title="'+L('Next hour','次の時刻','Nächste Stunde','Следующий час','Hora siguiente')+'">▶</button>'
        +'<button class="ecl-b" data-act="now" title="'+L('Back to now','現在に戻る','Zurück zu jetzt','К текущему времени','Volver a ahora')+'">⦿</button>'
        +'</div>'
        +'<input type="range" id="ec-time" min="0" max="'+Math.max(0,n-1)+'" step="1" value="'+i+'" style="width:100%;accent-color:var(--primary-color);">'
        +'<div id="ec-validtime">'+(vt?(L('valid','有効時刻','gültig','действ.','válido')+' '+E.fmt(vt)+' · '+relTxt(vt)):L('loading…','読み込み中…','wird geladen…','загрузка…','cargando…'))+'</div>';
      const bars=activeLayers().map(barFor).join('');
      el.innerHTML=head+player+'<div class="ecl-items">'+bars+'</div>';
      const x=el.querySelector('#ec-legend-x'); if(x) x.onclick=()=>{ el.style.display='none'; };
      const sl=el.querySelector('#ec-time');
      if(sl){ sl.oninput=()=>{ E.pause(); E.setIndex(+sl.value); }; }
      try{ window._tileLegends&&window._tileLegends(); }catch(_){}
      el.querySelectorAll('.ecl-b').forEach(b=>{ b.onclick=()=>{ const a=b.getAttribute('data-act');
        if(a==='first') { E.pause(); E.setIndex(0); }
        else if(a==='prev'){ E.pause(); E.step(-1); }
        else if(a==='next'){ E.pause(); E.step(1); }
        else if(a==='now'){ E.pause(); E.setIndex(E.nowIndex()); }
        else if(a==='play') E.togglePlay(); }; });
    }
    function syncLegend(){ const el=ensureLegend(); const show=anyOn(); el.style.display=show?'block':'none';
      if(show) renderLegend();
      /* the tiler owns where the legends sit; adding or removing a bar changes this box's height */
      try{ window._tileLegends&&window._tileLegends(); }catch(_){} }
    window._ecSyncTimeLegend=syncLegend;

    /* ── the Layers-panel rows ───────────────────────────────────────────────────────────────── */
    function relabelRows(){ LAYERS.forEach(l=>{ const s=document.querySelector('#lyrrow-'+l.id+' .ec-lbl'); if(s) s.textContent=ecLbl(l); }); if(legendEl&&legendEl.style.display!=='none') renderLegend(); }
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
      ensureLegend();
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
    GE().events.on('idle',()=>{ if(!anyOn()) return; activeLayers().forEach(cfg=>[cfg.id,cfg.id+'-lbl'].forEach(l=>{ try{ EC().lift(l); }catch(_){} })); });
    EC().on(ev=>{ if(ev.type==='time'){ if(anyOn()) applyTime(); renderLegend(); }
      else if(ev.type==='play'||ev.type==='meta'){ if(anyOn()) renderLegend(); } });

    mountRows(); setTimeout(mountRows,1500);
    window.addEventListener('intmap-lang',relabelRows);
    window.addEventListener('intmap-units',()=>{ if(legendEl&&legendEl.style.display!=='none') renderLegend(); });

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

    return { open(){ const el=ensureLegend(); el.style.display='block'; renderLegend(); },
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
    const COMPASS=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    const dir=(d)=>(d==null||isNaN(d))?'':COMPASS[Math.round(d/22.5)%16];
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
