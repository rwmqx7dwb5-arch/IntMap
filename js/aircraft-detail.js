/* ============================================================================
 *  IntMap · LIVE AIRCRAFT — the detail card behind a click  (#R175)
 * ----------------------------------------------------------------------------
 *  「また、航空機をクリックしたら、より詳細な画像が出るように。また、クリック画面から、その初期条件から
 *    フライトシミュレーターを開始できるボタンを置いて。」
 *
 *  Hovering an aircraft has always shown a tooltip. A CLICK now opens a real card: a PHOTOGRAPH of that
 *  exact airframe, every field the ADS-B feed carries (not the eight the tooltip had room for), and a
 *  button that hands the aircraft's own position, altitude, heading and airspeed to the flight simulator.
 *
 *  ── WHERE THE PHOTOGRAPH COMES FROM ────────────────────────────────────────────────────────────
 *  planespotters.net's public photo API, keyed by the SAME ICAO 24-bit address the ADS-B feed reports
 *  (`/pub/photos/hex/{hex}`), so the picture is of the individual airframe overhead — not a stock shot of
 *  the type. Keyless, CORS-enabled, free for non-commercial use provided the photographer is credited and
 *  the photo links back, which is why the credit line under every picture is not optional decoration.
 *  When that airframe has never been photographed the card SAYS SO; it never falls back to a picture of
 *  something else, and it never invents one. Registered in js/reference-data.js (Sources ▸ terms).
 *
 *  ── WHAT "THE SAME INITIAL CONDITIONS" MEANS ───────────────────────────────────────────────────
 *  The button is not "fly near here". It starts js/flight-sim.js at the aircraft's reported longitude and
 *  latitude, at its GEOMETRIC altitude (GPS — the height the aeroplane really is, falling back to the
 *  barometric one), on its TRUE track, at its TRUE AIRSPEED where the feed reports one and its ground
 *  speed otherwise. Those five numbers are then landed inside the chosen machine's own flight envelope,
 *  read live from the simulator through IntMapFlightSim.spec() rather than copied here — and when a clamp
 *  bites, the card says which number moved and why. The simulator's aircraft is chosen from the ADS-B
 *  emitter category and the military flag, and the card NAMES it, because "fly this A330" cannot be
 *  honest when the simulator's heaviest machine is an A320.
 *
 *  ── RENDERER / MODULE RULES ────────────────────────────────────────────────────────────────────
 *  · No <style> here — the CSS lives in css/intmap.css (standing rule for every module since #R162).
 *  · The card is a `.country-popup`, deliberately: it inherits the app's existing detail-card look, its
 *    drag behaviour and its mobile bottom-sheet, instead of inventing a second UI vocabulary (#R148).
 *  · Every value that reaches the DOM goes through window.IntMapSafe (#R138).
 *  · Five languages inline (standing rule 3), the way js/drone-nav.js does it.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.aircraftDetail=function(map,HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  const L=(en,jp,de,ru,es)=>HOST.lang==='jp'?jp:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?es:en;
  const S=(v)=>{ try{ return window.IntMapSafe.html(v==null?'':String(v)); }catch(_){ return ''; } };
  const U=(v)=>{ try{ return window.IntMapSafe.url(String(v||'')); }catch(_){ return ''; } };
  const KT=0.514444, FT=3.28084;

  /* ─── unit helpers. The tooltip has always shown metres AND feet side by side because aviation is
         flown in feet and the rest of IntMap is metric; the card keeps that rather than picking a side. */
  const n0=(v)=>Math.round(v).toLocaleString(HOST.lang==='jp'?'ja-JP':'en-US');
  const altTxt=(m)=>m==null?'':n0(m)+' m · '+n0(m*FT)+' ft';
  const spdTxt=(ms)=>ms==null?'':n0(ms)+' m/s · '+n0(ms*3.6)+' km/h · '+n0(ms/KT)+' kn';
  const degTxt=(d)=>d==null?'':(Math.round(d*10)/10)+'°';

  /* ─── THE ADS-B EMITTER CATEGORY, spelled out. The feed reports the raw DO-260B code (A1 … C5) and a
         great many transponders report A0, which means "no information" — printing "A0" as if it were a
         fact is worse than printing nothing, so the card shows the meaning and drops the empty ones. */
  const CAT={
    A1:['Light (< 7 t)','小型機（7 t 未満）','Leicht (< 7 t)','Лёгкий (< 7 т)','Ligero (< 7 t)'],
    A2:['Small (7–34 t)','中型機（7〜34 t）','Klein (7–34 t)','Малый (7–34 т)','Pequeño (7–34 t)'],
    A3:['Large (34–136 t)','大型機（34〜136 t）','Groß (34–136 t)','Крупный (34–136 т)','Grande (34–136 t)'],
    A4:['High-vortex large (B757)','大型・高後方乱気流（B757）','Große Wirbelschleppe (B757)','Крупный, сильный след (B757)','Gran estela (B757)'],
    A5:['Heavy (> 136 t)','超大型機（136 t 超）','Schwer (> 136 t)','Тяжёлый (> 136 т)','Pesado (> 136 t)'],
    A6:['High performance (> 5 g, > 400 kn)','高性能機（5 g・400 kn 超）','Hochleistung (> 5 g, > 400 kn)','Высокоманёвренный (> 5 g, > 400 уз)','Alto rendimiento (> 5 g, > 400 kn)'],
    A7:['Rotorcraft','回転翼機','Drehflügler','Винтокрылый','Aeronave de alas giratorias'],
    B1:['Glider / sailplane','グライダー','Segelflugzeug','Планёр','Planeador'],
    B2:['Lighter-than-air','軽航空機（気球・飛行船）','Leichter als Luft','Легче воздуха','Más ligero que el aire'],
    B3:['Parachutist','パラシュート','Fallschirmspringer','Парашютист','Paracaidista'],
    B4:['Ultralight / paraglider','超軽量動力機・パラグライダー','Ultraleicht / Gleitschirm','Сверхлёгкий / параплан','Ultraligero / parapente'],
    B6:['Unmanned aircraft','無人航空機','Unbemannt','Беспилотник','No tripulado'],
    B7:['Space / trans-atmospheric','宇宙機・大気圏往還機','Raumfahrzeug','Космический аппарат','Vehículo espacial'],
    C1:['Surface — emergency vehicle','地上車両（緊急）','Bodenfahrzeug (Einsatz)','Наземный транспорт (экстренный)','Vehículo de emergencia'],
    C2:['Surface — service vehicle','地上車両（作業）','Bodenfahrzeug (Dienst)','Наземный транспорт (служебный)','Vehículo de servicio'],
    C3:['Point obstacle','点状障害物','Punkthindernis','Точечное препятствие','Obstáculo puntual']
  };
  function catTxt(c){ const k=String(c||'').toUpperCase(), a=CAT[k]; if(!a) return '';
    return L(a[0],a[1],a[2],a[3],a[4])+' ('+k+')'; }

  /* ─── WHICH SIMULATOR AIRCRAFT. A ladder over what the feed actually knows, most reliable first:
         ① the DO-260B emitter category, when the transponder reports a real one;
         ② the airframe's ICAO type designator and the registry description the feed carries with it —
            needed because A0 ("no information") is extremely common, and it is what made a Boeing 737-800
            fly as a Cessna in the first build of this card;
         ③ the curated military flag;
         ④ observed ground speed, the only signal left when a transponder reports nothing but a position.
         The card NAMES the machine it picked, so a wrong guess is visible before the flight, not after. */
  function simKeyFor(p){
    const cat=String(p&&p.category||'').toUpperCase(), mil=(p&&p.type)==='military';
    const v=(p&&p.vel!=null)?+p.vel:null;
    const D=String(p&&p.desc||'').toUpperCase(), T=String(p&&p.acType||'').toUpperCase();
    /* ① emitter category */
    if(cat==='B1'||cat==='B2'||cat==='B4') return 'glider';
    if(cat==='A6') return mil?'f35':'fighter';
    if(cat==='A3'||cat==='A4'||cat==='A5') return 'airliner';
    if(cat==='A7') return 'cessna';
    if(cat==='A1'||cat==='A2') return mil?'warbird':'cessna';
    /* ② type designator / registry description */
    if(/GLIDER|SAILPLANE|SCHLEICHER|SCHEMPP|DG FLUGZEUG/.test(D)) return 'glider';
    if(/HELICOPTER|EUROCOPTER|ROBINSON|SIKORSKY|AGUSTA|BELL |AIRBUS HELI/.test(D)||/^(EC|AS3|R22|R44|R66|B06|B407|B412|S76|S92|H60|A109|A139|AW1|H12|H125|H135|H145|H175)/.test(T)) return 'cessna';
    if(/F-35|LIGHTNING II/.test(D)) return 'f35';
    if(/F-16|F-15|F-22|F\/A-18|F-18|EUROFIGHTER|TORNADO|RAFALE|GRIPEN|MIG-|SU-2[457]|SU-3[045]|A-10|HARRIER/.test(D)) return 'fighter';
    if(/BOEING|AIRBUS|EMBRAER|BOMBARDIER|CANADAIR|MCDONNELL|DOUGLAS|DE HAVILLAND CANADA DHC-8|ATR-|TUPOLEV|ILYUSHIN|ANTONOV|SUKHOI SUPERJET|COMAC|LOCKHEED C-130|LOCKHEED L-1011|FOKKER 100|BAE SYSTEMS AVRO/.test(D)) return 'airliner';
    if(/^(A[23]|B7|B3[89]|BCS|C919|CRJ|DH8|E1[79]|E2[9]|AT[47]|MD[189]|RJ[18]|SU95|IL[679]|AN[127])/.test(T)) return 'airliner';
    /* ③ military, ④ observed speed */
    if(mil) return (v!=null&&v>180)?'fighter':'warbird';
    if(v!=null&&v>150) return 'airliner';
    if(v!=null&&v<70) return 'cessna';
    return v!=null?'airliner':'cessna';
  }

  /* Ground elevation under a point, from whatever the app already knows — the 3-D terrain when it is on,
     otherwise the keyless DEM sampler behind the elevation profile (js/map-readout.js), the same one
     js/drone-nav.js measures its clearances with. null when neither can answer yet. */
  const DEM_Z=12;   /* terrarium z12 ≈ 38 m/pixel — ample for a spawn-clearance figure, and one tile covers a busy TMA */
  function groundAt(lng,lat){
    try{ if(GE().coords.terrainElevation){ const v=GE().coords.terrainElevation([lng,lat]); if(v!=null&&isFinite(v)) return +v; } }catch(_){}
    try{ const v=HOST.demElevBilinear(lng,lat,DEM_Z); if(v!=null&&isFinite(v)) return +v; }catch(_){}
    return null;
  }
  function fsSpec(key){ try{ const FS=window.IntMapFlightSim; return (FS&&FS.spec)?FS.spec(key):null; }catch(_){ return null; } }
  function specName(sp){ if(!sp) return ''; const nm=(sp.name&&(sp.name[HOST.lang]||sp.name.en))||sp.key; return String(nm).split('·')[0].trim(); }

  /* The initial conditions the button will actually use, plus WHY each one differs from the live report
     when it does. Computed separately from the click so the card can show them before you commit. */
  function initialConditions(p){
    const key=simKeyFor(p), sp=fsSpec(key);
    const rawAlt=(p.geoAlt!=null?p.geoAlt:(p.baroAlt!=null?p.baroAlt:null));
    const rawSpd=(p.tas!=null?p.tas*KT:(p.vel!=null?p.vel:null));
    const hdg=(p.trueHdg!=null?p.trueHdg:(p.heading!=null?p.heading:0));
    let alt=(rawAlt!=null?rawAlt:1500), spd=(rawSpd!=null?rawSpd:(sp?sp.Vcruise:120)), notes=[];
    /* THE GROUND IS NOT SEA LEVEL. An aeroplane taxiing at Denver reports "on ground" and a barometric
       altitude of zero; spawning a flight at 150 m AMSL there would start it 1.5 km inside the terrain and
       the simulator's collision check would end the flight on frame one. So the floor is measured against
       the real ground under that aircraft, and only falls back to a sea-level figure when neither the 3-D
       terrain nor the DEM sampler can answer yet (the card warms the tiles on open). */
    const grd=groundAt(p.lng,p.lat);
    if(p.onGround){ alt=Math.max(alt,(grd!=null?grd:0)+300); spd=Math.max(spd,sp?sp.Vstall*1.35:45);
      notes.push(L('on the ground — released just above the field, flying',
                   '地上の機体 — 飛行できる高度・速度で離陸直後の状態から開始',
                   'am Boden — Start knapp über dem Platz, in Fahrt',
                   'на земле — старт чуть выше аэродрома, уже в полёте',
                   'en tierra — inicio justo sobre el campo, ya en vuelo')); }
    else if(grd!=null&&alt<grd+150){ alt=grd+150;
      notes.push(L('raised to clear the terrain below it','直下の地形をよけて高度を引き上げ','Höhe über das Gelände angehoben','высота поднята над рельефом','altitud elevada para librar el terreno')); }
    if(sp){
      const vMin=sp.Vstall*1.25, vMax=sp.Vne*0.92;
      if(spd<vMin){ spd=vMin; notes.push(L('airspeed raised to the stall margin','失速余裕まで速度を引き上げ','Fahrt auf Überziehreserve angehoben','скорость поднята до запаса по срыву','velocidad elevada al margen de pérdida')); }
      else if(spd>vMax){ spd=vMax; notes.push(L('airspeed capped at never-exceed','超過禁止速度で頭打ち','Fahrt auf Vne begrenzt','скорость ограничена Vne','velocidad limitada a Vne')); }
      if(alt>sp.ceil){ alt=sp.ceil; notes.push(L('altitude capped at the service ceiling','実用上昇限度で頭打ち','Höhe auf Dienstgipfelhöhe begrenzt','высота ограничена практическим потолком','altitud limitada al techo de servicio')); }
    }
    return { key, spec:sp, lng:p.lng, lat:p.lat, alt:Math.max(30,alt), hdg, speed:spd, notes,
             rawAlt, rawSpd, altClamped:(rawAlt!=null&&Math.abs(alt-rawAlt)>1), spdClamped:(rawSpd!=null&&Math.abs(spd-rawSpd)>0.5) };
  }

  /* ─── THE PHOTOGRAPH. One request per airframe per session, hits AND misses cached, because the card is
         re-rendered on every 20-second ADS-B refresh and a live feed of 40 aircraft must not become 40
         requests a minute. `seq` drops a reply that arrives after the user has clicked something else. */
  const photoCache=new Map();
  let seq=0;
  async function photoFor(hex){
    const k=String(hex||'').toUpperCase(); if(!k) return null;
    if(photoCache.has(k)) return photoCache.get(k);
    let out=null;
    try{
      const r=await fetch('https://api.planespotters.net/pub/photos/hex/'+encodeURIComponent(k));
      if(r.ok){ const j=await r.json(); const ph=(j&&Array.isArray(j.photos))?j.photos[0]:null;
        if(ph){ const im=ph.thumbnail_large||ph.thumbnail||null;
          if(im&&im.src) out={ src:im.src, w:(im.size&&im.size.width)||420, h:(im.size&&im.size.height)||280,
                               link:ph.link||'', by:ph.photographer||'' }; } }
    }catch(_){ /* offline / blocked — the card simply says there is no photo */ }
    photoCache.set(k,out); return out;
  }

  /* ─── the card itself ─── */
  let el=null, cur=null, curTrack=null, onToggleTrack=null;
  function ensureEl(){
    if(el&&document.body.contains(el)) return el;
    el=document.createElement('div');
    el.className='country-popup ac-popup'; el.id='ac-popup';
    el.innerHTML='<button class="country-popup-close" id="acp-close" type="button" title="'+S(L('Close','閉じる','Schließen','Закрыть','Cerrar'))+'">✕</button>'
      +'<div class="country-popup-header"><h3 id="acp-title"></h3></div><div id="acp-body"></div>';
    (document.getElementById('map-container')||document.body).appendChild(el);
    el.querySelector('#acp-close').addEventListener('click',()=>close());
    try{ HOST.makeDraggable(el, el.querySelector('.country-popup-header')); }catch(_){}
    el.addEventListener('mousedown',()=>{ try{ HOST.bringToFront(el); }catch(_){} });
    /* the two actions the body carries, delegated so a re-render never leaves a dead button behind */
    el.addEventListener('click',(ev)=>{
      const b=ev.target&&ev.target.closest?ev.target.closest('[data-acp]'):null; if(!b) return;
      if(b.dataset.acp==='fly') flyFrom();
      else if(b.dataset.acp==='track'&&onToggleTrack){ try{ onToggleTrack(cur&&cur.icao24); }catch(_){} }
    });
    return el;
  }

  const row=(k,v)=>v===''||v==null?'':'<div class="acp-row"><span class="acp-k">'+S(k)+'</span><span class="acp-v">'+S(v)+'</span></div>';
  const sec=(title)=>'<div class="acp-sec">'+S(title)+'</div>';

  function bodyHTML(p,photo,photoPending){
    const jpish=HOST.lang==='jp';
    const ic=initialConditions(p);
    const title=(p.callsign||p.reg||p.icao24||'—');
    /* the photo block — a real picture with its mandatory credit, or an honest empty state */
    let photoHTML;
    if(photo) photoHTML='<a class="acp-photo" href="'+U(photo.link||('https://www.planespotters.net/hex/'+String(p.icao24||'')))+'" target="_blank" rel="noopener noreferrer">'
        +'<img src="'+U(photo.src)+'" width="'+(photo.w|0)+'" height="'+(photo.h|0)+'" alt="'+S(title)+'" decoding="async" referrerpolicy="no-referrer-when-downgrade">'
        +'</a><div class="acp-credit">'+S('© '+(photo.by||'—'))+' · '+S(L('photo: Planespotters.net','写真: Planespotters.net','Foto: Planespotters.net','фото: Planespotters.net','foto: Planespotters.net'))+'</div>';
    else photoHTML='<div class="acp-photo acp-photo-none">'+S(photoPending
        ? L('Looking for a photo of this airframe…','この機体の写真を検索中…','Suche ein Foto dieses Flugzeugs…','Ищем фото этого борта…','Buscando una foto de este avión…')
        : L('No photo of this airframe is available.','この機体の写真は見つかりませんでした。','Kein Foto dieses Flugzeugs verfügbar.','Фото этого борта нет.','No hay foto de este avión.'))+'</div>';

    const mil=p.type==='military';
    const badge='<span class="acp-badge '+(mil?'mil':'civ')+'">'+S(mil?L('Military','軍用','Militärisch','Военный','Militar'):L('Civilian','民間','Zivil','Гражданский','Civil'))+'</span>';
    const emerg=p.emergency?'<span class="acp-badge emg">'+S(L('Emergency: ','緊急事態: ','Notfall: ','Аварийная ситуация: ','Emergencia: ')+p.emergency)+'</span>':'';

    const dist=(()=>{ try{ const c=GE().camera.getCenter(); const R=6371, r=Math.PI/180;
      const dLat=(p.lat-c.lat)*r, dLng=(p.lng-c.lng)*r;
      const a=Math.sin(dLat/2)**2+Math.cos(c.lat*r)*Math.cos(p.lat*r)*Math.sin(dLng/2)**2;
      const km=2*R*Math.asin(Math.min(1,Math.sqrt(a)));
      return (Math.round(km*10)/10)+' km'; }catch(_){ return ''; } })();

    const tr=curTrack&&curTrack.fixes>=2
      ? '<div class="acp-track">'+S(L('Observed track: ','観測した軌跡: ','Beobachtete Spur: ','Наблюдаемый трек: ','Traza observada: ')+curTrack.fixes+(jpish?'点 · ':' fixes · ')+curTrack.minutes+(jpish?'分':' min'))
        +' <button type="button" class="acp-mini" data-acp="track">'+S(curTrack.on
            ? L('Hide','非表示','Ausblenden','Скрыть','Ocultar') : L('Show','表示','Anzeigen','Показать','Mostrar'))+'</button></div>'
      : '';

    const simName=specName(ic.spec)||ic.key;
    const notes=ic.notes.length?'<div class="acp-note">'+S(ic.notes.join(' · '))+'</div>':'';

    return photoHTML
      +'<div class="acp-badges">'+badge+emerg+'</div>'
      +sec(L('Identity','機体','Kennung','Идентификация','Identidad'))
      +row(L('Aircraft','機種','Muster','Тип ВС','Aeronave'), p.desc||p.acType||'')
      +row(L('Type code','型式コード','Musterkürzel','Код типа','Código de tipo'), p.acType||'')
      +row(L('Registration','登録記号','Kennzeichen','Регистрация','Matrícula'), p.reg||'')
      +row('ICAO24', p.icao24?p.icao24.toUpperCase():'')
      +row(L('Call sign','便名・コールサイン','Rufzeichen','Позывной','Indicativo'), p.callsign||'')
      +row(L('Emitter category','送信機カテゴリ','Emitterkategorie','Категория излучателя','Categoría de emisor'), catTxt(p.category))
      +sec(L('Flight','飛行','Flug','Полёт','Vuelo'))
      +row(L('Altitude (baro)','高度（気圧）','Höhe (Baro)','Высота (баро)','Altitud (baro)'), p.onGround?L('on the ground','地上','am Boden','на земле','en tierra'):altTxt(p.baroAlt))
      +row(L('Altitude (GPS)','高度（GPS）','Höhe (GPS)','Высота (GPS)','Altitud (GPS)'), altTxt(p.geoAlt))
      +row(L('Selected altitude','選択高度（autopilot）','Gewählte Höhe','Заданная высота','Altitud seleccionada'), altTxt(p.navAlt))
      +row(L('Vertical rate','昇降率','Steig-/Sinkrate','Вертикальная скорость','Velocidad vertical'), p.vrate==null?'':((p.vrate>0?'▲ ':p.vrate<0?'▼ ':'')+(Math.round(p.vrate*10)/10)+' m/s · '+n0(p.vrate*FT*60)+' ft/min'))
      +row(L('Ground speed','対地速度','Geschwindigkeit über Grund','Путевая скорость','Velocidad respecto al suelo'), spdTxt(p.vel))
      +row(L('Indicated airspeed','指示対気速度','Angezeigte Fahrt','Приборная скорость','Velocidad indicada'), p.ias==null?'':n0(p.ias)+' kn')
      +row(L('True airspeed','真対気速度','Wahre Fahrt','Истинная скорость','Velocidad verdadera'), p.tas==null?'':n0(p.tas)+' kn')
      +row(L('Mach','マッハ','Mach','Число Маха','Mach'), p.mach==null?'':('M '+p.mach.toFixed(3)))
      +row(L('Track','針路（対地）','Kurs über Grund','Путевой угол','Rumbo'), degTxt(p.heading))
      +row(L('Heading (true / mag)','機首方位（真/磁）','Steuerkurs (rw/mw)','Курс (ист./магн.)','Rumbo (verd./magn.)'), (p.trueHdg==null&&p.magHdg==null)?'':((p.trueHdg!=null?degTxt(p.trueHdg):'—')+' / '+(p.magHdg!=null?degTxt(p.magHdg):'—')))
      +row(L('Bank','バンク角','Querneigung','Крен','Alabeo'), p.roll==null?'':degTxt(p.roll))
      +row(L('Squawk','スコーク','Squawk','Сквок','Squawk'), p.squawk||'')
      +sec(L('Air around it','機体周辺の大気','Luft ringsum','Воздух вокруг','Aire alrededor'))
      +row(L('Outside air temp.','外気温','Außentemperatur','Наружная температура','Temperatura exterior'), p.oat==null?'':(Math.round(p.oat)+' °C'))
      +row(L('Wind','風','Wind','Ветер','Viento'), (p.windSpd==null&&p.windDir==null)?'':((p.windDir!=null?Math.round(p.windDir)+'° ':'')+(p.windSpd!=null?n0(p.windSpd)+' kn':'')))
      +row(L('QNH','QNH','QNH','QNH','QNH'), p.navQnh==null?'':(Math.round(p.navQnh)+' hPa'))
      +sec(L('Position','位置','Position','Позиция','Posición'))
      +row(L('Coordinates','座標','Koordinaten','Координаты','Coordenadas'), (p.lat!=null&&p.lng!=null)?(p.lat.toFixed(4)+', '+p.lng.toFixed(4)):'')
      +row(L('From the map centre','地図中心からの距離','Von der Kartenmitte','От центра карты','Desde el centro del mapa'), dist)
      +tr
      +sec(L('Reception','受信','Empfang','Приём','Recepción'))
      +row(L('Last seen','最終受信','Zuletzt gesehen','Последний приём','Última recepción'), p.lastContact?agoStr(p.lastContact):'')
      +row(L('Signal','信号強度','Signal','Сигнал','Señal'), p.rssi==null?'':(p.rssi.toFixed(1)+' dBFS'))
      +row(L('Messages','メッセージ数','Nachrichten','Сообщений','Mensajes'), p.messages==null?'':n0(p.messages))
      +row(L('Source','信号種別','Quelle','Источник','Fuente'), p.src||'')
      +'<button type="button" class="acp-fly" data-acp="fly">'
        +'<span class="acp-fly-h">'+S(L('Fly from these conditions','この初期条件でフライトを開始','Mit diesen Bedingungen fliegen','Взлететь с этими условиями','Volar con estas condiciones'))+'</span>'
        +'<span class="acp-fly-s">'+S((ic.spec&&ic.spec.icon?ic.spec.icon+' ':'')+simName+' · '+altTxt(ic.alt)+' · '+degTxt(ic.hdg)+' · '+n0(ic.speed/KT)+' kn')+'</span>'
      +'</button>'
      +notes
      +'<div class="acp-src">'+S('airplanes.live · ADS-B')+(photo?S(' · planespotters.net'):'')+'</div>';
  }

  function agoStr(sec){ const s=Math.max(0,Math.round(Date.now()/1000-sec));
    const U5=HOST.lang==='jp'?['秒前','分前','時間前']:HOST.lang==='de'?['s her','min her','h her']:HOST.lang==='ru'?['с назад','мин назад','ч назад']:HOST.lang==='es'?['s atrás','min atrás','h atrás']:['s ago','m ago','h ago'];
    const sep=(HOST.lang==='jp')?'':' ';
    if(s<60) return s+sep+U5[0]; if(s<3600) return Math.floor(s/60)+sep+U5[1]; return Math.floor(s/3600)+sep+U5[2]; }

  function render(photo,pending){
    if(!cur) return; const e=ensureEl();
    const h=e.querySelector('#acp-title');
    if(h) h.innerHTML='✈ '+S(cur.callsign||cur.reg||cur.icao24||'—');
    const b=e.querySelector('#acp-body'); if(!b) return;
    /* The live feed re-renders this card every 20 s. The card is taller than its box and scrolls, so
       rebuilding the body would jump a reader back to the top three times a minute — keep where they
       are. (The scroller is the .country-popup shell, which is what has overflow-y.) */
    const top=e.scrollTop;
    b.innerHTML=bodyHTML(cur,photo,pending);
    if(top) e.scrollTop=top;
  }

  function place(){
    const e=ensureEl(); const mc=document.getElementById('map-container');
    if(!mc) return;
    /* first open only — afterwards the card stays where the user dragged it */
    if(e.dataset.placed==='1') return; e.dataset.placed='1';
    const r=mc.getBoundingClientRect();
    e.style.left=Math.max(12,r.width-e.offsetWidth-24)+'px';
    e.style.top='84px';
  }

  function open(plane,opts){
    if(!plane) return false;
    opts=opts||{};
    cur=plane; curTrack=opts.track||null; onToggleTrack=opts.onToggleTrack||null;
    const e=ensureEl(); e.style.display='block';
    const my=++seq;
    render(null,true); place();
    try{ HOST.bringToFront(e); }catch(_){}
    photoFor(plane.icao24).then(ph=>{ if(my!==seq||!cur) return; render(ph,false); });
    /* pull the DEM tile under the aircraft into the cache so the flight's ground clearance is measured
       rather than assumed, then re-render so the card shows the altitude the button will really use */
    try{ if(HOST.warmDEMTiles&&plane.lng!=null&&plane.lat!=null){
      const w=HOST.warmDEMTiles([[plane.lng,plane.lat]],DEM_Z,9000);
      if(w&&w.then) w.then(()=>{ if(my!==seq||!cur) return; const k=String(cur.icao24||'').toUpperCase();
        render(photoCache.has(k)?photoCache.get(k):null, !photoCache.has(k)); }).catch(()=>{}); } }catch(_){}
    return true;
  }
  /* the live feed refreshes every 20 s — keep the open card on the SAME airframe current rather than stale */
  function update(plane,opts){
    if(!cur||!plane||!el||el.style.display==='none') return false;
    if(String(plane.icao24||'').toUpperCase()!==String(cur.icao24||'').toUpperCase()) return false;
    cur=plane; if(opts&&opts.track) curTrack=opts.track;
    const k=String(cur.icao24||'').toUpperCase();
    render(photoCache.has(k)?photoCache.get(k):null, !photoCache.has(k));
    return true;
  }
  function setTrack(t){ if(!cur) return; curTrack=t||null;
    const k=String(cur.icao24||'').toUpperCase(); render(photoCache.has(k)?photoCache.get(k):null,!photoCache.has(k)); }
  function close(){ seq++; cur=null; curTrack=null; if(el) el.style.display='none'; }
  function isOpen(){ return !!(el&&el.style.display!=='none'&&cur); }
  function current(){ return cur?String(cur.icao24||'').toUpperCase():null; }

  function flyFrom(){
    if(!cur) return false;
    const FS=window.IntMapFlightSim;
    if(!FS||!FS.start){ try{ HOST.imToast(L('The flight simulator is unavailable.','フライトシミュレーターを利用できません。','Der Flugsimulator ist nicht verfügbar.','Авиасимулятор недоступен.','El simulador de vuelo no está disponible.')); }catch(_){} return false; }
    const ic=initialConditions(cur);
    close();
    /* keepAlt: this caller KNOWS the altitude — see the spawn-clearance note in js/flight-sim.js. Without
       it the simulator lifts every airborne start to ground +1,500 m and a 250 m approach becomes 1,500 m. */
    try{ FS.start({ aircraft:ic.key, lng:ic.lng, lat:ic.lat, alt:ic.alt, hdg:ic.hdg, speed:ic.speed, keepAlt:true }); return true; }
    catch(_){ return false; }
  }

  return { open, update, close, isOpen, current, setTrack, flyFrom, initialConditions, simKeyFor, _photoFor:photoFor };
};
