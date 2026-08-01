/* ============================================================================
 *  IntMap · Widget board — IntMapModules.widgets  (#R164)
 * ----------------------------------------------------------------------------
 *  window.IntMapWidgets2 — the configurable dashboard widgets (FX, metals, crypto, earthquakes,
 *  on-this-day, featured layer, random country, countdown, …), all keyless real sources.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R164): the body below is
 *  byte-identical to the block that used to live there, except that closure values which are
 *  REASSIGNED at runtime are read through the live host interface (Architecture.md §3.1):
 *      currentLang -> HOST.lang, currentMode -> HOST.mode, userTZ -> HOST.userTZ
 *
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.widgets=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const countryStats=HOST.countryStats, fmtMoney=HOST.fmtMoney, imToast=HOST.imToast, isMobile=HOST.isMobile;
  /* (#R172) CAMERA THROUGH IntMapGeoEngine — this module no longer names the renderer.
     Every use here was a camera read or a camera move (centre, zoom, flyTo, fitBounds, cameraForBounds),
     so the whole file migrates behind five one-line helpers; `cameraForBounds`/`getPadding` were added to
     the contract this round for exactly this call site. */
  const _GE=()=>window.IntMapGeoEngine;
  const camCentre=()=>{ try{ const E=_GE(); return E?E.camera.getCenter():null; }catch(_){ return null; } };
  const camZoom=()=>{ try{ const E=_GE(); const z=E?E.camera.getZoom():null; return (z==null||!isFinite(z))?null:z; }catch(_){ return null; } };
  const camFly=o=>{ try{ const E=_GE(); if(E) E.camera.flyTo(o); }catch(_){} };
  const camFit=(b,o)=>{ try{ const E=_GE(); if(E) E.camera.fitBounds(b,o); }catch(_){} };
  const camForBounds=(b,o)=>{ try{ const E=_GE(); return E?E.camera.forBounds(b,o):null; }catch(_){ return null; } };
  (function(){
    /* (#R20) Widget board v3 — big expansion ("ウィジェットの選択肢を大幅拡充して"):
       configurable FX pairs, data "as of" stamps on every financial widget, Recent Earthquakes
       (USGS, 24 h, top-3 by magnitude — #1 big, #2/#3 small+equal), On this day (Wikimedia),
       Bloomberg-style one-indicator-per-widget cards (gold / silver via gold-api.com; BTC / ETH /
       crypto market-cap+dominance via CoinGecko; Crypto Fear & Greed via alternative.me — every
       source curl-verified keyless + CORS*; equity indices/oil need keyed APIs so they are honestly
       absent rather than faked), Featured Layer (random regular layer, tap = turn it on),
       Random Country (flag + key stats), and user-defined Countdown (title + date).
       Storage: intmap_widgets3 = [{u,t,cfg}]; v2 string entries migrate automatically. */
    const KEY='intmap_widgets3';
    const jp=()=>HOST.lang==='jp';
    let active=[];
    try{
      const s3=JSON.parse(localStorage.getItem(KEY)||'null');
      if(Array.isArray(s3)) active=s3.filter(x=>x&&typeof x.t==='string');
      else{ const s2=JSON.parse(localStorage.getItem('intmap_widgets2')||'[]');
        if(Array.isArray(s2)) active=s2.filter(x=>typeof x==='string').map(t=>({u:'w'+Math.random().toString(36).slice(2,8),t:(t==='markets'?'crypto':t),cfg:{}})); }
    }catch(_){}
    active.forEach(e=>{ if(!e.u) e.u='w'+Math.random().toString(36).slice(2,8); if(!e.cfg) e.cfg={}; });
    const save=()=>{ try{ localStorage.setItem(KEY,JSON.stringify(active)); }catch(_){} try{ window._syncPrefsUp&&window._syncPrefsUp(); }catch(_){} };
    /* (#R21) Default board = Clock · FX · Featured layer · Random country · On this day.
       Seeded ONCE (flagged) so the new defaults also appear for existing users; after that the
       user's own add/remove choices win. */
    try{ if(!localStorage.getItem('intmap_widgets_def21')){
      ['clock','fx','featured','country','otd'].forEach(tp=>{ if(!active.some(e=>e.t===tp)) active.push({u:'w'+Math.random().toString(36).slice(2,8),t:tp,cfg:(tp==='fx'?{base:'USD',quote:(HOST.lang==='jp'?'JPY':'EUR')}:{})}); });
      localStorage.setItem('intmap_widgets_def21','1'); save();
    }}catch(_){}
    const FX_CCY=['USD','JPY','EUR','GBP','CNY','KRW','CHF','AUD','CAD','NZD','SGD','HKD','TWD','INR','BRL','MXN','RUB','TRY','ZAR','SEK','NOK','PLN','THB','IDR','PHP','VND','SAR','AED','ILS','EGP'];
    /* multi: more than one instance allowed (different pairs / countdowns) */
    const DEFS={
      clock:    { nm:()=>jp()?'時計':'Clock', ic:'🕐', desc:()=>jp()?'現在時刻と日付':'Time & date' },
      aclock:   { nm:()=>jp()?'アナログ時計':'Analog clock', ic:'🕰', desc:()=>jp()?'アナログ文字盤':'An analog clock face' },
      weather:  { nm:()=>jp()?'天気':'Weather', ic:'🌤', desc:()=>jp()?'現在地の天気（追加時に位置情報の許可を求めます）':'Weather at your location (asks for location permission when added)' },
      fx:       { nm:()=>jp()?'為替レート':'FX rate', ic:'💱', desc:()=>jp()?'好きな通貨ペアを選択':'Pick any currency pair', multi:true },
      crypto:   { nm:()=>jp()?'暗号資産（BTC・ETH）':'Crypto (BTC·ETH)', ic:'📈', desc:()=>jp()?'価格と24h変動':'Price & 24h change' },
      cryptocap:{ nm:()=>jp()?'暗号資産時価総額':'Crypto market cap', ic:'🪙', desc:()=>jp()?'総時価総額とBTCドミナンス':'Total cap & BTC dominance' },
      fng:      { nm:()=>jp()?'Fear & Greed指数':'Fear & Greed', ic:'🌡', desc:()=>jp()?'暗号資産市場の心理指数':'Crypto market sentiment index' },
      gold:     { nm:()=>jp()?'金（ゴールド）':'Gold', ic:'🥇', desc:()=>jp()?'金スポット価格 (USD/oz)':'Gold spot (USD/oz)' },
      silver:   { nm:()=>jp()?'銀（シルバー）':'Silver', ic:'🥈', desc:()=>jp()?'銀スポット価格 (USD/oz)':'Silver spot (USD/oz)' },
      quake:    { nm:()=>jp()?'直近の地震':'Recent earthquakes', ic:'🌐', desc:()=>jp()?'直近24時間のM上位3（USGS）':'Top-3 magnitude, last 24 h (USGS)' },
      otd:      { nm:()=>jp()?'今日は何の日':'On this day', ic:'📅', desc:()=>jp()?'歴史上の今日の出来事':'A historical event from this date' },
      featured: { nm:()=>jp()?'おすすめレイヤー':'Featured layer', ic:'✨', desc:()=>jp()?'ランダムに紹介。押すと表示':'Random pick — tap to show it' },
      country:  { nm:()=>jp()?'ランダムな国':'Random country', ic:'🌍', desc:()=>jp()?'国旗と基礎データ':'Flag & key facts' },
      countdown:{ nm:()=>jp()?'カウントダウン':'Countdown', ic:'⏳', desc:()=>jp()?'日付と題名を設定':'Set a date & title', multi:true },
      /* (#R21) Board expansion — sun, moon, air quality, ISS, world clocks, year progress,
         Wikipedia featured article, live world-population estimate. */
      sun:      { nm:()=>jp()?'日の出・日の入り':'Sunrise & sunset', ic:'🌅', desc:()=>jp()?'現在地（許可時）または地図中心':'At your location (if allowed) or map center' },
      moon:     { nm:()=>jp()?'月相':'Moon phase', ic:'🌖', desc:()=>jp()?'今夜の月の満ち欠け':'Tonight’s phase & illumination' },
      aqi:      { nm:()=>jp()?'大気質（AQI）':'Air quality (AQI)', ic:'😮‍💨', desc:()=>jp()?'US AQIとPM2.5':'US AQI & PM2.5' },
      iss:      { nm:()=>jp()?'国際宇宙ステーション':'ISS tracker', ic:'🛰', desc:()=>jp()?'ISSの現在位置。タップで地図へ':'Live ISS position — tap to fly there' },
      worldclock:{ nm:()=>jp()?'世界時計':'World clock', ic:'🌐', desc:()=>jp()?'好きな都市の現在時刻':'Pick a city / timezone', multi:true },
      yearprog: { nm:()=>jp()?'今年の進捗':'Year progress', ic:'📆', desc:()=>jp()?'今年が何%過ぎたか':'How far through the year we are' },
      wikifeat: { nm:()=>jp()?'今日の注目記事':'Featured article', ic:'📖', desc:()=>jp()?'Wikipediaの本日の注目記事':'Wikipedia’s article of the day' },
      pop:      { nm:()=>jp()?'世界人口時計':'World population', ic:'👥', desc:()=>jp()?'国連推計ベースのライブ推定':'Live estimate (UN-based)' },
      /* (#R22) Board expansion #2 — all keyless + CORS-verified live sources. */
      uv:       { nm:()=>jp()?'UV指数':'UV index', ic:'🔆', desc:()=>jp()?'現在地の紫外線指数':'UV index at your location' },
      kp:       { nm:()=>jp()?'地磁気・オーロラ':'Aurora (Kp)', ic:'🌌', desc:()=>jp()?'地磁気活動（NOAA SWPC）':'Geomagnetic activity (NOAA SWPC)' },
      hn:       { nm:()=>jp()?'Hacker News':'Hacker News', ic:'💻', desc:()=>jp()?'技術系トップ記事':'Top technology story' },
      holiday:  { nm:()=>jp()?'次の祝日':'Next holiday', ic:'🎌', desc:()=>jp()?'指定国の次の祝日':'Next public holiday (pick a country)', multi:true },
      launch:   { nm:()=>jp()?'次のロケット打上げ':'Next rocket launch', ic:'🚀', desc:()=>jp()?'世界の次の打上げ予定':'The next spaceflight launch' },
      btc:      { nm:()=>jp()?'ビットコイン網':'Bitcoin network', ic:'₿', desc:()=>jp()?'ブロック高と手数料':'Block height & fees' },
      /* (#R40) Board expansion #3 — pure-computation widgets (no network, always work). */
      dayprog:  { nm:()=>jp()?'今日の進捗':'Day progress', ic:'⏱', desc:()=>jp()?'今日が何%過ぎたか':'How far through today we are' },
      season:   { nm:()=>jp()?'季節':'Season', ic:'🍂', desc:()=>jp()?'現在の季節（半球対応）':'Current season (hemisphere-aware)' },
      weeknum:  { nm:()=>jp()?'週番号':'Week number', ic:'🗓', desc:()=>jp()?'ISO週番号・通算日・残り日数':'ISO week, day-of-year & days left' },
      unixclock:{ nm:()=>jp()?'Unix時刻':'Unix time', ic:'⏲', desc:()=>jp()?'現在のUnixタイムスタンプ':'Live Unix timestamp' },
      mapcenter:{ nm:()=>jp()?'地図の中心':'Map center', ic:'🎯', desc:()=>jp()?'表示中心の座標とズーム':'Center coordinates & zoom' },
      fullmoon: { nm:()=>jp()?'次の満月':'Next full moon', ic:'🌕', desc:()=>jp()?'次の満月までの日数':'Days until the next full moon' },
      /* (#R41) Board expansion #4 — map-aware + pure-computation widgets (5-lang names). */
      mapweather:{ nm:()=>({en:'Map weather',jp:'地図中心の天気',de:'Karten-Wetter',ru:'Погода по центру',es:'Clima del mapa'})[HOST.lang]||'Map weather', ic:'🗺', desc:()=>({en:'Live weather at the map center (no location permission)',jp:'地図中心の現在の天気（位置情報不要）',de:'Wetter in der Kartenmitte (keine Standortfreigabe)',ru:'Погода в центре карты (без доступа к геолокации)',es:'Tiempo en el centro del mapa (sin permiso de ubicación)'})[HOST.lang]||'Live weather at the map center' },
      daylength:{ nm:()=>({en:'Day length',jp:'昼の長さ',de:'Tageslänge',ru:'Долгота дня',es:'Duración del día'})[HOST.lang]||'Day length', ic:'🌞', desc:()=>({en:'Daylight hours at the map-center latitude',jp:'地図中心の緯度での日照時間',de:'Tageslichtstunden auf Breite der Kartenmitte',ru:'Часы светового дня на широте центра карты',es:'Horas de luz en la latitud del centro'})[HOST.lang]||'Daylight hours' },
      mapscale:{ nm:()=>({en:'Map scale',jp:'地図の縮尺',de:'Kartenmaßstab',ru:'Масштаб карты',es:'Escala del mapa'})[HOST.lang]||'Map scale', ic:'📐', desc:()=>({en:'Scale at the current zoom',jp:'現在のズームの縮尺',de:'Maßstab beim aktuellen Zoom',ru:'Масштаб при текущем увеличении',es:'Escala en el zoom actual'})[HOST.lang]||'Scale at the current zoom' },
      calendar:{ nm:()=>({en:'Calendar',jp:'カレンダー',de:'Kalender',ru:'Календарь',es:'Calendario'})[HOST.lang]||'Calendar', ic:'📅', desc:()=>({en:'This month, today highlighted',jp:'今月のミニカレンダー',de:'Dieser Monat, heute markiert',ru:'Этот месяц, сегодня выделено',es:'Este mes, hoy resaltado'})[HOST.lang]||'This month' },
      newmoon:{ nm:()=>({en:'Next new moon',jp:'次の新月',de:'Nächster Neumond',ru:'Следующее новолуние',es:'Próxima luna nueva'})[HOST.lang]||'Next new moon', ic:'🌑', desc:()=>({en:'Days until the next new moon',jp:'次の新月までの日数',de:'Tage bis zum nächsten Neumond',ru:'Дней до новолуния',es:'Días hasta la luna nueva'})[HOST.lang]||'Days until the next new moon' }
    };
    const css=document.createElement('style');
    css.textContent=
      '.wgt-board{display:none;flex:1 1 auto;min-height:0;overflow-y:auto;padding:2px 2px 14px;}'+
      '.wgt-title{font-size:13px;font-weight:700;color:var(--text-muted);margin:2px 2px 10px;letter-spacing:0.2px;}'+
      '.wgt-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}'+
      /* (#R39) iOS-refined card: rounder corners, a softer layered shadow, a hairline top highlight, and a
         tactile press state — matching the iOS widget look ("よりiOS風の洗練されたデザインに"). */
      /* (#R186) …WITHOUT the ambient drop shadow. 「ウィジェットの周りにぼんやりと影を付けなくてよい」 —
         so every OUTER shadow is gone from the card and from all three of its states. The remaining
         `inset` rule is not a shadow around the card: it is the 1-px top highlight that draws the
         glass edge INSIDE the border, and removing it would flatten the surface rather than the halo
         the request is about. The press/hover TRANSFORMS stay — the tactile response was never the
         complaint. */
      '.wgt-card{position:relative;border-radius:22px;padding:14px 15px;min-height:106px;background:var(--glass-fill);border:1px solid var(--glass-border);backdrop-filter:saturate(var(--glass-sat)) blur(var(--glass-blur));-webkit-backdrop-filter:saturate(var(--glass-sat)) blur(var(--glass-blur));box-shadow:0 1px 0 rgba(255,255,255,0.10) inset;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;transition:transform 0.16s cubic-bezier(0.2,0.7,0.2,1),box-shadow 0.16s;}'+
      '.wgt-card:not(.editing):active{transform:scale(0.972);box-shadow:0 1px 0 rgba(255,255,255,0.10) inset;}'+
      /* (#R41) subtle iOS hover-lift on desktop ("よりiOS風の洗練されたデザインに") */
      '@media(hover:hover){ .wgt-card:not(.editing):hover{transform:translateY(-1.5px);box-shadow:0 1px 0 rgba(255,255,255,0.12) inset;} }'+
      /* (#R40) extra iOS refinement: a soft diagonal glass sheen BEHIND the content (content gets z-index:1). */
      '.wgt-card::before{content:"";position:absolute;inset:0;z-index:0;border-radius:22px;background:linear-gradient(155deg,rgba(255,255,255,0.08),rgba(255,255,255,0) 46%);pointer-events:none;}'+
      '.wgt-card>*{position:relative;z-index:1;}'+
      /* (#R63) iOS-clean widget interior — per explicit feedback: NO bold text, NO gradient type, NO coloured
         accents/rules. Quiet SF-style typography: small regular-weight caption, large regular-weight value. */
      '.wgt-card{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Segoe UI",Roboto,"Helvetica Neue",sans-serif;}'+
      '.wgt-card .wgt-h{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:500;color:var(--text-muted);letter-spacing:0.1px;text-transform:none;}'+
      '.wgt-card .wgt-h b,.wgt-card .wgt-h .wgt-nm{font-weight:500;}'+
      '.wgt-card .wgt-v{font-size:25px;font-weight:400;color:var(--text-main);line-height:1.16;letter-spacing:-0.4px;font-variant-numeric:tabular-nums;margin-top:8px;word-break:break-word;}'+
      '.wgt-card .wgt-v b{font-weight:500;}'+
      '.wgt-card .wgt-s{font-size:10.5px;font-weight:400;color:var(--text-muted);margin-top:5px;line-height:1.5;letter-spacing:0.05px;}'+
      /* (#R154) AQI / UV rebuilt iOS-style — the WHOLE card takes the category colour as its background ("現在の数字の
         色を背景にして。iOS風に。"). _wgtColor() sets the gradient inline!important (beats the glass override) and adds
         .wgt-colored (+ .wgt-on-light for pale colours → dark text, else white) so contrast holds on every tier. */
      '.wgt-card.wgt-colored{color:#fff;min-height:122px;border-color:rgba(255,255,255,0.14);box-shadow:0 1px 0 rgba(255,255,255,0.18) inset;}'+   /* (#R186) no ambient drop shadow — see .wgt-card above */
      '.wgt-card.wgt-colored.wgt-on-light{color:#1c1c1e;border-color:rgba(0,0,0,0.08);}'+
      '.wgt-card.wgt-colored::before{background:linear-gradient(158deg,rgba(255,255,255,0.22),rgba(255,255,255,0) 58%);}'+
      '.wgt-card.wgt-colored.wgt-on-light::before{background:linear-gradient(158deg,rgba(255,255,255,0.32),rgba(255,255,255,0) 58%);}'+
      '.wgt-card.wgt-colored .wgt-h{color:currentColor;opacity:0.82;font-weight:600;}'+
      '.wgt-card.wgt-colored .wgt-v{color:currentColor;font-size:36px;font-weight:600;letter-spacing:-1px;margin-top:6px;line-height:1.02;}'+
      '.wgt-card.wgt-colored .wgt-v .wgt-unit{font-size:14px;font-weight:600;opacity:0.72;margin-left:4px;letter-spacing:0;}'+
      '.wgt-card.wgt-colored .wgt-v .wgt-cat{display:block;font-size:14.5px;font-weight:600;opacity:0.95;margin-top:3px;letter-spacing:-0.1px;}'+
      '.wgt-card.wgt-colored .wgt-s{color:currentColor;opacity:0.8;font-weight:500;margin-top:6px;}'+
      '.wgt-x{position:absolute;top:6px;right:6px;width:26px;height:26px;border:none;border-radius:13px;background:rgba(128,128,128,0.22);color:var(--text-main);font-size:13px;line-height:1;cursor:pointer;opacity:0;transition:opacity 0.15s;display:flex;align-items:center;justify-content:center;}'+
      '.wgt-card:hover .wgt-x{opacity:1;}'+
      '@media(max-width:768px){ .wgt-x{opacity:0.85;width:30px;height:30px;border-radius:15px;} }'+
      '.wgt-add{position:relative;overflow:hidden;border:1.5px dashed rgba(128,128,128,0.45);border-radius:22px;min-height:106px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--text-muted);cursor:pointer;font-size:12.5px;background:transparent;transition:background 0.15s;}'+
      /* (#R22) Edit mode: per-card delete + reorder controls replace the old hover ✕. */
      '.wgt-title-row{display:flex;align-items:center;margin:2px 2px 10px;}'+
      '.wgt-edit-btn{margin-left:auto;border:none;background:rgba(128,128,128,0.16);color:var(--text-main);font-size:11.5px;font-weight:600;padding:4px 12px;border-radius:999px;cursor:pointer;}'+
      '.wgt-edit-btn.on{background:var(--primary-color);color:#fff;}'+
      /* (#R35) overflow:visible in edit mode so the iOS-style delete badge (top:-7px;left:-7px, OUTSIDE the
         card corner) is no longer clipped by the card's overflow:hidden ("削除する―ボタンがウィジェットに一部
         隠されている"). The badge now shows in full. */
      '.wgt-card.editing{outline:1.5px solid var(--glass-border);cursor:grab;touch-action:none;overflow:visible;}'+
      '.wgt-card.editing:active{cursor:grabbing;}'+
      /* (#R31) edit-mode: grip (drag) top-left, delete top-right; config gear restyled (SVG). */
      '.wgt-grip{position:absolute;top:7px;left:7px;z-index:2;display:flex;align-items:center;justify-content:center;color:var(--text-muted);opacity:0.7;}'+
      /* (#R33) iOS jiggle-mode delete badge: a dark circle with a white minus, pinned to the top-LEFT corner. */
      '.wgt-del{position:absolute;top:-7px;left:-7px;z-index:4;width:24px;height:24px;border:none;border-radius:50%;background:rgba(60,60,67,0.94);color:#fff;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 5px rgba(0,0,0,0.4);}'+
      '.wgt-card.editing{animation:wgtJiggle 0.35s ease-in-out infinite alternate;}'+
      '@keyframes wgtJiggle{from{transform:rotate(-0.5deg);}to{transform:rotate(0.5deg);}}'+
      '.wgt-cfg{position:absolute;top:6px;right:6px;z-index:2;width:26px;height:26px;border:none;border-radius:13px;background:rgba(128,128,128,0.16);color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s,color .15s;}'+
      '.wgt-cfg:hover{background:rgba(128,128,128,0.28);color:var(--text-main);}'+
      '@media(max-width:768px){ .wgt-del{width:32px;height:32px;border-radius:16px;font-size:15px;} .wgt-grip svg{width:18px;height:18px;} }'+
      '.wgt-add:hover{background:rgba(128,128,128,0.08);}'+
      '.wgt-add .plus{font-size:24px;line-height:1;}'+
      '.wgt-gallery{margin-top:12px;border-radius:18px;padding:12px;background:var(--glass-fill);border:1px solid var(--glass-border);}'+
      '.wgt-gallery h5{margin:0 0 8px;font-size:12.5px;color:var(--text-main);}'+
      '.wgt-g-row{display:flex;align-items:center;gap:10px;padding:9px 6px;border-radius:12px;cursor:pointer;}'+
      '.wgt-g-row:hover{background:rgba(128,128,128,0.10);}'+
      '.wgt-g-row .gi{font-size:20px;}'+
      '.wgt-g-row .gn{font-size:13px;font-weight:600;color:var(--text-main);}'+
      '.wgt-g-row .gd{font-size:10.5px;color:var(--text-muted);}'+
      '.wgt-g-row .ga{margin-left:auto;font-size:18px;color:var(--primary-color);}';
    document.head.appendChild(css);
    let board=null, gallery=false, clockT=null, dataT=null;
    function ensureBoard(){ if(board) return board;
      const sb=document.querySelector('.sidebar'); if(!sb) return null;
      board=document.createElement('div'); board.className='wgt-board'; board.id='widget-board';
      const feed=document.getElementById('live-news-feed');
      if(feed&&feed.parentElement===sb) sb.insertBefore(board,feed); else sb.appendChild(board);
      return board; }
    function hasType(t){ return active.some(e=>e.t===t); }
    let editing=false;
    function card(e){ const d=DEFS[e.t]; if(!d) return '';
      const i=active.indexOf(e);
      let topright='';
      if(editing){
        /* (#R31) Edit mode: DRAG-AND-DROP reorder (iOS-style) + delete (✕). The ↑↓ buttons are gone — a
           grip handle (the whole card is draggable) replaces them ("↓↑ではなく、ドラッグアンドドロップで"). */
        /* (#R33) iOS home-screen style: the whole card is draggable (no separate grip), and the delete badge
           is a minus in a dark circle at the top-left ("iPhoneのホーム画面のように / 削除ボタンをiOS風に"). */
        topright='<button class="wgt-del" data-u="'+e.u+'" title="'+(jp()?'削除':'Remove')+'" aria-label="'+(jp()?'削除':'Remove')+'"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 12h12"/></svg></button>';
      } else if(e.t==='fx'||e.t==='countdown'||e.t==='worldclock'||e.t==='holiday'){
        /* (#R31) cleaner SF-Symbol-style gear (the old ⚙ glyph looked "ダサい"). */
        topright='<button class="wgt-cfg" data-u="'+e.u+'" title="'+(jp()?'設定':'Configure')+'"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg></button>';
      }
      return '<div class="wgt-card'+(editing?' editing':'')+'" data-u="'+e.u+'" data-w="'+e.t+'">'+topright+
        '<div class="wgt-h"><span>'+d.ic+'</span><span class="wgt-nm">'+d.nm()+'</span></div><div class="wgt-v" id="wgtv-'+e.u+'">···</div><div class="wgt-s" id="wgts-'+e.u+'"></div><div class="wgt-cfgbox" id="wgtc-'+e.u+'" style="display:none;margin-top:7px;"></div></div>'; }
    function moveWidget(u,dir){ const i=active.findIndex(e=>e.u===u); if(i<0) return; const j=i+dir; if(j<0||j>=active.length) return;
      const tmp=active[i]; active[i]=active[j]; active[j]=tmp; save(); render(); }
    function doAdd(k){ if(!k||!DEFS[k]) return; if(!DEFS[k].multi&&hasType(k)) return;
      const e={u:'w'+Math.random().toString(36).slice(2,8),t:k,cfg:(k==='fx'?{base:'USD',quote:jp()?'JPY':'EUR'}:k==='worldclock'?{tz:'Asia/Tokyo'}:k==='holiday'?{cc:(jp()?'JP':'US')}:{})};
      active.push(e); save(); gallery=false; render();
      /* (#R25) Request the location permission for EVERY widget that uses widgetLoc() on add — UV index
         was missing, so it silently fell back to map center ("位置情報を使用するウィジェットは追加時に許可を求めて"). */
      if(['weather','aqi','sun','uv'].includes(k)) reqGeo(()=>refreshOne(e));
      if(k==='countdown'||k==='worldclock'||k==='holiday') setTimeout(()=>openCfg(e.u),50); }
    function render(){ const b=ensureBoard(); if(!b) return;
      const isMob=(typeof isMobile==='function'&&isMobile());
      const cards=active.map(card).join('');
      const addable=Object.keys(DEFS).filter(k=>DEFS[k].multi||!hasType(k));
      /* (#R22) An "Edit" button (top-right of the board) drives reorder/remove — no more per-card ✕. */
      const editBtn=active.length?'<button id="wgt-edit" class="wgt-edit-btn'+(editing?' on':'')+'">'+(editing?(jp()?'完了':'Done'):(jp()?'編集':'Edit'))+'</button>':'';
      let addCell='';
      if(!editing && addable.length){
        /* (#R22) Mobile: the Add tile is an iOS-native <select> wheel overlaid on the tile. Desktop keeps the gallery. */
        addCell='<div class="wgt-add" id="wgt-add"><span class="plus">＋</span>'+(jp()?'ウィジェットを追加':'Add widget')+
          (isMob?('<select id="wgt-add-sel" aria-label="'+(jp()?'ウィジェットを追加':'Add widget')+'" style="position:absolute;inset:0;width:100%;height:100%;opacity:0;font-size:16px;border:0;">'+
            '<option value="">'+(jp()?'追加するウィジェット…':'Add a widget…')+'</option>'+
            addable.map(k=>'<option value="'+k+'">'+DEFS[k].nm()+'</option>').join('')+'</select>'):'')+'</div>';
      }
      b.innerHTML='<div class="wgt-title-row"><span class="wgt-title" style="margin:0;">'+(jp()?'ウィジェット':'Widgets')+'</span>'+editBtn+'</div>'+
        '<div class="wgt-grid">'+cards+addCell+'</div>'+
        (!isMob&&gallery&&!editing&&addable.length?('<div class="wgt-gallery"><h5 style="display:flex;align-items:center;">'+(jp()?'追加できるウィジェット':'Available widgets')+
          '<button id="wgt-g-close" title="'+(jp()?'閉じる':'Close')+'" style="margin-left:auto;width:26px;height:26px;border:none;border-radius:13px;background:rgba(128,128,128,0.22);color:var(--text-main);font-size:13px;line-height:1;cursor:pointer;">✕</button></h5>'+
          addable.map(k=>'<div class="wgt-g-row" data-add="'+k+'"><span class="gi">'+DEFS[k].ic+'</span><span><div class="gn">'+DEFS[k].nm()+'</div><div class="gd">'+DEFS[k].desc()+'</div></span><span class="ga">＋</span></div>').join('')+'</div>'):'');
      const eb=b.querySelector('#wgt-edit'); if(eb) eb.onclick=()=>{ editing=!editing; gallery=false; render(); };
      const add=b.querySelector('#wgt-add'); if(add && !isMob) add.onclick=()=>{ gallery=!gallery; render(); };
      const addSel=b.querySelector('#wgt-add-sel'); if(addSel) addSel.onchange=()=>{ const k=addSel.value; if(k&&DEFS[k]) doAdd(k); };
      const gx=b.querySelector('#wgt-g-close'); if(gx) gx.onclick=(ev)=>{ ev.stopPropagation(); gallery=false; render(); };
      b.querySelectorAll('.wgt-g-row').forEach(r=>r.onclick=()=>{ doAdd(r.getAttribute('data-add')); });
      b.querySelectorAll('.wgt-del').forEach(x=>x.onclick=(ev)=>{ ev.stopPropagation(); const u=x.getAttribute('data-u'); if(u){ active=active.filter(a=>a.u!==u); save(); if(!active.length) editing=false; render(); } });
      b.querySelectorAll('.wgt-cfg').forEach(g=>g.onclick=(ev)=>{ ev.stopPropagation(); openCfg(g.getAttribute('data-u')); });
      if(editing) enableDnD(b);
      refreshAll(); }
    /* (#R31) Pointer-based drag-and-drop reorder (works on touch & desktop). The dragged card is lifted and
       set pointer-events:none so elementFromPoint finds the card beneath; the DOM order is committed to
       `active` on drop. */
    /* (#R32) iOS-home-screen-style reorder ("滑らかに移動させられる形式に"): the lifted card FOLLOWS the finger
       (translate) and the displaced cards GLIDE to their new slots via a FLIP animation, instead of jumping. */
    function enableDnD(b){ const grid=b.querySelector('.wgt-grid'); if(!grid) return;
      grid.querySelectorAll('.wgt-card').forEach(card=>{
        let dragging=false, hx=0, hy=0;
        const flip=(mut)=>{ const sibs=[].slice.call(grid.children).filter(c=>c!==card&&c.classList&&c.classList.contains('wgt-card'));
          const first=new Map(); sibs.forEach(c=>first.set(c,c.getBoundingClientRect())); mut();
          sibs.forEach(c=>{ const f=first.get(c), l=c.getBoundingClientRect(); const dx=f.left-l.left, dy=f.top-l.top; if(dx||dy){ c.style.transition='none'; c.style.transform='translate('+dx+'px,'+dy+'px)'; c.getBoundingClientRect(); requestAnimationFrame(()=>{ c.style.transition='transform 0.24s cubic-bezier(0.2,0.7,0.2,1)'; c.style.transform=''; }); } }); };
        /* (#R34) ROOT-CAUSE FIX for "ドラッグアンドドロップ…まったく動作しない". The old code set the card to
           pointer-events:none on pointerdown AND relied on setPointerCapture — but a pointer-captured element
           with pointer-events:none stops receiving pointermove/pointerup in most browsers, so the drag never
           moved. Now move/up are bound to DOCUMENT (they always fire), while the card stays pointer-events:none
           purely so elementFromPoint can see the card beneath the finger. */
        let moveH=null, upH=null;
        const onMove=(e)=>{ if(!dragging) return; e.preventDefault&&e.preventDefault();
          card.style.transition='none'; card.style.transform='translate('+(e.clientX-hx)+'px,'+(e.clientY-hy)+'px) scale(1.05)';
          const under=document.elementFromPoint(e.clientX,e.clientY); const over=under&&under.closest&&under.closest('.wgt-card');
          if(over&&over!==card&&over.parentElement===grid){ const r=over.getBoundingClientRect(); const before=(e.clientY< r.top+r.height/2);
            flip(()=>grid.insertBefore(card, before?over:over.nextSibling));
            hx=e.clientX; hy=e.clientY; card.style.transform='translate(0px,0px) scale(1.05)';   /* re-anchor to the new slot under the finger */
          } };
        const end=()=>{ if(!dragging) return; dragging=false;
          try{ document.removeEventListener('pointermove',moveH); document.removeEventListener('pointerup',upH); document.removeEventListener('pointercancel',upH); }catch(_){}
          card.style.transition='transform 0.2s cubic-bezier(0.2,0.7,0.2,1),opacity 0.2s,box-shadow 0.2s'; card.style.transform=''; card.style.opacity=''; card.style.boxShadow=''; card.style.zIndex=''; setTimeout(()=>{ card.style.pointerEvents=''; card.style.transition=''; },220);
          const order=[].map.call(grid.querySelectorAll('.wgt-card'),c=>c.getAttribute('data-u'));
          active.sort((a,b2)=>order.indexOf(a.u)-order.indexOf(b2.u)); try{ save(); }catch(_){} };
        card.addEventListener('pointerdown',(e)=>{ if(!editing) return; if(e.target.closest&&e.target.closest('button')) return; dragging=true; hx=e.clientX; hy=e.clientY;
          card.style.zIndex='8'; card.style.pointerEvents='none'; card.style.opacity='0.96'; card.style.boxShadow='0 16px 38px rgba(0,0,0,0.30)'; card.style.transition='transform 0.12s ease'; card.style.transform='scale(1.05)'; e.preventDefault();
          moveH=onMove; upH=end; document.addEventListener('pointermove',moveH,{passive:false}); document.addEventListener('pointerup',upH); document.addEventListener('pointercancel',upH); });
      });
    }
    function entry(u){ return active.find(e=>e.u===u); }
    function setV(u,v,s){ const ev=document.getElementById('wgtv-'+u); if(ev) ev.innerHTML=v; const es=document.getElementById('wgts-'+u); if(es) es.innerHTML=s||''; }
    /* (#R154) iOS-style colour-fill helpers for AQI / UV. _wgtColor paints the whole card the category colour (gradient,
       inline!important so it beats the sidebar-glass override) and picks dark/light text by luminance so every tier reads. */
    const _WL=(en,ja,de,ru,es)=>HOST.lang==='jp'?ja:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?es:en;
    function _lum(hex){ try{ let h=String(hex).replace('#',''); if(h.length===3) h=h.split('').map(x=>x+x).join(''); const n=parseInt(h,16); return (0.2126*((n>>16)&255)+0.7152*((n>>8)&255)+0.0722*(n&255))/255; }catch(_){ return 0; } }
    /* ══ (#R187) THE COLOURED CARDS ARE GLASS TOO ══════════════════════════════════════════════════
       「AQI, UVIウィジェットはぼんやりと影を付けなくてよい。そして、全ウィジェットはガラス風の質感に。」

       #R186 removed every OUTER shadow from `.wgt-card` and from `.wgt-colored` — and the report came
       back, because on these two cards the soft shading was never outside the card. It was INSIDE it:
       `linear-gradient(158deg, shade(col,+16), shade(col,−14))` darkened the bottom-right corner by
       14%, which is exactly what a soft shadow looks like. And being an OPAQUE gradient set
       inline-!important, it also overrode `--glass-fill` — so AQI and UV were the only two widgets in
       the app that were not glass. One change answers both halves: a FLAT translucent tint.

       Flat, so nothing on the card fades into a corner. Translucent, so `backdrop-filter` (which the
       card already carries and which the opaque gradient was hiding) does the work and the card reads
       as tinted glass like every other widget.

       ⚠ AND THE TEXT COLOUR IS DECIDED ON WHAT THE EYE ACTUALLY SEES. Picking it from the raw category
       colour was right while that colour was opaque; behind 58% alpha the surface is a blend of the
       colour and whatever is under the glass, so #ffcc00 ("light → dark text") over a dark sidebar is
       no longer light. The luminance test therefore runs on the COMPOSITED value: α·lum(colour) +
       (1−α)·lum(surface), with the surface read from the live theme. Yellow keeps dark text in light
       mode and takes white in dark mode, which is what the composite says. */
    /* ⚠ AND IT FOLLOWS THE APPEARANCE SETTING, because #R33's standing rule is 「全てのUIはこの設定に
       従うように」 and #R153 spelled out what that means for this exact material: `--glass-fill` is
       ONE shared surface that resolves to the OPAQUE --card-bg in Solid mode ("無条件で透過しないよう
       に") and to a translucent rgba in the two glass modes ("無条件で不透過するな"). Solid is the
       default. So a tint that was translucent unconditionally would make AQI and UV the only two
       see-through cards on an otherwise solid board — the same kind of exception this round is
       removing, pointing the other way. The alpha therefore comes from the mode; what is fixed is
       that the fill is FLAT, which is the half of the request about the soft shading. */
    const _TINT_GLASS=0.58;
    function _glassOn(){ try{ return document.body.classList.contains('sidebar-translucent')
      ||document.body.classList.contains('sidebar-glass2'); }catch(_){ return false; } }
    function _tintA(){ return _glassOn()?_TINT_GLASS:1; }
    function _themeLum(){ try{ return document.documentElement.getAttribute('data-theme')==='dark'?0.11:0.93; }catch(_){ return 0.11; } }
    function _wgtColor(u,col){ try{ const card=document.querySelector('.wgt-card[data-u="'+u+'"]'); if(!card) return;
        if(col){ card.classList.add('wgt-colored'); card.setAttribute('data-tint',col);
          const _TINT_A=_tintA();
          const eff=_TINT_A*_lum(col)+(1-_TINT_A)*_themeLum();
          card.classList.toggle('wgt-on-light',eff>0.5);
          let h=String(col).replace('#',''); if(h.length===3) h=h.split('').map(x=>x+x).join('');
          const n=parseInt(h,16);
          card.style.setProperty('background','rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+_TINT_A+')','important'); }
        else{ card.classList.remove('wgt-colored','wgt-on-light'); card.removeAttribute('data-tint'); card.style.removeProperty('background'); } }catch(_){} }
    /* The fill and the composite luminance above depend on the THEME and on the Solid/Frosted-Glass
       setting, and neither switch refreshes a widget's data — so re-decide both when either changes,
       from the tint the card is already wearing. (`data-tint` is written by _wgtColor itself, so this
       can never invent one.) The appearance setting is carried as a body class, which raises no
       event, so it is watched the same way js/space-sky.js watches the theme attribute. */
    function _retint(){ try{ document.querySelectorAll('.wgt-card[data-tint]').forEach(c=>{
      const u=c.getAttribute('data-u'); if(u) _wgtColor(u,c.getAttribute('data-tint')); }); }catch(_){} }
    try{ window.addEventListener('intmap-theme',_retint); }catch(_){}
    try{ new MutationObserver(_retint).observe(document.body,{attributes:true,attributeFilter:['class']}); }catch(_){}
    function _wgtBig(num,unit,cat){ return String(num)+(unit?'<span class="wgt-unit">'+unit+'</span>':'')+(cat?'<span class="wgt-cat">'+cat+'</span>':''); }
    /* full US-AQI 6-tier scale (was 4 stops) — 5 languages */
    function _aqiCat(v){ if(v==null) return {col:null,label:''};
      if(v<=50)  return {col:'#34c759',label:_WL('Good','良好','Gut','Хорошо','Buena')};
      if(v<=100) return {col:'#ffcc00',label:_WL('Moderate','普通','Mäßig','Умеренно','Moderada')};
      if(v<=150) return {col:'#ff9500',label:_WL('Unhealthy (sensitive)','敏感な人に注意','Ungesund (empfindl.)','Вредно (чувствит.)','Insalubre (sensibles)')};
      if(v<=200) return {col:'#ff3b30',label:_WL('Unhealthy','不健康','Ungesund','Вредно','Insalubre')};
      if(v<=300) return {col:'#af52de',label:_WL('Very unhealthy','非常に不健康','Sehr ungesund','Очень вредно','Muy insalubre')};
      return {col:'#8b2635',label:_WL('Hazardous','危険','Gefährlich','Опасно','Peligrosa')}; }
    function _uvCat(v){ if(v==null) return {col:null,label:''};
      if(v<3)  return {col:'#34c759',label:_WL('Low','低い','Niedrig','Низкий','Bajo')};
      if(v<6)  return {col:'#ffcc00',label:_WL('Moderate','中程度','Mäßig','Умеренный','Moderado')};
      if(v<8)  return {col:'#ff9500',label:_WL('High','高い','Hoch','Высокий','Alto')};
      if(v<11) return {col:'#ff3b30',label:_WL('Very high','非常に高い','Sehr hoch','Очень высокий','Muy alto')};
      return {col:'#af52de',label:_WL('Extreme','極端','Extrem','Экстремальный','Extremo')}; }
    /* "as of" stamp — every financial/data widget states WHEN its numbers are from (#R20). */
    function asOf(ts){ try{ const d=(ts instanceof Date)?ts:new Date(ts); if(isNaN(d.getTime())) return '';
      return (jp()?'取得時点 ':'as of ')+d.toLocaleString(jp()?'ja-JP':'en-GB',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }catch(_){ return ''; } }
    function openCfg(u){ const e=entry(u); if(!e) return; const box=document.getElementById('wgtc-'+u); if(!box) return;
      const open=box.style.display!=='none'; if(open){ box.style.display='none'; return; }
      box.style.display='block';
      const selStyle='padding:4px 6px;border-radius:7px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);font-size:12px;';
      if(e.t==='fx'){
        box.innerHTML='<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;color:var(--text-muted);">'+
          '<select class="fxb" style="'+selStyle+'">'+FX_CCY.map(c=>'<option'+(c===(e.cfg.base||'USD')?' selected':'')+'>'+c+'</option>').join('')+'</select> /'+
          '<select class="fxq" style="'+selStyle+'">'+FX_CCY.map(c=>'<option'+(c===(e.cfg.quote||'JPY')?' selected':'')+'>'+c+'</option>').join('')+'</select>'+
          '<button class="fxok" style="'+selStyle+'cursor:pointer;font-weight:600;">OK</button></div>';
        box.querySelector('.fxok').onclick=()=>{ e.cfg.base=box.querySelector('.fxb').value; e.cfg.quote=box.querySelector('.fxq').value; save(); box.style.display='none'; refreshOne(e); };
      } else if(e.t==='countdown'){
        box.innerHTML='<div style="display:flex;flex-direction:column;gap:6px;font-size:11px;color:var(--text-muted);">'+
          '<input class="cdt" type="text" maxlength="40" placeholder="'+(jp()?'題名（例: オリンピック開幕）':'Title (e.g. Olympics opening)')+'" value="'+String(e.cfg.title||'').replace(/"/g,'&quot;')+'" style="'+selStyle+'width:100%;box-sizing:border-box;">'+
          '<div style="display:flex;gap:6px;"><input class="cdd" type="date" value="'+(e.cfg.date||'')+'" style="'+selStyle+'flex:1;">'+
          '<button class="cdok" style="'+selStyle+'cursor:pointer;font-weight:600;">OK</button></div></div>';
        box.querySelector('.cdok').onclick=()=>{ e.cfg.title=box.querySelector('.cdt').value.trim(); e.cfg.date=box.querySelector('.cdd').value; save(); box.style.display='none'; refreshOne(e); };
      } else if(e.t==='worldclock'){
        const zones=['Asia/Tokyo','Asia/Seoul','Asia/Shanghai','Asia/Hong_Kong','Asia/Singapore','Asia/Kolkata','Asia/Dubai','Europe/Moscow','Europe/Istanbul','Europe/Berlin','Europe/Paris','Europe/London','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Sao_Paulo','America/Mexico_City','Africa/Cairo','Africa/Johannesburg','Australia/Sydney','Pacific/Auckland','UTC'];
        box.innerHTML='<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted);">'+
          '<select class="wctz" style="'+selStyle+'flex:1;min-width:0;">'+zones.map(z=>'<option value="'+z+'"'+(z===(e.cfg.tz||'Asia/Tokyo')?' selected':'')+'>'+z.replace(/_/g,' ')+'</option>').join('')+'</select>'+
          '<button class="wcok" style="'+selStyle+'cursor:pointer;font-weight:600;">OK</button></div>';
        box.querySelector('.wcok').onclick=()=>{ e.cfg.tz=box.querySelector('.wctz').value; save(); box.style.display='none'; tickClock(); };
      } else if(e.t==='holiday'){
        const HC=[['US','United States','アメリカ'],['JP','Japan','日本'],['GB','United Kingdom','イギリス'],['DE','Germany','ドイツ'],['FR','France','フランス'],['CA','Canada','カナダ'],['AU','Australia','オーストラリア'],['IN','India','インド'],['BR','Brazil','ブラジル'],['MX','Mexico','メキシコ'],['IT','Italy','イタリア'],['ES','Spain','スペイン'],['NL','Netherlands','オランダ'],['SE','Sweden','スウェーデン'],['PL','Poland','ポーランド'],['RU','Russia','ロシア'],['KR','South Korea','韓国'],['CN','China','中国'],['SG','Singapore','シンガポール'],['NZ','New Zealand','ニュージーランド'],['ZA','South Africa','南アフリカ'],['AR','Argentina','アルゼンチン'],['TR','Turkey','トルコ'],['CH','Switzerland','スイス'],['AT','Austria','オーストリア'],['IE','Ireland','アイルランド'],['NO','Norway','ノルウェー'],['FI','Finland','フィンランド'],['PT','Portugal','ポルトガル'],['BE','Belgium','ベルギー']];
        box.innerHTML='<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted);">'+
          '<select class="hcc" style="'+selStyle+'flex:1;min-width:0;">'+HC.map(c=>'<option value="'+c[0]+'"'+(c[0]===(e.cfg.cc||'US')?' selected':'')+'>'+(jp()?c[2]:c[1])+'</option>').join('')+'</select>'+
          '<button class="hcok" style="'+selStyle+'cursor:pointer;font-weight:600;">OK</button></div>';
        box.querySelector('.hcok').onclick=()=>{ e.cfg.cc=box.querySelector('.hcc').value; save(); box.style.display='none'; refreshOne(e); };
      }
    }
    function tickClock(){ if(!visible()) return;
      let tz; try{ if(typeof HOST.userTZ!=='undefined'&&HOST.userTZ&&HOST.userTZ!=='auto') tz=HOST.userTZ; }catch(_){}
      const now=new Date();
      active.filter(e=>e.t==='clock').forEach(e=>{ let tstr,dstr;
        try{ tstr=now.toLocaleTimeString(jp()?'ja-JP':'en-GB',{hour:'2-digit',minute:'2-digit',timeZone:tz}); }catch(_){ tstr=now.toLocaleTimeString(); }
        try{ dstr=now.toLocaleDateString(jp()?'ja-JP':'en-GB',{weekday:'short',month:'short',day:'numeric',timeZone:tz}); }catch(_){ dstr=now.toLocaleDateString(); }
        setV(e.u,'<span style="font-size:26px;">'+tstr+'</span>', dstr+(tz?' · '+tz:'')); });
      /* (#R33) Analog clock widget. */
      /* (#R36) ROOT CAUSE of "アナログ時計が動かない" AND "some widgets are too slow to update": this block
         referenced `dstr`, which is block-scoped to the DIGITAL clock forEach above — so in the aclock callback
         it was undefined → ReferenceError → setV never ran (clock blank) AND, worse, the throw ABORTED the rest of
         tickClock, freezing every locally-ticked widget after it (countdown / world clock / population / year
         progress). Compute dstr locally + wrap each block so one bad widget can never freeze the others. */
      active.filter(e=>e.t==='aclock').forEach(e=>{ try{ let d=now; try{ if(tz) d=new Date(now.toLocaleString('en-US',{timeZone:tz})); }catch(_){}
        let dstr=''; try{ dstr=now.toLocaleDateString(jp()?'ja-JP':'en-GB',{weekday:'short',month:'short',day:'numeric',timeZone:tz}); }catch(_){ dstr=''; }
        const h=d.getHours()%12, mi=d.getMinutes(), se=d.getSeconds();
        const hand=(ang,len,w,col)=>{ const a=(ang-90)*Math.PI/180; return '<line x1="50" y1="50" x2="'+(50+len*Math.cos(a)).toFixed(1)+'" y2="'+(50+len*Math.sin(a)).toFixed(1)+'" stroke="'+col+'" stroke-width="'+w+'" stroke-linecap="round"/>'; };
        let ticks=''; for(let i=0;i<12;i++){ const a=(i*30-90)*Math.PI/180; ticks+='<line x1="'+(50+40*Math.cos(a)).toFixed(1)+'" y1="'+(50+40*Math.sin(a)).toFixed(1)+'" x2="'+(50+45.5*Math.cos(a)).toFixed(1)+'" y2="'+(50+45.5*Math.sin(a)).toFixed(1)+'" stroke="var(--text-muted)" stroke-width="'+(i%3===0?2.4:1.2)+'"/>'; }
        const svg='<svg viewBox="0 0 100 100" width="96" height="96" style="display:block;margin:1px auto 0;"><circle cx="50" cy="50" r="47.5" fill="none" stroke="var(--text-muted)" stroke-width="2" opacity="0.55"/>'+ticks+hand(h*30+mi*0.5,25,3.2,'var(--text-main)')+hand(mi*6,34,2.3,'var(--text-main)')+hand(se*6,38,1.1,'var(--primary-color)')+'<circle cx="50" cy="50" r="2.6" fill="var(--primary-color)"/></svg>';
        setV(e.u, svg, dstr+(tz?' · '+tz:'')); }catch(_){} });
      active.filter(e=>e.t==='countdown').forEach(e=>{ try{ refreshCountdown(e); }catch(_){} });
      /* (#R21) Locally-computed widgets ride the clock tick so they're always current. */
      active.filter(e=>e.t==='worldclock').forEach(e=>{ try{ const z=(e.cfg&&e.cfg.tz)||'Asia/Tokyo'; let ts,ds;
        try{ ts=now.toLocaleTimeString(jp()?'ja-JP':'en-GB',{hour:'2-digit',minute:'2-digit',timeZone:z}); ds=now.toLocaleDateString(jp()?'ja-JP':'en-GB',{weekday:'short',timeZone:z}); }catch(_){ ts='—'; ds=''; }
        setV(e.u,'<span style="font-size:24px;">'+ts+'</span>', ds+' · '+z.split('/').pop().replace(/_/g,' '));
        const nm=document.querySelector('.wgt-card[data-u="'+e.u+'"] .wgt-nm'); if(nm) nm.textContent=(jp()?'世界時計 ':'World clock ')+z.split('/').pop().replace(/_/g,' '); }catch(_){} });
      active.filter(e=>e.t==='pop').forEach(e=>{ try{ /* UN WPP 2024: ~8.231B at mid-2025, ≈ +2.17 persons/sec */
        const v=8.231e9+(Date.now()-Date.UTC(2025,6,1))/1000*2.17;
        setV(e.u,(v/1e9).toFixed(6)+' <span style="font-size:13px;">B</span>', (jp()?'国連推計ベースのライブ推定':'live estimate, UN-based')); }catch(_){} });
      active.filter(e=>e.t==='yearprog').forEach(e=>{ try{ const y=now.getFullYear(); const a=new Date(y,0,1), b=new Date(y+1,0,1);
        const fr=Math.min(1,Math.max(0,(now-a)/(b-a))); const day=Math.ceil((now-a)/864e5);
        setV(e.u,(fr*100).toFixed(1)+'%<div style="height:7px;border-radius:4px;background:rgba(128,128,128,0.22);margin-top:7px;overflow:hidden;"><div style="height:100%;width:'+(fr*100).toFixed(1)+'%;background:var(--primary-color);border-radius:4px;"></div></div>', y+' · '+(jp()?day+'日目':'day '+day)); }catch(_){} });
      /* (#R40) pure-computation widgets */
      active.filter(e=>e.t==='dayprog').forEach(e=>{ try{ const a=new Date(now); a.setHours(0,0,0,0); const fr=Math.min(1,Math.max(0,(now-a)/864e5)); const leftMin=Math.round((864e5-(now-a))/60000); const h=Math.floor(leftMin/60), m=leftMin%60;
        setV(e.u,(fr*100).toFixed(1)+'%<div style="height:7px;border-radius:4px;background:rgba(128,128,128,0.22);margin-top:7px;overflow:hidden;"><div style="height:100%;width:'+(fr*100).toFixed(1)+'%;background:var(--primary-color);border-radius:4px;"></div></div>', (jp()?('残り '+h+'時間'+m+'分'):(h+'h '+m+'m left'))); }catch(_){} });
      active.filter(e=>e.t==='season').forEach(e=>{ try{ const _c0=camCentre(); const lat=_c0?_c0.lat:35; const mo=now.getMonth();
        const nSeason=['winter','winter','spring','spring','spring','summer','summer','summer','autumn','autumn','autumn','winter'][mo];
        const seas=(lat<0)?({winter:'summer',summer:'winter',spring:'autumn',autumn:'spring'})[nSeason]:nSeason;
        const ICON={winter:'❄️',spring:'🌸',summer:'☀️',autumn:'🍂'}, NMjp={winter:'冬',spring:'春',summer:'夏',autumn:'秋'}, NMen={winter:'Winter',spring:'Spring',summer:'Summer',autumn:'Autumn'};
        setV(e.u, ICON[seas]+' '+(jp()?NMjp[seas]:NMen[seas]), (lat<0?(jp()?'南半球':'Southern Hemisphere'):(jp()?'北半球':'Northern Hemisphere'))); }catch(_){} });
      active.filter(e=>e.t==='weeknum').forEach(e=>{ try{ const d=new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())); const dn=(d.getUTCDay()+6)%7; d.setUTCDate(d.getUTCDate()-dn+3); const ft=new Date(Date.UTC(d.getUTCFullYear(),0,4)); const wk=1+Math.round(((d-ft)/864e5-3+((ft.getUTCDay()+6)%7))/7);
        const y0=new Date(now.getFullYear(),0,0); const doy=Math.floor((now-y0)/864e5); const left=Math.ceil((new Date(now.getFullYear(),11,31,23,59,59)-now)/864e5);
        setV(e.u,'W'+wk, (jp()?('第'+doy+'日 · 残り'+left+'日'):('day '+doy+' · '+left+' left'))); }catch(_){} });
      active.filter(e=>e.t==='unixclock').forEach(e=>{ try{ const s=Math.floor(Date.now()/1000);
        setV(e.u,'<span style="font-size:19px;">'+s.toLocaleString()+'</span>', (jp()?'秒（1970-01-01 UTCから）':'seconds since 1970-01-01 UTC')); }catch(_){} });
      active.filter(e=>e.t==='mapcenter').forEach(e=>{ try{ const c=camCentre(); if(c){ const _z=camZoom(); setV(e.u,'<span style="font-size:16px;">'+c.lat.toFixed(3)+'°, '+c.lng.toFixed(3)+'°</span>', (jp()?'ズーム ':'zoom ')+(_z!=null?_z.toFixed(1):'')); } }catch(_){} });
      active.filter(e=>e.t==='fullmoon').forEach(e=>{ try{ const syn=29.530588853, ref=Date.UTC(2000,0,6,18,14); const phase=((((Date.now()-ref)/864e5)%syn)+syn)%syn; const toFull=((syn/2)-phase+syn)%syn; const days=Math.round(toFull);
        setV(e.u, days===0?(jp()?'今夜！':'Tonight!'):('🌕 '+days+(jp()?'日後':'d')), (jp()?'次の満月まで':'until the next full moon')); }catch(_){} });
      /* (#R41) pure-computation map-aware widgets */
      active.filter(e=>e.t==='newmoon').forEach(e=>{ try{ const syn=29.530588853, ref=Date.UTC(2000,0,6,18,14); const phase=((((Date.now()-ref)/864e5)%syn)+syn)%syn; const toNew=(syn-phase)%syn; const days=Math.round(toNew);
        setV(e.u, days===0?(jp()?'今夜！':'Tonight!'):('🌑 '+days+(jp()?'日後':'d')), (jp()?'次の新月まで':'until the next new moon')); }catch(_){} });
      active.filter(e=>e.t==='daylength').forEach(e=>{ try{ const _c1=camCentre(); const lat=_c1?_c1.lat:35; const st=new Date(now.getFullYear(),0,0); const doy=Math.floor((now-st)/864e5);
        const decl=-23.44*Math.cos((360/365)*(doy+10)*Math.PI/180); const cosH=-Math.tan(lat*Math.PI/180)*Math.tan(decl*Math.PI/180);
        let hrs; if(cosH<=-1) hrs=24; else if(cosH>=1) hrs=0; else hrs=(2*Math.acos(cosH)*180/Math.PI)/15; const h=Math.floor(hrs), m=Math.round((hrs-h)*60);
        setV(e.u,'🌞 '+h+'h '+(m<10?'0':'')+m+'m', (jp()?'緯度 ':'lat ')+lat.toFixed(1)+'° · '+(jp()?'日照':'daylight')); }catch(_){} });
      active.filter(e=>e.t==='mapscale').forEach(e=>{ try{ const _c2=camCentre(), _z2=camZoom(); if(!_c2||_z2==null) return; const lat=_c2.lat, z=_z2;
        const mpp=156543.03392*Math.cos(lat*Math.PI/180)/Math.pow(2,z); const v=(mpp>=1000)?((mpp/1000).toFixed(1)+' km/px'):(mpp>=1?Math.round(mpp)+' m/px':(mpp*100).toFixed(0)+' cm/px');
        const bar=mpp*100, barStr=bar>=1000?(bar/1000).toFixed(1)+' km':Math.round(bar)+' m';
        setV(e.u,'<span style="font-size:18px;">'+v+'</span>', (jp()?'100pxバー ≈ ':'100-px bar ≈ ')+barStr+' · z'+z.toFixed(1)); }catch(_){} });
      active.filter(e=>e.t==='calendar').forEach(e=>{ try{ const y=now.getFullYear(), mo=now.getMonth(), today=now.getDate(); const startDow=(new Date(y,mo,1).getDay()+6)%7, dim=new Date(y,mo+1,0).getDate();
        const dn=jp()?['月','火','水','木','金','土','日']:['M','T','W','T','F','S','S'];
        let html='<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;font-size:9px;text-align:center;line-height:14px;">';
        dn.forEach(x=>html+='<span style="color:var(--text-muted);font-weight:700;">'+x+'</span>');
        for(let i=0;i<startDow;i++) html+='<span></span>';
        for(let d2=1;d2<=dim;d2++){ const is=d2===today; html+='<span style="'+(is?'background:var(--primary-color);color:#fff;border-radius:50%;font-weight:700;':'color:var(--text-main);')+'display:inline-block;width:14px;height:14px;">'+d2+'</span>'; }
        html+='</div>';
        setV(e.u, html, ''); try{ const es=document.getElementById('wgts-'+e.u); if(es) es.textContent=now.toLocaleDateString(jp()?'ja-JP':(HOST.lang==='en'?'en-US':HOST.lang),{month:'long',year:'numeric'}); }catch(_){} }catch(_){} });
    }
    const wIco=(c)=>{ if(c==null)return '🌡'; if(c===0)return '☀️'; if(c<=3)return '⛅'; if(c<=48)return '🌫'; if(c<=67)return '🌧'; if(c<=77)return '❄️'; if(c<=82)return '🌦'; if(c<=99)return '⛈'; return '🌡'; };
    const una=()=>jp()?'取得できません':'unavailable';
    /* (#R21) Geolocation for the weather/AQI/sun widgets. The permission PROMPT fires only when a
       weather widget is added (reqGeo); other paths use the position only if already granted. */
    let geoPos=null, geoDenied=false;
    function reqGeo(cb){ try{ if(!navigator.geolocation){ geoDenied=true; cb&&cb(); return; }
        navigator.geolocation.getCurrentPosition(
          p=>{ geoPos={lat:p.coords.latitude,lng:p.coords.longitude,ts:Date.now()}; cb&&cb(); },
          ()=>{ geoDenied=true; cb&&cb(); },
          {enableHighAccuracy:true,maximumAge:0,timeout:20000}); }catch(_){ cb&&cb(); } }   /* (#R170) high accuracy, fresh fix; geoPos is still reused for 10 min by widgetLoc() so this asks the device once */
    async function widgetLoc(){
      const mine=()=>({lat:geoPos.lat,lng:geoPos.lng,lbl:jp()?'現在地':'my location'});
      if(geoPos&&Date.now()-geoPos.ts<10*60*1000) return mine();
      /* (#R22) "Weather shows map center despite my location" root cause: Safari/iOS has no
         navigator.permissions for geolocation, so the old `permissions.query` threw and we fell
         straight through to map center. Now: if state is granted OR unknown (Safari), still try to
         get the position — it won't re-prompt once granted, and location widgets already prompted on add. */
      if(!geoDenied && navigator.geolocation){
        let state='unknown';
        try{ const st=await navigator.permissions.query({name:'geolocation'}); state=st.state; }catch(_){ state='unknown'; }
        if(state==='granted'||state==='unknown'){ await new Promise(res=>reqGeo(res)); if(geoPos) return mine(); }
      }
      /* (#R33) NEVER fall back to map center ("map centerのデータを使用するのはやめて"). No location → null,
         and the widget shows an "Allow location" button (works across devices: a new device re-prompts). */
      return null;
    }
    function wgtLocPrompt(e){ const msg=jp()?'位置情報が必要です':'Location needed';
      setV(e.u, '<button class="wgt-loc-btn" data-u="'+e.u+'" style="background:var(--primary-color);color:#fff;border:none;border-radius:9px;padding:7px 13px;font-size:12px;font-weight:400;cursor:pointer;">'+(jp()?'位置情報を許可':'Allow location')+'</button>', msg);
      /* (#R130) One grant now dismisses EVERY location widget's button, not just this one. reqGeo populates the
         SHARED geoPos cache, so re-rendering all weather/aqi/sun/uv widgets lets them consume the cached coords and
         overwrite their own prompt buttons — "他のウィジェットのボタンも全部それぞれ押さなくていいように". */
      setTimeout(()=>{ const b=document.querySelector('.wgt-loc-btn[data-u="'+e.u+'"]'); if(b) b.onclick=()=>{ geoDenied=false; b.textContent=jp()?'取得中…':'Locating…'; reqGeo(()=>{ try{ active.forEach(w=>{ if(['weather','aqi','sun','uv'].includes(w.t)) refreshOne(w); }); }catch(_){ try{ refreshOne(e); }catch(__){} } }); }; },0); }
    /* (#R183) 「UV Indexとweatherのウィジェットが更新されない。」 ROOT CAUSE, reproduced in the browser:
       api.open-meteo.com was answering 429 {"error":true,"reason":"Daily API request limit exceeded"},
       and this function did `await r.json()` with NO `r.ok` test — an error body is perfectly good JSON,
       so `j.current` came back undefined and the card printed "🌤 —" forever with nothing to explain it.
       The air-quality host has its own quota and kept working, which is exactly why the report named
       `weather` and `uv` and not `aqi`.
       #R72 fixed this same defect in the point-weather popup and the fix could not travel, because every
       caller wrote its own fetch. It travels now: window.IntMapWx is the one guarded client (r.ok +
       {"error":true} checked, MET Norway failover, a circuit breaker so a dead quota is not re-hammered
       all day, request coalescing). See js/wx-source.js. */
    /* When BOTH sources are gone, SAY so — a bare dash is the thing that made this invisible for
       eleven rounds. `_wxWhy` reads the breaker so the line names the actual reason. */
    function _wxWhy(){ try{ const st=window.IntMapWx&&window.IntMapWx.status();
        if(st&&st.down&&st.daily) return _WL('Weather service daily limit reached — retrying after 00:00 UTC',
          '気象サービスの1日の上限に達しました（00:00 UTCに再開）','Tageslimit des Wetterdienstes erreicht — erneut ab 00:00 UTC',
          'Суточный лимит погодного сервиса исчерпан — повтор после 00:00 UTC','Límite diario del servicio meteorológico alcanzado — se reintenta tras las 00:00 UTC');
      }catch(_){}
      return _WL('Weather services unreachable','気象サービスに接続できません','Wetterdienste nicht erreichbar','Погодные сервисы недоступны','Servicios meteorológicos no disponibles'); }
    /* the "as of / via" tail every weather-family card shows, so the source is never a guess */
    function _wxSrc(j){ return (j&&j._src)?(' · '+j._src):''; }
    async function refreshWeather(e){ try{ const c=await widgetLoc(); if(!c){ wgtLocPrompt(e); return; }
        const j=await window.IntMapWx.point(c.lat,c.lng,{days:1,uv:false});
        if(!j){ setV(e.u,'—', _wxWhy()); return; }
        const cu=j.current||{}, dy=j.daily||{};
        const tmp=(window.fmtTemp?window.fmtTemp(cu.temperature_2m):Math.round(cu.temperature_2m)+'°C');
        const hi=dy.temperature_2m_max&&dy.temperature_2m_max[0], lo=dy.temperature_2m_min&&dy.temperature_2m_min[0];
        setV(e.u, wIco(cu.weather_code)+' '+tmp, (hi!=null?('H '+Math.round(hi)+'° · L '+Math.round(lo)+'°  ·  '):'')+c.lbl+_wxSrc(j));
      }catch(_){ setV(e.u,'—', una()); } }
    /* (#R41) Weather at the MAP CENTER — distinct from the geolocation 'weather' widget; needs no permission
       and follows wherever the user pans (refreshed on the data tick). */
    async function refreshMapWeather(e){ try{ const c=camCentre(); if(!c){ setV(e.u,'—',una()); return; }
        const j=await window.IntMapWx.point(c.lat,c.lng,{days:1,uv:false});
        if(!j){ setV(e.u,'—', _wxWhy()); return; }
        const cu=j.current||{}, dy=j.daily||{};
        const tmp=(window.fmtTemp?window.fmtTemp(cu.temperature_2m):Math.round(cu.temperature_2m)+'°C');
        const hi=dy.temperature_2m_max&&dy.temperature_2m_max[0], lo=dy.temperature_2m_min&&dy.temperature_2m_min[0];
        setV(e.u, wIco(cu.weather_code)+' '+tmp, (hi!=null?('H '+Math.round(hi)+'° · L '+Math.round(lo)+'°  ·  '):'')+(jp()?'地図中心':'map center')+_wxSrc(j)); }catch(_){ setV(e.u,'—', una()); } }
    /* (#R21) FX freshness: fxratesapi.com (keyless, CORS*, minute-fresh — curl-verified) is primary;
       open.er-api.com (daily) stays as the fallback. */
    async function refreshFx(e){ try{ const base=(e.cfg&&e.cfg.base)||'USD', quote=(e.cfg&&e.cfg.quote)||'JPY';
        let v=null, when='', src='';
        try{ const r=await fetch('https://api.fxratesapi.com/latest?base='+base+'&currencies='+quote);
          const j=await r.json(); if(j&&j.rates&&j.rates[quote]!=null){ v=j.rates[quote]; when=asOf((j.timestamp||0)*1000); src='fxratesapi'; } }catch(_){}
        if(v==null){ const r=await fetch('https://open.er-api.com/v6/latest/'+base); const j=await r.json();
          v=j.rates&&j.rates[quote]; when=asOf(j.time_last_update_utc); src='ER-API'; }
        const f=(x)=>x==null?'—':(x<0.01?(+x).toFixed(6):x<10?(+x).toFixed(4):(+x).toFixed(2));
        setV(e.u, base+'/'+quote+'<br><span style="font-size:24px;">'+f(v)+'</span>', when+' · '+src);
        const nm=document.querySelector('.wgt-card[data-u="'+e.u+'"] .wgt-nm'); if(nm) nm.textContent=(jp()?'為替 ':'FX ')+base+'/'+quote;
      }catch(_){ setV(e.u,'—', una()); } }
    /* (#R183) Sunrise/sunset used to be a forecast-host request for something that is pure astronomy —
       so the quota outage that killed the weather and UV cards took this one down too, for no reason at
       all. It is computed now (IntMapWx.sunTimes; measured within 3 min of MET Norway's Sunrise 3.0, see
       js/wx-source.js), which means it cannot be rate-limited, needs no network, and works offline.
       Times are rendered in the user's clock (HOST.userTZ when set), and the poles get the honest
       answer instead of a blank: at 78°N in July the sun does not set. */
    function refreshSun(e){ try{ const c0=geoPos&&(Date.now()-geoPos.ts<10*60*1000)?{lat:geoPos.lat,lng:geoPos.lng,lbl:jp()?'現在地':'my location'}:null;
        if(!c0){ widgetLoc().then(c=>{ if(!c) wgtLocPrompt(e); else _paintSun(e,c); }); return; }
        _paintSun(e,c0);
      }catch(_){ setV(e.u,'—', una()); } }
    function _paintSun(e,c){ try{
        const s=window.IntMapWx.sunTimes(c.lat,c.lng);
        let tz; try{ if(HOST.userTZ&&HOST.userTZ!=='auto') tz=HOST.userTZ; }catch(_){}
        const hm=d=>{ try{ return d.toLocaleTimeString(jp()?'ja-JP':'en-GB',{hour:'2-digit',minute:'2-digit',timeZone:tz}); }catch(_){ return '—'; } };
        if(s.polar==='day'){ setV(e.u,'<span style="font-size:17px;">☀️ '+_WL('Midnight sun','白夜','Mitternachtssonne','Полярный день','Sol de medianoche')+'</span>',
            _WL('the sun does not set today','今日は日没がありません','die Sonne geht heute nicht unter','сегодня солнце не заходит','hoy el sol no se pone')+' · '+c.lbl); return; }
        if(s.polar==='night'){ setV(e.u,'<span style="font-size:17px;">🌑 '+_WL('Polar night','極夜','Polarnacht','Полярная ночь','Noche polar')+'</span>',
            _WL('the sun does not rise today','今日は日の出がありません','die Sonne geht heute nicht auf','сегодня солнце не восходит','hoy el sol no sale')+' · '+c.lbl); return; }
        /* Round to MINUTES FIRST, then split. `floor(s/3600)+'h '+round(s%3600/60)+'m'` prints "13h 60m"
           whenever the leftover seconds round up to a full minute — seen in this very card at 13:59:50
           of daylight. Carrying the rounded minute into the hour is the only way that cannot happen. */
        const dl=s.daylightSec;
        const dlMin=Math.round(dl/60), dlTxt=Math.floor(dlMin/60)+'h '+(dlMin%60)+'m';
        setV(e.u,'<span style="font-size:17px;">🌅 '+hm(s.sunrise)+' · 🌇 '+hm(s.sunset)+'</span>',
          (dl?((jp()?'昼の長さ ':'daylight ')+dlTxt+' · '):'')+c.lbl);
      }catch(_){ setV(e.u,'—', una()); } }
    function refreshMoon(e){ try{ const syn=29.530588853, ref=Date.UTC(2000,0,6,18,14)/864e5;
        let age=(Date.now()/864e5-ref)%syn; if(age<0)age+=syn; const ph=age/syn;
        const idx=Math.round(ph*8)%8;
        const ic=['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'][idx];
        const nmE=['New moon','Waxing crescent','First quarter','Waxing gibbous','Full moon','Waning gibbous','Last quarter','Waning crescent'];
        const nmJ=['新月','三日月','上弦の月','十三夜月','満月','寝待月','下弦の月','有明月'];
        const illum=Math.round((1-Math.cos(ph*2*Math.PI))/2*100);
        setV(e.u,ic+' <span style="font-size:15px;">'+(jp()?nmJ[idx]:nmE[idx])+'</span>',(jp()?'月齢 ':'age ')+age.toFixed(1)+(jp()?'日':' d')+' · '+illum+'% '+(jp()?'照度':'lit'));
      }catch(_){ setV(e.u,'—',''); } }
    async function refreshAqi(e){ try{ const c=await widgetLoc(); if(!c){ wgtLocPrompt(e); return; }
        const r=await fetch('https://air-quality-api.open-meteo.com/v1/air-quality?latitude='+c.lat.toFixed(2)+'&longitude='+c.lng.toFixed(2)+'&current=us_aqi,pm2_5');
        const j=await r.json(); const cu=j.current||{}; const v=cu.us_aqi; const cat=_aqiCat(v);   /* (#R154) 6-tier scale + colour-fill */
        _wgtColor(e.u, cat.col);
        setV(e.u, _wgtBig(v!=null?Math.round(v):'—','US AQI', cat.label),
          (cu.pm2_5!=null?('PM2.5 '+(+cu.pm2_5).toFixed(1)+' µg/m³ · '):'')+c.lbl);
      }catch(_){ _wgtColor(e.u,null); setV(e.u,'—', una()); } }
    async function refreshIss(e){ try{ const r=await fetch('https://api.wheretheiss.at/v1/satellites/25544'); const j=await r.json();
        setV(e.u,'🛰 '+(+j.latitude).toFixed(1)+'°, '+(+j.longitude).toFixed(1)+'°',
          '<span class="iss-fly" style="color:var(--primary-color);cursor:pointer;font-weight:600;">'+(jp()?'地図で見る →':'Fly there →')+'</span> · '+Math.round(j.altitude)+' km · '+asOf((j.timestamp||0)*1000));
        const fl=document.querySelector('#wgts-'+e.u+' .iss-fly'); if(fl) fl.onclick=()=>{ camFly({center:[+j.longitude,+j.latitude],zoom:3}); };
      }catch(_){ setV(e.u,'—', una()); } }
    async function refreshWikiFeat(e){ try{ const now=new Date();
        const ymd=now.getFullYear()+'/'+String(now.getMonth()+1).padStart(2,'0')+'/'+String(now.getDate()).padStart(2,'0');
        let tfa=null;
        for(const wl of (jp()?['ja','en']:['en'])){ try{ const r=await fetch('https://api.wikimedia.org/feed/v1/wikipedia/'+wl+'/featured/'+ymd); if(r.ok){ const j=await r.json(); if(j&&j.tfa){ tfa=j.tfa; break; } } }catch(_){} }
        if(!tfa){ setV(e.u,'—', una()); return; }
        const url=(tfa.content_urls&&tfa.content_urls.desktop&&tfa.content_urls.desktop.page)||'';
        setV(e.u,'<span style="font-size:14px;line-height:1.4;font-weight:700;">'+String(tfa.normalizedtitle||tfa.title||'').slice(0,60)+'</span>',
          String(tfa.extract||'').slice(0,90)+'… · Wikipedia');
        const ev=document.getElementById('wgtv-'+e.u); if(ev&&url){ ev.style.cursor='pointer'; ev.onclick=()=>{ try{ window.open(url,'_blank','noopener'); }catch(_){} }; }
      }catch(_){ setV(e.u,'—', una()); } }
    async function refreshCrypto(e){ try{ const r=await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true');
        const j=await r.json(); const b=j.bitcoin||{}, t=j.ethereum||{};
        const pc=(v)=>v==null?'':('<span style="color:'+(v>=0?'#34c759':'#ff3b30')+';">'+(v>=0?'+':'')+v.toFixed(1)+'%</span>');
        setV(e.u,'BTC $'+(b.usd!=null?b.usd.toLocaleString():'—')+' '+pc(b.usd_24h_change)+'<br><span style="font-size:14px;">ETH $'+(t.usd!=null?t.usd.toLocaleString():'—')+' '+pc(t.usd_24h_change)+'</span>', asOf((b.last_updated_at||0)*1000)+' · CoinGecko');
      }catch(_){ setV(e.u,'—', una()); } }
    async function refreshCryptoCap(e){ try{ const r=await fetch('https://api.coingecko.com/api/v3/global'); const j=(await r.json()).data||{};
        const cap=j.total_market_cap&&j.total_market_cap.usd, dom=j.market_cap_percentage&&j.market_cap_percentage.btc, chg=j.market_cap_change_percentage_24h_usd;
        const capS=cap==null?'—':('$'+(cap/1e12).toFixed(2)+'T');
        const pc=(v)=>v==null?'':(' <span style="color:'+(v>=0?'#34c759':'#ff3b30')+';font-size:13px;">'+(v>=0?'+':'')+v.toFixed(1)+'%</span>');
        setV(e.u,capS+pc(chg),'BTC '+(jp()?'ドミナンス':'dominance')+' '+(dom!=null?dom.toFixed(1)+'%':'—')+' · '+asOf((j.updated_at||0)*1000)+' · CoinGecko');
      }catch(_){ setV(e.u,'—', una()); } }
    async function refreshFng(e){ try{ const r=await fetch('https://api.alternative.me/fng/'); const j=await r.json(); const d=(j.data||[])[0]||{};
        const v=+d.value; const col=v>=55?'#34c759':v<=45?'#ff3b30':'#ff9500';
        const cls=jp()?({'Extreme Fear':'極度の恐怖','Fear':'恐怖','Neutral':'中立','Greed':'強欲','Extreme Greed':'極度の強欲'}[d.value_classification]||d.value_classification):d.value_classification;
        setV(e.u,'<span style="color:'+col+';">'+(isNaN(v)?'—':v)+'</span> <span style="font-size:13px;">'+(cls||'')+'</span>', asOf((+d.timestamp||0)*1000)+' · alternative.me');
      }catch(_){ setV(e.u,'—', una()); } }
    async function refreshMetal(e,sym){ try{ const r=await fetch('https://api.gold-api.com/price/'+sym); const j=await r.json();
        setV(e.u,'$'+(+j.price).toLocaleString(undefined,{maximumFractionDigits:2})+' <span style="font-size:12px;color:var(--text-muted);">/oz</span>', asOf(j.updatedAt)+' · gold-api');
      }catch(_){ setV(e.u,'—', una()); } }
    async function refreshQuake(e){ try{ const r=await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'); const j=await r.json();
        const qs=(j.features||[]).filter(f=>f.properties&&f.properties.mag!=null).sort((a,b)=>b.properties.mag-a.properties.mag).slice(0,3);
        if(!qs.length){ setV(e.u,'—', jp()?'M2.5以上なし（24h）':'None ≥ M2.5 (24 h)'); return; }
        const row=(f,big)=>{ const p=f.properties, c=f.geometry.coordinates;
          const ago=Math.max(0,Math.round((Date.now()-p.time)/36e5));
          return '<div class="wq-row" data-ll="'+c[0]+','+c[1]+'" style="cursor:pointer;'+(big?'':'font-size:12px;color:var(--text-muted);')+'margin-top:'+(big?'0':'3px')+';">'+
            '<span style="font-weight:800;'+(big?'font-size:24px;':'font-size:13px;')+'color:'+(p.mag>=6?'#ff3b30':p.mag>=5?'#ff9500':'var(--text-main)')+';">M'+p.mag.toFixed(1)+'</span> '+
            '<span style="font-size:'+(big?'12px':'11px')+';">'+(p.place||'')+' · '+ago+'h</span></div>'; };
        setV(e.u,row(qs[0],true)+(qs[1]?row(qs[1],false):'')+(qs[2]?row(qs[2],false):''), asOf(j.metadata&&j.metadata.generated)+' · USGS');
        document.querySelectorAll('#wgtv-'+e.u+' .wq-row').forEach(rw=>rw.onclick=()=>{ try{ const [lng,lat]=rw.getAttribute('data-ll').split(',').map(Number); camFly({center:[lng,lat],zoom:5}); }catch(_){} });
      }catch(_){ setV(e.u,'—', una()); } }
    let otdList=null, otdDay='';
    async function refreshOtd(e){ try{
        const now=new Date(), key=(now.getMonth()+1)+'-'+now.getDate();
        if(!otdList||otdDay!==key){
          const mm=String(now.getMonth()+1).padStart(2,'0'), dd=String(now.getDate()).padStart(2,'0');
          let j=null;
          for(const wl of (jp()?['ja','en']:['en'])){ try{ const r=await fetch('https://api.wikimedia.org/feed/v1/wikipedia/'+wl+'/onthisday/events/'+mm+'/'+dd); if(r.ok){ j=await r.json(); if(j&&j.events&&j.events.length) break; } }catch(_){} }
          if(j&&j.events&&j.events.length){ otdList=j.events; otdDay=key; }
        }
        if(!otdList||!otdList.length){ setV(e.u,'—', una()); return; }
        const pick=otdList[Math.floor(Math.random()*otdList.length)];
        setV(e.u,'<span style="font-size:13px;line-height:1.45;font-weight:600;">'+pick.year+' — '+String(pick.text||'').slice(0,150)+'</span>',
          (jp()?'タップで別の出来事':'Tap for another')+' · Wikipedia');
        const ev=document.getElementById('wgtv-'+e.u); if(ev){ ev.style.cursor='pointer'; ev.onclick=()=>refreshOtd(e); }
      }catch(_){ setV(e.u,'—', una()); } }
    /* Featured layer — random pick from the REGULAR layer rows; tap turns it on (#R20). */
    const FEAT_IDS=['dl-climate','dl-wind','dl-radar','dl-snow','dl-aod','dl-sst','dl-eez','dl-subcables','dl-planes','dl-sats','eco-dl-worldcover','eco-dl-ecoregions','eco-dl-plates','dl-relief','dl-hillshade','dl-contours','dl-sealevel','dl-pop','dl-popgrid','dl-gdppc','dl-tfr','dl-hdi','dl-dem','dl-thermal','l9-dl-aurora','dl-nightsat','dl-night','dl-fsu','dl-milSpend','dl-milSpendGDP','dl-nato','dl-eu','beta-dl-histb','beta-dl-ukrfront','dl-nuclear'];
    function refreshFeatured(e){ try{
        const avail=FEAT_IDS.map(id=>document.getElementById(id)).filter(Boolean);
        if(!avail.length){ setV(e.u,'—',''); return; }
        const cb=avail[Math.floor(Math.random()*avail.length)];
        const lab=cb.closest('label'); const sp=lab&&lab.querySelector('span:not(.lyr-sw):not(.lsr-thumb)'); const name=((sp?sp.textContent:'')||cb.id).trim();
        setV(e.u,'<span style="font-size:15px;font-weight:700;">'+name+'</span>','<span style="color:var(--primary-color);font-weight:600;cursor:pointer;">'+(jp()?'タップして地図に表示 →':'Tap to show on the map →')+'</span>');
        const ev=document.getElementById('wgtv-'+e.u), es=document.getElementById('wgts-'+e.u);
        const act=()=>{ try{ if(!cb.checked){ cb.checked=true; cb.dispatchEvent(new Event('change',{bubbles:true})); } try{ imToast((jp()?'レイヤーを表示: ':'Layer on: ')+name); }catch(_){} }catch(_){} };
        [ev,es].forEach(x=>{ if(x){ x.style.cursor='pointer'; x.onclick=act; } });
      }catch(_){ setV(e.u,'—',''); } }
    function refreshCountry(e){ try{
        /* (#R23) only real sovereign states — skip uninhabited reefs/banks/ice fields (sov===false or pop 0) */
        const all=Object.values((typeof countryStats!=='undefined'&&countryStats)||{}).filter(s=>s&&s.nameEn&&s.sov!==false&&s.pop>0);
        if(!all.length){ setV(e.u,'…', jp()?'国データ読込中':'loading country data'); setTimeout(()=>refreshCountry(e),2500); return; }
        const s=all[Math.floor(Math.random()*all.length)];
        const nm=jp()?(s.nameJp||s.nameEn):s.nameEn;
        const fm=(v)=>{ if(v==null) return '—'; if(v>=1e9) return (v/1e9).toFixed(2)+'B'; if(v>=1e6) return (v/1e6).toFixed(1)+'M'; if(v>=1e3) return (v/1e3).toFixed(0)+'K'; return String(v); };
        setV(e.u,'<span class="wc-go" style="cursor:pointer;" title="'+(jp()?'この国へ移動':'Fly to this country')+'">'+window.imFlagHTML(s.flag,22)+' <span style="font-size:15px;font-weight:700;">'+nm+'</span></span>',
          (jp()?'人口 ':'Pop ')+fm(s.pop)+(s.gdp!=null?' · GDP '+(typeof fmtMoney==='function'?fmtMoney(s.gdp):'$'+s.gdp+'B'):'')+(s.area!=null?' · '+fm(s.area)+' km²':'')+'<br><span style="color:var(--primary-color);cursor:pointer;font-weight:600;" class="wc-next">'+(jp()?'別の国 ↻':'Another ↻')+'</span>');
        const nx=document.querySelector('#wgts-'+e.u+' .wc-next'); if(nx) nx.onclick=(ev)=>{ ev.stopPropagation(); refreshCountry(e); };
        /* (#R34) Tap the country → fit the WHOLE country. The old flyTo used zoom:Math.max(map.getZoom(),4.2),
           so if you were already zoomed in it stayed city-close ("zoomed too close. Show an entire country").
           Now fitBounds the country geometry (maxZoom 6 so a tiny country still shows with context); fall back
           to a sensible low-zoom flyTo when the geometry is unavailable or spans the antimeridian. */
        const go=document.querySelector('#wgtv-'+e.u+' .wc-go'); if(go) go.onclick=()=>{ try{ if(!GE().hasRenderer()) return;
          /* (#R37) Frame the WHOLE country (more context, never city-close) with a GENTLE animation. The user
             re-reported both "zoomed too close" AND "jump too fast" after the R36 cameraForBounds+speed:1.2 (1.2
             is MapLibre's DEFAULT — i.e. still the fast snap). Fix: cap the framing zoom a notch lower (maxZoom 5,
             so even a small country is shown with its surroundings) and fly at speed 0.7 with a flat curve, so the
             camera glides in calmly like a deliberate navigation rather than snapping. */
          const flyOpts=(center,zoom)=>({center,zoom,speed:0.7,curve:1.3,essential:true});
          let done=false;
          try{ const cg=window.countryGeo; const ft=cg&&cg.features&&cg.features.find(f=>String(f.id)===String(s.code));
            if(ft&&ft.geometry&&typeof turf!=='undefined'){ const bb=turf.bbox(ft);
              if(bb&&bb.every(isFinite)&&(bb[2]-bb[0])<180&&(bb[3]-bb[1])<170){
                const cam=camForBounds([[bb[0],bb[1]],[bb[2],bb[3]]],{padding:50,maxZoom:5});
                if(cam&&cam.center){ camFly(flyOpts(cam.center,cam.zoom)); done=true; }
                else { camFit([[bb[0],bb[1]],[bb[2],bb[3]]],{padding:50,maxZoom:5,speed:0.7,essential:true}); done=true; } } } }catch(_){}
          if(!done){ const ll=s.latlng; if(ll) camFly(flyOpts([ll[1],ll[0]],4)); }
          try{ if(typeof closeSheet==='function') closeSheet(); }catch(_){}
        }catch(_){} };
      }catch(_){ setV(e.u,'—',''); } }
    function refreshCountdown(e){ try{
        if(!e.cfg||!e.cfg.date){ setV(e.u,'<span style="font-size:13px;color:var(--text-muted);">'+(jp()?'⚙ から日付と題名を設定':'Set date & title via ⚙')+'</span>',''); return; }
        const tgt=new Date(e.cfg.date+'T00:00:00'); const now=new Date();
        const days=Math.ceil((tgt-now)/864e5);
        const title=e.cfg.title||(jp()?'カウントダウン':'Countdown');
        if(isNaN(days)){ setV(e.u,'—',''); return; }
        const v=days>0?('<span style="font-size:26px;">'+days+'</span> '+(jp()?'日':'days'))
               :days===0?(jp()?'<span style="font-size:20px;">今日！🎉</span>':'<span style="font-size:20px;">Today! 🎉</span>')
               :('<span style="font-size:18px;">'+(jp()?(-days)+'日前':Math.abs(days)+' days ago')+'</span>');
        setV(e.u,v,'<b style="color:var(--text-main);">'+String(title).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</b> · '+e.cfg.date);
      }catch(_){ setV(e.u,'—',''); } }
    /* (#R22) New live widgets — all keyless + CORS-verified. */
    /* (#R183) Same root cause as the weather card (see refreshWeather), and one extra trap on the way out.
       Open-Meteo's `uv_index` is the ALL-SKY index; MET Norway publishes `ultraviolet_index_clear_sky`,
       which ignores cloud and is therefore an upper bound — a different quantity. Writing it into the same
       field would have made the number quietly change meaning the moment the source changed, so the
       fallback value is carried separately and the card SAYS "clear sky" when that is what it is showing. */
    async function refreshUv(e){ try{ const c=await widgetLoc(); if(!c){ wgtLocPrompt(e); return; }
        const j=await window.IntMapWx.point(c.lat,c.lng,{days:1,uv:true});
        if(!j){ _wgtColor(e.u,null); setV(e.u,'—', _wxWhy()); return; }
        const cu=j.current||{}, dy=j.daily||{};
        const allSky=(cu.uv_index!=null);
        const uv=allSky?cu.uv_index:cu.uv_index_clear_sky;
        const mx=allSky?(dy.uv_index_max&&dy.uv_index_max[0]):(dy.uv_index_clear_sky_max&&dy.uv_index_clear_sky_max[0]);
        const cat=_uvCat(uv);   /* (#R154) colour-fill */
        _wgtColor(e.u, cat.col);
        const clearNote=(uv!=null&&!allSky)?(_WL('clear sky','快晴時','klarer Himmel','ясное небо','cielo despejado')+' · '):'';
        /* "today's max" is only true of a whole-day aggregate. The fallback's first bucket starts at the
           current hour (dy._partialFirstDay), so it is the peak still to come — said as such. */
        const mxLbl=dy._partialFirstDay?_WL('peak ahead ','この先の最大 ','Spitze voraus ','пик впереди ','pico próximo ')
                                       :_WL('max ','本日最大 ','max ','макс. ','máx ');
        setV(e.u, _wgtBig(uv!=null?(+uv).toFixed(1):'—','UV', cat.label),
          clearNote+((mx!=null?(mxLbl+(+mx).toFixed(1)+' · '):''))+(cu.time?asOf(cu.time)+' · ':'')+c.lbl+_wxSrc(j));   /* (#R146) reading date/time via asOf() */
      }catch(_){ _wgtColor(e.u,null); setV(e.u,'—', una()); } }
    async function refreshKp(e){ try{ const r=await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json');
        /* (#R33) NOAA changed this feed from array-rows to an array of OBJECTS ({time_tag,Kp,…}) — the old
           last[1] read undefined → the widget showed "—" ("Aurora widget is not working"). Handle both. */
        const a=await r.json(); let kp=NaN, when='';
        if(Array.isArray(a)&&a.length){ const last=a[a.length-1];
          if(last&&typeof last==='object'&&!Array.isArray(last)){ kp=parseFloat(last.Kp!=null?last.Kp:last.kp_index); when=last.time_tag||''; }
          else { const rows=a.slice(1); const lr=rows[rows.length-1]||[]; kp=parseFloat(lr[1]); when=(lr[0]||'').replace(' ','T'); } }
        const col=kp>=7?'#af52de':kp>=5?'#ff3b30':kp>=4?'#ff9500':'#34c759';
        const note=kp>=5?(jp()?'地磁気嵐（オーロラの可能性）':'Storm — aurora likely'):kp>=4?(jp()?'活発':'Active'):(jp()?'静穏':'Quiet');
        setV(e.u,'Kp <span style="color:'+col+';">'+(isNaN(kp)?'—':kp.toFixed(0))+'</span>', note+' · '+asOf(when)+' · NOAA');
      }catch(_){ setV(e.u,'—', una()); } }
    async function refreshHn(e){ try{ const ids=await (await fetch('https://hacker-news.firebaseio.com/v0/topstories.json')).json();
        const it=await (await fetch('https://hacker-news.firebaseio.com/v0/item/'+ids[0]+'.json')).json();
        const url=it.url||('https://news.ycombinator.com/item?id='+it.id);
        setV(e.u,'<span style="font-size:14px;line-height:1.4;font-weight:700;">'+String(it.title||'').slice(0,80)+'</span>','▲ '+(it.score||0)+' · '+(it.by||'')+' · Hacker News');
        const ev=document.getElementById('wgtv-'+e.u); if(ev){ ev.style.cursor='pointer'; ev.onclick=()=>{ try{ window.open(url,'_blank','noopener'); }catch(_){} }; }
      }catch(_){ setV(e.u,'—', una()); } }
    let holCache={};
    async function refreshHoliday(e){ try{ const cc=(e.cfg&&e.cfg.cc)||'US';
        const nm=document.querySelector('.wgt-card[data-u="'+e.u+'"] .wgt-nm'); if(nm) nm.textContent=(jp()?'次の祝日 ':'Next holiday ')+cc;
        let list=holCache[cc];
        if(!list||Date.now()-list.ts>6*3600*1000){ const r=await fetch('https://date.nager.at/api/v3/NextPublicHolidays/'+cc); list={data:await r.json(),ts:Date.now()}; holCache[cc]=list; }
        const h=(list.data||[])[0]; if(!h){ setV(e.u,'—', una()); return; }
        const d=new Date(h.date+'T00:00:00'); const days=Math.ceil((d-new Date())/864e5);
        setV(e.u,'<span style="font-size:15px;font-weight:700;">'+(h.localName||h.name)+'</span>', h.date+' · '+(days<=0?(jp()?'本日':'today'):(jp()?('あと'+days+'日'):('in '+days+' days'))));
      }catch(_){ setV(e.u,'—', una()); } }
    let launchCache=null;
    async function refreshLaunch(e){ try{
        if(!launchCache||Date.now()-launchCache.ts>30*60*1000){ const r=await fetch('https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=1&mode=list'); const j=await r.json(); launchCache={data:(j.results||[])[0],ts:Date.now()}; }
        const L=launchCache.data; if(!L){ setV(e.u,'—', una()); return; }
        const net=L.net?new Date(L.net):null; const days=net?Math.ceil((net-new Date())/864e5):null;
        setV(e.u,'🚀 <span style="font-size:14px;font-weight:700;">'+String(L.name||'').slice(0,70)+'</span>',(net?net.toLocaleDateString(jp()?'ja-JP':'en-GB',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'')+(days!=null&&days>=0?' · '+(jp()?('あと'+days+'日'):('in '+days+' d')):'')+' · LL2');
      }catch(_){ setV(e.u,'—', una()); } }
    async function refreshBtc(e){ try{
        const h=await (await fetch('https://mempool.space/api/blocks/tip/height')).json();
        let fee=null; try{ fee=await (await fetch('https://mempool.space/api/v1/fees/recommended')).json(); }catch(_){}
        setV(e.u,'₿ <span style="font-size:18px;">#'+(+h).toLocaleString()+'</span>',(fee?((jp()?'手数料 ':'fee ')+fee.fastestFee+' sat/vB · '):'')+(jp()?'ブロック高':'block height')+' · mempool.space');
      }catch(_){ setV(e.u,'—', una()); } }
    function refreshOne(e){ if(!e) return;
      switch(e.t){ case 'clock': tickClock(); break; case 'weather': refreshWeather(e); break; case 'fx': refreshFx(e); break;
        case 'crypto': refreshCrypto(e); break; case 'cryptocap': refreshCryptoCap(e); break; case 'fng': refreshFng(e); break;
        case 'gold': refreshMetal(e,'XAU'); break; case 'silver': refreshMetal(e,'XAG'); break; case 'quake': refreshQuake(e); break;
        case 'otd': refreshOtd(e); break; case 'featured': refreshFeatured(e); break; case 'country': refreshCountry(e); break;
        case 'countdown': refreshCountdown(e); break;
        case 'sun': refreshSun(e); break; case 'moon': refreshMoon(e); break; case 'aqi': refreshAqi(e); break;
        case 'iss': refreshIss(e); break; case 'wikifeat': refreshWikiFeat(e); break;
        case 'uv': refreshUv(e); break; case 'kp': refreshKp(e); break; case 'hn': refreshHn(e); break;
        case 'holiday': refreshHoliday(e); break; case 'launch': refreshLaunch(e); break; case 'btc': refreshBtc(e); break;
        case 'mapweather': refreshMapWeather(e); break;
        case 'worldclock': case 'pop': case 'yearprog': case 'dayprog': case 'season': case 'weeknum': case 'unixclock': case 'mapcenter': case 'fullmoon': case 'newmoon': case 'daylength': case 'mapscale': case 'calendar': tickClock(); break; } }
    function refreshAll(){ if(!visible()) return; active.forEach(refreshOne); }
    /* (#R21) Market/fast data refreshes every 60 s (was one 5-min tick for everything — the
       "数時間遅れ" was the daily ER-API source, now replaced; this keeps the board live). */
    const FAST=new Set(['fx','crypto','cryptocap','fng','gold','silver','iss']);
    const LOCAL=new Set(['clock','countdown','featured','country','otd','worldclock','pop','yearprog','moon']);
    function refreshFast(){ if(!visible()) return; active.forEach(e=>{ if(FAST.has(e.t)) refreshOne(e); }); }
    function refreshData(){ if(!visible()) return; active.forEach(e=>{ if(!FAST.has(e.t)&&!LOCAL.has(e.t)) refreshOne(e); }); }
    function visible(){ return board && board.style.display!=='none' && board.offsetParent!==null; }
    function sync(){ const b=ensureBoard(); if(!b) return;
      const noTab=(typeof HOST.mode==='undefined'||!HOST.mode);
      if(noTab){ b.style.display='block'; if(!b.dataset.built){ b.dataset.built='1'; render(); } else refreshAll();
        /* (#R37) 1-second tick — ROOT CAUSE of "アナログ時計の秒針が動かない": at 30 s the second hand only
           redrew twice a minute, so it looked frozen. A 1 s tick is a handful of cheap setV writes (clock text
           + analog SVG + the live population counter) → the second hand sweeps and the pop counter ticks live. */
        if(!clockT) clockT=setInterval(tickClock,1000);
        if(!dataT){ dataT=setInterval(refreshData,3*60*1000); setInterval(refreshFast,60*1000);   /* (#R24) 5→3 min data tick, fresher widgets */
          document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&visible()) refreshAll(); });
          window.addEventListener('focus',()=>{ if(visible()) refreshAll(); }); }   /* (#R24) also refresh the moment the window regains focus, so returning to the tab is never hours-stale */
      } else { b.style.display='none'; } }
    window.addEventListener('intmap-lang',()=>{ if(board){ board.dataset.built=''; if(board.style.display!=='none'){ board.dataset.built='1'; render(); } } });
    window.IntMapWidgets2={ sync, render, _active:()=>active, _setActive:(a)=>{ if(Array.isArray(a)){ active=a; active.forEach(e=>{ if(!e.u) e.u='w'+Math.random().toString(36).slice(2,8); if(!e.cfg) e.cfg={}; }); try{ localStorage.setItem(KEY,JSON.stringify(active)); }catch(_){} if(board){ board.dataset.built=''; sync(); } } } };
    if(document.readyState!=='loading') setTimeout(sync,0); else document.addEventListener('DOMContentLoaded',()=>setTimeout(sync,0));
  })();
};
