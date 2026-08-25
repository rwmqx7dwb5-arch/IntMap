/* ============================================================================
 *  IntMap · Map chrome — IntMapModules.{layerRegistry,layerSidebar,ticker,layerPresets,labelPopup,geojsonUpload,viewHash,share}  (#R166)
 * ----------------------------------------------------------------------------
 *  The UI wrapped around the map: the layer registry, the right-hand layer sidebar, the news
 *  ticker strip, layer presets, the click-a-label popup, user GeoJSON upload, the shareable view hash
 *  and the share panel.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R166): each body below is
 *  byte-identical to the block that used to live there, except that closure values which are
 *  REASSIGNED at runtime are read through the live host interface (Architecture.md §3.1):
 *      currentLang -> HOST.lang
 *      currentMapType -> HOST.mapType
 *      currentProj -> HOST.proj
 *      globalData -> HOST.globalData
 *      toolMode -> HOST.toolMode
 *
 *  Every factory is called at the exact spot its block used to occupy, so execution order is
 *  unchanged. The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
import { everyTick, stopTick, tickKey } from './runtime.js';   /* the one timer wheel — js/runtime.js */

window.IntMapModules=window.IntMapModules||{};
/* ══ ⚠⚠⚠ (#R273) THE CLOSE MARK, ONE CHARACTER, EVERYWHERE ════════════════════════════════════════
   「複数のポップアップで、×の形がおかしくなっている。改悪をするな。元に戻せ。」
   「なにか形がおかしい×をやめろと言っている。明らかに×の形が変な感じ。」

   MEASURED in the running page, `measureText` at 16 px:

       U+2715   Inter 13.07 · Noto Sans JP 13.07 · system-ui 13.07 · sans-serif 13.07 · Arial 13.07
       U+00D7   Inter 10.59 · Noto Sans JP 16.00 · system-ui 10.95 · sans-serif 16.00 · Arial  9.34

   ⚠ THE TWO CODE POINTS ARE NAMED HERE RATHER THAN TYPED. tests/r273 sweeps every js/ and css/
   file for U+2715 and would find this note if it spelled the character out — the shape #R266
   recorded as 「自分の検査が自分のコメントに当たった」, for the ninth time.

   An advance that is IDENTICAL in every family is the signature of a glyph NO family has: every one
   of them was falling through to the platform's symbol font, so the mark was drawn at a weight, a
   size and a baseline belonging to nothing else on screen — and to a different font on every
   operating system. U+00D7 varies per family because Inter, the app's own typeface, actually draws
   it. THAT is the 「形が変な感じ」, and this app was using BOTH: 177 occurrences of the first across
   46 files, next to a dozen buttons already on the second.

   → ONE mark, U+00D7, in the app's own font, in every popup, panel, chip and search box. #R270
   replaced the search boxes' U+2715 with two SVG strokes, which fixed the fallback for two of the
   app's forty-odd close buttons and left the rest on the character nobody draws — 「改悪をするな。
   元に戻せ」 is that, and the answer is the mark the rest of the app was already using rather than a
   third one. This function stays the ONE definition, because there are TWO layer-search boxes —
   this file's `.lsr-clear` and js/map-extras.js's `.ls-clear` — and #R239's standing lesson is a
   defect fixed in one of two copies and left in the other. */
window.IntMapClearGlyph=function(){ return '×'; };
/* ══ ⚠⚠ (#R271) A CLEAR MARK BELONGS TO ITS FIELD, NOT TO THE BOX AROUND IT ══════════════════════
   「レイヤー検索欄の×の様子がおかしい。不自然な位置の×。」 — #R270 fixed the SHAPE (that half holds:
   #R273 has since replaced that SVG with `×`, the character the rest of the app uses) and left
   the placement written in CSS as `top:50%`, which resolves against the POSITIONED ANCESTOR. MEASURED on the built site,
   desktop, default profile, with a query typed so the button is on screen:

       .lsr-search (the wrapper, and the positioned ancestor)   y = 53   h = 48   centre 77
       its <input> (the field the mark belongs to)              y = 55   h = 36   centre 73
       .lsr-clear  (the mark)                                   y = 67   h = 20   centre 77

   Four pixels low, on a 20 px control inside a 36 px field, because the wrapper is twelve pixels
   taller than the field it wraps. It is not a rounding error and it is not a font: the mark is
   centred on the wrong box.
   → It is placed from the FIELD'S OWN offset rectangle — `offsetTop`/`offsetLeft`/`offsetWidth`
   are measured against the same padding box CSS `top`/`right` are, so the two cannot disagree
   however the wrapper is padded. Re-measured when the button appears, when the window resizes and
   whenever the field itself changes size. ONE definition, because there are two search boxes and
   #R239's standing lesson is a defect fixed in one copy and left in the other. */
/* ══ ⚠⚠ (#R290) TYPING IN A BOX THAT HAS SCROLLED OFF THE TOP ═════════════════════════════════
   「レイヤー検索欄に入力があったり変更があったら、レイヤー検索欄の最上部の位置に自動的になるように。」
   #R23 took this box OUT of sticky position on the reader's own instruction (「レイヤー検索窓の上部
   固定はやめて」), so it scrolls with the list — and a reader who has scrolled a thousand pixels down
   and then types is filtering a list they cannot see the top of, with the box they are typing in
   somewhere above the viewport. Sticky is not the answer twice; scrolling to it on input is: the
   box comes to the top of its own scroll container the moment there is a query, and stays put
   otherwise.
   ⚠ IT SCROLLS A PANEL, NOT THE MAP. The camera is untouched — CONSTITUTION §3, 「レイヤーを選択
   しても視点を一切動かさない」 — and it scrolls only the nearest ancestor that is actually
   scrollable, so on a phone (where the sheet is the scroller) it is the sheet that moves.
   ⚠ ONE DEFINITION, BOTH SEARCH BOXES — the classic panel's `#layer-search` (js/map-extras.js) and
   this file's tile-grid `.lsr-q`. #R239's lesson is a defect fixed in one of two copies. */
window.IntMapSearchToTop=function(el){
  try{
    if(!el||!el.getBoundingClientRect) return false;
    var sc=el.parentElement;
    while(sc&&sc!==document.body&&sc!==document.documentElement){
      var cs=window.getComputedStyle(sc);
      if(/(auto|scroll)/.test(cs.overflowY)&&sc.scrollHeight>sc.clientHeight+2) break;
      sc=sc.parentElement;
    }
    if(!sc||sc===document.body||sc===document.documentElement) return false;
    var pad=parseFloat(window.getComputedStyle(sc).paddingTop)||0;
    var top=sc.scrollTop+(el.getBoundingClientRect().top-sc.getBoundingClientRect().top)-pad;
    top=Math.max(0,Math.round(top));
    if(Math.abs(top-sc.scrollTop)<2) return false;
    try{ sc.scrollTo({top:top,behavior:'smooth'}); }catch(_){ sc.scrollTop=top; }
    return true;
  }catch(_){ return false; }
};
window.IntMapPlaceClear=function(inp,btn,gap){
  if(!inp||!btn) return function(){};
  var pad=(typeof gap==='number')?gap:9;
  function place(){ try{
    var host=btn.offsetParent; if(!host||!inp.offsetHeight) return;
    var h=btn.offsetHeight||20;
    btn.style.top=Math.round(inp.offsetTop+(inp.offsetHeight-h)/2)+'px';
    btn.style.right=Math.round(host.clientWidth-(inp.offsetLeft+inp.offsetWidth)+pad)+'px';
    btn.style.transform='none';   /* the CSS fallback centred on the wrapper; the measurement wins */
  }catch(_){} }
  place();
  try{ window.addEventListener('resize',place); }catch(_){}
  try{ if(window.ResizeObserver){ var ro=new ResizeObserver(place); ro.observe(inp); } }catch(_){}
  return place; };

window.IntMapModules.layerRegistry=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */

  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const demElevAt=HOST.demElevAt;
  window.IntMapLayers=(function(){
    const REG={};
    /* ⚠⚠⚠ (#R251) THIS WAS A PRIVATE FIVE-LANGUAGE HELPER, AND FIVE IS NOT NINE.
       `const L5=(en,jp2,de,ru,es)=>({en,jp:jp2,de,ru,es})[HOST.lang]||en;` built a language-keyed
       object and subscripted it, so every one of the 36 readout labels below was ENGLISH for
       fr / ko / zh / zh-Hans — and invisible while it happened: the callee is not bound to the
       registry, so scripts/i18n-report.mjs never put the strings in the inline universe, and the
       langmap audit never saw the object because it is BUILT from parameters rather than written
       as a literal (the same blindness #R250 found in `_dc(…,en,jp,…)` → `title:{en,jp}`).
       `pick()` IS this function, minus the ceiling: positional for the first five, the inline table
       keyed by the English string for the rest, English underneath both. */
    const L5=window.IntMapLang.pick(()=>HOST.lang);

    /* ⚠ (#R251) THE MAP CANVAS NAMES ITSELF, AND IT NAMES ITSELF IN ENGLISH. MapLibre writes
       `aria-label="Map"` on its canvas, so a screen-reader user in any of the other eight languages
       is told 「Map」 — the one string on the screen that only a blind reader ever meets, which is
       exactly why nothing had noticed it. Found by tests/r251.spec.js, which reads attributes as
       well as text. Re-applied on `intmap-lang` because the canvas outlives the language. */
    const _nameCanvas=()=>{ try{ const cv=GE().render.canvas&&GE().render.canvas();
      if(cv) cv.setAttribute('aria-label', L5('Map','地図','Karte','Карта','Mapa')); }catch(_){} };
    try{ _nameCanvas(); }catch(_){}
    window.addEventListener('intmap-lang', ()=>setTimeout(_nameCanvas, 30));
    const isOn=id=>{ const cb=document.getElementById('dl-'+id)||document.getElementById(id); return !!(cb&&cb.checked); };
    const _numCache=new Map();   /* per (kind,0.25°cell) numeric cache shared by all Open-Meteo samplers */
    async function _om(kind,lng,lat){ const q=v=>Math.round(v*4)/4, qla=q(lat), qlo=q(lng), key=kind+':'+qla+','+qlo;
      if(_numCache.has(key)) return _numCache.get(key);
      let url=null,pick=null,unit='';
      if(kind==='temp'){ url='https://api.open-meteo.com/v1/forecast?latitude='+qla+'&longitude='+qlo+'&current=temperature_2m'; pick=j=>j.current&&j.current.temperature_2m; unit='°C'; }
      else if(kind==='sst'){ url='https://marine-api.open-meteo.com/v1/marine?latitude='+qla+'&longitude='+qlo+'&current=sea_surface_temperature'; pick=j=>j.current&&j.current.sea_surface_temperature; unit='°C'; }
      else if(kind==='wind'){ url='https://api.open-meteo.com/v1/forecast?latitude='+qla+'&longitude='+qlo+'&current=wind_speed_10m,wind_direction_10m'; pick=j=>j.current&&(j.current.wind_speed_10m!=null?(j.current.wind_speed_10m+' km/h @'+Math.round(j.current.wind_direction_10m||0)+'°'):null); unit=''; }
      else if(kind==='precip'){ url='https://api.open-meteo.com/v1/forecast?latitude='+qla+'&longitude='+qlo+'&current=precipitation'; pick=j=>j.current&&j.current.precipitation; unit=' mm/h'; }
      else if(kind==='snow'){ url='https://api.open-meteo.com/v1/forecast?latitude='+qla+'&longitude='+qlo+'&hourly=snow_depth&forecast_days=1'; pick=j=>j.hourly&&j.hourly.snow_depth&&j.hourly.snow_depth[0]; unit=' m'; }
      else if(kind==='aod'){ url='https://air-quality-api.open-meteo.com/v1/air-quality?latitude='+qla+'&longitude='+qlo+'&current=aerosol_optical_depth'; pick=j=>j.current&&j.current.aerosol_optical_depth; unit=''; }
      else if(kind==='no2'){ url='https://air-quality-api.open-meteo.com/v1/air-quality?latitude='+qla+'&longitude='+qlo+'&current=nitrogen_dioxide'; pick=j=>j.current&&j.current.nitrogen_dioxide; unit=' µg/m³'; }
      else if(kind==='co'){ url='https://air-quality-api.open-meteo.com/v1/air-quality?latitude='+qla+'&longitude='+qlo+'&current=carbon_monoxide'; pick=j=>j.current&&j.current.carbon_monoxide; unit=' µg/m³'; }
      if(!url) return null;
      /* (#R276) through window.IntMapWx — one cache, one de-duplicator, one circuit breaker */
      try{ const j=await window.IntMapWx.guardedJSON(url,300000); if(!j) return null; const v=pick(j);
        const out=(v==null||v==='')?null:(typeof v==='number'?(Math.round(v*100)/100+unit):String(v));
        if(out!=null) _numCache.set(key,out); return out; }catch(_){ return null; } }
    function _srcFeatsIn(srcId,bounds){ try{ const d=GE().layers.sourceData(srcId); if(!d||!Array.isArray(d.features)) return null;
      const b=bounds||GE().camera.getBounds(); const w=b.getWest?b.getWest():b[0][0], e=b.getEast?b.getEast():b[1][0], so=b.getSouth?b.getSouth():b[0][1], n=b.getNorth?b.getNorth():b[1][1];
      return d.features.filter(f=>{ try{ const c=f.geometry&&f.geometry.type==='Point'&&f.geometry.coordinates; return c&&c[0]>=w&&c[0]<=e&&c[1]>=so&&c[1]<=n; }catch(_){ return false; } }); }catch(_){ return null; } }
    function register(id,impl){ REG[id]=impl||{}; }
    function list(){ return Object.keys(REG); }
    function activeIds(){ return Object.keys(REG).filter(id=>{ try{ const r=REG[id]; return r.on?!!r.on():isOn(id); }catch(_){ return false; } }); }
    function state(id){ const r=REG[id]; if(!r) return null; const g=(fn,fb)=>{ try{ return r[fn]?r[fn]():fb; }catch(_){ return fb; } };
      return { id, on:(r.on?!!r.on():isOn(id)), label:g('label',id), time:g('time',null), source:g('source',null), legend:g('legend',null) }; }
    async function sampleAt(lng,lat,ids){ const out=[]; const use=(ids&&ids.length)?ids:activeIds();
      for(const id of use){ const r=REG[id]; if(!r||!r.sampleAt) continue;
        try{ const v=await Promise.resolve(r.sampleAt(lng,lat)); if(v!=null&&v!=='') out.push({ id, label:state(id).label, value:v }); }catch(_){} }
      return out; }
    function featuresIn(id,bounds){ const r=REG[id]; if(!r||!r.featuresIn) return null; try{ return r.featuresIn(bounds); }catch(_){ return null; } }
    function context(){ try{ return activeIds().map(id=>{ const s=state(id); if(!s) return null; const bits=[];
        if(s.time) bits.push('time='+s.time); if(s.source) bits.push('src='+s.source);
        try{ const r=REG[id]; if(r.summary){ const sm=r.summary(); if(sm) bits.push(sm); } }catch(_){}
        return s.label+(bits.length?(' ['+bits.join(' · ')+']'):''); }).filter(Boolean); }catch(_){ return []; } }
    /* ---- first registration set: the layers with REAL live data hooks ---- */
    const _ld=k=>{ try{ return (window._imLayerDates&&window._imLayerDates[k])||null; }catch(_){ return null; } };
    /* ⚠ (#R288) `dl-temp` is not a checkbox any more — air temperature is ONE layer with two
       sources (js/weather.js). The registry follows that row, answers from the SAME field the
       picture is drawn from when the forecast source is up, and only falls back to a live point
       request when it cannot (the reanalysis raster has no point-value service). */
    const _wxEC=()=>{ try{ return window.IntMapWeatherEC; }catch(_){ return null; } };
    const _tempSrc=()=>{ try{ const W=_wxEC(); return (W&&W.source)?W.source('ec-temp'):'ecmwf'; }catch(_){ return 'ecmwf'; } };
    register('temp',   { label:()=>L5('Air temperature','気温','Lufttemperatur','Темп. воздуха','Temp. del aire'),
      on:()=>isOn('ec-temp'),
      sampleAt:(x,y)=>{ try{ if(_tempSrc()!=='merra2'){ const v=window.IntMapECMWF.valueNow('temperature_2m',y,x);
          if(v!=null) return (Math.round(v*10)/10)+'°C'; } }catch(_){}
        return (_tempSrc()==='merra2')?null:_om('temp',x,y); },
      time:()=>{ try{ const W=_wxEC(); if(_tempSrc()==='merra2') return (W&&W.month)?W.month('ec-temp'):null;
          return window.IntMapECMWF.validTime(); }catch(_){ return null; } },
      source:()=>(_tempSrc()==='merra2')?'NASA GIBS · MERRA-2':'ECMWF IFS HRES · Open-Meteo' });
    register('sst',    { label:()=>L5('Sea surface temp','海面水温','Meerestemperatur','Темп. моря','Temp. del mar'), sampleAt:(x,y)=>_om('sst',x,y), time:()=>_ld('sst'), source:()=>'NASA GIBS / Open-Meteo marine' });
    /* ⚠ (#R302) THE WIND ANSWERS FROM THE FIELD THAT IS ON SCREEN, THE WAY `temp` ABOVE DOES.
       This row asked api.open-meteo.com for a point value while the ECMWF field the particles and the
       colour slot are drawn from was already decoded IN RAM — a live 「now」 reading from a different
       hour, printed under a picture of another one. That is precisely what #R276 forbade
       (「地図上の地点値は、表示中のレイヤー・モデル・時刻と同じデータから取得する」); #R288 fixed the `temp`
       row against it and this one alone was never carried over.
       ⚠ `window.Wind.sampleAt` IS that field — `IntMapECMWF.sampler('wind_u_component_10m').uv`, through
       the single accessor js/map-readout.js's corner already reads (js/weather.js) — so the bearing and
       the frame's own hour come with it instead of the u/v maths being written a second time here.
       Open-Meteo stays as the fallback for when no frame is held: the layer off, or the first one still
       downloading. `time` is null on that path because an Open-Meteo `current=` reading is not of the
       hour the axis is standing on. */
    const _WIND_VAR='wind_u_component_10m';
    const _windFld=()=>{ try{ return !!(window.IntMapECMWF&&window.IntMapECMWF.sampler(_WIND_VAR)); }catch(_){ return false; } };
    register('wind',   { label:()=>L5('Wind','風','Wind','Ветер','Viento'),
      sampleAt:(x,y)=>{ try{ const w=window.Wind.sampleAt(x,y);
          if(w&&isFinite(w.speed)){ const sp=window.fmtWindSpeed?window.fmtWindSpeed(w.speed):((Math.round(w.speed*10)/10)+' m/s');
            /* (#R289) one compass table for the whole app — the word, not just the number */
            const card=(()=>{ try{ return window.IntMapCompass.point(w.dir,HOST.lang,8); }catch(_){ return ''; } })();
            return sp+' '+(card?(card+' '):'')+'@'+Math.round(w.dir)+'°'; } }catch(_){}
        return _om('wind',x,y); },
      time:()=>{ try{ return _windFld()?window.IntMapECMWF.validTime():null; }catch(_){ return null; } },
      source:()=>_windFld()?'ECMWF IFS HRES · Open-Meteo':'Open-Meteo' });
    register('precip', { label:()=>L5('Precipitation','降水','Niederschlag','Осадки','Precipitación'), sampleAt:(x,y)=>_om('precip',x,y), time:()=>_ld('precip'), source:()=>'NASA GIBS (IMERG) / Open-Meteo' });
    register('snow',   { label:()=>L5('Snow & ice','積雪・氷','Schnee & Eis','Снег и лёд','Nieve y hielo'), sampleAt:(x,y)=>_om('snow',x,y), time:()=>_ld('snow'), source:()=>'NASA GIBS / Open-Meteo' });
    register('aod',    { label:()=>L5('Aerosol / haze','エアロゾル','Aerosol','Аэрозоль','Aerosol'), sampleAt:(x,y)=>_om('aod',x,y), time:()=>_ld('aod'), source:()=>'NASA GIBS / Open-Meteo air-quality' });
    register('no2',    { label:()=>'NO₂', sampleAt:(x,y)=>_om('no2',x,y), time:()=>_ld('no2'), source:()=>'NASA GIBS / Open-Meteo air-quality' });
    register('co',     { label:()=>'CO', sampleAt:(x,y)=>_om('co',x,y), time:()=>_ld('co'), source:()=>'NASA GIBS / Open-Meteo air-quality' });
    register('climate',{ label:()=>L5('Köppen climate','ケッペン気候区分','Köppen-Klima','Климат Кёппена','Clima de Köppen'),
      /* (#R245) one climate-name lookup for the whole app — see window.kName in js/data-layers.js */
      sampleAt:(x,y)=>{ try{ const c=window.sampleKoppenAt&&window.sampleKoppenAt(x,y); if(!c) return null; const nm=window.kName&&window.kName(c); return c+((nm&&nm!==c)?(' · '+nm):''); }catch(_){ return null; } },
      time:()=>{ try{ return window._koppenPeriod||null; }catch(_){ return null; } }, source:()=>'Beck et al. Köppen-Geiger' });
    register('webcams',{ label:()=>L5('Live cameras','ライブカメラ','Live-Kameras','Камеры','Cámaras en vivo'),
      featuresIn:b=>_srcFeatsIn('webcams-src',b), summary:()=>{ const f=_srcFeatsIn('webcams-src',null); return f?(f.length+' '+L5('in view','表示範囲内','im Blick','в поле зрения','a la vista')):null; }, source:()=>'OSM/DOT public cams' });
    register('news',   { label:()=>L5('News points','ニュース地点','Nachrichtenpunkte','Точки новостей','Puntos de noticias'),
      on:()=>{ const f=_srcFeatsIn('news-points',null); return !!(f&&f.length); },
      featuresIn:b=>_srcFeatsIn('news-points',b), summary:()=>{ const f=_srcFeatsIn('news-points',null); return f?(f.length+' '+L5('in view','表示範囲内','im Blick','в поле зрения','a la vista')):null; } });
    register('volcanoes',{ label:()=>L5('Volcanoes','火山','Vulkane','Вулканы','Volcanes'), on:()=>{ try{ return !!(GE().layers.has('volc2-pt')&&GE().layers.getLayout('volc2-pt','visibility')!=='none'); }catch(_){ return false; } },
      featuresIn:b=>_srcFeatsIn('volc2-src',b), source:()=>'Smithsonian GVP' });
    register('elevation',{ label:()=>L5('Elevation','標高','Höhe','Высота','Elevación'), on:()=>true,
      sampleAt:(x,y)=>{ try{ const v=(typeof demElevAt==='function')?demElevAt(x,y):null; return (v==null)?null:(Math.round(v)+' m'); }catch(_){ return null; } }, source:()=>'Mapzen/AWS terrarium DEM' });
    /* ---- (#R120) live traffic layers — the REAL features currently on the map (same geojson the symbols paint) ---- */
    const _lyrVis=id=>{ try{ return !!(GE().layers.has(id)&&GE().layers.getLayout(id,'visibility')==='visible'); }catch(_){ return false; } };
    register('aircraft',{ label:()=>L5('Live aircraft','航空機（リアルタイム）','Live-Flugverkehr','Самолёты (онлайн)','Aviones en vivo'),
      on:()=>_lyrVis('lyr-planes'), featuresIn:b=>_srcFeatsIn('src-planes',b),
      summary:()=>{ const f=_srcFeatsIn('src-planes',null); return f?(f.length+' '+L5('in view','表示範囲内','im Blick','в поле зрения','a la vista')):null; }, source:()=>'airplanes.live ADS-B' });
    register('ships',{ label:()=>L5('Live ships','船舶（リアルタイム）','Live-Schiffe','Суда (онлайн)','Barcos en vivo'),
      on:()=>_lyrVis('lyr-ships'), featuresIn:b=>_srcFeatsIn('src-ships',b),
      summary:()=>{ const f=_srcFeatsIn('src-ships',null); return f?(f.length+' '+L5('in view','表示範囲内','im Blick','в поле зрения','a la vista')):null; }, source:()=>'aisstream.io AIS' });
    /* (#R184) live satellites. Unlike the two above, this one does NOT read the source back out of the
       renderer: the layer's own state() is authoritative (a GeoJSON source's data is not readable in
       MapLibre 5 — #R183), and "how many are above the horizon from here" is the meaningful count. */
    register('satellites',{ label:()=>L5('Live satellites','人工衛星（リアルタイム）','Live-Satelliten','Спутники (онлайн)','Satélites en vivo'),
      on:()=>{ try{ return !!(window.IntMapSatellites&&window.IntMapSatellites.isOn()); }catch(_){ return false; } },
      featuresIn:b=>_srcFeatsIn('src-sats',b),
      summary:()=>{ try{ const s=window.IntMapSatellites&&window.IntMapSatellites.state(); if(!s) return null;
          return s.drawn+' / '+s.catalogue+' '+L5('tracked','追跡中','verfolgt','отслеживается','en seguimiento'); }catch(_){ return null; } },
      source:()=>'CelesTrak GP · SGP4/SDP4' });
    /* ---- (#R120/#R121) country choropleths — the value of every VISIBLE choropleth family at a point.
       Core stat fills go through window.choroValueAt (countryStats; R121: works OFF-SCREEN too via
       point-in-polygon over countryGeo), the World-Bank beta fills carry their raw value in the feature
       properties (R121: PIP over the source data when the point is off screen), and the ~40 bx World-Bank
       choropleths report through window._imBxChoroValueAt (registered by their own module). ---- */
    /* shared point-in-polygon (Polygon/MultiPolygon with holes) — also used by choroValueAt & the bx module */
    window._imPipGeo=function(x,y,g){ const ring=r=>{ let ins=false; for(let i=0,j=r.length-1;i<r.length;j=i++){ const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1]; if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi)) ins=!ins; } return ins; };
      const poly=p=>{ if(!p||!p.length||!ring(p[0])) return false; for(let k=1;k<p.length;k++){ if(ring(p[k])) return false; } return true; };
      try{ if(!g) return false; if(g.type==='Polygon') return poly(g.coordinates); if(g.type==='MultiPolygon') return g.coordinates.some(poly); }catch(_){} return false; };
    const _WBF={ 'wb-cpi-f':{src:'wb-cpi',lb:()=>L5('Corruption (control, WGI)','汚職・腐敗指標','Korruptionsindex','Индекс коррупции','Índice de corrupción'),fmt:p=>Math.round(+p.s)+' / 100'},
      'wb-le-f':{src:'wb-le',lb:()=>L5('Life expectancy','平均寿命','Lebenserwartung','Продолжительность жизни','Esperanza de vida'),fmt:p=>(+p.raw).toFixed(1)+' '+L5('yrs','年','J.','лет','años')},
      'wb-unemp-f':{src:'wb-unemp',lb:()=>L5('Unemployment','失業率','Arbeitslosenquote','Безработица','Desempleo'),fmt:p=>(+p.raw).toFixed(1)+'%'},
      'wb-internet-f':{src:'wb-internet',lb:()=>L5('Internet users','インターネット普及率','Internetnutzer','Пользователи интернета','Usuarios de internet'),fmt:p=>(+p.raw).toFixed(1)+'%'},
      'wb-precip-f':{src:'wb-precip',lb:()=>L5('Annual precipitation','年降水量','Jahresniederschlag','Годовые осадки','Precipitación anual'),fmt:p=>Math.round(+p.raw)+' mm'} };
    const _CHF=['pop','hdi','dem','milSpend','milSpendGDP','gdppc','tfr'].map(id=>id+'-fill');
    const _srcData=sid=>{ try{ const d=GE().layers.sourceData(sid); return (d&&d.features)?d:null; }catch(_){ return null; } };
    register('choropleth',{ label:()=>L5('Country choropleth','国別コロプレス','Länder-Choroplethe','Хороплет по странам','Coropleta por países'),
      on:()=>_CHF.some(_lyrVis)||Object.keys(_WBF).some(_lyrVis)||!!(window._imBxChoroOn&&window._imBxChoroOn()),
      sampleAt:(x,y)=>{ const outs=[];
        try{ const v=window.choroValueAt&&window.choroValueAt(x,y); if(v) outs.push(v); }catch(_){}
        try{ const ids=Object.keys(_WBF).filter(_lyrVis);
          if(ids.length){ let hit=null;
            try{ const pt=GE().coords.project([x,y]); const cv=GE().render.canvas();
              if(pt&&pt.x>=0&&pt.y>=0&&pt.x<=((cv&&cv.clientWidth)||1e9)&&pt.y<=((cv&&cv.clientHeight)||1e9)){ const h=GE().coords.queryRenderedFeatures(pt,{layers:ids}); if(h&&h.length) hit={id:h[0].layer.id,p:h[0].properties||{}}; } }catch(_){}
            if(!hit){ for(const id of ids){ const d=_srcData(_WBF[id].src); if(!d) continue;   /* (#R121) off-screen → PIP over the layer's own data */
              const f=d.features.find(ft=>window._imPipGeo(x,y,ft.geometry)); if(f&&f.properties&&f.properties.raw!=null){ hit={id,p:f.properties}; break; } } }
            if(hit){ const W=_WBF[hit.id]; if(W) outs.push(W.lb()+': '+W.fmt(hit.p)+(hit.p.iso?(' ('+hit.p.iso+')'):'')); } } }catch(_){}
        try{ const bx=window._imBxChoroValueAt&&window._imBxChoroValueAt(x,y); if(bx&&bx.length) outs.push.apply(outs,bx.slice(0,4)); }catch(_){}
        return outs.length?outs.join(' | '):null; }, source:()=>'World Bank / SIPRI / UNDP' });
    /* ---- (#R121) more REAL feature layers on the contract ---- */
    register('earthquakes',{ label:()=>L5('Earthquakes','地震','Erdbeben','Землетрясения','Terremotos'),
      on:()=>_lyrVis('eq-pt'), featuresIn:b=>_srcFeatsIn('src-eq',b),
      summary:()=>{ const f=_srcFeatsIn('src-eq',null); if(!f) return null; let mx=null; f.forEach(q=>{ const m=q.properties&&+q.properties.mag; if(m!=null&&isFinite(m)&&(mx==null||m>mx)) mx=m; });
        return f.length+' '+L5('in view','表示範囲内','im Blick','в поле зрения','a la vista')+(mx!=null?(' · max M'+mx.toFixed(1)):''); }, source:()=>'USGS' });
    register('datacenters',{ label:()=>L5('Data centers & AI infra','データセンター・AIインフラ','Rechenzentren & KI-Infrastruktur','Дата-центры и ИИ-инфраструктура','Centros de datos e infra de IA'),
      on:()=>_lyrVis('dc-pt'), featuresIn:b=>_srcFeatsIn('dc-src',b),
      summary:()=>{ const f=_srcFeatsIn('dc-src',null); return f?(f.length+' '+L5('in view','表示範囲内','im Blick','в поле зрения','a la vista')):null; } });
    register('pharma',{ label:()=>L5('Pharma manufacturing hubs','製薬・医薬品製造拠点','Pharma-Produktionszentren','Центры фармпроизводства','Centros farmacéuticos'),
      on:()=>_lyrVis('ph-pt'), featuresIn:b=>_srcFeatsIn('ph-src',b),
      summary:()=>{ const f=_srcFeatsIn('ph-src',null); return f?(f.length+' '+L5('in view','表示範囲内','im Blick','в поле зрения','a la vista')):null; } });
    /* (#R121) thermal anomalies (active fires) — REAL pixel count from the same NASA FIRMS/GIBS WMS imagery the
       layer paints: fetch a small GetMap around the point (per day-offset of the user's 24/48/72h window) and
       count non-transparent pixels. 0 = "none detected" (a real answer); fetch failure = null (no data). */
    const _fireCache=new Map();
    async function _fireCount(lng,lat){ const R=20037508.342789244;
      const mx=lng/180*R, my=Math.log(Math.tan((90+lat)*Math.PI/360))/Math.PI*R; if(!isFinite(my)) return null;
      const half=15000, n={'24':2,'48':3,'72':4}[window._thermalWindow||'24']||2, W=96;
      /* one GetMap PER PRODUCT (a combined LAYERS= request fails ENTIRELY with a ServiceException when any one
         product has no shapefile for that day — live-verified with VIIRS_SNPP); the detections are OR-ed into a
         pixel mask so the count matches the UNION the painted layer shows (no sensor double-counting). */
      const days=[]; for(let off=0;off<n;off++) days.push(new Date(Date.now()-off*86400000).toISOString().slice(0,10));
      const key=days[0]+':'+n+':'+Math.round(mx/5000)+','+Math.round(my/5000);
      if(_fireCache.has(key)) return _fireCache.get(key);
      const PRODUCTS=['VIIRS_NOAA20_Thermal_Anomalies_375m_All','VIIRS_SNPP_Thermal_Anomalies_375m_All','MODIS_Terra_Thermal_Anomalies_All','MODIS_Aqua_Thermal_Anomalies_All'];
      const mask=new Uint8Array(W*W); let got=false;
      await Promise.all(days.map(day=>Promise.all(PRODUCTS.map(ly=>new Promise(res=>{ const im=new Image(); im.crossOrigin='anonymous';
        im.onload=()=>{ try{ const cv=document.createElement('canvas'); cv.width=cv.height=W; const cx=cv.getContext('2d',{willReadFrequently:true}); cx.drawImage(im,0,0,W,W); const d=cx.getImageData(0,0,W,W).data;
          for(let i=0;i<W*W;i++){ if(d[i*4+3]>60) mask[i]=1; } got=true; }catch(_){} res(); };
        im.onerror=()=>res();
        im.src='https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS='+ly+'&CRS=EPSG:3857&BBOX='+(mx-half)+','+(my-half)+','+(mx+half)+','+(my+half)+'&WIDTH='+W+'&HEIGHT='+W+'&FORMAT=image/png&TRANSPARENT=TRUE&STYLES=&TIME='+day; })))));
      if(!got) return null;
      let total=0; for(let i=0;i<W*W;i++) total+=mask[i];
      const out= total>0 ? (total+' '+L5('fire pixels within ~15 km','火災ピクセル（約15km圏）','Feuerpixel in ~15 km','пикс. пожаров в ~15 км','píxeles de fuego en ~15 km'))
                         : L5('none detected within ~15 km','約15km圏で検出なし','keine in ~15 km erkannt','не обнаружено в ~15 км','ninguno en ~15 km');
      if(_fireCache.size>60) _fireCache.clear(); _fireCache.set(key,out); return out; }
    register('thermal',{ label:()=>L5('Thermal anomalies (fires)','熱異常（火災）','Thermale Anomalien (Brände)','Тепловые аномалии (пожары)','Anomalías térmicas (incendios)'),
      on:()=>['lyr-thermal','lyr-thermal-1','lyr-thermal-2','lyr-thermal-3'].some(_lyrVis), sampleAt:(x,y)=>_fireCount(x,y),
      time:()=>L5('last','直近','letzte','последние','últimas')+' '+(window._thermalWindow||'24')+' h', source:()=>'NASA FIRMS / GIBS (MODIS+VIIRS)' });
    return { register, list, active:activeIds, state, sampleAt, featuresIn, context };
  })();
};

window.IntMapModules.layerSidebar=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const layerCbInfo=HOST.layerCbInfo, saveSettings=HOST.saveSettings, renderLayerFavs=HOST.renderLayerFavs;
  window.IntMapLayerSidebar=(function(){
    let sb=null,built=false;
    const isMob=()=>window.matchMedia&&window.matchMedia('(max-width:768px)').matches;
    /* ══ ⚠ (#R253) FRONT-MOST FOLLOWS THE POINTER, NOT THE STYLESHEET ═══════════════════════════════
       「サイドバーをあけたときに、ポップアップ等がサイドバーの後ろに隠れるように。ポップアップ内で
         なんらかの操作したら、ポップアップが前部に来るように。サイドバー内をクリックした場合はまた
         サイドバーを前部に。」 The z-index band itself is in css/intmap.css beside the other
         `body.lsr-open` rules; this is the one bit of state it reads.
       ⚠ «A FLOATING PANEL» IS ASKED OF THE LAYOUT, NOT OF A LIST OF SELECTORS. Walking up for the
       first positioned ancestor catches every panel this app has and every one a later module adds —
       a hand-written list would be one more place to forget, which is the shape this project keeps
       paying for. The map's own canvas container is positioned too and is explicitly NOT a panel:
       clicking the map is what OPENS a popup, and the report says a fresh popup belongs BEHIND the
       sidebar. Capture phase, so a handler that stops propagation cannot hide the gesture. */
    /* ══ ⚠⚠ (#R254) …AND A MAP POPUP COULD NEVER COME TO THE FRONT, BECAUSE IT HAS NO z-index ═══════
       「ポップアップ内でなんらかの操作したら、ポップアップが前部に来るように。サイドバー内をクリック
         した場合はまたサイドバーを前部に。」 — reported again, and the half above is why. MEASURED on
       the shipped build: `getComputedStyle('.maplibregl-popup').zIndex` is **auto**, its parent is
       `#map`, and #map / #map-container / .operation-room are all `z-index:auto`, so a popup takes
       part in the ROOT stacking context at level 0. `body.im-float-front` drops the sidebar from
       2600 to its base **1000** — which is still above 0. So the demotion worked exactly as #R253
       measured it for the panels that carry an explicit z-index (legends 1100, popovers 1300-1500,
       cards 2200), and could not possibly work for a MapLibre popup.
       ⚠ DEMOTING THE SIDEBAR IS NOT ENOUGH; THE THING BEING USED HAS TO BE NAMED. The panel under
       the pointer is now marked `.im-front` and rises above the whole band on its own, whatever its
       own z-index was (or wasn't). One element carries the mark at a time — it moves with the
       pointer, and a pointerdown in a sidebar or on the map takes it away, which is the other two
       sentences of the instruction. */
    const _FRONT_SIDE='.sidebar,#layer-sidebar-r,.btn-toggle-sidebar,#lsr-toggle';
    /* ══ ⚠ (#R255) THE SHELL IS NOT A PANEL, AND «SOME OPERATION» IS NOT ONLY A POINTERDOWN ═════════
       「ポップアップ内でなんらかの操作したら、ポップアップが前部に来るように。」— reported a third
       time. #R253 built the demotion and #R254 named the raised element; MEASURED on this build both
       do exactly what they say (a `.data-legend` goes 1100 → 2650 and the sidebar 2600 → 1000; a
       MapLibre popup goes `auto` → 2650 and back). Two holes were left, and both are «operations»:

       ① A WHEEL SCROLL AND A KEYSTROKE ARE NOT POINTERDOWNS. Reading a long card by scrolling it, or
          typing into a field inside it, are the plainest cases of 「なんらかの操作」 there are, and
          neither raised anything. `wheel` and `focusin` now count.
       ② `#map-container` AND `.operation-room` ARE `position:relative` (css/intmap.css), so they are
          positioned ancestors — and `panelOf` returns the FIRST one it finds. Anything inside the map
          shell that is not itself positioned and not under the canvas therefore resolved to the SHELL,
          and marking that `.im-front` puts the whole map (and every sidebar inside `.operation-room`)
          into one 2650 box. The walk now refuses the shell by name as well as the canvas. */
    /* ══ ⚠ (#R258) …AND A PANEL THAT SITS ABOVE THE BAND CAN NEVER BE COVERED BY THE SIDEBAR ════════
       「ポップアップ内でなんらかの操作したら、ポップアップが前部に来るように。左サイドバー内をクリック
         した場合はまた左サイドバーを前部に。」— a FOURTH time. MEASURED on this build, the mechanism
       #R254/#R255 built does work end to end: a pointerdown inside `#country-popup` takes it
       `auto → .im-front → 2650` with the sidebar at 1000; a pointerdown in the left sidebar puts it
       back (`popup 2200 / sidebar 2600`, and `elementFromPoint` over the overlap returns the
       sidebar's row); a wheel inside the popup raises it again. What it cannot do is cover a panel
       whose own z-index is ABOVE the band, and there was one: **`#compare-window` at 4000** — a
       draggable, resizable window, i.e. exactly the kind of thing one «reaches into», sitting
       permanently in front of both sidebars. It is in the card band (2200) now, so the sidebar
       covers it and `.im-front` raises it, like every other panel. See js/compare.js.
       Two more holes closed here:
       ① `keydown` counts as an operation. `focusin` fires once; a panel re-rendered under the
          caret (the trade / crop panels rebuild their body on every change) leaves the reader
          typing into something that never announced itself.
       ② A panel positioned `relative`/`sticky` WITH A Z-INDEX OF ITS OWN is a panel. `panelOf`
          only accepted `absolute`/`fixed`, so a pointerdown inside such a panel found nothing and
          took the DEMOTE branch — it pushed the panel being used behind the sidebar. A plain flow
          element has `z-index:auto` and is still skipped, which is what keeps this narrow.
          ⚠ Both sidebars are `relative` + `z-index:2600`, so they are named in `_NOT_PANEL` as
          well as in `_FRONT_SIDE`: they are the shell this band is measured against, never a
          panel inside it. */
    const _NOT_PANEL='#map,#map-container,.operation-room,.maplibregl-map,.maplibregl-canvas-container,'
      +'.maplibregl-control-container,canvas,.sidebar,#sidebar,#layer-sidebar-r';
    function _wireFrontMost(){ if(window.__imFrontMostWired) return; window.__imFrontMostWired=1;
      /* the floating panel an event landed in — the first positioned ancestor, asked of the LAYOUT
         rather than of a list of selectors (#R253). The map's own canvas is explicitly not one. */
      const panelOf=(el)=>{ for(let n=el; n&&n!==document.body; n=n.parentElement){
          if(n.matches&&n.matches(_NOT_PANEL)) return null;
          let p='',z=''; try{ const cs=getComputedStyle(n); p=cs.position; z=cs.zIndex; }catch(_){}
          if(p==='absolute'||p==='fixed') return n;
          if((p==='relative'||p==='sticky')&&z&&z!=='auto') return n; }
        return null; };
      const raise=(el)=>{ try{ document.querySelectorAll('.im-front').forEach(n=>{ if(n!==el) n.classList.remove('im-front'); }); }catch(_){}
        if(el) el.classList.add('im-front'); };
      const act=(t,mayDemote)=>{ if(!t||!t.closest) return;
        if(t.closest(_FRONT_SIDE)){ document.body.classList.remove('im-float-front'); raise(null); return; }
        const p=panelOf(t);
        /* a wheel over the map must not clear a panel the reader is using — only a POINTERDOWN on the
           map means «I have moved on». So the passive signals raise, and never demote. */
        if(!p){ if(!mayDemote) return; document.body.classList.remove('im-float-front'); raise(null); return; }
        document.body.classList.add('im-float-front'); raise(p); };
      document.addEventListener('pointerdown',(e)=>{ try{ act(e.target,true); }catch(_){} },true);
      document.addEventListener('wheel',(e)=>{ try{ act(e.target,false); }catch(_){} },{capture:true,passive:true});
      document.addEventListener('focusin',(e)=>{ try{ act(e.target,false); }catch(_){} },true);
      document.addEventListener('keydown',(e)=>{ try{ act(e.target,false); }catch(_){} },true);   /* (#R258) typing is an operation */
    }
    const T=window.IntMapLang.pick(()=>HOST.lang);
    /* ⚠ (#R459) AN ATTRIBUTE THAT OUTLIVES A LANGUAGE CHANGE NEEDS BOTH HALVES. The text is right the
       moment the element is built; the KEY is what js/app-body.js's updateI18n() re-applies on every
       switch. `tg.title='Layers'` and `st.title='Favorite'` had neither and shipped English in all nine
       languages — invisibly, because scripts/i18n-attr-audit.mjs read only index.html until #R459. */
    const titleKey=(el,k)=>{ try{ el.title=window.IntMapLang.keyed(HOST.lang)[k]||el.title; }catch(_){} el.setAttribute('data-i18n-title',k); return el; };
    /* (#R70) REBUILT FROM SCRATCH ("単にデフォルトの Layers選択欄を移植するな。一から同じ機能かつ洗練された
       UIで作り直せ。タイル形式にして"): the sidebar no longer adopts/reparents #layer-dropdown. It is its own
       TILE GRID — every layer row of the classic panel becomes a visual tile (preview image via
       IntMapLayerPreviews, full name, ✓ active state, ★ favorite), grouped under the same category headers,
       with live search. The classic dropdown stays untouched in its home (hidden) and remains the single
       source of truth: a tile click toggles the REAL checkbox and dispatches its change event, so every
       existing layer engine, legend, Active-layers chip and Atlas action keeps working unchanged. */
    function css(){ const st=document.createElement('style');
      /* (#R66) DECOUPLED layout ("右サイドバーそのものが覆いかぶさる" report): the MAP cedes the strip itself —
         `.map-container{margin-right:var(--lsr-w)}` (also set INLINE by open()) — and the sidebar merely fills
         the vacated strip as an absolute panel. The map's width never depends on the sidebar's flex/transition
         state, so no failure mode of the panel can ever leave it covering the map: worst case is an empty strip. */
      st.textContent=':root{--lsr-w:min(300px,92vw);}'   /* (#R154/#R159/#R160) smaller default width ("もう少し小さく") — 430→380→340→300 */
        +'body.lsr-avail .operation-room{position:relative;}'
        /* (#R154) LEFT-EDGE drag-resizer — mirror of the left sidebar's #sb-resizer so the right sidebar is
           left-right adjustable too ("左サイドバーと同様に左右に調整"). Grows as the cursor moves LEFT. Desktop only. */
        +'#layer-sidebar-r .lsr-resizer{position:absolute;top:0;left:-3px;width:8px;height:100%;cursor:col-resize;z-index:1200;touch-action:none;}'
        +'#layer-sidebar-r .lsr-resizer:hover{background:linear-gradient(to left,transparent,rgba(0,122,255,0.35),transparent);}'
        +'@media(max-width:768px){#layer-sidebar-r .lsr-resizer{display:none;}}'
        /* (#R160) The right sidebar now OVERLAYS the map on DESKTOP too (previously it pushed the map with
           margin-right, which resized + recentred the map = "地図領域の位置が動く"). The map-container keeps its
           fixed full width; the panel slides over the right strip. The right-anchored HUD slides left to clear
           it (rules above). Mobile already overlaid — this just makes desktop match. */
        +'@media(max-width:768px){#layer-sidebar-r{z-index:1460;box-shadow:-6px 0 30px rgba(0,0,0,0.32);}#lsr-toggle{display:none !important;}}'
        +'#layer-sidebar-r{position:absolute;top:0;right:0;bottom:0;width:var(--lsr-w);z-index:1000;background:var(--sidebar-bg);backdrop-filter:blur(25px) saturate(160%);-webkit-backdrop-filter:blur(25px) saturate(160%);border-left:1px solid rgba(128,128,128,0.18);display:flex;flex-direction:column;box-sizing:border-box;transform:translateX(102%);transition:transform .38s cubic-bezier(0.25,1,0.5,1);min-height:0;pointer-events:none;visibility:hidden;}'
        +'#layer-sidebar-r.open{transform:translateX(0);pointer-events:auto;visibility:visible;}'
        /* ══ (#R191) THE LAYER SIDEBAR FOLLOWS THE APPEARANCE SETTING LIKE EVERY OTHER SURFACE ═══════
           「レイヤーサイドバーは無条件で透過するな。」 The rule above paints it with --sidebar-bg, which
           is rgba(255,255,255,0.85) / rgba(28,28,30,0.85) — translucent in EVERY mode, including
           「不透過（デフォルト）」. Settings › サイドバーの外観 has said Solid / Frosted / More frosted
           since #R33 («全てのUIはこの設定に従うように»), and the left .sidebar has honoured it since
           #R104; this panel was simply never wired to it. Solid now paints the same recessed
           --panel-bg the left sidebar uses (so its rows read as elevated tiles) with the blur off —
           a blur behind an opaque fill is GPU work nobody can see. The two frosted modes keep the
           frosted material above untouched, which is the other half of the instruction: not
           unconditionally opaque either. */
        +'body:not(.sidebar-translucent):not(.sidebar-glass2) #layer-sidebar-r{background:var(--panel-bg,var(--card-bg));backdrop-filter:none;-webkit-backdrop-filter:none;}'
        +'#layer-sidebar-r .lsr-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px 8px;padding-top:max(14px,env(safe-area-inset-top));}'
        +'#layer-sidebar-r .lsr-head b{font-size:16px;color:var(--text-main);}'
        +'#layer-sidebar-r .lsr-x{background:none;border:none;font-size:20px;color:var(--text-muted);cursor:pointer;border-radius:8px;padding:2px 8px;}'
        +'#layer-sidebar-r .lsr-x:hover{background:var(--input-bg);color:var(--text-main);}'
        /* (#R70) the sidebar's OWN search pill (it filters the tile grid — the classic dropdown is untouched) */
        +'#layer-sidebar-r .lsr-search{display:block;padding:2px 14px 10px;}'
        +'#layer-sidebar-r .lsr-search input{width:100%;box-sizing:border-box;height:36px;border-radius:18px;border:1px solid rgba(128,128,128,0.28);background:var(--card-bg);color:var(--text-main);font-size:12.5px;padding:0 14px;outline:none;}'
        +'#layer-sidebar-r .lsr-search input:focus{border-color:var(--primary-color);}'
        /* (#R255) 「レイヤー検索欄に入力内容をクリアするボタンを。」 — the pill is the positioning
           context; the button sits inside its right-hand padding and appears only with a query. */
        +'.lsr-search{position:relative;}'
        +'.lsr-search input{padding-right:38px !important;}'
        /* (#R268) 「レイヤー検索欄の×ボタンに背景は不要」 — the disc is gone from BOTH search boxes
           (this one and js/map-extras.js's `#layer-search`); hover moves the glyph, not a plate. */
        /* ══ ⚠⚠ (#R270) THE × WAS A CHARACTER NOBODY IN THIS APP'S TYPEFACE DRAWS ══════════════════
           「レイヤー検索欄の×の様子がおかしい。不自然な形の×。」
           MEASURED in the running page: `measureText('×')` returns 9.8027 px at 12 px in EVERY
           family this app names — Inter, Noto Sans JP, system-ui, sans-serif — i.e. none of them has
           the glyph and every one of them falls through to the platform's symbol font. So the mark
           was drawn at a weight, a size and a baseline that belong to no other glyph on the screen,
           and it is a different mark on every operating system. That is the 不自然な形.
           → It is GEOMETRY now: two strokes of one SVG, 1.6 px wide with round caps, centred in the
           box. Exactly symmetric, the same on every platform, and it inherits `currentColor` so the
           hover state is unchanged. Both search boxes get it — see js/map-extras.js. */
        +'.lsr-search .lsr-clear{display:none;position:absolute;right:22px;top:50%;transform:translateY(-50%);width:20px;height:20px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--text-muted);cursor:pointer;align-items:center;justify-content:center;line-height:1;}'
        +'.lsr-search .lsr-clear[data-on="1"]{display:flex;}'
        /* (#R273) the mark is a CHARACTER again (see IntMapClearGlyph) — sized and weighted to sit
           in the field the way the app's other close marks sit in their panels */
        +'.lsr-search .lsr-clear,#layer-search-wrap .ls-clear{font-size:17px;font-weight:400;line-height:1;}'
        +'.lsr-search .lsr-clear:hover{background:transparent;color:var(--text-main);}'
        +'.lsr-mount .lsr-search .lsr-clear{right:8px;}'
        /* the native WebKit clear button would sit UNDER this one on Chrome (`type=search`), i.e.
           two marks in one place — the other half of 「不自然な形の×」 (see js/map-extras.js) */
        +'.lsr-search input::-webkit-search-cancel-button,#layer-search-wrap input::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none;display:none;}'
        +'#layer-sidebar-r .lsr-body{flex:1;overflow-y:auto;padding:0 12px 24px;min-height:0;}'
        /* (#R70/#R71) TILE GRID — 3 columns, mercator-true previews (aspect matches the canvas exactly:
           nothing stretched), tightened typography, quieter card chrome ("素人が作ったようなダサい"対策). */
        /* (#R72) category headers: real COLLAPSIBLE section controls (chevron + name + count), normal-case,
           readable size — the old tiny all-caps row read as decoration ("形骸化しており、折りたたみが不可能かつ
           …テキストやフォント、UIがダサい").
           ⚠ (#R313) 「レイヤーカテゴリの見出しをもっと大きく目立つ感じにしろ。」 #R108 had pulled these to
           13.5px/500 ("slightly larger, NOT bold") and at that weight a section title read as one more
           row of the list rather than as the thing the rows hang under. They are titles now — 17px/700,
           with the chevron and the count pill scaled to sit beside a title instead of beside a row.
           ⚠ THE MOBILE SHEET CARRIES ITS OWN COPY of these declarations (css/intmap.css, `.m-sheet
           .lsr-mount .lst-sech`) because this block is injected under an #id selector that never matches
           there — both were moved together. */
        +'#layer-sidebar-r .lst-sech{font-size:17px;font-weight:700;letter-spacing:-0.015em;text-transform:none;color:var(--text-main);margin:20px 0 9px;display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;padding:4px 2px;border-radius:8px;}'   /* (#R313) a title, not a row */
        +'#layer-sidebar-r .lst-sech:hover{background:var(--input-bg);}'
        +'#layer-sidebar-r .lst-sech .lst-chev{flex:0 0 auto;width:8.5px;height:8.5px;border-right:2px solid var(--text-muted);border-bottom:2px solid var(--text-muted);transform:rotate(45deg);transition:transform .18s ease;position:relative;top:-2px;}'
        +'#layer-sidebar-r .lst-sech.closed .lst-chev{transform:rotate(-45deg);top:0;}'
        +'#layer-sidebar-r .lst-sech .lst-cnt{font-weight:600;font-size:11px;color:var(--text-muted);background:var(--input-bg);border-radius:999px;padding:2px 8px;letter-spacing:0;}'
        +'#layer-sidebar-r .lst-sech::after{content:"";flex:1;height:1px;background:rgba(128,128,128,0.14);}'
        +'#layer-sidebar-r .lst-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}'
        +'#layer-sidebar-r .lst-grid.closed{display:none;}'
        +'#layer-sidebar-r .lst-tile{position:relative;border-radius:11px;overflow:hidden;border:1px solid rgba(128,128,128,0.18);cursor:pointer;background:var(--card-bg);transition:border-color .13s ease,box-shadow .13s ease;-webkit-tap-highlight-color:transparent;}'
        +'#layer-sidebar-r .lst-tile:hover{box-shadow:0 4px 14px rgba(0,0,0,0.20);border-color:rgba(128,128,128,0.38);}'
        +'#layer-sidebar-r .lst-tile.on{border-color:var(--primary-color);box-shadow:0 0 0 1px var(--primary-color);}'
        /* (#R101) shorter tiles per request — flatter preview thumbnail */
        +'#layer-sidebar-r .lst-prev{aspect-ratio:240/96;background-size:cover;background-position:center;background-color:#14212f;border-bottom:1px solid rgba(128,128,128,0.14);}'
        /* (#R72) tile caption: slightly larger, evenly padded, vertically centered within its fixed 2-line box */
        +'#layer-sidebar-r .lst-nm{padding:5px 8px 5px;font-size:11px;font-weight:500;line-height:1.3;color:var(--text-main);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:26px;box-sizing:content-box;text-align:left;overflow-wrap:break-word;}'   /* (#R103) reverted to the original 11px per request */
        /* (#R114) .lst-check ✓ badge removed — the `.on` accent border is the ON-layer highlight now. */
        +'#layer-sidebar-r .lst-star{position:absolute;top:3px;right:3px;width:19px;height:19px;border:none;border-radius:50%;background:rgba(10,14,22,0.5);color:rgba(255,255,255,0.8);font-size:10.5px;line-height:1;cursor:pointer;display:none;align-items:center;justify-content:center;padding:0;}'
        +'#layer-sidebar-r .lst-tile:hover .lst-star,#layer-sidebar-r .lst-star.on{display:flex;}'
        +'#layer-sidebar-r .lst-star.on{color:#ffd60a;}'
        +'#layer-sidebar-r .lst-empty{color:var(--text-muted);font-size:12px;padding:18px 4px;text-align:center;}'
        /* == (#R309) "Base map & labels" IS A LIST OF SWITCHES, NOT A GRID OF PICTURES ============
           「Base map & labelsは、タイル形式ではなく、トグルで行で並べる形式に。サムネイル画像はいらない。」
           Every section of this browser was drawn by the same `buildTiles` loop, so the basics were
           thirteen 3-up cards whose thumbnails are pictures of the map itself — a photograph of «Place
           names» tells a reader nothing that the words do not. The rows keep the `lst-tile` class on
           purpose: `syncTiles`, `filterTiles`, `_setTileOn` and the three rebuild-if-the-count-changed
           guards all query `.lst-tile`, and a second class name would have meant finding every one of
           them. `.lst-row` only re-shapes what the card looks like.
           The switch is the `.wgt-sw` geometry (42x26, 20 px knob, 16 px throw) so the one iOS switch
           this app draws is the same object in the widget deck and here; the ON colour is the panel's
           own `--primary-color`, which is what `.lst-tile.on` already used to say.
           ⚠ Both mounts, exactly as `.lst-toolrow` above does it — the phone sheet builds through the
           SAME `buildTiles(host)`, so a rule written only for the sidebar would leave the sheet with
           thumbnail-less cards. */
        +'#layer-sidebar-r .lst-grid.lst-rows,.lsr-mount .lst-grid.lst-rows{display:flex;flex-direction:column;gap:6px;}'
        +'#layer-sidebar-r .lst-grid.lst-rows.closed,.lsr-mount .lst-grid.lst-rows.closed{display:none;}'
        +'#layer-sidebar-r .lst-tile.lst-row,.lsr-mount .lst-tile.lst-row{display:flex;align-items:center;gap:10px;box-sizing:border-box;min-height:46px;padding:8px 12px;border-radius:12px;overflow:visible;}'
        /* ⚠ the accent RING is what a picture card needs to say "on" from across a grid. A row says it
           with the switch, so the ring would be a second, louder voice for the same fact. */
        +'#layer-sidebar-r .lst-tile.lst-row.on,.lsr-mount .lst-tile.lst-row.on{border-color:rgba(128,128,128,0.18);box-shadow:none;}'
        +'#layer-sidebar-r .lst-tile.lst-row:hover,.lsr-mount .lst-tile.lst-row:hover{box-shadow:none;border-color:rgba(128,128,128,0.38);background:var(--input-bg);}'
        +'#layer-sidebar-r .lst-tile.lst-row .lst-nm,.lsr-mount .lst-tile.lst-row .lst-nm{flex:1;min-width:0;padding:0;min-height:0;font-size:12.5px;}'
        +'#layer-sidebar-r .lst-tile.lst-row .lst-star,.lsr-mount .lst-tile.lst-row .lst-star{position:static;flex:0 0 auto;background:transparent;color:var(--text-muted);width:20px;height:20px;font-size:12px;}'
        +'#layer-sidebar-r .lst-tile.lst-row .lst-star.on,.lsr-mount .lst-tile.lst-row .lst-star.on{color:#ffd60a;}'
        +'#layer-sidebar-r .lst-sw,.lsr-mount .lst-sw{position:relative;flex:0 0 auto;width:42px;height:26px;border-radius:13px;background:rgba(128,128,128,0.32);transition:background .16s;pointer-events:none;}'
        +'#layer-sidebar-r .lst-tile.on .lst-sw,.lsr-mount .lst-tile.on .lst-sw{background:var(--primary-color);}'
        +'#layer-sidebar-r .lst-sw i,.lsr-mount .lst-sw i{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:10px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.28);transition:transform .16s cubic-bezier(0.2,0.7,0.2,1);}'
        +'#layer-sidebar-r .lst-tile.on .lst-sw i,.lsr-mount .lst-tile.on .lst-sw i{transform:translateX(16px);}'
        /* ══ ⚠⚠⚠ (#R243) THE TOOL ROW — 「地震シミュレータはレイヤー欄からも開けるようにしろ。」 ══════
           #R242 answered this by appending a button to `#layer-tools`, which lives inside
           `#layer-dropdown` — the CLASSIC dropdown, and `imLayerPanel` has defaulted to `'right'`
           since #R154. MEASURED on the shipped build: the button exists, `display:block`, and its
           bounding rect is 0×0, because its ancestor `#layer-dropdown` is `display:none` for every
           reader on the default setting. So the instruction was re-sent, and correctly.
           ⚠ THE PANEL A READER OPENS IS THIS ONE, so the row is drawn here, at the end of the tile
           browser, in the two places the browser is mounted (the right sidebar and the phone's
           「地図とレイヤー」 sheet — see `mountInto`). It is NOT a tile: a tile toggles a layer, and this
           opens a simulator, so it gets the full-width inset shape the rest of the app uses for a
           verb. ⚠ AND THE OPEN GOES THROUGH THE OS ACTION (`sim.seismic`), which is what the classic
           dropdown's button, the map's right-click menu and the command palette all call — one path,
           three doors ([[intmap-recurring-lessons]] G). */
        /* ══ ⚠⚠ (#R264) THE TOOL CARDS ARE CARDS, SO THEY BEHAVE LIKE THE OTHER CARDS ══════════════
           「レイヤー欄のToolsのカードは、タイルカードと同様に選択中はハイライトし、カード間の間隔が今ない
             から少し開けること。もう一度タイルを押したら選択解除されるように。」
           Two of the three are here. MEASURED on the shipped build: the four visible rows had gaps
           of 0, 0, 0 px (the tile grid beside them is `gap:8px`) because the block was a plain
           `display:block` wrapper of full-width buttons, and no row ever carried an `on` class —
           there was no such rule and nothing set one. The gap is now the SAME 8 px the tile grid
           uses, and `.on` is the SAME accent border + 1 px ring `.lst-tile.on` already draws, so
           «selected» reads identically whichever kind of card it is. The section heading keeps its
           16 px of air above and gives up its own bottom margin to the flex gap, so the first card
           does not sit 16 px further down than the tiles' first row. */
        +'#layer-sidebar-r .lst-tools,.lsr-mount .lst-tools{margin-top:18px;display:flex;flex-direction:column;gap:8px;}'
        +'#layer-sidebar-r .lst-tools>.lst-sech,.lsr-mount .lst-tools>.lst-sech{margin-bottom:0;}'
        +'#layer-sidebar-r .lst-toolrow,.lsr-mount .lst-toolrow{width:100%;box-sizing:border-box;display:flex;align-items:center;gap:10px;'
          +'min-height:46px;padding:9px 12px;border-radius:12px;border:1px solid rgba(128,128,128,0.18);'
          +'background:var(--card-bg);color:var(--text-main);font-size:12.5px;font-weight:500;cursor:pointer;text-align:left;'
          +'transition:background .13s ease,border-color .13s ease;-webkit-tap-highlight-color:transparent;}'
        +'#layer-sidebar-r .lst-toolrow:hover,.lsr-mount .lst-toolrow:hover{border-color:rgba(128,128,128,0.38);background:var(--input-bg);}'
        +'#layer-sidebar-r .lst-toolrow:active,.lsr-mount .lst-toolrow:active{transform:scale(0.995);}'
        /* ⚠ (#R264) AFTER `:hover`, exactly as `.lst-tile.on` is. `#id .cls:hover` and `#id .cls.on`
           have the SAME specificity, so the one written later wins — an `on` row the pointer happens
           to be over would otherwise lose its accent border while it is being pressed. */
        +'#layer-sidebar-r .lst-toolrow.on,.lsr-mount .lst-toolrow.on{border-color:var(--primary-color);box-shadow:0 0 0 1px var(--primary-color);}'
        +'#layer-sidebar-r .lst-toolic,.lsr-mount .lst-toolic{flex:0 0 auto;width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;'
          +'background:color-mix(in srgb, var(--primary-color) 16%, transparent);color:var(--primary-color);}'
        +'#layer-sidebar-r .lst-toolt,.lsr-mount .lst-toolt{flex:1;min-width:0;position:relative;}'
        /* (#R291) 「現在経路が存在する場合は、控えめなアクティブ表示」 — a route outlives its panel, so a
           row needs a way to say «there is one» that is not the same signal as «the panel is open». */
        +'#layer-sidebar-r .lst-tooldot,.lsr-mount .lst-tooldot{position:absolute;top:2px;right:-2px;width:7px;height:7px;border-radius:50%;background:var(--primary-color);}'
        +'#layer-sidebar-r .lst-toolgo,.lsr-mount .lst-toolgo{flex:0 0 auto;color:var(--text-muted);font-size:15px;}'
        /* Active-layers bar pinned at the top of the tile browser — COMPACT here: the chip strip is hidden
           (it turns into clutter as layers pile up — "選択レイヤーが増加すると煩雑"); the counter + List
           overlay + Clear-all carry the same functions in one constant-height row. */
        /* (#R102) tighten the always-shown ACTIVE-LAYERS bar's LEFT + BOTTOM gap a little more (kept non-flush) */
        /* ⚠ (#R252) THE BAR READS THE PANEL'S OWN BACKGROUND VARIABLE, NOT A SECOND ONE.
           「LayersのActive layersの背景が、Layersの背景の色と微妙に違う。合わせて。」 — and it was, by
           exactly one elevation step: this rule painted `--card-bg` while the rule 60 lines above paints
           the sidebar `--panel-bg` in the default (solid) appearance. Measured on the shipped build:
           dark rgb(28,28,30) on rgb(20,20,22), light rgb(255,255,255) on rgb(233,235,239) — the light
           pair is plainly visible. It is the same `var(--panel-bg,var(--card-bg))` the sidebar itself
           uses, so the two can no longer disagree, and in the two FROSTED appearances `--panel-bg` is
           undefined and the fallback keeps #R115's rule («Active layers is OPAQUE — never transparent»)
           byte-for-byte. */
        +'#layer-sidebar-r #layer-active-section{position:sticky;top:0;bottom:auto;background:var(--panel-bg,var(--card-bg));z-index:6;margin:0 -8px 1px;padding:5px 7px 3px;border-radius:0;}'   /* (#R115) opaque — never transparent */
        +'#layer-sidebar-r #layer-active-section .active-lyr-chips{display:none;}'
        +'#layer-sidebar-r .lsr-body{padding-top:0;}'   /* (#R106) flush the Search box to the Active-layers bar (was a 2px see-through seam) */
        /* (#R63) left-style edge toggle — mirrors .btn-toggle-sidebar */
        +'#lsr-toggle{position:fixed;top:50%;right:0;z-index:1460;background:var(--sidebar-bg);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(128,128,128,0.18);border-right:none;color:var(--text-muted);width:22px;height:64px;padding:0;border-radius:10px 0 0 10px;display:none;align-items:center;justify-content:center;cursor:pointer;box-shadow:-4px 0 16px rgba(0,0,0,0.12);transition:right 0.38s cubic-bezier(0.25,1,0.5,1),background .2s,color .2s;transform:translateY(-50%);}'
        +'body.lsr-avail #lsr-toggle{display:flex;}'
        +'body.lsr-open #lsr-toggle{right:var(--lsr-w);}'
        +'#lsr-toggle:hover{background:var(--card-bg);color:var(--primary-color);}'
        +'#lsr-toggle .chev{width:7px;height:7px;border-left:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg);transition:transform 0.38s cubic-bezier(0.25,1,0.5,1);}'
        +'body.lsr-open #lsr-toggle .chev{transform:rotate(-135deg);}'
        +'@media(max-width:768px){ #layer-sidebar-r{display:none;} #lsr-toggle{display:none !important;} }';
      document.head.appendChild(st); }
    /* ⚠⚠⚠ (#R251) THE PANEL FOLLOWS THE LANGUAGE. `build()` runs once and `sb.innerHTML` carries the
       panel title, the close button's tooltip and the search placeholder, so a reader who switched
       language kept the one the sidebar was BUILT in — 「Close」 and 「Search layers…」 stayed English
       in French. The app dispatches `intmap-lang` for exactly this; the head is relabelled in place
       rather than rebuilt, so the body's rows, its scroll position and the resize handle survive. */
    function relabelHead(){ try{ if(!built||!sb) return;
      const h=sb.querySelector('.lsr-head b'); if(h) h.textContent='▤ '+T('Layers','レイヤー','Ebenen','Слои','Capas');
      const x=sb.querySelector('.lsr-x'); if(x) x.title=T('Close','閉じる','Schließen','Закрыть','Cerrar');
      const q=sb.querySelector('#lsr-q'); if(q) q.placeholder=T('Search layers…','レイヤーを検索…','Ebenen suchen…','Поиск слоёв…','Buscar capas…');
    }catch(_){} }
    window.addEventListener('intmap-lang',()=>setTimeout(relabelHead,30));
    function build(){ if(built) return; built=true; css();
      sb=document.createElement('div'); sb.id='layer-sidebar-r';
      sb.innerHTML='<div class="lsr-head"><b>▤ '+T('Layers','レイヤー','Ebenen','Слои','Capas')+'</b><button class="lsr-x" title="'+T('Close','閉じる','Schließen','Закрыть','Cerrar')+'">×</button></div>'
        +'<div class="lsr-search"><input id="lsr-q" type="text" placeholder="'+T('Search layers…','レイヤーを検索…','Ebenen suchen…','Поиск слоёв…','Buscar capas…')+'"></div>'
        +'<div class="lsr-body"></div>';
      /* (#R64) live INSIDE the app shell flex row (last child) so opening pushes the map like the left sidebar */
      (document.querySelector('.operation-room')||document.body).appendChild(sb);
      /* (#R154) drag-to-resize handle on the LEFT edge (the right sidebar grows as the cursor moves left).
         Persists to intmap_lsr_w; open() honours the saved width instead of the auto-formula. Desktop only. */
      (function(){ const rh=document.createElement('div'); rh.className='lsr-resizer';
        /* ⚠ (#R251) THIS TITLE WAS A BARE ENGLISH LITERAL — `rh.title='Drag to resize'` — so it read
           the same in all nine languages. Found by tests/r251.spec.js, which reads `title` as well as
           text. ⚠ AND IT HAS TO FOLLOW THE LANGUAGE: the handle is appended BESIDE `sb.innerHTML`, so
           the rebuild that relabels the panel head leaves it untouched and it would otherwise keep
           the language the reader started in. */
        const _rt=()=>{ rh.title=T('Drag to resize','高さを調節','Zum Ändern der Höhe ziehen','Потяните, чтобы изменить размер','Arrastra para redimensionar'); };
        _rt(); window.addEventListener('intmap-lang',()=>setTimeout(_rt,30));
        sb.appendChild(rh);
        let rdrag=false, rsx=0, rsw=0;
        rh.addEventListener('pointerdown',e=>{ if(isMob()) return; rdrag=true; rsx=e.clientX; rsw=sb.offsetWidth; try{ rh.setPointerCapture(e.pointerId); }catch(_){} document.body.style.userSelect='none'; sb.style.transition='none'; e.preventDefault(); e.stopPropagation(); });
        rh.addEventListener('pointermove',e=>{ if(!rdrag) return; const ls=document.getElementById('sidebar'); const lw=(ls&&!ls.classList.contains('collapsed'))?ls.getBoundingClientRect().width:0;
          let w=rsw-(e.clientX-rsx); w=Math.max(260,Math.min(Math.max(300,window.innerWidth-lw-320),w));   /* keep ≥320px of map, ≥260px panel */
          document.documentElement.style.setProperty('--lsr-w', w+'px');   /* (#R160) overlay: only the panel width changes; the map stays full-width behind it (no margin push, no resize) */
          try{ window.dispatchEvent(new Event('intmap-sidebar-resize')); }catch(_){} });
        const end=e=>{ if(!rdrag) return; rdrag=false; try{ rh.releasePointerCapture(e.pointerId); }catch(_){} document.body.style.userSelect=''; sb.style.transition='';
          try{ localStorage.setItem('intmap_lsr_w', String(sb.offsetWidth)); }catch(_){} try{ if(GE().hasRenderer()&&GE().hasRenderer()) GE().render.resize(); }catch(_){} };
        rh.addEventListener('pointerup',end); rh.addEventListener('pointercancel',end);
      })();
      sb.querySelector('.lsr-x').onclick=close;
      _hosts.push(sb);   /* (#R232) the sidebar is simply the FIRST host */
      sb.querySelector('#lsr-q').addEventListener('input',(ev)=>{ filterTiles(sb);   /* ⚠ (#R232) not `filterTiles` bare — it takes a host now, and an Event is not one */
        try{ window.IntMapSearchToTop(ev.target.closest('.lsr-search')||ev.target); }catch(_){} });
      wireSearchClear(sb);   /* (#R255) the × that empties it */
      sb.addEventListener('click',e=>e.stopPropagation());
      /* keep every tile's ✓ in sync with its real checkbox, whoever toggles it (classic panel, Atlas, legends) */
      document.addEventListener('change',e=>{ try{ const t2=e.target; if(!t2||t2.type!=='checkbox') return; if(!t2.closest||!t2.closest('#layer-dropdown')) return;
        const id=t2.id||t2.getAttribute('data-layer'); if(!id) return;
        const sel='.lst-tile[data-lid="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]';
        _liveHosts().forEach(h=>{ const tile=h.querySelector(sel); if(tile) tile.classList.toggle('on',t2.checked); }); }catch(_){} });   /* (#R232) every mounted grid, not only the sidebar */
      /* (#R63) left-style edge toggle button (open AND close, like the left sidebar's chevron) */
      const tg=document.createElement('button'); tg.id='lsr-toggle'; titleKey(tg,'ttlLayersPanel'); tg.innerHTML='<span class="chev"></span>';
      tg.addEventListener('click',e=>{ e.stopPropagation(); toggle(); });
      document.body.appendChild(tg); }
    _wireFrontMost();
    /* ---- (#R70) tile-grid builder: the classic dropdown is the data source, never the UI ---- */
    function rowsFromDropdown(){ const dd=document.getElementById('layer-dropdown'); const out=[]; if(!dd) return out;
      let sec='', secBeta=false;   /* (#R101) track the beta section by data-i18n, not translated text */
      const skipIn=el=>el.closest&&(el.closest('#layer-active-section')||el.closest('#layer-fav-section')||el.closest('#layer-search-wrap')||el.closest('#layer-tools'));
      const walk=(el)=>{ for(const ch of el.children){ if(skipIn(ch)) continue;
        if(ch.classList&&(ch.classList.contains('lyr-head')||ch.classList.contains('lyr-section-label'))){ const t2=(ch.textContent||'').replace(/\s+/g,' ').trim(); if(t2){ sec=t2; secBeta=(ch.getAttribute&&ch.getAttribute('data-i18n')==='lyrGrpOthers'); } continue; }
        if(ch.matches&&ch.matches('label')){ const cb=ch.querySelector('input[type=checkbox]');
          if(cb){ const sp=ch.querySelector('span:not(.lyr-sw):not(.lfc-sw):not(.lsr-thumb)');
            const name=((sp?sp.textContent:ch.textContent)||'').replace(/★/g,'').replace(/\s+/g,' ').trim();
            const id=cb.id||cb.getAttribute('data-layer')||'';
            if(name&&id) out.push({cb,id,name,sec,secBeta,gk:cb.getAttribute('data-layer')||''}); }
          continue; }
        if(ch.children&&ch.children.length) walk(ch); } };
      walk(dd); return out; }
    /* (#R309) `asRow` — the "Base map & labels" shape: a full-width switch row with no thumbnail.
       Same element, same dataset, same click path; only the children and the class differ. */
    function tileFor(r,asRow){ const d=document.createElement('div'); d.className='lst-tile'+(asRow?' lst-row':'')+(r.cb.checked?' on':''); d.dataset.lid=r.id; d.dataset.nm=r.name.toLowerCase();
      const nm=document.createElement('div'); nm.className='lst-nm'; nm.textContent=r.name; nm.title=r.name;
      if(asRow){ d.setAttribute('role','switch'); d.setAttribute('aria-checked',r.cb.checked?'true':'false'); d.appendChild(nm); }
      else{
        const pv=document.createElement('div'); pv.className='lst-prev'; if(r.gk) pv.dataset.gk=r.gk;
        try{ window.IntMapLayerPreviews&&window.IntMapLayerPreviews.into(pv,r.id,r.name); }catch(_){}
        /* (#R114) no ✓ badge on the ON-layer highlight (requested): the `.on` accent border already marks an
           enabled layer, and a bare ✓ is exactly what the standing UI rule tells us to drop. */
        d.appendChild(pv); d.appendChild(nm);
      }
      /* ★ favorite — the SAME store as the classic panel (imLayerFavs), mirrored both ways */
      try{ if(typeof layerCbInfo==='function'&&Array.isArray(window.imLayerFavs)){ const info=layerCbInfo(r.cb);
        if(info){ const st=document.createElement('button'); st.className='lst-star'+(window.imLayerFavs.includes(info.key)?' on':''); st.type='button'; st.textContent='★'; titleKey(st,'ttlFavorite');
          st.onclick=(e)=>{ e.preventDefault(); e.stopPropagation();
            const i=window.imLayerFavs.indexOf(info.key); if(i>=0) window.imLayerFavs.splice(i,1); else window.imLayerFavs.push(info.key);
            st.classList.toggle('on');
            try{ saveSettings(); }catch(_){} try{ renderLayerFavs(); }catch(_){}
            try{ const cls=document.querySelector('#layer-dropdown .lyr-star[data-key="'+info.key+'"]'); if(cls) cls.classList.toggle('on',st.classList.contains('on')); }catch(_){} };
          d.appendChild(st); } } }catch(_){}
      if(asRow){ const sw=document.createElement('span'); sw.className='lst-sw'; sw.appendChild(document.createElement('i')); d.appendChild(sw); }
      /* (#R72) toggle the LIVE checkbox, not a possibly-stale captured node ("押しても反応しないレイヤーがある" /
         "レイヤーのオンオフが地図上と一致していない"): reorganizeLayerPanel / language switches can rebuild the
         classic dropdown, detaching the element this tile captured — clicking it then toggled a dead node and
         nothing happened on the map. Resolve by id at CLICK TIME, and re-read the final state a tick later so
         rows whose handlers reject the toggle (login-gated etc.) can't leave the tile out of sync. */
      d.addEventListener('click',()=>{ try{
        let cb=r.cb;
        if(!cb||!cb.isConnected){ cb=(r.id&&document.getElementById(r.id))||null;
          if(!cb){ const dd2=document.getElementById('layer-dropdown'); if(dd2&&r.gk) cb=dd2.querySelector('input[type=checkbox][data-layer="'+(window.CSS&&CSS.escape?CSS.escape(r.gk):r.gk)+'"]'); }
          if(cb) r.cb=cb; }
        if(!cb) return;
        cb.checked=!cb.checked; cb.dispatchEvent(new Event('change',{bubbles:true}));
        d.classList.toggle('on',cb.checked);
        if(asRow) d.setAttribute('aria-checked',cb.checked?'true':'false');   /* (#R309) role=switch has to say so */
        setTimeout(()=>{ try{ d.classList.toggle('on',cb.checked); if(asRow) d.setAttribute('aria-checked',cb.checked?'true':'false'); }catch(_){} },320);
      }catch(_){} });
      return d; }
    /* (#R72) collapse state per section title — default OPEN, Others (beta) starts CLOSED ("デフォルト状態では
       すべてのレイヤーが見える状態にし、折りたたまないように。ただし、Others(beta)は折りたたんでおくこと") */
    const _secClosed={};
    /* (#R101) match the beta group across ALL languages (was English-only, so JP/DE/RU/ES showed it EXPANDED) */
    const _isBeta=(t2)=>/others?\s*\(?\s*beta|ベータ|бета/i.test(String(t2||''));
    /* ══ (#R232) THE TILE GRID IS NO LONGER WELDED TO THE DESKTOP SIDEBAR ═════════════════════════
       「モバイル版のレイヤー選択欄についても、タイル形式のものに。」 Everything below already builds a
       tile browser; it just built it into ONE element — the module-level `sb` (#layer-sidebar-r), which
       the stylesheet at the end of css() hides outright below 768 px. The phone therefore kept the
       classic checkbox list that #R70 replaced on the desktop three dozen rounds ago.
       ⚠ THE FIX IS A HOST PARAMETER, NOT A SECOND IMPLEMENTATION. `_hosts` is every element currently
       showing a grid (the sidebar, and the mobile sheet's mount); build/sync/filter take the one they
       are working on, and the live-sync listener walks them all. There is still ONE tile builder, ONE
       data source (#layer-dropdown, untouched) and ONE click path, so the phone cannot drift from the
       desktop the way a copied panel would. */
    const _hosts=[];
    const _liveHosts=()=>_hosts.filter(h=>h&&h.isConnected);
    /* ══ ⚠⚠⚠ (#R408 追記) THE QUESTION IS «IS THE SHEET SHOWN», NOT «IS THIS BOX IN THE VIEWPORT» ══
       Two wrong answers were tried before this one, and the second was MEASURED to break the feature:
         · `display`-style tests (`offsetParent`, `getClientRects().length`, `checkVisibility()`) all
           say VISIBLE for a shut sheet, because the phone's sheet is not hidden when it is shut — it
           is parked below the fold (MEASURED on production: top 879 px of an 812 px viewport).
         · intersecting the VIEWPORT says NO for a sheet the reader has just opened: the tile grid is
           a long list inside a scrollable sheet, and at the `peek`/`half` detent its top sits below
           the fold (MEASURED here: sheet `m-sheet show`, host top 1026 px of 812). That answer would
           have shut the gate for good and left a phone with no thumbnails at all — the exact
           regression #R72→#R73 produced, and the one js/layer-previews.js's note is about.
       What actually separates the two `mountInto` callers is whether the SHEET carrying the grid is
       shown. js/mobile-ui.js `openSheet()` adds `.show` before it mounts; `applyLayout()` at boot
       mounts with no sheet shown at all. A host that is not inside a sheet (the desktop sidebar) is
       not this question's business and answers TRUE.
       ⚠ AND IT FAILS OPEN, on every path it cannot read: a preview that never appears is a worse
       defect than one that appears early. */
    function _hostShown(el){ try{
      if(!el||!el.isConnected) return false;
      const sheet=el.closest&&el.closest('.m-sheet');
      if(!sheet) return true;                       /* desktop sidebar / anything not in a sheet */
      return sheet.classList.contains('show');
    }catch(_){ return true; } }
    function buildTiles(host){ host=host||sb; if(!host) return; const bodyEl=host.querySelector('.lsr-body'); if(!bodyEl) return;
      const rows=rowsFromDropdown(); if(!rows.length) return;
      const root=document.createElement('div'); root.className='lst-root';
      const basics=T('Base map & labels','基本表示','Grundkarte & Labels','Основа и подписи','Base y etiquetas');
      let curSec=null,curGrid=null,curRow=false;
      rows.forEach(r=>{ const secName=r.sec||basics;
        if(secName!==curSec){ curSec=secName;
          /* (#R101) default the beta section CLOSED, detected by the header's data-i18n (robust across languages) */
          /* (#R108) "Base map & labels" also defaults CLOSED per request (kept openable + remembered per session).
             ⚠ (#R210) REVERSED, by a later instruction: 「レイヤー欄の基本表示は、デフォルトでは今まで
             折りたたまれていましたが、今後はデフォルトでは開いた状態に。」 Only `basics` changes — the
             beta group still starts closed (#R72/#R101), and both are still remembered per session. */
          if(!(secName in _secClosed)) _secClosed[secName]=(!!r.secBeta || _isBeta(secName));
          const closed=!!_secClosed[secName];
          const h=document.createElement('div'); h.className='lst-sech'+(closed?' closed':''); h.setAttribute('role','button'); h.setAttribute('aria-expanded',closed?'false':'true');
          const ch=document.createElement('span'); ch.className='lst-chev'; h.appendChild(ch);
          const tt=document.createElement('span'); tt.textContent=secName; h.appendChild(tt);
          root.appendChild(h);
          /* (#R309) the basics are the one section drawn as rows — see the CSS note on `.lst-row`.
             It is identified the same way the section itself is: `rowsFromDropdown` gives every row
             before the first `.lyr-head` an empty `sec`, and `basics` is the name those get. */
          curRow=(secName===basics);
          curGrid=document.createElement('div'); curGrid.className='lst-grid'+(curRow?' lst-rows':'')+(closed?' closed':''); root.appendChild(curGrid);
          h.addEventListener('click',()=>{ const now=!h.classList.contains('closed');
            h.classList.toggle('closed',now); h.setAttribute('aria-expanded',now?'false':'true');
            const g2=h.nextElementSibling; if(g2&&g2.classList.contains('lst-grid')) g2.classList.toggle('closed',now);
            _secClosed[secName]=now; }); }
        curGrid.appendChild(tileFor(r,curRow)); });
      root.querySelectorAll('.lst-grid').forEach(g=>{ const h=g.previousElementSibling; if(h&&h.classList.contains('lst-sech')){ const c=document.createElement('span'); c.className='lst-cnt'; c.textContent=g.children.length; h.appendChild(c); } });
      root.appendChild(toolsBlock());   /* (#R243) 「地震シミュレータはレイヤー欄からも」 — see the CSS note */
      /* ⚠ (#R232) `#lst-root` was an ID and there can now be two of them on the page at once, so the
         root is found by CLASS within its own host. The id is kept on the sidebar's copy because
         tests and older selectors name it. */
      const old=host.querySelector('.lst-root'); if(old) old.replaceWith(root); else bodyEl.appendChild(root);
      if(host===sb) root.id='lst-root';
      filterTiles(host); }
    /* ══ (#R243) THE TOOLS BLOCK AT THE FOOT OF THE TILE BROWSER ═════════════════════════════════
       One entry today — the seismic-wave simulator — declared as data so a second one is a row in
       this array and nothing else. The glyph is inline SVG rather than an emoji (standing rule: no
       decorative emoji), and the press goes through `IntMapOS` so the palette, the map's right-click
       menu, the classic dropdown's button and this row are ONE path.
       ══ (#R258) …AND THE OTHER SIMULATIONS ARE ROWS IN IT ══════════════════════════════════════════
       「シミュレーション系のもので、レイヤーではないものは、地震波シミュレーターのようにツール欄に追加
         して。」 Everything below already existed and was reachable ONLY from the map's right-click
       menu — i.e. you had to know to right-click the ground to discover that this app can route
       water, propagate a tsunami or measure a radar shadow. They are not layers (nothing to switch
       on over the map; each opens a panel and owns the pointer), so the tools list is where they
       belong, exactly as #R243 put the earthquake simulator there.
       ⚠ EACH IS AN `IntMapOS` ACTION, REGISTERED HERE. #R242's rule is that a feature has one door
       and every UI presses the same one; the registration lives beside the row that needs it because
       js/app-body.js is at the tests/r200 ⑤ line ceiling (4,400) with 22 lines of headroom, and the
       standing lesson from #R253 ⑥ / #R254 ⑨ is that a dependency goes to the CONSUMER.
       ⚠ A TOOL OPENED FROM A LIST HAS NO POINT UNDER THE CURSOR. The right-click menu hands each of
       these the coordinate it was opened on; from here there is none, so (#R298) a row that CANNOT
       OPEN without one ASKS — `_askPoint` below, three of them (#R299). Until then the camera's own
       centre was passed as though it had been chosen, which is the report this round answers. */
    const _svg=(d)=>'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>';
    const SVG_QUAKE=_svg('<path d="M2 13h3.2l2.1-6.4 3 12.2 2.6-9.1 1.9 3.3H22"/>');
    /* ⚠ (#R296) SVG_WAVE / SVG_FLOOD / SVG_TRANSIT / SVG_RF / SVG_REPLAY stood here — the five icons of the rows removed below. An icon nothing draws is dead weight in the shell budget. */
    const SVG_TERR=_svg('<path d="M2 19l6-9 4 5.5 3-4L22 19z"/><path d="M2 19h20"/>');
    const SVG_LOS=_svg('<path d="M3 20V9"/><path d="M3 9l16 5"/><circle cx="20" cy="14.5" r="1.8"/><path d="M3 5v2"/>');
    const SVG_REACH=_svg('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/>');
    const SVG_SUN=_svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>');
    const SVG_STAR=_svg('<path d="M12 3l1.9 4.6 5 .4-3.8 3.3 1.2 4.9L12 13.6 7.7 16.2l1.2-4.9L5.1 8l5-.4z"/>');
    const SVG_PLUME=_svg('<path d="M4 20c0-5 3-6 3-9a3 3 0 016 0c0 4 4 3 4 7"/><path d="M3 20h18"/>');
    /* (#R261) the five below — see the ⚠⚠⚠ note on SIM_TOOLS */
    const SVG_DRONE=_svg('<circle cx="12" cy="12" r="2.4"/><path d="M10 10L6.5 6.5M14 10l3.5-3.5M10 14l-3.5 3.5M14 14l3.5 3.5"/><circle cx="5" cy="5" r="2.1"/><circle cx="19" cy="5" r="2.1"/><circle cx="5" cy="19" r="2.1"/><circle cx="19" cy="19" r="2.1"/>');
    /* (#R291) a signpost: the fork this app has been unable to show anybody for seven rounds */
    const SVG_DIRECTIONS=_svg('<path d="M12 21.5v-6.2"/><path d="M12 15.3L6.6 9.9V5.4"/><path d="M12 15.3l5.4-5.4V5.4"/><circle cx="6.6" cy="4" r="1.6"/><circle cx="17.4" cy="4" r="1.6"/>');
    /* ══ ⚠⚠⚠ (#R298) A TOOL THAT NEEDS A POINT ASKS FOR THE POINT ═════════════════════════════════
       「地点を選ばないといけない系のツール、押したら勝手に地図中心を選択しているものとして結果を出すのを
         辞めろ。」 Five rows below handed the CAMERA's centre to a tool as though the reader had chosen
       it: pressing 「ここからの星空」 produced a sky, a horizon and a set of rise times
       for a coordinate nobody named, and because the answer looks exactly like an answer there is
       nothing about it to notice. The comment two blocks up said so in as many words («from here the
       subject is «where I am looking»»), which is a decision the reader never made.

       ⚠⚠ #R298 ALSO WROTE 「a point the reader has already chosen is not asked for twice — a pin they
       dropped, or the point they picked for the previous tool — but only while it is on screen」, AND
       #R307 REMOVED THAT: it is the 「そのあとのやつも全部その地点で強制開始」 the reader named. See the
       note beside `_askPoint` below; there is no remembered point and no pin fallback in this file.
       ══ ⚠⚠⚠ (#R299) …AND THE ROWS THAT DO NOT NEED ONE ARE NOT ASKED AT ALL ════════════════════════
       「いやあたらしいピルUI勝手に作るな。既存のやつを、いきなり勝手に地図中心を選択しているという前提で
         勝手に計算して結果を表示するのを辞めろってこと。まずは地点を選ばせろってこと。最初に地点選ぶ必要
         のないものまで全部最初に選ばせようとするな。」 Two separate corrections, and #R298 got both wrong
       in the same direction — it made the centre reachable again by GROWING the shared bar.
         ① The extra pill 「地図の中心を使う」 (`.im-pick-alt`, built into #R196's bar from here) is gone.
            It is the 「あたらしいピルUI」 the reader means, and `_hereLL()` went with it: no row in this
            file names the camera's centre any more, so there is no door left for it to come back
            through. #R196's bar itself — crosshair, one line of instruction, × and Esc — is untouched.
         ② `_askPoint` is on the rows that cannot answer without a point: `sim.los` (js/viewshed.js
            `open()` dereferences `lngLat.lng`), `sim.nightSky` (an invalid ll returns false) and
            `sim.reach` (its panel had no way to name a point at all until the ◎ button #R299 adds to
            it). `sim.terrainWater` opens on the CURRENT VIEW RECTANGLE when given nothing
            (js/terrain-water.js `build()`), so it is not asked — 「最初に地点選ぶ必要のないものまで全部
            最初に選ばせようとするな」 is the other half of the same sentence.
       ⚠ AND `sim.sun` NO LONGER RUNS THE ANNUAL ANALYSIS ON OPENING. `analysePoint(centre)` printed a
       year's sunlight hours for a coordinate nobody had chosen, which is the second half of the
       sentence above; the ◎ 「地点の日照時間」 button and Atlas's `sunHours` still run it, for a point
       somebody named. Nothing is removed — the automatic guess is.
       ══ ⚠⚠⚠ (#R302) …AND `sim.sun` IS ASKED TOO, BECAUSE NAMING THE GUESS IS STILL GUESSING ═══════
       The sentence came a third time. #R299's exemption for this row rested on the panel WRITING
       「観測地点は地図の中心」 above its numbers — but the numbers were still computed, still printed and
       still drawn on the map for a coordinate nobody chose. It is a fourth `_askPoint` row now, and
       js/sims.js treats 「no point」 as a real state instead of falling back to the camera. */
    /* ══ ⚠⚠⚠ (#R307) 「一回地点選んだらそのあとのやつも全部その地点で強制開始とかあほか。」 ═══════
       #R298 wrote 「A POINT THE READER HAS ALREADY CHOSEN IS NOT ASKED FOR TWICE — a pin they dropped,
       or the point they picked for the previous tool — but only while it is ON SCREEN」, and that
       second half is what the reader has now rejected. `_picked` was remembered for the session, so
       the FIRST tool asked and every tool after it opened silently on that coordinate: 「ここからの
       星空」 answered for wherever the reachable-area origin happened to be, and nothing on screen
       said which point it had used. A point chosen for one question is not the answer to the next
       one, and 「まずは地点を選ばせろ」 has now been said four times.
       → A ROW IN THIS LIST ALWAYS ASKS. There is no remembered point and no pin fallback left here,
         so there is no door for a coordinate nobody chose FOR THIS TOOL to come back through.
       ⚠ NOTHING IS REMOVED FROM THE TOOLS THEMSELVES. Every one of them still opens on a named point
         from the doors that HAVE one — the map's right-click item (the coordinate it was opened on),
         Atlas, and each panel's own ◎ 「地点を変える…」 button. What is gone is the guess.
       ⚠ AND THE ROWS THAT DO NOT NEED A POINT ARE STILL NOT ASKED (#R299): `sim.terrainWater` opens
         on the current view rectangle, and the four rows below are the only callers of this. */
    function _askPoint(run,id){
      const fire=(ll)=>{
        try{ return Promise.resolve(run({ lng:+ll.lng, lat:+ll.lat })); }catch(_){ return Promise.resolve(false); } };
      const P=window.IntMapPick;
      const name=(()=>{ try{ const t=TOOLS.find(x=>x.id===id); return t?t.label():''; }catch(_){ return ''; } })();
      return new Promise(resolve=>{
        let done=false, watch=0;
        const tidy=()=>{ if(watch){ stopTick(watch); watch=0; } };
        /* (#R299) a cancelled pick opens NOTHING — not the tool at the centre, not the tool empty */
        const end=(ll)=>{ if(done) return; done=true; tidy();
          if(!ll){ resolve(false); return; }
          Promise.resolve(fire(ll)).then(resolve,()=>resolve(false)); };
        /* ⚠ (#R302) THE APP'S OWN RED MESSAGE SAYS IT, NOT A NEW PIECE OF CHROME ═══════════════════
           「普通の既存の赤メッセージ使ってください。…まずは地点を選ばせろってこと。」 #R298 answered the same
           sentence by inventing a pill on the shared bar and #R299 took it away again, which left the bar
           arming SILENTLY: the map waits for a tap and nothing in the reader's own language says so.
           `imToast` is the app's existing toast — `.sat-toast` on --info-mil (#ff3b30), the same red
           js/community.js's 「まず初めに場所を選ばせろ」 uses — and the sentence it carries is the SAME one
           the bar's hint carries, so the two cannot drift apart in nine languages. No new element, no
           new class, no new string.
           ══ ⚠⚠⚠ (#R305) …AND IT SAYS IT **INSTEAD OF**, NOT AS WELL AS ═══════════════════════════
           「いや並行してどちらも出てくるとかあほか。」 #R302 added the toast and left #R298's bar armed, so
           one press of one row put the same sentence on the screen twice, in two different shapes, at
           the same moment. The reader asked for the red message; the pill is the thing they asked
           twice not to have. `announce:false` arms the same gesture — crosshair, Esc, one-shot click,
           `abort()` — with the banner off (js/map-pick.js), so exactly one thing speaks. */
        const ask=(name?(name+' — '):'')+T('Tap the map to choose a point','地図をタップして地点を選んでください','Zum Wählen eines Punktes auf die Karte tippen','Нажмите на карту, чтобы выбрать точку','Toca el mapa para elegir un punto');
        let armed=false;
        try{ armed=!!(P&&P.start&&P.start({ onPick:(ll)=>end(ll), onCancel:()=>end(null), hint:ask, announce:false })); }catch(_){ armed=false; }
        /* a tool that cannot ask says why, rather than quietly answering for the centre instead */
        if(!armed){ try{ HOST.satToast(T('The map is not ready to choose a point yet','地図がまだ地点を選べる状態ではありません','Die Karte ist noch nicht bereit, einen Punkt zu wählen','Карта ещё не готова к выбору точки','El mapa aún no está listo para elegir un punto')); }catch(_){}
          end(null); return; }
        try{ (HOST.imToast||HOST.satToast)(ask); }catch(_){}   /* (#R302) armed → the red toast that says so */
        /* the bar can also be torn down by `abort()` — a panel closing, the engine swapping — and that
           path notifies nobody, so a gesture that stopped existing is noticed by watching it. */
        /* ⚠ the key carries the serial: two rows asked one after the other are two live watches, and a
           shared key would REPLACE the first — leaving its promise waiting for ever. */
        watch=everyTick(tickKey('map-ui:ask-point'),400,()=>{ try{ if(!P.active()) end(null); }catch(_){ end(null); } });
      });
    }
    const _lazy=(name,fn)=>(a)=>window.IntMapLazy.need(name).then(()=>{ try{ return !!fn(a); }catch(_){ return false; } });
    const SIM_TOOLS=[
      /* ══ ⚠⚠⚠ (#R291) THE ROUTING ENTRY, AND WHY IT IS THE FIRST ROW ═════════════════════════════
         「経路機能の正式な入口は、必ず Layers → Tools → Directions / 経路 に置いてください。」
         MEASURED before writing this: js/routing.js exported `openPanel` and NOTHING in the program
         called it — not this list, not the right-click menu, not IntMapOS, not index.html. A rich
         directions panel with via points, avoid options, drawn keep-out areas and six analyses had
         been unreachable since #R84; typing a sentence at Atlas was the only way into routing at
         all. That is the same shape as #R261's five simulators with no door, one notch worse,
         because this one is the everyday feature rather than a specialist one — which is also why
         it sits ABOVE the simulators rather than at the end of them.
         ⚠ (#R299 追記) THIS PARAGRAPH DESCRIBED #R291's RULE, WHICH #R296 INVERTED FOUR ROUNDS AGO.
         It said 「a second press closes the panel and the route stays drawn (§2.2); only 『経路を消去』
         throws it away」. MEASURED on production R299: a second press leaves `hasRoute()` false and
         every `imroute-*` layer at 0 features — because 「経路機能を閉じても地図に経路が残り続ける
         のをやめろ」 made CLOSING mean CLEARING, and this row closes through the same `close()` as
         the × does. The behaviour is the instruction; the sentence was the stale copy, in the third
         of three files that stated the same fact.
         ⚠ `isOpen` / `close` are still THE PANEL's — the row asks them to decide whether a press
         opens or closes. What follows from closing belongs to js/routing-ui.js `close()`.
         `dot` reads the store, so it goes out with the route rather than lying about one that is
         no longer drawn.
         ⚠ NO NEW FLOATING BUTTON ANYWHERE — 「地図上へ新しい常設フローティングボタンを追加しない」. */
      { id:'tool.directions', mod:'IntMapRouteUI', ic:SVG_DIRECTIONS, en:'Directions', group:'tool',
        keys:'route directions navigation journey trip 経路 ルート 道順 経路案内 ナビ Route Wegbeschreibung маршрут путь ruta indicaciones',
        run:_lazy('routeUi',()=>window.IntMapRouteUI&&window.IntMapRouteUI.open()),
        dot:()=>{ try{ return !!(window.IntMapRouteStore&&window.IntMapRouteStore.hasRoute()); }catch(_){ return false; } },
        label:()=>T('Directions','経路','Route','Маршрут','Cómo llegar'),
        hint:()=>T('Plan routes by car, transit, walking or cycling','車・公共交通・徒歩・自転車の経路を検索','Routen mit Auto, ÖPNV, zu Fuß oder Rad planen','Маршруты на авто, транспорте, пешком или на велосипеде','Rutas en coche, transporte, a pie o en bici') },
      { id:'sim.seismic', mod:'IntMapSeismic', ic:SVG_QUAKE, run:null,   /* registered in js/app-body.js beside the OS kernel */
        label:()=>T('Earthquake simulator','地震シミュレーター','Erdbeben-Simulator','Симулятор землетрясений','Simulador de terremotos'),
        hint:()=>T('Place a source and watch the shaking spread','震源を置いて揺れの広がりを見る','Herd setzen und die Erschütterung verfolgen','Задайте очаг и смотрите, как расходятся колебания','Coloque una fuente y vea propagarse el temblor') },
      /* ══ ⚠ (#R296) NO ROW FOR THE TSUNAMI — 「津波シミュレータはボタンを設置しないように。（地震シミュ
         レータありきの機能なため、直接アクセスUIは不要。）」 ═════════════════════════════════════════════
         `IntMapTsunami` (js/tsunami.js) is NOT removed and nothing about it changes: it is the shallow-
         water propagation model the earthquake simulator opens once a source has a magnitude and a
         depth, which is the only state in which it has anything to solve. A row here offered it from a
         standing start, where the reader would have had to invent a rupture for it — the same
         「invented data」 the standing rules forbid. Atlas still reaches it, and so does #R261's share
         link; what is gone is the button that starts with nothing. */
      { id:'sim.terrainWater', mod:'IntMapTerrainWater', ic:SVG_TERR, en:'Terrain & water simulator',
        /* (#R299) NO POINT IS ASKED FOR — with none, `open()` builds on the rectangle now in view */
        run:_lazy('terrainWater',()=>window.IntMapTerrainWater&&window.IntMapTerrainWater.open()),
        label:()=>T('Terrain & water simulator','地形編集・水流シミュレーター','Gelände- & Wasser-Simulator','Симулятор рельефа и водотока','Simulador de terreno y agua'),
        hint:()=>T('Sculpt the ground, pour water, build a levee','地形を盛る・削る、水を流す、堤防を引く','Gelände formen, Wasser gießen, Deich ziehen','Лепите рельеф, лейте воду, стройте дамбу','Modele el terreno, vierta agua, trace un dique') },
      /* ⚠⚠ (#R264) THIS ROW HAS NEVER OPENED ANYTHING, AND THAT IS NOT THIS ROUND'S FIX. MEASURED on
         the shipped build: `IntMapRadiation` (js/sims.js) exposes `run / clear / ISOTOPES / SOURCES /
         ZONES / resolveSite` and has NO `openPanel` — `typeof` it is `undefined`, the call throws,
         the catch returns false, and `IntMapOS.exec('sim.radiation')` measured **false**. Unlike the
         other twelve this simulator has no panel AT ALL; Atlas's `run(site, opts)` is its only door,
         and picking an isotope and a release rate on the reader's behalf is exactly the invented
         data the standing rules forbid. Reported rather than papered over. `mod` is still real: the
         row lights when a plume IS on the map and a second press clears it. */
      { id:'sim.radiation', mod:'IntMapRadiation', ic:SVG_PLUME, en:'Radioactive plume simulator',
        run:()=>{ try{ return !!(window.IntMapRadiation&&window.IntMapRadiation.openPanel()); }catch(_){ return false; } },
        label:()=>T('Radioactive plume simulator','放射性プルーム拡散シミュレーター','Simulator radioaktiver Fahnen','Симулятор радиоактивного шлейфа','Simulador de pluma radiactiva'),
        hint:()=>T('Disperse a release on the live wind field','実際の風の場で放出を拡散させる','Freisetzung im realen Windfeld ausbreiten','Выброс в реальном поле ветра','Dispersa una emisión con el viento real') },
      /* ⚠ (#R296) ONE ROW FOR BOTH — 「電波・通信圏と見通し線解析を統合して」. The panel switches between
         「見通し線」 (geometry / radar shadow) and 「電波・通信圏」 (the same viewshed with refraction, a
         frequency and a link-budget range); the `sim.rf` row that stood below is gone with it. */
      { id:'sim.los', mod:'IntMapLOS', ic:SVG_LOS, en:'Radio coverage & line of sight',
        keys:'radio rf coverage signal antenna line of sight viewshed radar shadow 電波 通信圏 アンテナ 見通し線 レーダー Funkabdeckung Sichtlinie радиопокрытие видимость cobertura visión',
        run:()=>_askPoint(_lazy('los',(ll)=>window.IntMapLOS&&window.IntMapLOS.open(ll)),'sim.los'),
        label:()=>T('Radio coverage & line of sight','電波・通信圏／見通し線','Funkabdeckung & Sichtlinie','Радиопокрытие и линия видимости','Cobertura de radio y línea de visión'),
        hint:()=>T('Signal from a transmitter here, and what the terrain hides','ここに置いた送信機の到達範囲と、地形が隠すもの','Reichweite eines Senders hier und was das Gelände verbirgt','Дальность передатчика здесь и что скрывает рельеф','Alcance de un emisor aquí y lo que oculta el terreno') },
      /* ⚠ (#R296) ONE REACHABILITY ROW — 「到達圏と公共交通機関の到達圏に分離するのを辞めろ」. 公共交通 is
         a fourth transport in this panel now (js/map-tools.js), answered by the same rail model that
         used to have a row of its own; the `sim.transitReach` row that stood below is gone with it. */
      { id:'sim.reach', mod:'IntMapIsochrone', ic:SVG_REACH, en:'Reachable area',
        keys:'isochrone reach transit rail 到達圏 公共交通 鉄道 電車 Erreichbarkeit ÖPNV доступность транспорт alcanzable transporte',
        run:()=>_askPoint((ll)=>{ try{ return !!(window.IntMapIsochrone&&window.IntMapIsochrone.open(ll)); }catch(_){ return false; } },'sim.reach'),
        label:()=>T('Reachable area (drive/walk/cycle/transit)','到達圏（車・徒歩・自転車・公共交通）','Erreichbarkeit (Auto/Fuß/Rad/ÖPNV)','Зона доступности (авто/пешком/вело/транспорт)','Área alcanzable (coche/pie/bici/transporte)'),
        hint:()=>T('How far you get in a given time','決めた時間でどこまで行けるか','Wie weit man in einer Zeit kommt','Как далеко можно уехать за время','Hasta dónde se llega en un tiempo') },
      { id:'sim.sun', mod:'IntMapSun', ic:SVG_SUN, en:'Sunlight hours & shade',
        /* ⚠⚠⚠ (#R302) THIS ROW WAS THE ONE THE SENTENCE WAS ABOUT ═══════════════════════════════════
           「いきなり勝手に地図中心を選択しているという前提で勝手に計算して結果を表示するのを辞めろってこと。
             まずは地点を選ばせろってこと。」 #R299 exempted this row on the grounds that the panel NAMES its
           own observer. MEASURED on that build: pressing it printed the sun's altitude, its azimuth,
           sunrise, noon and sunset, and drew the cast shadows, for `GE().camera.getCenter()` — with
           「観測地点は地図の中心」 written above them. Naming the guess is not the same as not guessing, and
           the reader has now said so. It asks first, like the three rows above it. */
        run:()=>_askPoint((ll)=>{ try{ if(!window.IntMapSun) return false; window.IntMapSun.open(ll); return true; }catch(_){ return false; } },'sim.sun'),
        label:()=>T('Sunlight hours & shade','日照時間・影の解析','Sonnenstunden & Schatten','Часы солнца и тени','Horas de sol y sombra'),
        hint:()=>T('Where the sun reaches, hour by hour','時間ごとに日が当たる場所','Wo die Sonne stündlich hinkommt','Куда солнце попадает по часам','Dónde llega el sol, hora a hora') },
      { id:'sim.nightSky', mod:'IntMapNightSky', ic:SVG_STAR, en:'Night sky from here',
        run:()=>_askPoint(_lazy('nightSky',(ll)=>window.IntMapNightSky&&window.IntMapNightSky.open(ll)),'sim.nightSky'),
        label:()=>T('Night sky from here','ここからの星空','Sternhimmel von hier','Ночное небо отсюда','El cielo nocturno desde aquí'),
        hint:()=>T('The sky a person standing here has','ここに立つ人に見える空','Der Himmel, den man hier hat','Небо, которое видно отсюда','El cielo que se ve desde aquí') },
      /* ══ ⚠⚠⚠ (#R261) FIVE MORE, AND THEY HAD NO UI DOOR AT ALL ═════════════════════════════════════
         「シミュレーション系のもので、レイヤーではないものは、地震波シミュレーターのようにツール欄に
           追加して。（続き）」 — the same sentence as #R258, sent again, and #R258's fix was real but
         one shelf short. It swept the tools reachable from the MAP'S RIGHT-CLICK MENU into this list
         (that was the set it went looking at). MEASURED on the shipped build by asking, for every
         `window.IntMap*` object that has an `open`/`toggle`, which UI presses it:

             IntMapDrone         js/atlas-console.js:2383   — and nothing else
             IntMapDisaster      js/atlas-console.js:2654   — and nothing else
             IntMapTransitReach  js/atlas-console.js:2116   — and nothing else
             IntMapRF            js/atlas-console.js:2522   — and nothing else
             IntMapEarthReplay   js/atlas-console.js:2658   — and nothing else

         Every one of them is a simulation, none of them is a layer, and the ONLY way to run any of
         them was to type a sentence at the AI and hope it picked that intent — no button, no menu
         entry, not even a right-click. A terrain-aware drone flight planner (#R174/#R184) and a
         radio-coverage model have been in this program for seventy rounds behind a door nobody can
         see. They are rows here now, exactly like the other eight.
         ⚠ NOT ADDED, ON PURPOSE: 「⛰ Slope / aspect」 (`IntMapSlope`) is a LAYER — it has its own row
         in the layer list — and the instruction is about the things that are not. */
      { id:'sim.drone', mod:'IntMapDrone', ic:SVG_DRONE, en:'Drone flight planner',
        run:()=>{ try{ return !!(window.IntMapDrone&&window.IntMapDrone.open()); }catch(_){ return false; } },
        label:()=>T('Drone flight planner','ドローン飛行計画','Drohnen-Flugplanung','Планировщик полёта дрона','Planificador de vuelo de dron'),
        hint:()=>T('Battery, clearance and no-fly zones over the real terrain','実地形の上で電池・対地高度・飛行禁止区域を解く','Akku, Bodenabstand und Sperrzonen über echtem Gelände','Батарея, высота над землёй и бесполётные зоны над реальным рельефом','Batería, margen sobre el suelo y zonas prohibidas en terreno real') },
      /* ══ ⚠⚠ (#R296) FOUR ROWS STOOD HERE AND NONE OF THEM DOES ANY MORE ═══════════════════════════
         · `sim.disaster` 「浸水・津波ハザード」 — 「災害シミュレーターは4つのうち、放射性物質拡散シミュ
           レーションを残し全削除」. Its fourth hazard only opened `IntMapRadiation`, which has its own row
           above (and, this round, its own panel), so nothing it could do is unreachable.
         · `sim.transitReach` 「公共交通の到達圏」 — 「到達圏と…分離するのを辞めろ」: the same model, as the
           `transit` transport of the reachable-area row above.
         · `sim.rf` 「電波到達範囲」 — 「電波・通信圏と見通し線解析を統合して」: a mode of the row above.
         · `sim.earthReplay` 「地球リプレイ」 — 「存在意義が不明だから全削除」: Chronos is that clock.
         ⚠ THE MODULES WENT WITH THEM where nothing else uses them (js/sims.js), which is what keeps this
         list from being a menu of names that no longer resolve. `IntMapTransitReach` and `IntMapTsunami`
         are the two that STAY — both are called by something else now. */
    ];
    /* one door per tool — the palette, Atlas and this row all press the same one (#R242).
       ⚠ CALLED FROM `toolsBlock()`, not from the factory body: this module is constructed during
       boot and `window.IntMapOS` is built later in js/app-body.js, so a registration at load time
       would be a silent no-op (#R200 ⑥'s shape, in a different file). The tile browser is assembled
       long after both exist, and `OS.has` keeps it idempotent. */
    /* ══ ⚠⚠⚠ (#R264) A TOOL CARD NOW CARRIES THE TOOL'S STATE ══════════════════════════════════════
       「…選択中はハイライトし…もう一度タイルを押したら選択解除されるように。」 A layer tile can do this
       because it owns a checkbox; a tool card owns nothing — the state lives in the simulator, so
       the card has to ASK it. `mod` on each row above is that module's global name, written ONCE
       per row beside the `run` that opens it, and these two read it:

         · `isOn` — `isOpen()` where the module has one, else `state().open`. Modules whose answer is
           a drawing rather than a panel (the plume, the transit reach) report their own source, so
           the highlight is read off what is on the map and cannot disagree with it.
         · `off`  — the module's `close()`. Five simulators had no way to be shut from outside and
           two could not say whether they were open at all; those are added in their own files this
           round (js/sims.js, js/viewshed.js, js/map-tools.js), reusing the body of the × their
           header already had, so there is one way out rather than two that drift apart.

       ⚠ NOT A SECOND SOURCE OF TRUTH. Nothing is cached here — every read goes to the module, so a
       panel closed by its own ×, by Atlas or by a keyboard shortcut is reflected the moment the row
       is re-synced, and a row can never be lit for a tool that is not running. */
    const _tmod=(t)=>{ try{ return (t&&t.mod)?(window[t.mod]||null):null; }catch(_){ return null; } };
    const _toolOn=(t)=>{ const m=_tmod(t); if(!m) return false;
      try{ if(typeof m.isOpen==='function') return !!m.isOpen(); }catch(_){}
      try{ if(typeof m.state==='function'){ const s=m.state(); return !!(s&&s.open); } }catch(_){}
      return false; };
    const _toolOff=(t)=>{ const m=_tmod(t); if(!m||typeof m.close!=='function') return false;
      try{ return m.close()!==false; }catch(_){ return false; } };
    function registerSimTools(){ try{ const OS=window.IntMapOS; if(!OS||!OS.register) return;
      SIM_TOOLS.forEach(t=>{ if(!t.run) return; try{ if(OS.has&&OS.has(t.id)) return;
        OS.register(t.id,()=>Promise.resolve(t.run()),{label:t.en,group:t.group||'sim'}); }catch(_){} }); }catch(_){} }
    const TOOLS=SIM_TOOLS;
    function toolsBlock(){ registerSimTools();
      const wrap=document.createElement('div'); wrap.className='lst-tools';
      const h=document.createElement('div'); h.className='lst-sech';
      const tt=document.createElement('span'); tt.textContent=T('Tools','ツール','Werkzeuge','Инструменты','Herramientas'); h.appendChild(tt);
      wrap.appendChild(h);
      TOOLS.forEach(t=>{
        const b=document.createElement('button'); b.type='button'; b.className='lst-toolrow'+(_toolOn(t)?' on':''); b.dataset.act=t.id;
        const ic=document.createElement('span'); ic.className='lst-toolic'; ic.innerHTML=t.ic;
        const tx=document.createElement('span'); tx.className='lst-toolt';
        const nm=document.createElement('b'); nm.style.cssText='display:block;font-weight:600;'; nm.textContent=t.label();
        const hn=document.createElement('span'); hn.style.cssText='display:block;font-size:11px;color:var(--text-muted);line-height:1.35;margin-top:1px;'; hn.textContent=t.hint();
        tx.appendChild(nm); tx.appendChild(hn);
        const go=document.createElement('span'); go.className='lst-toolgo'; go.textContent='›';
        /* (#R291) a tool may own something that outlives its panel — a drawn route is the first —
           so a row can carry a quiet mark that says so without claiming the panel is open. */
        if(t.dot){ const d=document.createElement('span'); d.className='lst-tooldot'; d.hidden=!_toolDot(t);
          d.setAttribute('aria-label',T('active','使用中','aktiv','активно','activo')); tx.appendChild(d); }
        /* (#R291) the row is findable by what it IS as well as by its name in this language */
        b.dataset.nm=((t.label()+' '+t.hint()+' '+(t.en||'')+' '+(t.keys||'')).toLowerCase());
        b.appendChild(ic); b.appendChild(tx); b.appendChild(go);
        /* ⚠ (#R264) THE SECOND PRESS CLOSES — and it asks the module, not the class on this button.
           A row rebuilt while its tool is running, or a tool closed by its own × since this row was
           drawn, would both make a cached class lie; `_toolOn` is the live answer either way.
           ⚠ The OPEN still goes through `IntMapOS.exec` — one door, pressed by the palette, the
           right-click menu and this row alike (#R242). Only the CLOSE is direct, because there is no
           OS action for it and inventing thirteen would be a second registry to keep in step. */
        b.addEventListener('click',()=>{
          if(_toolOn(t)){ _toolOff(t); syncTools(); return; }
          /* ⚠⚠ (#R264 追記) THE SYNC WAITS FOR THE OPEN, IT DOES NOT GUESS HOW LONG IT TAKES.
             PRODUCTION VERIFICATION caught this: eight of these thirteen are LAZY CHUNKS, and a
             chunk takes seconds, not the 340 ms a timeout was willing to wait — measured on the
             shipped build, pressing 「地震シミュレーター」 opened the panel (`state().open` true,
             `#sq-panel` display flex) with the row still UNLIT, and it only lit on the next pointer
             release anywhere on the page. `OS.exec` hands back whatever the command returned, which
             for every lazy tool is the promise of its arrival, so that is what the sync hangs off.
             The timeout stays for the commands that return a plain value. */
          let p=null;
          try{ const OS=window.IntMapOS; if(OS&&OS.exec) p=OS.exec(t.id,{source:'ui'}); }catch(_){}
          syncTools(); setTimeout(syncTools,340);
          try{ if(p&&typeof p.then==='function') p.then(syncTools,syncTools); }catch(_){}
          try{ if(isMob()) close(); }catch(_){} });   /* on a phone the panel covers the map the tool needs */
        wrap.appendChild(b);
      });
      return wrap;
    }
    /* ══ (#R264) …AND THE ROWS FOLLOW THE TOOLS, NOT ONLY THE PRESSES ═══════════════════════════════
       A simulator is closed from its own × far more often than from this list, and #R254's lesson is
       that a highlight which only updates on its own button is a highlight that goes stale and lies.
       The cheapest honest signal is that closing anything is a POINTER RELEASE somewhere on the page,
       so the rows re-read the modules just after one — 13 property reads, and only while a tools
       block is actually mounted. No timer, no observer, no second copy of the state. */
    const _toolDot=(t)=>{ try{ return !!(t&&t.dot&&t.dot()); }catch(_){ return false; } };
    function syncTools(){ try{ _liveHosts().forEach(h=>h.querySelectorAll('.lst-toolrow').forEach(b=>{
      const t=TOOLS.find(x=>x.id===b.dataset.act); if(!t) return; b.classList.toggle('on',_toolOn(t));
      const d=b.querySelector('.lst-tooldot'); if(d) d.hidden=!_toolDot(t); })); }catch(_){} }
    try{ document.addEventListener('pointerup',()=>{ try{ if(document.querySelector('.lst-toolrow')) setTimeout(syncTools,60); }catch(_){} },true); }catch(_){}
    /* cheap state re-sync (no rebuild): reflect the live checkboxes onto the existing tiles */
    function syncTiles(){ try{ _liveHosts().forEach(h=>h.querySelectorAll('.lst-tile').forEach(t2=>{ const id=t2.dataset.lid; if(!id) return;
      const cb=document.getElementById(id); if(cb) t2.classList.toggle('on',!!cb.checked); })); }catch(_){} }
    /* ══ (#R255) THE CLEAR BUTTON — ONE IMPLEMENTATION, EVERY MOUNT ════════════════════════════════
       「レイヤー検索欄に入力内容をクリアするボタンを。」 This grid is mounted in at least two places
       (the desktop sidebar and the phone's «Map & layers» sheet) and the classic panel has a search
       box of its own in js/map-extras.js. #R239's lesson is a defect fixed in one of two copies of a
       thing and left in the other, so this is a function every host calls rather than markup written
       twice — the third box (a different panel entirely) gets its own, beside its own filter. */
    function wireSearchClear(host){ try{
      const wrap=host&&host.querySelector('.lsr-search'); if(!wrap||wrap.querySelector('.lsr-clear')) return;
      const inp=wrap.querySelector('input'); if(!inp) return;
      const b=document.createElement('button'); b.type='button'; b.className='lsr-clear'; b.innerHTML=window.IntMapClearGlyph();
      const lbl=()=>T('Clear search','検索をクリア','Suche leeren','Очистить поиск','Borrar búsqueda');
      b.title=lbl(); b.setAttribute('aria-label',lbl());
      wrap.appendChild(b);
      /* (#R271) the mark is placed from the field, not from the wrapper — see IntMapPlaceClear */
      const place=window.IntMapPlaceClear(inp,b);
      const sync=()=>{ b.setAttribute('data-on',inp.value?'1':'0'); if(inp.value) place(); };
      sync();
      inp.addEventListener('input',sync);
      inp.addEventListener('keydown',e=>{ if(e.key==='Escape'&&inp.value){ inp.value=''; filterTiles(host); sync(); } });
      b.addEventListener('click',e=>{ e.stopPropagation(); e.preventDefault(); inp.value=''; filterTiles(host); sync(); inp.focus(); });
      window.addEventListener('intmap-lang',()=>{ b.title=lbl(); b.setAttribute('aria-label',lbl()); });
    }catch(_){} }
    function filterTiles(host){ host=host||sb; if(!host) return; const qi=host.querySelector('.lsr-search input');
      const q=((qi&&qi.value)||'').toLowerCase().trim();
      const root=host.querySelector('.lst-root'); if(!root) return;
      root.querySelectorAll('.lst-grid').forEach(g=>{ let vis=0;
        g.querySelectorAll('.lst-tile').forEach(t2=>{ const show=!q||t2.dataset.nm.indexOf(q)>=0; t2.style.display=show?'':'none'; if(show) vis++; });
        /* while searching, a collapsed section with matches is forced open (inline display beats .closed) */
        /* (#R309) …and a section drawn as rows is `flex`, not `grid` — this inline value is what forces a
           collapsed section open while a search is running, so it has to name that section's own display. */
        g.style.display=vis?(q?(g.classList.contains('lst-rows')?'flex':'grid'):''):'none'; const h=g.previousElementSibling; if(h&&h.classList.contains('lst-sech')) h.style.display=vis?'':'none'; });
      /* (#R291) 「Layersの検索で route / directions / 経路 / ルート / 道順 等から発見できるように」 — the
         tool rows were outside this filter entirely, so a search narrowed the layers and left the
         tools alone. They match on their own name, their hint, their English id and a keyword list. */
      try{ const tw=root.querySelector('.lst-tools'); if(tw){ let tv=0;
        tw.querySelectorAll('.lst-toolrow').forEach(b=>{ const show=!q||String(b.dataset.nm||'').indexOf(q)>=0; b.style.display=show?'':'none'; if(show) tv++; });
        tw.style.display=tv?'':'none'; } }catch(_){} }
    function open(){ build();   /* (#R107) mobile allowed — the right-sidebar layer panel now works on phones too (overlay, no map push) */
      /* (#R72) SPEED ("layersをクリックしたときの反応が非常に遅い"): the full reorganize+rebuild ran on EVERY
         open. Now the grid is rebuilt only when the row set actually changed; an unchanged grid just re-syncs
         its ✓ states (milliseconds). */
      try{ const have=sb.querySelectorAll('.lst-tile').length;
        if(!have){ try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} buildTiles(); }
        else{ const want=rowsFromDropdown().length; if(want&&want!==have) buildTiles(); else syncTiles(); } }catch(_){ try{ buildTiles(); }catch(__){} }
      /* (#R66) dynamic width: the map ALWAYS keeps ≥320px when geometrically possible — on a narrow window or
         with a widened left sidebar, a fixed 430px panel swallowed the map ("覆いかぶさる" perception). */
      try{ if(isMob()){ document.documentElement.style.setProperty('--lsr-w','min(430px,92vw)'); }   /* (#R107) mobile: near-full-width overlay */
        else { const ls=document.getElementById('sidebar');
        /* (#R160) the LEFT sidebar now always OVERLAYS the map (absolute), but it still visually covers its strip,
           so subtract its width whenever it is open — keep ≥320px of VISIBLE map between the two overlays. */
        const lw=(ls&&!ls.classList.contains('collapsed'))?ls.getBoundingClientRect().width:0;
        const cap=Math.max(300, Math.round(window.innerWidth-lw-320));   /* keep ≥320px of map */
        let saved=parseInt(localStorage.getItem('intmap_lsr_w')||'',10);   /* (#R154) honour a user-dragged width instead of clobbering it every open */
        const w=(saved>=260)?Math.min(saved,cap):Math.max(280,Math.min(300, Math.round(window.innerWidth-lw-320)));   /* (#R154/#R159/#R160) default cap 430→380→340→300 (smaller) */
        document.documentElement.style.setProperty('--lsr-w', w+'px'); } }catch(_){}
      sb.classList.add('open'); document.body.classList.add('lsr-open');
      document.body.classList.remove('im-float-front');   /* (#R253) 「サイドバーをあけたときに」— opening puts it in front, whatever was raised before */
      /* (#R73) fire any lazy previews that IO missed while the panel was prebuilt off-screen */
      setTimeout(()=>{ try{ window.IntMapLayerPreviews&&window.IntMapLayerPreviews.kick&&window.IntMapLayerPreviews.kick(sb); }catch(_){} },450);
      /* (#R66) INLINE, decoupled: the MAP cedes the strip via its own margin (one line, no cascade, no flex
         math), the panel just slides into the vacated strip. Neither depends on the other. */
      sb.style.transform='translateX(0)'; sb.style.visibility='visible'; sb.style.pointerEvents='auto';
      try{ const mc=document.querySelector('.map-container'); if(mc&&mc.style.marginRight) mc.style.marginRight=''; }catch(_){}   /* (#R160) overlay: the panel never pushes the map — clear any stale inline margin from an older session */
      /* the Active-layers bar re-homes to the top of the tile browser (returns to the dropdown on close) */
      try{ window._placeActiveSection&&window._placeActiveSection(); }catch(_){} try{ window._refreshActiveLayers&&window._refreshActiveLayers(); }catch(_){}
      /* rows built by late modules (eco/l9/beta, ~1.5 s) — one deferred rebuild picks them up */
      setTimeout(()=>{ try{ if(sb.classList.contains('open')&&sb.querySelectorAll('.lst-tile').length<rowsFromDropdown().length) buildTiles(); }catch(_){} },900);
      /* (#R72) clicking the MAP closes the sidebar, same as the classic dropdown ("地図上のどこかをクリックしたら
         閉まるように") */
      if(!open._mapCloser){ open._mapCloser=()=>{ try{ if(sb&&sb.classList.contains('open')) close(); }catch(_){} }; }
      try{ GE().events.on('click',open._mapCloser); }catch(_){}
      /* (#R160) overlay: the map-container did NOT change size, so no resize/recentre — just let the search-pill
         layout recompute against the now-open panel (the right-anchored HUD slides left via CSS). */
      try{ window.dispatchEvent(new Event('intmap-sidebar-resize')); }catch(_){}
      try{ window._imSaveSession&&window._imSaveSession(); }catch(_){} }   /* (#R195) remember it */
    function close(){ if(document.body.classList.contains('ws-mode')) return;   /* (#R78d) in workspace mode the layer panel lives in its own window and must never auto-close (that turned the window black) */
      if(sb){ sb.classList.remove('open'); sb.style.transform='translateX(102%)'; sb.style.pointerEvents='none'; setTimeout(()=>{ try{ if(!sb.classList.contains('open')) sb.style.visibility='hidden'; }catch(_){} },400); }
      try{ if(open._mapCloser&&GE().hasRenderer()) GE().events.off('click',open._mapCloser); }catch(_){}
      document.body.classList.remove('lsr-open');
      try{ const mc=document.querySelector('.map-container'); if(mc) mc.style.marginRight=''; }catch(_){}
      try{ window._placeActiveSection&&window._placeActiveSection(); }catch(_){}   /* Active bar back to the classic dropdown */
      /* (#R160) overlay: closing the panel doesn't resize the map — just recompute the search-pill layout. */
      try{ window.dispatchEvent(new Event('intmap-sidebar-resize')); }catch(_){}
      try{ window._imSaveSession&&window._imSaveSession(); }catch(_){} }   /* (#R195) remember it */
    /* (#R195) every route in and out of this panel records itself, so the next load can restore it */
    function toggle(){ if(sb&&sb.classList.contains('open')) close(); else open();
      try{ window._imSaveSession&&window._imSaveSession(); }catch(_){} }
    function apply(){ if(window.imLayerPanel==='right'){ build(); document.body.classList.add('lsr-avail'); if(!isMob()) open(); } else { close(); document.body.classList.remove('lsr-avail'); } }   /* (#R107) build on mobile too; only auto-OPEN on desktop (mobile opens on the layer button) */
    setTimeout(()=>{ try{ if(window.imLayerPanel==='right'){ build(); document.body.classList.add('lsr-avail');
      /* (#R72) PRE-BUILD the tile grid while idle so the FIRST open is instant too */
      const pre=()=>{ try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} try{ buildTiles(); }catch(_){} };
      if('requestIdleCallback' in window) requestIdleCallback(pre,{timeout:4000}); else setTimeout(pre,2500);
      /* (#R195) 「再読み込み時に、サイドバーの開閉状態を保持するように。」 Boot has always left this panel
         closed, so a user who had it open lost it on every reload. It re-opens only when the last
         session actually ended with it open — a first visit still boots closed, which is the
         behaviour the line below was written for and the one nobody asked to change. */
      /* ⚠ (#R210) …AND A FIRST VISIT NOW BOOTS IT OPEN. The note above says a first visit stays
         closed and that nobody asked to change it; 「初回時は、右サイドバーも開かれた状態にして。」 is
         that ask. Only the FIRST visit changes: a returning user who closed the panel saved
         `right:false`, and that still wins — the new case is the one where there is no saved answer
         at all. Mobile is unchanged (the panel is an overlay there, opened by the layer button). */
      { const ui=window._imSessionUI; const unanswered=!ui||typeof ui.right!=='boolean';
        if(!isMob()&&(unanswered||ui.right===true)){
          /* WARN (#R210) A FIRST VISIT OPENS IT WHEN THE APP IS IDLE, NOT WHILE IT IS STILL
             BOOTING. open() runs reorganizeLayerPanel()+buildTiles() synchronously when the grid
             has not been built yet, and on a first visit it never has — so opening here put a
             full tile build in front of whatever boot was still doing. That is #R208's own
             finding («譲り方が同優先度だと背景処理がアプリ起動と競走して勝つ»), and it showed up
             as tests/r170's fresh-profile test failing on a GPU-less CI runner while passing
             three times out of three locally. A RESTORED session is different: the grid was
             pre-built by the idle callback above, so open() is cheap and immediate is right.
             The 3 s timeout means the panel always appears, idle or not. */
          if(unanswered&&'requestIdleCallback' in window) requestIdleCallback(()=>{ try{ open(); }catch(_){} },{timeout:3000});
          else open();
        } }
    } }catch(_){} },1500);   /* edge toggle available on boot in right mode (without auto-opening) */
    /* (#R104) rebuild the tile grid on a language change so the layer NAMES follow the new language immediately
       (the tiles are a copy of the classic dropdown, which updateI18n localizes — rebuild AFTER that). This was
       the biggest "ワークスペースで言語を変えてもすぐ変わらない（再読み込みが必要）" offender (dozens of layer names). */
    window.addEventListener('intmap-lang',()=>{ if(!_liveHosts().length) return;
      /* (#R106) the "Search layers…" placeholder was set once at build and never re-localized ("言語設定を変えても
         すぐ変わらない" in ws mode — the layers window search stayed English). Update it live on a language change.
         (#R232) …for every mounted grid, not only the sidebar's. */
      try{ _liveHosts().forEach(h=>{ const q=h.querySelector('.lsr-search input'); if(q) q.placeholder=T('Search layers…','レイヤーを検索…','Ebenen suchen…','Поиск слоёв…','Buscar capas…'); }); }catch(_){}
      setTimeout(()=>{ try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} try{ _liveHosts().forEach(h=>buildTiles(h)); }catch(_){} },40); });
    /* ══ (#R232) MOUNT THE SAME GRID SOMEWHERE ELSE — the phone's Map & layers sheet ═══════════════
       Idempotent: called on every layout change and every sheet open. It creates its own search pill
       and body once, registers the host, and thereafter only rebuilds when the row set has actually
       changed (rows arrive late — the eco / l9 / beta modules build theirs ~1.5 s in), which is the
       same cheap-resync rule open() uses so that opening the sheet is not a full rebuild. */
    function mountInto(container){
      if(!container) return null;
      build();                       /* ensures css() has run — the .lst-* rules are shared */
      let host=container.querySelector('.lsr-mount');
      if(!host){
        host=document.createElement('div'); host.className='lsr-mount';
        host.innerHTML='<div class="lsr-search"><input class="lsr-q" type="text" placeholder="'+T('Search layers…','レイヤーを検索…','Ebenen suchen…','Поиск слоёв…','Buscar capas…')+'"></div><div class="lsr-body"></div>';
        container.insertBefore(host, container.firstChild);
        host.querySelector('.lsr-q').addEventListener('input',(ev)=>{ filterTiles(host);
          try{ window.IntMapSearchToTop(ev.target.closest('.lsr-search')||ev.target); }catch(_){} });
        wireSearchClear(host);   /* (#R255) …and the phone's sheet gets the same button, from the same code */
        _hosts.push(host);
      }
      try{
        const have=host.querySelectorAll('.lst-tile').length;
        if(!have){ try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} buildTiles(host); }
        else { const want=rowsFromDropdown().length; if(want&&want!==have) buildTiles(host); else syncTiles(); }
      }catch(_){ try{ buildTiles(host); }catch(__){} }
      /* ══ ⚠⚠⚠ (#R408 追記) `kick()` MEANS «THE PANEL IS ON SCREEN», AND THIS CALLER WAS NOT CHECKING ══
         #R408 shut the boot path in js/layer-previews.js so a phone does not buy 28 pictures
         (4,051,978 B) and 33 canvas painters for a sheet nobody has pulled up. PRODUCTION VERIFICATION
         FOUND THEM STILL ARRIVING: 27–35 `preview_*.png` from 2.1 s, with the sheet measurably shut
         (`class="m-sheet"`, top 879 px of an 812 px viewport). The gate was never reached, because
         mountInto is called TWICE and only one of the two means what kick() says:
           · js/mobile-ui.js openSheet() — the reader pulled the sheet up. `.show` is added BEFORE this
             call, so the host is on screen and the pictures are exactly what was asked for.
           · js/mobile-ui.js applyLayout() — at BOOT, from syncResponsive(), to have the grid ready.
             Nothing is on screen. This is the one that was buying them.
         So the caller checks the claim it is making. ⚠ NOT an IntersectionObserver: #R72→#R73 replaced
         this gate with one and rows built off-screen were never revisited, so the note in
         js/layer-previews.js states the rule as «the gate must always open». It still always opens —
         openSheet() calls mountInto() every time, so the first pull-up kicks. The bounded retries are
         only for the sheet's transition still being in flight when the first attempt lands.
         ⚠ AND IT FAILS OPEN: if the geometry cannot be read, kick as before. A preview that never
         appears is a worse defect than one that appears early. */
      (function(){ const at=[300,700,1500];
        const go=(i)=>setTimeout(()=>{ try{
          if(!host.isConnected) return;
          if(!_hostShown(host)){ if(i+1<at.length) go(i+1); return; }
          window.IntMapLayerPreviews&&window.IntMapLayerPreviews.kick&&window.IntMapLayerPreviews.kick(host);
        }catch(_){} },at[i]);
        go(0); })();
      setTimeout(()=>{ try{ if(host.isConnected&&host.querySelectorAll('.lst-tile').length<rowsFromDropdown().length) buildTiles(host); }catch(_){} },1200);
      return host;
    }
    function unmountFrom(container){ try{ const host=container&&container.querySelector('.lsr-mount');
      if(host){ const i=_hosts.indexOf(host); if(i>=0) _hosts.splice(i,1); host.remove(); } }catch(_){} }
    return { open, close, toggle, apply, mountInto, unmountFrom };
  })();
};

window.IntMapModules.ticker=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const fetchData=HOST.fetchData, saveSettings=HOST.saveSettings;
  window.IntMapTicker=(function(){
    const T=window.IntMapLang.pick(()=>HOST.lang);
    const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const isMob=()=>window.matchMedia&&window.matchMedia('(max-width:768px)').matches;
    let bar=null,track=null,built=false,timer=0,mkt=[],news=[];
    /* (#R102) which symbols / items the ticker shows is user-configurable in Settings ("表示銘柄や表示項目を設定から
       変更可能に"). Each market instrument carries a stable key; `cfg.syms` is the enabled set, `cfg.news` gates the
       news headlines. Defaults = everything on. */
    const TK_SYMS=[
      {k:'usdjpy',l:'USD/JPY',g:'fx'},{k:'eurusd',l:'EUR/USD',g:'fx'},{k:'gbpusd',l:'GBP/USD',g:'fx'},{k:'usdcny',l:'USD/CNY',g:'fx'},
      {k:'spx',l:'S&P 500',g:'idx'},{k:'dow',l:'Dow',g:'idx'},{k:'nasdaq',l:'Nasdaq',g:'idx'},{k:'nikkei',l:'Nikkei 225',g:'idx'},{k:'dax',l:'DAX',g:'idx'},
      {k:'gold',l:()=>T('Gold','金','Gold','Золото','Oro'),g:'com'},{k:'silver',l:()=>T('Silver','銀','Silber','Серебро','Plata'),g:'com'},
      {k:'btc',l:'BTC',g:'crypto'},{k:'eth',l:'ETH',g:'crypto'} ];
    const CFG_KEY='intmap_ticker_cfg';
    function loadCfg(){ try{ const j=JSON.parse(localStorage.getItem(CFG_KEY)||'null'); if(j&&Array.isArray(j.syms)) return {syms:new Set(j.syms),news:j.news!==false}; }catch(_){} return {syms:new Set(TK_SYMS.map(s=>s.k)),news:true}; }
    let cfg=loadCfg();
    function saveCfg(){ try{ localStorage.setItem(CFG_KEY,JSON.stringify({syms:[...cfg.syms],news:cfg.news})); }catch(_){} }
    const PROX=[x=>x, x=>'https://corsproxy.io/?url='+encodeURIComponent(x), x=>'https://api.allorigins.win/raw?url='+encodeURIComponent(x)];
    /* ⚠ THE PROXY LADDER IS FOR "CORS WILL NOT LET ME REACH IT", NOT FOR "IT ANSWERED 429".
       Rung 0 is the host itself; rungs 1 and 2 are relays. A CORS refusal never produces a status
       at all — fetch rejects — so a status on rung 0 means the HOST really answered, and re-asking
       the same host through two relays is three requests against one keyless allowance from three
       different addresses. That is how the FX endpoint's 61 calls a day disappeared. A relay's own
       status stays ambiguous (it may be the relay that is busy), so only rung 0 stops the descent. */
    const PEER_REFUSED=new Set([400,401,403,404,410,429,451]);
    async function fjson(url){ for(let i=0;i<PROX.length;i++){ try{ const r=await fetch(PROX[i](url)); if(r&&r.ok) return await r.json(); if(i===0&&r&&PEER_REFUSED.has(r.status)) return null; }catch(_){} } return null; }
    async function ftext(url){ for(const p of PROX){ try{ const r=await fetch(p(url)); if(r&&r.ok) return await r.text(); }catch(_){} } return null; }
    function css(){ const st=document.createElement('style');
      /* (#R65) DETERMINISTIC column layout — no height calc at all: body becomes a flex column, the app shell
         takes the remaining space and the bar its fixed 30px row BELOW it. There is no arithmetic (dvh/scaling
         rounding) that can ever make the bar overlap the map. */
      st.textContent='body.ticker-on{display:flex;flex-direction:column;height:100vh;height:100dvh;overflow:hidden;}'
        +'body.ticker-on .operation-room{flex:1 1 auto;min-height:0;height:auto !important;}'
        +'#ticker-bar{position:relative;flex:0 0 30px;width:100%;height:30px;z-index:500;display:flex;align-items:center;background:var(--bg-color);border-top:1px solid rgba(128,128,128,0.25);overflow:hidden;font-size:12px;font-variant-numeric:tabular-nums;box-sizing:border-box;}'
        +'#ticker-bar .tk-track{display:inline-flex;white-space:nowrap;will-change:transform;animation:tkScroll var(--tk-dur,70s) linear infinite;align-items:center;}'
        +'#ticker-bar:hover .tk-track{animation-play-state:paused;}'
        +'@keyframes tkScroll{from{transform:translateX(0);}to{transform:translateX(-50%);}}'
        +'#ticker-bar .tk-half{display:inline-flex;align-items:center;gap:30px;padding-right:30px;}'
        +'#ticker-bar .tk-item{display:inline-flex;align-items:center;gap:6px;color:var(--text-main);}'
        +'#ticker-bar .tk-lbl{color:var(--text-muted);}'
        +'#ticker-bar .tk-up{color:#34c759;} #ticker-bar .tk-dn{color:#ff453a;}'
        +'#ticker-bar a{color:var(--text-main);text-decoration:none;} #ticker-bar a:hover{color:var(--primary-color);}'
        /* (#R102/#R103) a small hide button at the FAR RIGHT of the ticker — clicking it turns the whole ticker off.
           The scrolling text lives in a CLIPPED flex wrap (.tk-scroll) and the button is a real flex sibling, so the
           text can never run under the button (the earlier absolute overlay overlapped it — "重なって汚い"). */
        +'#ticker-bar .tk-scroll{flex:1 1 auto;min-width:0;height:100%;overflow:hidden;display:flex;align-items:center;}'
        +'#ticker-bar .tk-hide{flex:0 0 auto;width:28px;align-self:stretch;display:flex;align-items:center;justify-content:center;background:transparent;border-left:1px solid rgba(128,128,128,0.22);color:var(--text-muted);cursor:pointer;font-size:15px;line-height:1;padding:0;}'
        +'#ticker-bar .tk-hide:hover{color:var(--text-main);background:var(--input-bg);}'
        +'@media(max-width:768px){ #ticker-bar{display:none !important;} body.ticker-on{display:block;} body.ticker-on .operation-room{height:100vh !important;height:100dvh !important;} }';
      document.head.appendChild(st); }
    async function loadMarkets(){ const out=[];
      /* ⚠ ER-API FIRST. Measured in production: api.fxratesapi.com answers 429 with
         `x-ratelimit-remaining: 0` on a plain load while open.er-api.com answers 200 — the keyless
         fxratesapi allowance is 61 calls a day and the app was spending it on itself. fxratesapi is
         kept as the second choice because an API key restores it. */
      let rt=null; try{ const j=await fjson('https://open.er-api.com/v6/latest/USD'); rt=j&&j.rates; }catch(_){}
      if(!rt){ try{ const j2=await fjson('https://api.fxratesapi.com/latest?base=USD&currencies=JPY,EUR,GBP,CNY'); rt=j2&&j2.rates; }catch(_){} }
      if(rt){ if(rt.JPY!=null) out.push({l:'USD/JPY',v:(+rt.JPY).toFixed(2),k:'usdjpy'}); if(rt.EUR!=null&&+rt.EUR>0) out.push({l:'EUR/USD',v:(1/+rt.EUR).toFixed(4),k:'eurusd'}); if(rt.GBP!=null&&+rt.GBP>0) out.push({l:'GBP/USD',v:(1/+rt.GBP).toFixed(4),k:'gbpusd'}); if(rt.CNY!=null) out.push({l:'USD/CNY',v:(+rt.CNY).toFixed(3),k:'usdcny'}); }
      /* stock indices — Yahoo Finance chart endpoint (real price + true day change vs previous close);
         Stooq rejected datacenter/proxy requests, Yahoo verified working through the proxy ladder. */
      const YSYM=[['%5EGSPC','S&P 500','spx'],['%5EDJI','Dow','dow'],['%5EIXIC','Nasdaq','nasdaq'],['%5EN225','Nikkei 225','nikkei'],['%5EGDAXI','DAX','dax']];
      for(const ys of YSYM){ if(!cfg.syms.has(ys[2])) continue; try{ const j=await fjson('https://query1.finance.yahoo.com/v8/finance/chart/'+ys[0]+'?range=1d&interval=1d');
        const m=j&&j.chart&&j.chart.result&&j.chart.result[0]&&j.chart.result[0].meta;
        if(m&&m.regularMarketPrice!=null){ const prev=(m.chartPreviousClose!=null)?+m.chartPreviousClose:(+m.previousClose||null);
          const d=(prev&&prev>0)?((+m.regularMarketPrice-prev)/prev*100):null;
          out.push({l:ys[1],v:(+m.regularMarketPrice).toLocaleString(undefined,{maximumFractionDigits:2}),d,k:ys[2]}); } }catch(_){} }
      if(cfg.syms.has('gold')){ try{ const g=await fjson('https://api.gold-api.com/price/XAU'); if(g&&g.price) out.push({l:T('Gold','金','Gold','Золото','Oro'),v:'$'+(+g.price).toLocaleString(undefined,{maximumFractionDigits:0})+'/oz',k:'gold'}); }catch(_){} }
      if(cfg.syms.has('silver')){ try{ const s2=await fjson('https://api.gold-api.com/price/XAG'); if(s2&&s2.price) out.push({l:T('Silver','銀','Silber','Серебро','Plata'),v:'$'+(+s2.price).toFixed(2)+'/oz',k:'silver'}); }catch(_){} }
      if(cfg.syms.has('btc')||cfg.syms.has('eth')){ try{ const c=await fjson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true');
        if(cfg.syms.has('btc')&&c&&c.bitcoin&&c.bitcoin.usd!=null) out.push({l:'BTC',v:'$'+(+c.bitcoin.usd).toLocaleString(),d:c.bitcoin.usd_24h_change,k:'btc'});
        if(cfg.syms.has('eth')&&c&&c.ethereum&&c.ethereum.usd!=null) out.push({l:'ETH',v:'$'+(+c.ethereum.usd).toLocaleString(),d:c.ethereum.usd_24h_change,k:'eth'}); }catch(_){} }
      mkt=out; }
    function loadNews(){ try{ if(typeof HOST.globalData!=='undefined'&&HOST.globalData&&HOST.globalData.length){ news=HOST.globalData.slice(0,14).map(it=>({t:String(it.title||'').slice(0,110),u:it.link||''})); }
      else { news=[]; if(typeof fetchData==='function'&&!loadNews._asked){ loadNews._asked=1; try{ fetchData(); }catch(_){} [8000,16000,30000].forEach(ms=>setTimeout(()=>{ try{ loadNews(); render(); }catch(_){} },ms)); } } }catch(_){ news=[]; } }
    function render(){ if(!track) return; const parts=[];
      mkt.forEach(m=>{ if(m.k&&!cfg.syms.has(m.k)) return;   /* (#R102) respect the user's ticker symbol selection */
        const dd=(m.d!=null&&isFinite(m.d))?(' <span class="'+(m.d>=0?'tk-up':'tk-dn')+'">'+(m.d>=0?'▲':'▼')+Math.abs(m.d).toFixed(2)+'%</span>'):''; parts.push('<span class="tk-item"><span class="tk-lbl">'+esc(m.l)+'</span>'+esc(m.v)+dd+'</span>'); });
      /* (#R72) no 📰 emoji on ticker items ("Tickerに📰の絵文字はいらない") */
      if(cfg.news) news.forEach(n=>{ parts.push('<span class="tk-item">'+(n.u?('<a href="'+esc(n.u)+'" target="_blank" rel="noopener">'+esc(n.t)+'</a>'):esc(n.t))+'</span>'); });
      if(!parts.length) parts.push('<span class="tk-item tk-lbl">'+T('Loading ticker…','ティッカー読込中…','Ticker lädt…','Загрузка ленты…','Cargando cinta…')+'</span>');
      const html=parts.join('');
      track.innerHTML='<span class="tk-half">'+html+'</span><span class="tk-half" aria-hidden="true">'+html+'</span>';
      requestAnimationFrame(()=>{ try{ const w=track.scrollWidth/2; if(w>0) track.style.setProperty('--tk-dur',Math.max(28,Math.round(w/65))+'s'); }catch(_){} }); }
    async function refresh(){ loadNews(); render(); await loadMarkets(); render(); }
    function build(){ if(built) return; built=true; css();
      bar=document.createElement('div'); bar.id='ticker-bar'; bar.innerHTML='<div class="tk-scroll"><div class="tk-track"></div></div>';
      /* (#R102/#R103) far-right hide button — a real flex sibling (not an overlay) so it never overlaps the text */
      const hb=document.createElement('button'); hb.className='tk-hide'; hb.type='button'; hb.setAttribute('aria-label',T('Hide ticker','ティッカーを隠す','Ticker ausblenden','Скрыть ленту','Ocultar cinta')); hb.title=T('Hide ticker','ティッカーを隠す','Ticker ausblenden','Скрыть ленту','Ocultar cinta'); hb.textContent='×';
      hb.onclick=(e)=>{ e.stopPropagation(); if(document.body.classList.contains('ticker-on')) toggle(); };
      bar.appendChild(hb);
      /* insert directly after the app shell so the bar occupies the vacated strip in normal flow */
      const or=document.querySelector('.operation-room');
      if(or&&or.parentNode){ or.parentNode.insertBefore(bar,or.nextSibling); } else document.body.appendChild(bar);
      track=bar.querySelector('.tk-track'); }
    function open(){ build(); document.body.classList.add('ticker-on'); bar.style.display='flex'; refresh(); if(!timer) timer=everyTick('map-ui:ticker',300000,refresh);
      try{ GE().render.resize(); }catch(_){} setTimeout(()=>{ try{ GE().render.resize(); }catch(_){} },350);
      try{ window.IntMapWorkspace&&IntMapWorkspace.tickerReflow&&IntMapWorkspace.tickerReflow(); IntMapWorkspace.syncTicker&&IntMapWorkspace.syncTicker(); }catch(_){} }   /* (#R102) ws windows fill the vacated strip */
    function close(){ if(bar) bar.style.display='none'; document.body.classList.remove('ticker-on'); if(timer){ stopTick(timer); timer=0; }
      try{ GE().render.resize(); }catch(_){} setTimeout(()=>{ try{ GE().render.resize(); }catch(_){} },350);
      try{ window.IntMapWorkspace&&IntMapWorkspace.tickerReflow&&IntMapWorkspace.tickerReflow(); IntMapWorkspace.syncTicker&&IntMapWorkspace.syncTicker(); }catch(_){} }
    function toggle(){ if(document.body.classList.contains('ticker-on')){ window.imTicker='off'; close(); } else { window.imTicker='on'; open(); } try{ saveSettings&&saveSettings(); }catch(_){} }
    function apply(){ if(window.imTicker==='on') open(); else close(); }
    setTimeout(()=>{ try{ apply(); }catch(_){} },1500);   /* honour the saved setting on boot */
    /* (#R102) config API for the Settings ticker panel: read the symbol list + current selection, write a new one
       (persisted) and re-pull/re-render immediately. */
    function getConfig(){ return { syms:new Set(cfg.syms), news:cfg.news, list:TK_SYMS.map(s=>({k:s.k,g:s.g,l:(typeof s.l==='function'?s.l():s.l)})) }; }
    function setConfig(nc){ try{ if(nc){ if(nc.syms) cfg.syms=(nc.syms instanceof Set)?new Set(nc.syms):new Set(nc.syms||[]); if(nc.news!=null) cfg.news=!!nc.news; } saveCfg();
      try{ render(); }catch(_){} try{ if(document.body.classList.contains('ticker-on')) refresh(); }catch(_){} }catch(_){} }
    return { open, close, toggle, apply, getConfig, setConfig, isOpen:()=>document.body.classList.contains('ticker-on') };
  })();
};

window.IntMapModules.layerPresets=function(HOST){
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const imToast=HOST.imToast;
  (function(){
    const jp=()=>HOST.lang==='jp';
    const KEY='intmap_layer_presets';
    let presets=[]; try{ const s=JSON.parse(localStorage.getItem(KEY)||'[]'); if(Array.isArray(s)) presets=s; }catch(_){}
    function save(){ try{ localStorage.setItem(KEY,JSON.stringify(presets)); }catch(_){} try{ window._syncPrefsUp&&window._syncPrefsUp(); }catch(_){} }
    function cbKey(cb){ if(cb.id) return 'id:'+cb.id; const dl=cb.getAttribute&&cb.getAttribute('data-layer'); return dl?('dl:'+dl):null; }
    function findCb(key){ if(!key) return null; if(key.startsWith('id:')) return document.getElementById(key.slice(3));
      if(key.startsWith('dl:')){ const dd=document.getElementById('layer-dropdown'); return dd&&dd.querySelector('input[data-layer="'+key.slice(3)+'"]'); } return null; }
    const SKIP=new Set(['cb-names','cb-geolabels','cb-borders','cb-coast','cb-grid','cb-countries','cb-admin1','cb-roads','cb-rail2']);
    function capture(){ const dd=document.getElementById('layer-dropdown'); if(!dd) return null;
      const ids=[]; dd.querySelectorAll('input[type=checkbox]').forEach(cb=>{ if(!cb.checked||SKIP.has(cb.id)) return; const k=cbKey(cb); if(k&&!ids.includes(k)) ids.push(k); });
      let ops={}; try{ ops=JSON.parse(JSON.stringify(opacities)); }catch(_){}
      return { ids, ops }; }
    function clearAll(){ const dd=document.getElementById('layer-dropdown'); if(!dd) return;
      dd.querySelectorAll('input[type=checkbox]').forEach(cb=>{ if(!cb.checked||SKIP.has(cb.id)) return; cb.checked=false; try{ cb.dispatchEvent(new Event('change',{bubbles:true})); }catch(_){} }); }
    function apply(p){ if(!p) return;
      try{ if(p.ops) Object.keys(p.ops).forEach(k=>{ opacities[k]=p.ops[k]; }); }catch(_){}
      clearAll();
      setTimeout(()=>{ (p.ids||[]).forEach(k=>{ const cb=findCb(k); if(cb&&!cb.checked){ cb.checked=true; try{ cb.dispatchEvent(new Event('change',{bubbles:true})); }catch(_){} } });
        /* re-assert the saved opacities once the layers exist */
        setTimeout(()=>{ try{ if(p.ops) Object.keys(p.ops).forEach(k=>{ try{ setLayerOpacity(k,p.ops[k]); }catch(_){} }); }catch(_){} },900);
      },60); }
    function render(){ const host=document.getElementById('lyr-presets'); if(!host) return;
      host.innerHTML='<button id="lp-save" class="ai-test-btn" style="width:100%;">💾 <span>'+(window.IntMapLang.t(HOST.lang,"Save current layers as preset","現在のレイヤー構成を保存","Aktuelle Ebenen als Voreinstellung speichern","Сохранить текущие слои как пресет","Guardar las capas actuales como preajuste"))+'</span></button>'+
        (presets.length?('<div style="display:flex;flex-direction:column;gap:4px;margin-top:6px;">'+presets.map((p,i)=>
          '<div style="display:flex;align-items:center;gap:6px;">'+
          '<button data-ap="'+i+'" style="flex:1;text-align:left;background:var(--input-bg);border:1px solid rgba(128,128,128,0.2);color:var(--text-main);border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">▶ '+String(p.name).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+' <span style="color:var(--text-muted);font-size:10px;">('+(p.ids||[]).length+')</span></button>'+
          '<button data-del="'+i+'" title="'+(window.IntMapLang.t(HOST.lang,"Delete","削除","Löschen","Удалить","Eliminar"))+'" style="flex:0 0 auto;width:26px;height:26px;border:none;border-radius:7px;background:var(--input-bg);color:var(--text-muted);cursor:pointer;font-size:12px;">×</button></div>').join('')+'</div>'):'');
      const sv=host.querySelector('#lp-save');
      if(sv) sv.onclick=()=>{ const snap=capture(); if(!snap||!snap.ids.length){ try{ imToast(window.IntMapLang.t(HOST.lang,"No layers are on","表示中のレイヤーがありません","Keine Ebene ist eingeschaltet","Ни один слой не включён","No hay capas activas")); }catch(_){} return; }
        const name=prompt(window.IntMapLang.t(HOST.lang,"Preset name:","プリセット名:","Name der Voreinstellung:","Название пресета:","Nombre del preajuste:"), jp()?('プリセット '+(presets.length+1)):('Preset '+(presets.length+1)));
        if(!name) return; presets.push({name:String(name).slice(0,40), ids:snap.ids, ops:snap.ops}); save(); render(); };
      host.querySelectorAll('[data-ap]').forEach(b=>b.onclick=()=>{ apply(presets[+b.getAttribute('data-ap')]); try{ imToast(window.IntMapLang.t(HOST.lang,"Preset applied","プリセットを適用しました","Voreinstellung angewendet","Пресет применён","Preajuste aplicado")); }catch(_){} });
      host.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{ presets.splice(+b.getAttribute('data-del'),1); save(); render(); });
    }
    function mount(){ if(document.getElementById('lyr-presets')) { render(); return; }
      const host=document.createElement('div'); host.id='lyr-presets'; host.style.marginTop='4px';
      const tools=document.getElementById('layer-tools'); const dd=document.getElementById('layer-dropdown');
      (tools||dd||document.body).appendChild(host); render();
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} }
    if(document.readyState!=='loading') setTimeout(mount,400); else document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,400));
    window.addEventListener('intmap-lang',render);
    window.IntMapPresets={ render, _get:()=>presets, _set:(a)=>{ if(Array.isArray(a)){ presets=a; try{ localStorage.setItem(KEY,JSON.stringify(presets)); }catch(_){} render(); } } };
  })();
};

window.IntMapModules.labelPopup=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */

  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const imToast=HOST.imToast, isMobile=HOST.isMobile;
  (function(){
    if(!GE().hasRenderer()) return;
    let popup=null, wired=false;
    function firstSym(){ try{ for(const l of (GE().scene.getStyle().layers||[])) if(l.type==='symbol') return l.id; }catch(_){} }
    function ensureHL(){ if(GE().layers.hasSource('place-hl-src')) return true; if(!_imCanDraw()) return false;
      try{ GE().layers.addSource('place-hl-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}}); const before=firstSym();
        GE().layers.add({id:'place-hl-fill',type:'fill',source:'place-hl-src',filter:['==','$type','Polygon'],paint:{'fill-color':'#ff3b30','fill-opacity':0.30}},before);
        GE().layers.add({id:'place-hl-line',type:'line',source:'place-hl-src',filter:['==','$type','Polygon'],paint:{'line-color':'#ff3b30','line-width':1.8,'line-opacity':0.9}},before);
        GE().layers.add({id:'place-hl-dot',type:'circle',source:'place-hl-src',filter:['==','$type','Point'],paint:{'circle-radius':9,'circle-color':'#ff3b30','circle-opacity':0.35,'circle-stroke-color':'#ff3b30','circle-stroke-width':2.5}},before);
        return true; }catch(_){ return false; }
    }
    /* ══ (#R210) A RIVER NAME HIGHLIGHTS THE RIVER ═════════════════════════════════════════════════
       「河川名のラベルをクリックしたら、その河川が線でハイライトされるように。」 A river label is placed
       ALONG the line it names (#R41 moved it onto the `waterway` layer for exactly that reason), so
       the geometry is already in the tiles — what was missing is that a click drew nothing, because
       water/terrain labels pass `noOutline` (they have no polygon, and IntMapOutline draws polygons).
       A river is a LINE, so it gets a line highlight of its own.
       ⚠ `querySourceFeatures`, not `queryRenderedFeatures`: the point is to light up the WHOLE river
       that is loaded, not the one segment under the pointer. Tiles cut a river into many features,
       so every segment carrying the same name is taken.

       ══ (#R217) …AND BOTH OF THE LIMITS #R210 WROTE DOWN WERE THE REPORTED BUG ═══════════════════
       「河川名ラベルクリック時に、クリック地点によっては全区間がハイライトされない問題を解決して。」

       #R210 stated two limits honestly: a river outside the loaded tiles is not in the highlight,
       and one name is one river. The second one was doing more damage than it sounded, because a
       river IS renamed at every border — Donau / Duna / Dunav / Dunărea are one river, linked in the
       data through `name:en=Danube` that the single-field comparison never looked at. So which
       segments lit up depended on which segment you clicked. js/river-course.js owns that comparison
       now: a SET of names per feature, merged transitively, so the same click lights the same river
       wherever it lands. The `class` filter there also stops a ditch that shares a name from joining.

       The first limit is answered by asking OpenStreetMap for the river's real course (same two
       sources, same order Atlas has used since #R65) and drawing it BESIDE the tile segments. It
       arrives late and it may not arrive at all; the tile highlight is drawn first and is never
       taken away, so the worst case is exactly what #R210 shipped. */
    function ensureRiverHL(){ if(GE().layers.hasSource('river-hl-src')) return true; if(!_imCanDraw()) return false;
      try{ GE().layers.addSource('river-hl-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        const before=firstSym();
        GE().layers.add({id:'river-hl-glow',type:'line',source:'river-hl-src',layout:{'line-join':'round','line-cap':'round'},
          paint:{'line-color':'#00e5ff','line-opacity':0.35,'line-width':['interpolate',['linear'],['zoom'],5,7,12,18]}},before);
        GE().layers.add({id:'river-hl-line',type:'line',source:'river-hl-src',layout:{'line-join':'round','line-cap':'round'},
          paint:{'line-color':'#00e5ff','line-opacity':0.95,'line-width':['interpolate',['linear'],['zoom'],5,2.2,12,5]}},before);
        return true; }catch(_){ return false; } }
    /* (#R217) one sequence for the whole river highlight: a later click (or any clear) must be able
       to overrule a fetch that is still in the air, or a slow answer would repaint a river the user
       has already moved away from. */
    /* ⚠ declared HERE, beside _riverSeq and ABOVE clearRiverHL — a `let` further down is in the
       temporal dead zone for any call that happens during boot, and #R200 lost a whole boot to that. */
    let _riverSeq=0, _riverLive=null;
    function clearRiverHL(){ _riverSeq++; _riverLive=null; try{ if(GE().layers.hasSource('river-hl-src')) GE().layers.setSourceData('river-hl-src',{type:'FeatureCollection',features:[]}); }catch(_){} }
    function _riverBbox(feats){
      let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;
      const eat=(ln)=>{ for(const pt of ln){ const x=+pt[0],y=+pt[1]; if(!isFinite(x)||!isFinite(y)) continue; if(x<a)a=x; if(y<b)b=y; if(x>c)c=x; if(y>d)d=y; } };
      for(const f of feats){ for(const ln of (window.IntMapRiverCourse?window.IntMapRiverCourse.linesOf(f.geometry):[])) eat(ln); }
      return [a,b,c,d];
    }
    /* ══ ⚠⚠ (#R219) THE TILE PASS ONLY EVER SEES THE TILES THAT ARE LOADED ═══════════════════════
       「河川名ラベルクリック時に、クリック地点によっては全区間がハイライトされない問題を解決して。
        （河川名が変わるから云々の話じゃないわボケ。同じ川の同じ名前の区間の話じゃ）」

       #R217 and #R218 both answered the NAME question (the transitive closure, and asking the fetch
       with the whole closure) and both were right about it — this report is about a river whose
       segments all carry the SAME name, so neither of those is what is missing. What is missing is
       simpler and is in this function: `querySourceFeatures` answers from the tiles the renderer has
       IN MEMORY, which is the current viewport plus a margin. Half of a 900 km river is not in them,
       so half of it cannot be highlighted, and WHICH half depends on where the map happens to be —
       「クリック地点によっては」 exactly.
       The fetched course (`RC.course`) is the answer when it lands, but it is one Nominatim/Overpass
       round trip that can be slow, partial or refused, and when it is, the highlight is whatever the
       tiles held at the instant of the click and it never grows again.
       So the highlight is now LIVE: while a river is lit, every `idle` re-runs the closure over the
       tiles that are loaded NOW and unions anything new into it. Panning along the river completes
       it, and it never shrinks — a highlight that loses segments as you move is worse than one that
       is short. The accumulated name set is carried, so the closure keeps its #R217 transitivity
       across the panning too. */
    function _riverKeyOf(g){
      try{ const ls=window.IntMapRiverCourse.linesOf(g);
        let k='';
        for(const ln of ls){ if(!ln||!ln.length) continue;
          const a=ln[0], b=ln[ln.length-1];
          k+=a[0].toFixed(5)+','+a[1].toFixed(5)+'>'+b[0].toFixed(5)+','+b[1].toFixed(5)+';'+ln.length+'|'; }
        return k; }catch(_){ return ''; }
    }
    function _riverGrow(){
      const st=_riverLive; if(!st||st.seq!==_riverSeq) return;
      const RC=window.IntMapRiverCourse; if(!RC) return;
      let raw=[]; try{ raw=GE().coords.querySourceFeatures('ofm',{sourceLayer:'waterway'})||[]; }catch(_){ return; }
      if(!raw.length) return;
      /* the closure is asked with EVERY name gathered so far, not with the clicked segment's — that is
         what makes a river picked up in Hungary keep growing when the map reaches Austria */
      const picked=RC.sameRiver(st.seedProps,raw,{limit:4000,names:st.names});
      let grew=false;
      for(const f of picked){
        const g=f&&f.geometry; if(!g||(g.type!=='LineString'&&g.type!=='MultiLineString')) continue;
        const k=_riverKeyOf(g); if(!k||st.keys.has(k)) continue;
        st.keys.add(k); st.feats.push({type:'Feature',geometry:g,properties:{}}); grew=true;
        RC.nameSet(f.properties).forEach(n=>st.names.add(n));
      }
      if(grew){ try{ GE().layers.setSourceData('river-hl-src',{type:'FeatureCollection',features:st.feats.concat(st.fetched||[])}); }catch(_){} }
    }
    if(!highlightRiver._grow){ highlightRiver._grow=true;
      try{ GE().events.on('idle',()=>{ try{ _riverGrow(); }catch(_){} }); }catch(_){} }
    function highlightRiver(props,lngLat){
      try{
        const RC=window.IntMapRiverCourse;
        if(!props||!RC||!ensureRiverHL()) return;
        const seq=++_riverSeq;
        const raw=GE().coords.querySourceFeatures('ofm',{sourceLayer:'waterway'})||[];
        /* a long river in loaded tiles is thousands of segments; the cap is the frame budget (#R210) */
        const picked=RC.sameRiver(props,raw,{limit:4000});
        const tile=[];
        for(const f of picked){
          const g=f&&f.geometry; if(!g||(g.type!=='LineString'&&g.type!=='MultiLineString')) continue;
          tile.push({type:'Feature',geometry:g,properties:{}});
        }
        GE().layers.setSourceData('river-hl-src',{type:'FeatureCollection',features:tile});
        /* what the live pass carries forward: the segments already lit (by identity, so a tile that
           reloads does not double them) and the names the closure has agreed on so far */
        { const keys=new Set(); tile.forEach(f=>{ const k=_riverKeyOf(f.geometry); if(k) keys.add(k); });
          const acc=new Set();
          for(const f of picked) RC.nameSet(f&&f.properties).forEach(n=>acc.add(n));
          RC.nameSet(props).forEach(n=>acc.add(n));
          _riverLive={ seq, keys, feats:tile.slice(), fetched:null, names:acc, seedProps:props }; }
        if(!lngLat||!isFinite(lngLat.lng)) return;
        /* ══ ⚠ (#R218) ASK ABOUT THE RIVER, NOT ABOUT THE PIXEL ═══════════════════════════════════
           「クリック地点によっては全区間がハイライトされない」— see js/river-course.js for the two
           click-dependent things inside `course()`. Both need the caller to hand over what the TILE
           closure already established: every name in it (so a Hungarian click asks the same question
           an Austrian one does), its extent (so the Overpass box is the river's, not the finger's),
           and points along it (so a candidate is accepted for passing THIS RIVER rather than for
           passing this click, which a 2,850 km river's far reach never does). */
        const allNames=new Set(), allList=[];
        for(const f of picked){ const s=RC.nameSet(f&&f.properties); s.forEach(n=>allNames.add(n));
          for(const n of RC.nameList(f&&f.properties)) if(allList.indexOf(n)<0) allList.push(n); }
        const anchors=[]; { const step=Math.max(1,Math.floor(tile.length/24));
          for(let i=0;i<tile.length;i+=step){ const ln=RC.linesOf(tile[i].geometry)[0];
            if(ln&&ln.length) anchors.push(ln[(ln.length/2)|0]); } }
        if(!anchors.length) anchors.push([lngLat.lng,lngLat.lat]);
        RC.course(props,lngLat,{ names:allNames, nameList:allList, anchors, bbox:_riverBbox(tile) }).then(hit=>{
          if(!hit||!hit.geo||seq!==_riverSeq) return;
          const full=RC.linesOf(hit.geo).filter(ln=>ln&&ln.length>1)
            .map(ln=>({type:'Feature',geometry:{type:'LineString',coordinates:ln},properties:{}}));
          if(!full.length) return;
          /* ⚠ THE FETCHED COURSE REPLACES THE TILE SEGMENTS ONLY WHEN IT COVERS THEM. Nominatim
             answers for ONE named OSM object, so a query for "Donau" can come back with less of the
             river than the tiles are already showing; replacing blindly would SHRINK the highlight
             the user just got. Compare the two extents and union whenever the answer is not a
             superset — a doubled line looks slightly brighter, a vanished one looks broken. */
          const tb=_riverBbox(tile), cb=_riverBbox(full), e=0.02;
          const covers=isFinite(tb[0])&&cb[0]<=tb[0]+e&&cb[1]<=tb[1]+e&&cb[2]>=tb[2]-e&&cb[3]>=tb[3]-e;
          /* ⚠ the fetched course is kept BESIDE the live tile set, not instead of it: the live pass
             keeps adding tile segments as the reader pans, and it must not undo this. */
          if(_riverLive&&_riverLive.seq===seq){ _riverLive.fetched=full;
            GE().layers.setSourceData('river-hl-src',{type:'FeatureCollection',
              features:covers?full:_riverLive.feats.concat(full)});
            return; }
          GE().layers.setSourceData('river-hl-src',{type:'FeatureCollection',features:covers?full:full.concat(tile)});
        }).catch(()=>{});
      }catch(_){}
    }
    function clearHL(){ try{ GE().layers.setSourceData('place-hl-src',{type:'FeatureCollection',features:[]}); }catch(_){} clearRiverHL(); if(popup){ try{popup.remove();}catch(_){} popup=null; }
      /* (#R59) the place popup now OWNS the boundary outline (#R8c popup + IntMapOutline unified) — closing/clearing
         the popup (×, click-away, or a new label) also clears the blue boundary, so it can never linger. */
      try{ window.IntMapOutline && window.IntMapOutline.clear && window.IntMapOutline.clear(); }catch(_){} }
    /* ⚠ (#R252) `opts.title` is the HEADING ONLY. `name` stays the place's identity — it is what Copy
       writes, what the Wikipedia probe and the AI brief are asked about, and what IntMapOutline looks
       the boundary up by — so the two must not be confused: 「大阪府 (Osaka Prefecture)」 is a caption,
       not a query. See `_bothNames` below for what builds it. */
    function showPopup(lngLat,name,isCountry,opts){ opts=opts||{}; if(popup){ try{popup.remove();}catch(_){} } const jp=HOST.lang==='jp', safe=String(opts.title||name).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
      /* (#R22) Cleaner layout: name on its own line, then an even button row (equal widths on desktop,
         stacked vertically on mobile via .plc-acts — "ボタンの配置が不格好／モバイルでは縦に三つ"). */
      /* (#R210) 「地名ラベルクリック時のポップアップをすこし小さくして」— one step down across the
         board (button 12→11px / 7-10→6-9 padding, title 14→13px, min-width 172→148, max 300→268).
         Deliberately a step, not a redesign: the row still holds Copy/Wikipedia/AI/Isolate/Move
         without wrapping on desktop, which is what #R22 built this layout to do. */
      const btnBase='border:none;color:var(--text-main);border-radius:7px;padding:6px 9px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;';
      /* (#R33) Isolate now lives in this SAME action row as Copy/Wikipedia/AI brief (for countries) — no more
         separate floating button ("既存のcopy, wikipedia, AI briefと同じ並びに、同じUIで"). */
      const de=HOST.lang==='de';   /* (#R33) 3-language labels */
      /* (#R122) Isolate is available for ANY outlined place now (not just countries) via the outline geometry;
         Move drags the place (true-size) to a new spot. */
      const isoLbl=de?'Isolieren':jp?'この地域だけ':window.IntMapLang.t(HOST.lang,'Isolate',undefined,undefined,'Только это','Aislar');
      const moveLbl=de?'Verschieben':jp?'移動':window.IntMapLang.t(HOST.lang,'Move',undefined,undefined,'Переместить','Mover');
      /* (#R123) Isolate/Move are only meaningful for AREA-bearing places (countries, regions, cities with a
         boundary) — NOT for point/line classifications like mountains (ofm-peak), rivers (ofm-river) or seas
         (geo-sea) which have no polygon ("領域のない分類のものはボタンをつけないように"). The terrain/water label
         handler passes opts.noAreaTools to suppress both buttons. */
      const areaTools=!opts.noAreaTools;
      const isoBtn=areaTools?`<button class="plc-iso" style="background:var(--input-bg);${btnBase}">${isoLbl}</button>`:'';
      const moveBtn=areaTools?`<button class="plc-move" style="background:var(--input-bg);${btnBase}">${moveLbl}</button>`:'';
      /* (#R127) historical entities pass their flag (opts.flag = the countryStats/registry flag HTML) so the click
         popup shows it too — previously the flag only appeared in the full country card, never here ("国旗…まだ詰め
         られる箇所が大量にある"). Modern place labels pass no flag, so their popup is unchanged. */
      const flagHtml=(opts&&opts.flag)?('<span class="plc-flag" style="flex:0 0 auto;line-height:0;display:inline-flex;align-items:center;font-size:19px;">'+opts.flag+'</span>'):'';
      const html=`<div style="min-width:148px;"><div style="font-weight:700;font-size:13px;color:var(--text-main);margin-bottom:8px;padding-right:30px;display:flex;align-items:center;gap:7px;">${flagHtml}<span>${safe}</span></div><div class="plc-acts"><button class="plc-copy" style="background:var(--input-bg);${btnBase}">${window.IntMapLang.t(HOST.lang,'Copy name','地名をコピー','Namen kopieren','Копировать название','Copiar el nombre')}</button><button class="plc-wiki" style="display:none;background:var(--input-bg);${btnBase}">Wikipedia</button><button class="plc-ai" style="background:linear-gradient(135deg,rgba(106,90,205,0.30),rgba(30,144,255,0.30));${btnBase}">${de?'KI-Bericht':window.IntMapLang.t(HOST.lang,'AI brief','AI調査','KI-Kurzbericht','Обзор ИИ','Informe de IA')}</button>${isoBtn}${moveBtn}</div></div>`;
      try{ popup=GE().ui.attach(GE().ui.popup({closeButton:true,closeOnClick:false,maxWidth:'268px',className:'plc-popup'}).setLngLat(lngLat).setHTML(html));
        /* (#R59) draw this place's REAL boundary as a polygon (cities/towns/regions; NOT countries). IntMapOutline
           uses point-in-polygon (no fixed threshold → no far same-named place) and draws NOTHING if there is no real
           boundary (no ugly rectangle). The popup's × / click-away clears it (clearHL → IntMapOutline.clear). */
        if(!opts.noOutline){
          /* (#R122) the place-label click highlight uses the user's ACCENT colour (falls back to the default blue). */
          try{ if(window.IntMapOutline&&window.IntMapOutline.setColor){ const ac=(window.imAccent&&/^#[0-9a-fA-F]{6}$/.test(window.imAccent))?window.imAccent:'#0a84ff'; window.IntMapOutline.setColor(ac); } }catch(_){}
          if(opts.geojson){ try{ window.IntMapOutline && window.IntMapOutline.show && window.IntMapOutline.show(name,{geojson:opts.geojson,lng:lngLat.lng,lat:lngLat.lat,fit:false}); }catch(_){} }   /* (#R94m) caller-supplied polygon (historical era border) */
          else if(!isCountry){ try{ window.IntMapOutline && window.IntMapOutline.show && window.IntMapOutline.show(name,{lng:lngLat.lng,lat:lngLat.lat,fit:false}); }catch(_){} }
          /* (#R62) "国名のラベルをクリックしても国の範囲がハイライトされない" — countries now outline too, from the
             LOCAL countryGeo polygon (point-in-polygon; no network, no wrong-namesake risk). */
          else { try{ const cg=window.countryGeo; if(cg&&cg.features&&typeof turf!=='undefined'){ const pt=turf.point([lngLat.lng,lngLat.lat]);
            for(const f of cg.features){ try{ if(turf.booleanPointInPolygon(pt,f)){ window.IntMapOutline&&window.IntMapOutline.show&&window.IntMapOutline.show(name,{geojson:f.geometry,lng:lngLat.lng,lat:lngLat.lat,fit:false}); break; } }catch(_){} } } }catch(_){} }
        }
        setTimeout(()=>{ try{ const xb=document.querySelector('.plc-popup .maplibregl-popup-close-button'); if(xb) xb.addEventListener('click',()=>{ try{ clearHL(); }catch(_){} }); }catch(_){}
          const b=document.querySelector('.plc-copy'); if(b) b.onclick=()=>{ try{ navigator.clipboard.writeText(name); }catch(_){} b.textContent=window.IntMapLang.t(HOST.lang,'✓ Copied','✓ コピーしました','✓ Kopiert','✓ Скопировано','✓ Copiado'); };
          /* (#R20) Wikipedia button — shown only when an article actually EXISTS for this name
             (REST summary probe, CORS*). Opens the article in a new tab. */
          const w=document.querySelector('.plc-wiki');
          if(w){ const wl=({jp:'ja',de:'de',ru:'ru',es:'es'})[HOST.lang]||'en';   /* (#R108) all languages, not just ja/en */
            /* (#R94n) a historical entity passes an explicit Wikipedia title (opts.wiki: "German Empire",
               "Kingdom of Italy", "Qajar Iran"…) so the button opens the ERA article, not the modern namesake. */
            const wtitle=(opts&&opts.wiki)||name;
            const _probe=(lang,title)=>fetch('https://'+lang+'.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(String(title).replace(/ /g,'_'))).then(r=>r.ok?r.json():null).catch(()=>null);
            const _showW=(j)=>{ const url=j&&j.content_urls&&j.content_urls.desktop&&j.content_urls.desktop.page; if(url){ w.style.display='inline-block'; w.onclick=()=>{ try{ window.open(url,'_blank','noopener'); }catch(_){} }; return true; } return false; };
            /* (#R108) FIX "設定言語ではなく英語Wikipediaに飛ばされる": for a historical entity the passed title is
               ENGLISH, so a direct ja/de/ru/es probe with that title fails → it fell back to English. Resolve the
               CURRENT-language article title via the EN langlinks API first, then open that; only fall back to the
               English article when no langlink exists (fallback is acceptable per request). */
            const _langlink=(title)=>fetch('https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=langlinks&lllang='+wl+'&lllimit=1&titles='+encodeURIComponent(String(title).replace(/ /g,'_'))).then(r=>r.ok?r.json():null).then(j=>{ try{ const pg=j&&j.query&&j.query.pages; for(const k in pg){ const ll=pg[k].langlinks; if(ll&&ll[0]&&ll[0]['*']) return ll[0]['*']; } }catch(_){} return null; }).catch(()=>null);
            if(wl==='en'){ _probe('en',wtitle).then(_showW); }
            else if(opts&&opts.wiki){   /* historical: English title → localized via langlinks, else EN fallback */
              _langlink(wtitle).then(loc=>{ const t2=loc||wtitle; _probe(wl,t2).then(j=>{ if(!_showW(j)) _probe('en',wtitle).then(_showW); }); }); }
            else { /* modern place: name is already in the current language */ _probe(wl,wtitle).then(j=>{ if(_showW(j)) return; _probe('en',wtitle).then(_showW); }); } }
          /* (#R20) AI Research Assistant entry point */
          const ai=document.querySelector('.plc-ai');
          /* (#R224) Atlas is on demand — fetch it, and only fall back to the older research panel if
             the kernel genuinely cannot be had. Testing for the global would ALWAYS take the fallback. */
          if(ai) ai.onclick=()=>{ try{ if(window.IntMapAtlas){ window.IntMapAtlas.ensure().then(C=>{ try{ if(C&&C.brief) C.brief(name,lngLat); else if(window.IntMapAIResearch) window.IntMapAIResearch.open(name,lngLat); }catch(_){} }); } else if(window.IntMapAIResearch){ window.IntMapAIResearch.open(name,lngLat); } }catch(_){} };   /* (#R62) brief runs inside Atlas */
          /* (#R122) resolve the clicked place's polygon: the caller-supplied era border, else the outline this
             popup drew (works for sub-national regions / cities too), else the modern country polygon under the point. */
          const _placeGeo=()=>{ try{ if(opts&&opts.geojson&&/Polygon/.test(opts.geojson.type||'')) return opts.geojson;
              const c=window.IntMapOutline&&window.IntMapOutline.current&&window.IntMapOutline.current(); if(c&&c.geo&&/Polygon/.test(c.geo.type||'')) return c.geo; }catch(_){}
            try{ if(window.countryGeo&&typeof turf!=='undefined'){ const pt=turf.point([lngLat.lng,lngLat.lat]); for(const f of window.countryGeo.features){ try{ if(turf.booleanPointInPolygon(pt,f)) return f.geometry; }catch(_){} } } }catch(_){}
            return null; };
          /* the outline may still be loading (async Nominatim for a non-country) — resolve now or poll briefly */
          const _withGeo=(cb)=>{ let g=_placeGeo(); if(g){ cb(g); return; } let n=0; const iv=everyTick(tickKey('map-ui:with-geo'),200,()=>{ n++; const g2=_placeGeo(); if(g2){ stopTick(iv); cb(g2); } else if(n>15){ stopTick(iv); cb(null); } }); };   /* ⚠ serial: both buttons on this popup poll, and each popup builds its own */
          const iso=document.querySelector('.plc-iso');
          if(iso) iso.onclick=()=>{ _withGeo(g=>{ try{ popup&&popup.remove(); }catch(_){}
            /* (#R106/#R122) isolate the EXACT clicked shape — era polygon, outlined sub-national region, city, or the
               modern country — via enterGeom; only fall back to the point-based country path when no polygon exists. */
            try{ if(g&&window.IntMapIsolate&&window.IntMapIsolate.enterGeom){ window.IntMapIsolate.enterGeom(g,name); }
              else if(window.IntMapIsolate&&window.IntMapIsolate.enterAt){ window.IntMapIsolate.enterAt(lngLat.lng,lngLat.lat,name); } }catch(_){} }); };
          const mv=document.querySelector('.plc-move');
          if(mv) mv.onclick=()=>{ _withGeo(g=>{ if(!g){ try{ if(typeof imToast==='function') imToast(window.IntMapLang.t(HOST.lang,'No boundary available for this place','この場所の範囲が取得できませんでした','Für diesen Ort ist keine Grenze verfügbar','Для этого места нет границы','No hay límite disponible para este lugar')); }catch(_){} return; }
            try{ popup&&popup.remove(); }catch(_){} try{ window.IntMapOutline&&window.IntMapOutline.clear&&window.IntMapOutline.clear(); }catch(_){}
            try{ window.IntMapMoveShape&&window.IntMapMoveShape.start(g,name); }catch(_){} }); };
        },0);
      }catch(_){}
    }
    function highlight(lngLat,isCountry){ if(!ensureHL()) return; const set=(fc)=>{ try{ GE().layers.setSourceData('place-hl-src',fc); }catch(_){} };
      const dot={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[lngLat.lng,lngLat.lat]},properties:{}}]};
      if(!isCountry){ set(dot); return; }
      const fill=()=>{ try{ const cg=window.countryGeo; if(cg&&cg.features&&typeof turf!=='undefined'){ const pt=turf.point([lngLat.lng,lngLat.lat]);
          for(const f of cg.features){ try{ if(turf.booleanPointInPolygon(pt,f)){ set({type:'FeatureCollection',features:[{type:'Feature',geometry:f.geometry,properties:{}}]}); return; } }catch(_){} } } set(dot); }catch(_){ set(dot); } };
      if(typeof withCountries==='function'){ try{ withCountries(fill); }catch(_){ fill(); } } else fill();
    }
    /* (#R62) anchor the popup at the LABEL's own point (its symbol geometry), not the raw click position —
       "ポップアップの位置は、クリック地点に固定ではなく、地名ラベルの位置に固定に". Line-placed labels (rivers)
       have no single point, so those keep the click position. */
    function labelAnchor(f,e){ try{ const g=f&&f.geometry; if(g&&g.type==='Point'&&Array.isArray(g.coordinates)){ let lng=+g.coordinates[0]; const lat=+g.coordinates[1];
      if(isFinite(lng)&&isFinite(lat)){ try{ const c=e&&e.lngLat?e.lngLat.lng:lng; while(lng-c>180) lng-=360; while(lng-c<-180) lng+=360; }catch(_){} return {lng,lat}; } } }catch(_){} return e.lngLat; }
    /* ══ (#R207) A PLACE LABEL IS THE LOWEST-PRIORITY CLICK TARGET ═════════════════════════════════
       「地図上の他のものをクリックした際は、その下にある地名ラベルを同時にクリックした判定になることがある
        から、そうならないように。」

       MapLibre delivers a click to EVERY per-layer handler whose feature is under the pointer, in no
       particular order and with no notion of "on top". So a tap on a volcano, a quake, a live plane,
       a user pin, a news dot or a community marker also reached the city name drawn beneath it, and
       two things opened at once. #R122 fixed the same collision in the other direction (a label tap
       was also toggling the Köppen zone) by asking whether a label was under the point; this is that
       question turned around, and it is answered from the engine's own registry of click-wired layers
       (`events.clickLayers`) rather than from a hand-written list that every later round would have to
       remember to extend.

       ⚠ ONLY LAYERS THAT ARE NOT LABELS COUNT. The label layers are click-wired too, and a label
       yielding to another label would mean no label is ever clickable. */
    function _ownedByOther(pt){
      try{
        if(!pt||!GE().hasRenderer()) return false;
        const all=(GE().events.clickLayers?GE().events.clickLayers():[])
          .filter(id=>ALL_LBL.indexOf(id)<0)
          .filter(id=>{ try{ return !!GE().layers.get(id)&&GE().layers.getLayout(id,'visibility')!=='none'; }catch(_){ return false; } });
        if(!all.length) return false;
        const hit=GE().coords.queryRenderedFeatures(pt,{layers:all});
        return !!(hit&&hit.length);
      }catch(_){ return false; }
    }
    /* ══ (#R210) A LABEL DECIDES LAST, NOT FIRST ═══════════════════════════════════════════════════
       #R207's `_ownedByOther` only sees owners that registered a per-LAYER click handler. The ones
       that were still stealing the tap (aircraft, satellites, the seismic pickers, tsunami, the
       terrain brush, Street-View coverage) listen at MAP level and hit-test themselves, so no list
       of layer ids can contain them — see the note in js/geo-engine.js beside `_clickLayers`.
       Every listener for one click runs synchronously, so a microtask is exactly "after all of
       them": by the time this resolves, anyone who consumed the click has said so. There is no
       perceptible delay — it is the same frame — and the popup is skipped, not closed, so nothing
       flashes open first. */
    function _deferLabel(e,fn){
      const claimed=()=>{ try{ return !!(GE().events.clickClaimed&&GE().events.clickClaimed(e)); }catch(_){ return false; } };
      Promise.resolve().then(()=>{ if(claimed()) return; try{ fn(); }catch(_){} });
    }
    /* ══ ⚠⚠⚠ (#R252) THE POPUP NAMES THE PLACE TWICE: LOCALLY, AND AS THE MAP DREW IT ═══════════════
       「地名ラベルをクリックしたときに出るポップアップには、現地名に()で地名ラベルに表示されていた
         名前を併記して」

       The popup has always shown `name` — the OpenMapTiles LOCAL name — while the label beside it is
       drawn from whatever `text-field` js/place-labels.js resolved for the reader's language and
       「地名ラベル」 setting. So an English reader tapped 「Osaka Prefecture」 and got 「大阪府」, with
       nothing on screen connecting the two.

       ⚠ THE SECOND NAME IS COMPUTED FROM THE RENDERER'S OWN RULE, not from a copy of it. `applyLabelLang`
       builds `text-field` as `coalesce(OSM_NAME_KEYS(lang)…, name)` for the 「ui」 setting, a fixed
       en/latin/int chain for 「英語で」, and bare `name` for 「現地表記で」; `_labelShown` asks that same
       exported key list (`window.IntMapOsmNameKeys`) of ONE feature's properties. A second list of
       languages here is exactly the shape this project keeps paying for.
       ⚠ AND IT NEVER PRINTS A NAME TWICE. 「現地表記で」, a Japanese reader in Japan, or any place whose
       localised name IS its local name resolves to one string and the parentheses do not appear. */
    function _labelShown(p){
      try{
        const mode=window.imLabelLang||'ui';
        if(mode==='local') return String(p.name||'');
        const keys=(mode==='en')?['name:en','name:latin','name_int']
          :((window.IntMapOsmNameKeys&&window.IntMapOsmNameKeys(HOST.lang))||['name:en','name:latin','name_int']);
        for(let i=0;i<keys.length;i++){ const v=p[keys[i]]; if(v) return String(v); }
      }catch(_){}
      return String(p.name||'');
    }
    function _bothNames(p,name){
      try{ const local=String((p&&p.name)||''), shown=_labelShown(p||{});
        if(local&&shown&&shown!==local) return local+' ('+shown+')';
        return local||shown||name;
      }catch(_){ return name; }
    }
    function onLabel(isCountry){ return (e)=>{ if(!e.features||!e.features.length) return; if(_ownedByOther(e.point)) return; const p=e.features[0].properties||{}; const name=p.name||p['name:en']||p['name_en']||p.name_en||''; if(!name) return;
      /* (#R9/#12) The red area/dot highlight was unwanted — only the copyable popup remains. */
      const f=e.features[0];
      _deferLabel(e,()=>showPopup(labelAnchor(f,e),name,isCountry,{title:_bothNames(p,name)})); }; }
    /* (#R62) water / terrain labels are now clickable too (popup with Copy/Wikipedia/AI brief; NO highlight). */
    function onGeoLabel(){ return (e)=>{ if(!e.features||!e.features.length) return; if(_ownedByOther(e.point)) return; const f=e.features[0]; const p=f.properties||{};
      const gl=(({jp:'jp',de:'de',ru:'ru',es:'es'})[HOST.lang])||'en';
      const name=(f.layer&&f.layer.id==='geo-sea')?(p[gl]||p.en||''):(p.name||p['name:en']||p.name_en||''); if(!name) return;
      /* (#R252) the curated sea gazetteer has no endonym column, so only the tile-sourced water /
         river / peak labels can carry both names — those are `name` + the same `name:*` fields. */
      const both=(f.layer&&f.layer.id==='geo-sea')?name:_bothNames(p,name);
      _deferLabel(e,()=>{ showPopup(labelAnchor(f,e),name,false,{noOutline:true,noAreaTools:true,title:both});
        /* (#R217) the whole property bag, not the one name the popup shows — see js/river-course.js */
        if(f.layer&&f.layer.id==='ofm-river') highlightRiver(p,e.lngLat); }); }; }   /* (#R123) water/terrain = no area → no Isolate/Move */
    /* ══ (#R201) THE ADMIN-1 LABEL IS A PLACE LABEL, SO IT IS ONE HERE TOO ═══════════════════════════
       「クリック可能ではない！ほかの地名ラベルと違う挙動にするな！」 #R198 added `ofm-admin1` (prefectures,
       states, provinces) as NAMES only and wrote down that leaving it out of these lists was deliberate.
       It was the wrong call: a prefecture name looks exactly like a city name on the map, so a tap that
       does nothing reads as a broken label rather than as a decision. It joins every list in this
       function — the per-layer click, the cursor, the exact-hit query and the padded-tap fallback — with
       `onLabel(false)`, which is what `ofm-city` and `ofm-other` already get: the same popup, the same
       Copy / Wikipedia / AI brief / Isolate / Move row, and the same real boundary from IntMapOutline
       (a region HAS an area, so the area tools are not suppressed the way water/terrain labels are). */
    const PLACE_LBL=['ofm-country','ofm-admin1','ofm-city','ofm-other'];
    const ALL_LBL=PLACE_LBL.concat(['geo-sea','ofm-water','ofm-water2','ofm-river','ofm-peak']);
    function wire(){ if(wired) return; if(!GE().layers.has('ofm-country')) return; wired=true;
      GE().events.onLayer('click','ofm-country',onLabel(true)); GE().events.onLayer('click','ofm-admin1',onLabel(false)); GE().events.onLayer('click','ofm-city',onLabel(false)); GE().events.onLayer('click','ofm-other',onLabel(false));
      ['geo-sea','ofm-water','ofm-water2','ofm-river','ofm-peak'].forEach(id=>{ try{ GE().events.onLayer('click',id,onGeoLabel()); }catch(_){} });
      ALL_LBL.forEach(id=>{ GE().events.onLayer('mouseenter',id,()=>{ GE().render.canvas().style.cursor='pointer'; }); GE().events.onLayer('mouseleave',id,()=>{ GE().render.canvas().style.cursor=''; }); });
      /* clicking the map away from any label clears the highlight */
      /* (#R210) …and the padded fallback runs in the SAME microtask defer as the per-layer path.
         Checking `clickClaimed` synchronously here would be a coin-flip on listener registration
         order: js/data-layers.js registers the aircraft click handler when the layer is switched
         on, which is usually AFTER this one. Deferring makes the order irrelevant. */
      GE().events.on('click',(e)=>{ _deferLabel(e,()=>{ try{
        const ls=ALL_LBL.filter(id=>GE().layers.get(id)); if(!ls.length) return;
        /* (#R207) the padded fallback below is a SECOND way into the same popup, so it needs the same
           rule — a tap that landed on a marker must not open the nearest place name instead. */
        if(_ownedByOther(e.point)){ clearHL(); return; }
        const hit=GE().coords.queryRenderedFeatures(e.point,{layers:ls});
        if(hit.length) return;   /* exact glyph hit → the per-layer onLabel handler already opened the popup */
        /* (#R23) PADDED hit-box: a finger tap almost never lands on the exact label glyph, so the popup
           "モバイル版では出ない". Re-query a small box around the tap (bigger on touch) and open the nearest
           label's popup. Skipped while a measurement/draw tool owns the gesture. */
        if(typeof HOST.toolMode==='undefined' || !HOST.toolMode){
          const pad=(typeof isMobile==='function'&&isMobile())?15:6;
          const near=GE().coords.queryRenderedFeatures([[e.point.x-pad,e.point.y-pad],[e.point.x+pad,e.point.y+pad]],{layers:ls});
          if(near.length){ const lid=(near[0].layer&&near[0].layer.id)||''; const p=near[0].properties||{}; const geoLbl=/^(geo-sea|ofm-water|ofm-river|ofm-peak)$/.test(lid);
            const gl=(({jp:'jp',de:'de',ru:'ru',es:'es'})[HOST.lang])||'en';
            const nm=(lid==='geo-sea')?(p[gl]||p.en||''):(p.name||p['name:en']||p.name_en||p['name_en']||'');
            /* (#R252) the padded tap is the same click, so it gets the same two-name heading */
            const ttl=(lid==='geo-sea')?nm:_bothNames(p,nm);
            if(nm){ showPopup(labelAnchor(near[0],e),nm,lid==='ofm-country',geoLbl?{noOutline:true,noAreaTools:true,title:ttl}:{title:ttl});
              if(lid==='ofm-river') highlightRiver(p,e.lngLat);   /* (#R210) the padded tap is the same click */
              return; } }
        }
        clearHL();
      }catch(_){} }); });
    }
    function tryWire(n){ if(GE().layers.has('ofm-country')){ wire(); return; } if((n||0)<300) setTimeout(()=>tryWire((n||0)+1),200); }
    if(_imCanDraw()) tryWire(0); else GE().events.on('load',()=>tryWire(0));
    /* (#R101) RE-ARM the label-click wiring on every style/source update. The old bounded 12 s retry could give up
       before the (sometimes slow) OpenFreeMap label layers finished loading — and because BOTH the per-layer
       handlers AND the padded-hit fallback live inside wire(), that left place-name labels completely UNCLICKABLE
       in the present (and past). styledata fires whenever the ofm source settles / after a basemap swap, so wire()
       now binds the moment ofm-country exists, however late. Also re-creates the highlight layers after a swap. */
    GE().events.on('styledata',()=>{ if(!wired){ try{ tryWire(0); }catch(_){} } setTimeout(()=>{ try{ ensureHL(); }catch(_){} }, 120); });
    /* (#R94m) EXACT same reaction for historical labels: reuse this place popup (Copy/Wikipedia/AI brief/Isolate
       + blue outline). `geojson` lets the caller outline the era polygon (an empire, not just one modern country). */
    window._imPlacePopup=(lngLat,name,isCountry,opts)=>{ try{ showPopup(lngLat,name,isCountry,opts); }catch(_){} };
  })();
};

window.IntMapModules.geojsonUpload=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const imToast=HOST.imToast;
  (function(){
    if(!GE().hasRenderer()) return;
    let seq=0; const items=[]; let listEl=null;
    const PALETTE=['#ff9500','#34c759','#5856d6','#ff2d55','#00b8d4','#ffcc00','#af52de','#0a84ff'];
    const jp=()=>HOST.lang==='jp';
    const toast=(m)=>{ try{ imToast(m); }catch(_){} };
    const fileInput=document.createElement('input'); fileInput.type='file'; fileInput.accept='.geojson,.json,application/geo+json,application/json'; fileInput.multiple=true; fileInput.style.display='none'; document.body.appendChild(fileInput);
    function toFC(g){ if(!g||typeof g!=='object') return null;
      if(g.type==='FeatureCollection' && Array.isArray(g.features)) return g;
      if(g.type==='Feature') return {type:'FeatureCollection',features:[g]};
      if(g.type && g.coordinates) return {type:'FeatureCollection',features:[{type:'Feature',geometry:g,properties:{}}]};
      if(Array.isArray(g.features)) return {type:'FeatureCollection',features:g.features};
      return null; }
    function fit(fc){ try{ if(typeof turf!=='undefined'){ const bb=turf.bbox(fc); if(bb.every(isFinite) && bb[0]>=-180 && bb[2]<=180) GE().camera.fitBounds([[bb[0],bb[1]],[bb[2],bb[3]]],{padding:60,duration:900,maxZoom:12}); } }catch(_){} }
    function addFC(fc,name){
      const n=++seq, sid='ugj-'+n, col=PALETTE[(n-1)%PALETTE.length];
      try{ GE().layers.addSource(sid,{type:'geojson',data:fc}); }catch(e){ toast(window.IntMapLang.t(HOST.lang,"Failed to add layer","読み込みに失敗しました","Ebene konnte nicht hinzugefügt werden","Не удалось добавить слой","No se pudo añadir la capa")); return; }
      const before = GE().layers.has('tool-poly')?'tool-poly':undefined;
      try{
        GE().layers.add({id:sid+'-fill',type:'fill',source:sid,filter:['==','$type','Polygon'],paint:{'fill-color':col,'fill-opacity':0.22}},before);
        GE().layers.add({id:sid+'-line',type:'line',source:sid,filter:['in','$type','Polygon','LineString'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':col,'line-width':2.2}},before);
        GE().layers.add({id:sid+'-pt',type:'circle',source:sid,filter:['==','$type','Point'],paint:{'circle-radius':5,'circle-color':col,'circle-stroke-color':'#fff','circle-stroke-width':1.4}},before);
      }catch(_){}
      items.push({n,sid,name,col}); renderList(); fit(fc);
      try{ window._imNoteObjects&&window._imNoteObjects(['up_'+n]); }catch(_){}   /* (#R120) uploads join Atlas's "さっき作ったやつ" deixis */
      toast((window.IntMapLang.t(HOST.lang,"GeoJSON added: ","GeoJSONを表示: ","GeoJSON hinzugefügt: ","GeoJSON добавлен: ","GeoJSON añadido: "))+name);
    }
    function removeItem(n){ const i=items.findIndex(x=>x.n===n); if(i<0) return; const it=items[i];
      [it.sid+'-fill',it.sid+'-line',it.sid+'-pt'].forEach(l=>{ try{ if(GE().layers.has(l)) GE().layers.remove(l); }catch(_){} });
      try{ if(GE().layers.hasSource(it.sid)) GE().layers.removeSource(it.sid); }catch(_){}
      items.splice(i,1); renderList(); }
    function renderList(){ if(!listEl) return;
      listEl.innerHTML=items.map(it=>`<div style="display:flex;align-items:center;gap:6px;font-size:11px;padding:2px 0;"><span style="width:11px;height:11px;border-radius:3px;background:${it.col};flex:0 0 auto;"></span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${String(it.name).replace(/[<>&]/g,'')}</span><button data-rm="${it.n}" title="${window.IntMapLang.t(HOST.lang,"Remove","削除","Entfernen","Удалить","Quitar")}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:13px;line-height:1;">×</button></div>`).join('');
      listEl.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>removeItem(+b.getAttribute('data-rm'))); }
    function handleFiles(files){ Array.from(files||[]).forEach(f=>{ const r=new FileReader();
      r.onload=()=>{ let g=null; try{ g=JSON.parse(r.result); }catch(_){ toast(window.IntMapLang.t(HOST.lang,"Could not parse JSON","JSONの解析に失敗しました","JSON konnte nicht gelesen werden","Не удалось разобрать JSON","No se pudo analizar el JSON")); return; }
        const fc=toFC(g); if(!fc||!fc.features||!fc.features.length){ toast(window.IntMapLang.t(HOST.lang,"Not valid GeoJSON","有効なGeoJSONではありません","Kein gültiges GeoJSON","Некорректный GeoJSON","GeoJSON no válido")); return; }
        addFC(fc, f.name||'GeoJSON'); };
      r.readAsText(f); }); }
    fileInput.addEventListener('change',()=>{ handleFiles(fileInput.files); fileInput.value=''; });
    function mountButton(){ const dd=document.getElementById('layer-dropdown'); if(!dd||document.getElementById('btn-upload-geojson')) return;
      const wrap=document.createElement('div'); wrap.id='ugj-mount'; wrap.style.marginTop='6px';
      wrap.innerHTML=`<hr style="border:0;border-top:1px solid rgba(128,128,128,0.2);width:100%;margin:6px 0;"><button id="btn-upload-geojson" class="ai-test-btn" style="width:100%;">📂 <span data-i18n="uploadGeoJSON">Upload GeoJSON</span></button><div id="ugj-list" style="margin-top:5px;"></div>`;
      dd.appendChild(wrap); listEl=wrap.querySelector('#ugj-list');
      wrap.querySelector('#btn-upload-geojson').onclick=()=>fileInput.click();
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} }
    mountButton(); setTimeout(mountButton,1500);
    const mc=document.getElementById('map-container');
    if(mc){ mc.addEventListener('dragover',e=>{ if(e.dataTransfer&&Array.from(e.dataTransfer.types||[]).includes('Files')) e.preventDefault(); });
      mc.addEventListener('drop',e=>{ if(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files.length){ e.preventDefault(); handleFiles(e.dataTransfer.files); } }); }
    window.GeoJSONUpload={ open:()=>fileInput.click(), add:addFC, remove:removeItem, _items:items };   /* (#R88) expose remove so the universal Object List can delete an uploaded layer */
  })();
};

window.IntMapModules.viewHash=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */

  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  (function(){
    if(!GE().hasRenderer()) return;
    let restoring=false, t=null;
    /* ══ ⚠⚠⚠ (#R244) THE URL THE READER OPENED IS READ ONCE, BEFORE ANYTHING CAN OVERWRITE IT ═══════
       「再読み込み時に情報が保持されなくなっている。」

       MEASURED: open `…#v=2.3522,48.8566,6.00,0,0,g&l=dl-subcables`, and one second later the address
       bar reads `#v=-84.7787,20.0000,1.70,0,0,g&l=…` — the DEFAULT view — and the map is at the
       default. `sessionStorage.intmap_restore_try`, which `markAttempt` writes from inside
       `restore()`, held the DEFAULT hash too: by the time the restorer looked, the hash it was
       supposed to restore was already gone.

       The writer is `save()` in this same closure. It is armed on `moveend` with a 400 ms timer,
       and the restorer waits for the renderer — `GE().events.on('load',restore)` — so on any load
       where the initial camera settles before the style finishes, the sequence is
           moveend → save() (writes the DEFAULT camera over the hash) → load → restore() (reads it).
       `restoring` cannot help: it is only set once `restore` has started, i.e. after the damage.
       That is [[intmap-recurring-lessons]] G one level up — TWO things own the hash, and the one
       that writes runs first.

       ⚠ TWO LATCHES, AND THE FIRST ONE IS THE FIX. `BOOT_HASH` is the address the document was
       opened with, captured at evaluation time, and it is what a boot restore parses — so even a
       writer that beats the restorer cannot cost the reader their state. `booted` then says 「the
       boot restore has had its turn」, and nothing is written to the address bar before it is true,
       so the URL a reader shares is never a default that overwrote their own. The backstop timer
       exists because `load` may already have fired when this module is evaluated, in which case
       `on('load',…)` never calls back and the hash would freeze for the whole session. */
    const BOOT_HASH=(function(){ try{ return location.hash||''; }catch(_){ return ''; } })();
    let booted=false, bootDone=false, bootRan=false;
    /* (#R42b) Per-TAB flag: true on the FIRST load of a tab (a fresh open / a shared link / a copied address
       bar opened on another device), false on a plain RELOAD of the same tab. sessionStorage survives reload
       but is absent in a new tab. This lets a shared/opened URL restore the FULL state while a reload of your
       own tab stays clean (the R33 "落ちても通常の初期時に" intent) — WITHOUT the old self=1 marker, so the
       address bar is now itself a complete, copy-and-share link. */
    let firstLoad; try{ firstLoad = (sessionStorage.getItem('intmap_session')!=='1'); sessionStorage.setItem('intmap_session','1'); }catch(_){ firstLoad=null; }
    /* ══ (#R211) A RELOAD NOW COMES BACK TO WHERE YOU WERE — WITH ONE WAY OUT ══════════════════════
       「あわせてリロード時にできる限り元の状態へ復帰。」

       ⚠ THIS REVERSES #R33 ON PURPOSE, AND THE REASON #R33 EXISTED IS STILL REAL. #R33 made a reload
       return to a clean map so that a layer which brings the app down cannot be restored into the
       same crash on every reload — 「落ちても通常の初期時に」. Simply restoring everything would put
       that trap back. So the full restore is attempted, and the attempt is RECORDED before it runs:
       `intmap_restore_try` holds the hash being restored and is cleared once the session has stayed
       up for six seconds. If a load starts and finds that marker still set for the SAME hash, the
       previous attempt did not survive, and this one falls back to the view alone.
       Net effect: a reload reproduces the session; a reload after a crash reproduces the map only. */
    let crashed=false;
    try{ const prev=sessionStorage.getItem('intmap_restore_try');
      crashed=!!(prev&&prev===location.hash&&location.hash); }catch(_){}
    function markAttempt(h){ try{ sessionStorage.setItem('intmap_restore_try',h||location.hash);
      setTimeout(()=>{ try{ sessionStorage.removeItem('intmap_restore_try'); }catch(_){} },6000); }catch(_){} }

    /* ══ (#R211) THE SIMULATORS' OWN NUMBERS TRAVEL TOO ═══════════════════════════════════════════
       「シミュレーションに入力された数値まで共有して同じ状態で開ける。」
       A registry rather than a list, because the alternative is this file knowing the field names of
       every simulator — which is the coupling #R178 spent a round removing. A module registers a
       `get()` that returns a small JSON-able object (or null when it has nothing to say) and a
       `set(v)` that applies one. Everything registered is packed into ONE `s=` parameter. */
    const SIMS=Object.create(null); let PENDING=null;
    window.IntMapShareState={
      /* ⚠ THE KEY IS THE LAZY-MODULE NAME where the simulator has one. Most of these panels are
         fetched on demand (#R209), so at restore time the module that owns the state does not exist
         yet — and a state that silently does not arrive is this project's most expensive recurring
         defect. So `apply` (a) asks IntMapLazy for the module by that name, and (b) KEEPS the value:
         whatever registers later gets its own entry handed to it on registration. */
      register(key,io){ if(!(key&&io&&typeof io.get==='function'&&typeof io.set==='function')) return this;
        SIMS[key]=io;
        if(PENDING&&PENDING[key]!==undefined){ try{ io.set(PENDING[key]); }catch(_){} }
        return this; },
      collect(){ const o={}; Object.keys(SIMS).forEach(k=>{ try{ const v=SIMS[k].get(); if(v!=null) o[k]=v; }catch(_){} });
        return Object.keys(o).length?o:null; },
      apply(o){ if(!o) return; PENDING=Object.assign(PENDING||{},o);
        Object.keys(o).forEach(k=>{
          if(SIMS[k]){ try{ SIMS[k].set(o[k]); }catch(_){} return; }
          try{ const p=window.IntMapLazy&&window.IntMapLazy.need(k); if(p&&p.catch) p.catch(()=>{}); }catch(_){} }); },
      pending(){ return PENDING; },
      keys(){ return Object.keys(SIMS); } };
    /* ⚠⚠ (#R214) A MODULE THAT LOADS BEFORE THIS FILE COULD NOT REGISTER, AND SAID NOTHING.
       Every `register` call site is `try{ window.IntMapShareState&&…register(…) }catch(_){}` — which
       is correct for a module that may run without a map, and is ALSO a silent no-op for one that
       simply ran first. MEASURED: with the six simulators registering themselves, `keys()` after boot
       held sun / disaster / radiation but NOT drone — js/drone-nav.js is evaluated before this file,
       so its call saw `undefined` and the `&&` swallowed it. That is #R162's trap exactly: the
       feature does not break, it is never there. So a module may leave its entry HERE instead, and
       this drains whatever arrived early. Load order stops being something anybody has to know. */
    try{ const early=window._imShareEarly; if(Array.isArray(early)){
      early.splice(0).forEach(e=>{ try{ window.IntMapShareState.register(e[0],e[1]); }catch(_){} }); } }catch(_){}
    try{ window._imShareEarly={ push(e){ try{ window.IntMapShareState.register(e[0],e[1]); }catch(_){} } }; }catch(_){}
    /* base64url of the JSON — short enough for an address bar, and opaque so nobody hand-edits it */
    function packSims(){ try{ const o=window.IntMapShareState.collect(); if(!o) return '';
      const b=btoa(unescape(encodeURIComponent(JSON.stringify(o))));
      return b.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }catch(_){ return ''; } }
    function unpackSims(s){ try{ const b=s.replace(/-/g,'+').replace(/_/g,'/');
      return JSON.parse(decodeURIComponent(escape(atob(b)))); }catch(_){ return null; } }
    function activeLayers(){ const ids=new Set(); try{
      /* (#R40) capture EVERY data-layer checkbox convention so the share link carries ALL selected layers
         (previously only dl-* / geo-layer-cb → GIBS gx-*, eco-dl-*, round-9 l9-dl-*, beta-dl-* were lost). */
      document.querySelectorAll('input[id^="dl-"]:checked, input[id^="gx-"]:checked, input[id^="eco-dl-"]:checked, input[id^="l9-dl-"]:checked, input[id^="beta-dl-"]:checked, input[id^="wp-dl-"]:checked, #r7-dl-disputes:checked, #r7-dl-airdef:checked, #r7-dl-langs:checked').forEach(cb=>{ const k=cb.id||cb.getAttribute('data-layer'); if(k) ids.add(k); });
    }catch(_){} return Array.from(ids); }
    function encode(){ try{ const c=GE().camera.getCenter(); const v=[c.lng.toFixed(4),c.lat.toFixed(4),GE().camera.getZoom().toFixed(2),Math.round(GE().camera.getBearing()),Math.round(GE().camera.getPitch()),(HOST.proj==='globe'?'g':'f')].join(',');
      const ls=activeLayers(); let h='#v='+v; if(ls.length) h+='&l='+ls.join(',');
      /* (#R101) time-travel state saved as the kernel's ISO instant (mode-independent — the slider is now year-based),
         so a shared link reproduces the exact moment; compare state too. */
      try{ const T=window.IntMapTime; if(T&&T.state){ const s=T.state(); if(s&&!s.isLive&&s.iso) h+='&tt='+encodeURIComponent(s.iso); } }catch(_){}
      try{ const cw=document.getElementById('compare-window'); if(cw && getComputedStyle(cw).display!=='none') h+='&cmp='+(cw.classList.contains('cmp-xray')?'x':'1'); }catch(_){}
      /* (#R42) satellite base view too, so "今の状態をそのまま" share/restore reproduces Map-vs-Satellite. */
      try{ if(typeof HOST.mapType!=='undefined' && HOST.mapType==='sat') h+='&sat=1'; }catch(_){}
      /* (#R211) 「視点の高度と角度」 — bearing and pitch were already in `v`; 3-D terrain was not, and
         without it the same zoom/pitch produces a flat scene where the shared one had relief. */
      try{ if(HOST.terrain3D) h+='&t3=1'; }catch(_){}
      /* (#R211) …and every simulator's own inputs, in one opaque parameter (see IntMapShareState). */
      try{ const s=packSims(); if(s) h+='&s='+s; }catch(_){}
      return h; }catch(_){ return ''; } }
    /* (#R23) never persist layers while the intro AUTO-demo is toggling them — otherwise a demo layer
       lands in the URL hash and gets restored on the next load, so a layer the user never chose appears
       on its own ("なにも操作していないのに勝手にレイヤーがオンになる"). */
    /* (#R33→#R42b) The R33 "reload returns clean" intent ("落ちても通常の初期時に") used a self=1 URL marker,
       but that made the address bar non-shareable (copying it lost the layers). R42b drops the marker and writes
       the FULL state straight to the address bar — so the URL is itself a complete copy-and-share link — while
       the SAME reload-clean behaviour is preserved via the per-tab `firstLoad` sessionStorage flag (a reload of
       your own tab restores the view only; a fresh open / shared link / same-tab paste restores everything). */
    /* (#R244) …and nothing is written until the boot restore has had its turn — see BOOT_HASH */
    function save(){ if(!booted || restoring || window._imDemoActive) return; const h=encode(); if(!h) return; try{ history.replaceState(null,'',location.pathname+location.search+h); }catch(_){} }
    /* (#R42b) restore. The VIEW (center/zoom/bearing/pitch/projection) is ALWAYS restored. The FULL state
       (layers + time-travel + compare + base map, EXACTLY) is restored when this is a shared/explicit open —
       i.e. a hashchange navigation (opts.shared, e.g. pasting a link in the same tab) OR the first load of the
       tab (firstLoad: a new tab / another device / a copied link). A plain RELOAD of the same tab restores the
       view only (R33). Legacy self=1 links still fully restore (firstLoad handles them). */
    function restore(opts){
      /* ⚠ (#R244) THE BOOT PASS PARSES THE ADDRESS THE DOCUMENT WAS OPENED WITH, not whatever is in
         the bar by the time the renderer got round to calling back — see BOOT_HASH above. A hash
         NAVIGATION (`opts.shared`) is a new intention and reads the live value, as it must. */
      const H=(opts&&opts.shared===true)?location.hash:(bootDone?location.hash:BOOT_HASH);
      const m=/[#&]v=([^&]+)/.exec(H); if(!m){ booted=true; return; } restoring=true;
      /* (#R211) a plain reload restores everything too — unless the previous attempt at this very
         hash did not survive, in which case only the view comes back (see `crashed` above). */
      const full = (!!(opts&&opts.shared===true) || firstLoad!==false || !crashed);
      if(full) markAttempt(H);
      try{ const p=decodeURIComponent(m[1]).split(','); const lng=+p[0],lat=+p[1],z=+p[2],br=+p[3]||0,pi=+p[4]||0,proj=p[5];
        if(proj==='f'&&HOST.proj!=='flat'){ const b=document.getElementById('btn-view-flat'); if(b) b.click(); }
        else if(proj==='g'&&HOST.proj!=='globe'){ const b=document.getElementById('btn-view-globe'); if(b) b.click(); }
        if(isFinite(lng)&&isFinite(lat)) GE().camera.jumpTo({center:[lng,lat],zoom:isFinite(z)?z:2,bearing:br,pitch:pi});
        /* satellite base view: switch ON if wanted; on a FULL restore also switch back to Map if NOT wanted (so a
           shared link reproduces the base exactly, e.g. pasting a no-sat link over a satellite session). */
        try{ const wantSat=/[#&]sat=1/.test(H);
          if(wantSat){ const sb=document.getElementById('btn-view-sat'); if(sb&&typeof HOST.mapType!=='undefined'&&HOST.mapType!=='sat') setTimeout(()=>{ try{ sb.click(); }catch(_){} },300); }
          else if(full){ const mb=document.getElementById('btn-view-map'); if(mb&&typeof HOST.mapType!=='undefined'&&HOST.mapType==='sat') setTimeout(()=>{ try{ mb.click(); }catch(_){} },300); } }catch(_){}
      }catch(_){}
      if(full){
        const lm=/[#&]l=([^&]+)/.exec(H);
        const want=lm?decodeURIComponent(lm[1]).split(','):[]; const wantSet=new Set(want);
        /* ⚠ (#R409) A LINK THAT NAMES THE ROW THAT NO LONGER EXISTS OPENS THE TWO THAT REPLACED IT.
           「WW1とWW2でレイヤーを分けろ。」 split `dl-wars` into `dl-ww1` and `dl-ww2`; every link
           shared, bookmarked or restored from a session tab before that names the old id, and the
           loop below resolves ids by getElementById — so without this it would silently open
           nothing and then, one line further down, be treated as «not wanted» and close the rest.
           Renaming a control is not a reason to break the links people already sent each other. */
        if(wantSet.has('dl-wars')){ wantSet.delete('dl-wars');
          for(const k of ['dl-ww1','dl-ww2']){ if(!wantSet.has(k)){ wantSet.add(k); want.push(k); } }
          const i=want.indexOf('dl-wars'); if(i>=0) want.splice(i,1); }
        /* ⚠ (#R439) …AND THE SAME FOR THE ISOBARS, WHICH ARE NOT A ROW ANY MORE. 「等圧線レイヤーを
           取り込み」 moved that switch into the sea-level-pressure legend, so a link that names
           `dl-ec-isobars` resolves to nothing. It means 「pressure, with contours」 and it is opened
           as exactly that: the raster's row plus the switch, through the one door the legend box
           and Atlas also use. ⚠ The switch is set LATE, with `apply`, because the module that owns
           it is only wired once the layer has been turned on. */
        if(wantSet.has('dl-ec-isobars')){ wantSet.delete('dl-ec-isobars');
          if(!wantSet.has('dl-ec-slp')){ wantSet.add('dl-ec-slp'); want.push('dl-ec-slp'); }
          const i=want.indexOf('dl-ec-isobars'); if(i>=0) want.splice(i,1);
          [900,2000,3400].forEach(ms=>setTimeout(()=>{ try{ window._imWxIsobars&&window._imWxIsobars(true); }catch(_){} },ms)); }
        const DATASEL='input[id^="dl-"]:checked, input[id^="gx-"]:checked, input[id^="eco-dl-"]:checked, input[id^="l9-dl-"]:checked, input[id^="beta-dl-"]:checked, input[id^="wp-dl-"]:checked, #r7-dl-disputes:checked, #r7-dl-airdef:checked, #r7-dl-langs:checked';
        const apply=()=>{
          /* ⚠ (#R225) A RETIRED KEY MUST STOP BEING READ, NOT MERELY STOP BEING WRITTEN. `activeLayers()` no
             longer WRITES `.geo-layer-cb` keys into the hash, but a link (or an address bar) saved months
             ago still CARRIES them — and this loop resolving them by `data-layer` is precisely how the nine
             geopolitics layers kept switching themselves on («大昔に捨てたはずの地政学レイヤーが勝手にオンに
             なる»). Only ids are resolved now, so a retired key finds nothing. */
          want.forEach(k=>{ const cb=document.getElementById(k); if(cb&&!cb.checked){ cb.checked=true; cb.dispatchEvent(new Event('change',{bubbles:true})); } });
          /* turn OFF any data layer NOT in the link so the shared state is reproduced EXACTLY (matters when a
             link is pasted into a tab that already had layers on). Base toggles (names/borders/…) are untouched. */
          document.querySelectorAll(DATASEL).forEach(cb=>{ const k=cb.id||cb.getAttribute('data-layer'); if(k && !wantSet.has(k)){ cb.checked=false; cb.dispatchEvent(new Event('change',{bubbles:true})); } });
        };
        [700,1800,3200].forEach(ms=>setTimeout(apply,ms));
        /* (#R101) restore time-travel via the kernel (mode-independent). `tt`=ISO instant; keep `ts` (old day-based
           links) for backward compatibility. */
        const tt=/[#&]tt=([^&]+)/.exec(H);
        if(tt){ setTimeout(()=>{ try{ const d=new Date(decodeURIComponent(tt[1])); if(!isNaN(d.getTime())&&window.IntMapTime) window.IntMapTime.set(d,{source:'ui'}); }catch(_){} },900); }
        else { const tm=/[#&]ts=(\d+)/.exec(H);
          if(tm){ setTimeout(()=>{ try{ if(window.IntMapTime) window.IntMapTime.setDaysAgo(3650-parseInt(tm[1],10),{source:'ui'}); }catch(_){} },900); } }
        /* (#R211) 3-D terrain, then the simulators' own numbers. The sims go LAST and late: several
           of them are lazy modules that are only fetched when their layer or panel is asked for, so
           applying at 900 ms would reach a module that does not exist yet. Each `set` is expected to
           no-op safely when its module is absent (they all guard). */
        try{ if(/[#&]t3=1/.test(H)){ const tb=document.getElementById('btn-terrain-3d')||document.getElementById('setting-terrain-3d');
          if(tb) setTimeout(()=>{ try{ if(tb.type==='checkbox'){ if(!tb.checked){ tb.checked=true; tb.dispatchEvent(new Event('change',{bubbles:true})); } } else tb.click(); }catch(_){} },1200); } }catch(_){}
        const sm=/[#&]s=([^&]+)/.exec(H);
        if(sm){ const obj=unpackSims(sm[1]);
          if(obj) [1500,4000].forEach(ms=>setTimeout(()=>{ try{ window.IntMapShareState.apply(obj); }catch(_){} },ms)); }
        const cm2=/[#&]cmp=([^&]+)/.exec(H);
        if(cm2){ setTimeout(()=>{ try{ window.IntMapCompare&&window.IntMapCompare.open(); if(cm2[1]==='x'){ setTimeout(()=>{ const xb=Array.from(document.querySelectorAll('#compare-window .cmp-btn')).find(b=>/x-ray/i.test(b.textContent)); if(xb) xb.click(); },700); } }catch(_){} },1300); }
      }
      setTimeout(()=>{ restoring=false; },3500);
      booted=true;   /* (#R244) the boot restore has read the address — the bar may be written now */
    }
    GE().events.on('moveend',()=>{ clearTimeout(t); t=setTimeout(save,400); });
    /* (#R42b) ROOT CAUSE of "コピーしたリンクを開いてもそのままにならない": pasting a link into the SAME tab is a
       hash-only navigation — no reload — so restore() never re-ran. history.replaceState (used by save) does NOT
       fire hashchange, so this can't loop. Re-run a FULL restore on any user hash navigation to a state link. */
    window.addEventListener('hashchange',()=>{ try{ if(restoring) return; if(/[#&]v=/.test(location.hash)) restore({shared:true}); }catch(_){} });
    /* (#R16) GHOST-LAYER fix: the hash (which restore() re-applies on reload) used to update ONLY on pan,
       so toggling a layer OFF without panning left it in the hash → it "came back" on the next/crash reload
       ("表示を辞めたはずのレイヤーが残り続ける"). Persist the hash on EVERY layer change so the restored set
       always matches what's actually on. */
    document.addEventListener('change',(e)=>{ const el=e.target; if(el && (el.id&&/^dl-/.test(el.id) || (el.classList&&el.classList.contains('geo-layer-cb')))){ clearTimeout(t); t=setTimeout(save,300); } });
    /* ⚠ (#R244) ONE boot pass, whichever way the renderer becomes ready — and a backstop, because
       `load` may already have fired when this module is evaluated, in which case `on('load',…)`
       never calls back and `booted` would stay false for the whole session (the address bar would
       stop following the map). `bootDone` makes the three entries idempotent. */
    const _boot=()=>{ if(bootRan) return; bootRan=true; try{ restore(); }catch(_){} bootDone=true; booted=true; };
    if(_imCanDraw()) _boot(); else { GE().events.on('load',_boot); setTimeout(_boot,8000); }
    window.IntMapBookmark={ link:()=>location.origin+location.pathname+location.search+encode(), save:save, restore:restore };
  })();
};

window.IntMapModules.share=function(HOST){
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const t=HOST.t;
  window.IntMapShare=(function(){
    const L=window.IntMapLang.pick(()=>HOST.lang);
    let panel=null, styled=false;
    function ensureStyle(){ if(styled) return; styled=true; const s=document.createElement('style');
      s.textContent='#share-panel{position:absolute;z-index:1800;left:50%;top:80px;transform:translateX(-50%);width:min(440px,calc(100vw - 24px));background:var(--popup-bg);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.2));border-radius:16px;box-shadow:var(--shadow);backdrop-filter:saturate(180%) blur(18px);-webkit-backdrop-filter:saturate(180%) blur(18px);padding:16px 18px;font-size:13px;}'
        +'#share-panel h4{margin:0 0 4px;font-size:15px;font-weight:700;}'
        +'#share-panel .sh-x{position:absolute;top:10px;right:12px;background:none;border:none;color:var(--text-muted);font-size:20px;line-height:1;cursor:pointer;padding:2px 7px;border-radius:8px;}'
        +'#share-panel .sh-x:hover{background:var(--input-bg);color:var(--text-main);}'
        +'#share-panel .sh-row{display:flex;gap:8px;margin-top:12px;}'
        +'#share-panel .sh-url{flex:1;min-width:0;height:40px;padding:0 12px;border-radius:11px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);font-size:12px;box-sizing:border-box;}'
        +'#share-panel .sh-btn{flex:0 0 auto;height:40px;padding:0 16px;border:none;border-radius:11px;background:var(--primary-color);color:#fff;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:transform .08s ease,filter .15s ease;}'
        +'#share-panel .sh-btn.sec{background:var(--input-bg);color:var(--text-main);}'
        +'#share-panel .sh-btn:hover{filter:brightness(1.06);}'
        +'#share-panel .sh-btn:active{transform:scale(0.96);}'
        +'#share-panel .sh-inc{margin-top:13px;font-size:11px;color:var(--text-muted);line-height:1.6;border-top:1px solid rgba(128,128,128,0.16);padding-top:10px;}'
        +'#share-panel .sh-inc b{color:var(--text-main);font-weight:600;}'
        +'@media(max-width:768px){#share-panel{left:8px;right:8px;width:auto;transform:none;top:auto;bottom:calc(var(--sheet-cover, var(--peek-h)) + 12px);}}';
      document.head.appendChild(s); }
    function close(){ if(panel) panel.style.display='none'; }
    function open(){
      ensureStyle();
      const link=(window.IntMapBookmark&&window.IntMapBookmark.link)?window.IntMapBookmark.link():location.href;
      if(!panel){ panel=document.createElement('div'); panel.id='share-panel'; (document.getElementById('map-container')||document.body).appendChild(panel); }
      panel.style.display='block';
      const inc=L('Includes: position, zoom, projection, base map, every active layer, time-travel & compare state.',
        '含まれる情報: 位置・ズーム・投影・ベースマップ・選択中の全レイヤー・時刻（タイムトラベル）・比較状態。',
        'Enthalten: Position, Zoom, Projektion, Basiskarte, alle aktiven Ebenen, Zeitreise & Vergleich.',
        'Включено: позиция, зум, проекция, базовая карта, все активные слои, время и режим сравнения.',
        'Incluye: posición, zoom, proyección, mapa base, todas las capas activas, viaje en el tiempo y comparación.');
      panel.innerHTML='<button class="sh-x" title="'+t('close')+'">×</button>'
        +'<h4>🔗 '+L('Share this view','このビューを共有','Diese Ansicht teilen','Поделиться видом','Compartir esta vista')+'</h4>'
        +'<div style="font-size:11.5px;color:var(--text-muted);">'+L('Anyone who opens this link sees the map exactly as you do now.','このリンクを開くと、今あなたが見ている状態がそのまま再現されます。','Wer den Link öffnet, sieht die Karte genau wie Sie jetzt.','Открывший ссылку увидит карту точно как вы сейчас.','Quien abra el enlace verá el mapa tal como lo ves ahora.')+'</div>'
        +'<div class="sh-row"><input class="sh-url" type="text" readonly value="'+String(link).replace(/"/g,'&quot;')+'"><button class="sh-btn sh-copy">📋 '+L('Copy','コピー','Kopieren','Копировать','Copiar')+'</button></div>'
        +(navigator.share?('<div class="sh-row"><button class="sh-btn sec sh-native" style="flex:1;">📤 '+L('Share…','共有…','Teilen…','Поделиться…','Compartir…')+'</button></div>'):'')
        +'<div class="sh-inc">'+inc+'</div>';
      const urlEl=panel.querySelector('.sh-url'); try{ urlEl.focus(); urlEl.select(); }catch(_){}
      panel.querySelector('.sh-x').onclick=close;
      const copyBtn=panel.querySelector('.sh-copy');
      copyBtn.onclick=async()=>{ let ok=false;
        try{ await navigator.clipboard.writeText(link); ok=true; }catch(_){ try{ urlEl.select(); ok=document.execCommand('copy'); }catch(__){} }
        copyBtn.textContent=ok?('✓ '+L('Copied!','コピー完了','Kopiert!','Скопировано!','¡Copiado!')):('⚠ Ctrl+C');
        setTimeout(()=>{ copyBtn.textContent='📋 '+L('Copy','コピー','Kopieren','Копировать','Copiar'); },1900); };
      const nb=panel.querySelector('.sh-native'); if(nb) nb.onclick=()=>{ try{ navigator.share({title:'IntMap',url:link}); }catch(_){} };
    }
    return { open, close };
  })();
};
