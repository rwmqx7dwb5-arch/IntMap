/* ============================================================================
 *  IntMap · LIVE SATELLITES — the detail card behind a click  (#R184)
 * ----------------------------------------------------------------------------
 *  The counterpart of js/aircraft-detail.js, for orbit. Hovering a satellite shows a tooltip; a CLICK
 *  opens this card: what the object IS, where it is right now, the shape of the orbit it is in, what
 *  it looks like FROM HERE (look angles, and the next time it comes over the horizon), and how old the
 *  element set behind all of it is.
 *
 *  ── WHY THERE IS NO PHOTOGRAPH ─────────────────────────────────────────────────────────────────
 *  The aircraft card shows a picture of that exact airframe because planespotters.net publishes one,
 *  keyed by the same ICAO 24-bit address the feed reports. There is no equivalent keyless, per-object,
 *  correctly-licensed image source for the satellite catalogue, and a "representative satellite photo"
 *  next to a named object is a picture of something else — standing instruction 4. So the card spends
 *  its space on numbers that are real instead.
 *
 *  ── WHAT IS COMPUTED HERE VERSUS READ ──────────────────────────────────────────────────────────
 *  Nothing on this card comes from the feed except the identity fields and the element set. Position,
 *  altitude, speed, sunlit state, look angles, range, Doppler and the pass prediction are all computed
 *  by js/satellites-live.js from the elements, which is what makes them consistent with the dot on the
 *  map — the card and the layer read the same propagation, never two.
 *
 *  ── ORBIT CLASS IS A STATEMENT ABOUT THE NUMBERS, NOT A LABEL FROM THE FEED ────────────────────
 *  CelesTrak's GP records carry no "this is a GEO satellite" field. The class shown is derived from
 *  the period, the eccentricity and the inclination — the same three numbers an orbital analyst would
 *  use — and the thresholds are the conventional ones, so "geostationary" means the object really is
 *  within a degree of the equator on a 23 h 56 m near-circular orbit rather than merely being high up.
 *
 *  ── RENDERER / MODULE RULES ────────────────────────────────────────────────────────────────────
 *  · No <style> here — the CSS lives in css/intmap.css (standing rule for every module since #R162).
 *  · The card is a `.country-popup`, deliberately: it inherits the app's existing detail-card look,
 *    its drag behaviour and its mobile bottom-sheet, instead of inventing a second UI vocabulary.
 *  · Every value that reaches the DOM goes through window.IntMapSafe (#R138).
 *  · Five languages inline (standing rule 3).
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.satelliteDetail=function(HOST){
  const GE=()=>window.IntMapGeoEngine;
  const SATS=()=>window.IntMapSatellites;
  const L=window.IntMapLang.pick(()=>HOST.lang);
  const S=(v)=>{ try{ return window.IntMapSafe.html(v==null?'':String(v)); }catch(_){ return ''; } };

  const n0=(v)=>(v==null||!isFinite(v))?'':Math.round(v).toLocaleString(window.IntMapLang.locale(HOST.lang));
  const KM=(v)=>(v==null||!isFinite(v))?'':n0(v)+' km';

  /* ─── ORBIT CLASS, derived. Conventional thresholds, applied to the numbers actually in hand. */
  function orbitClass(f){
    const p=f.periodMin, e=f.ecc||0, i=Math.abs(f.inclDeg==null?0:f.inclDeg), h=f.altKm;
    if(p!=null&&Math.abs(p-1436)<30&&e<0.01&&i<1.5) return L('Geostationary (GEO)','静止軌道 (GEO)','Geostationär (GEO)','Геостационарная (GEO)','Geoestacionaria (GEO)');
    if(p!=null&&Math.abs(p-1436)<30) return L('Geosynchronous (GSO)','静止同期軌道 (GSO)','Geosynchron (GSO)','Геосинхронная (GSO)','Geosíncrona (GSO)');
    if(e>=0.25) return L('Highly elliptical (HEO)','長楕円軌道 (HEO)','Hochexzentrisch (HEO)','Высокоэллиптическая (ВЭО)','Muy elíptica (HEO)');
    if(h>=2000&&h<35000) return L('Medium Earth orbit (MEO)','中軌道 (MEO)','Mittlere Erdumlaufbahn (MEO)','Средняя орбита (MEO)','Órbita media (MEO)');
    if(h<2000){
      if(i>=96&&i<=105) return L('Sun-synchronous low Earth orbit','太陽同期低軌道','Sonnensynchroner LEO','Солнечно-синхронная НОО','Órbita baja heliosíncrona');
      if(i>80) return L('Polar low Earth orbit','極軌道（低軌道）','Polarer LEO','Полярная НОО','Órbita baja polar');
      return L('Low Earth orbit (LEO)','低軌道 (LEO)','Niedrige Erdumlaufbahn (LEO)','Низкая околоземная (НОО)','Órbita baja (LEO)');
    }
    return L('High Earth orbit','高軌道','Hohe Erdumlaufbahn','Высокая орбита','Órbita alta');
  }

  /* Apogee / perigee from the mean motion and eccentricity — a is (mu/n²)^⅓, and the two radii are
     a(1±e) minus the Earth's radius. Real elements, real conic, no lookup table. */
  const MU=398600.4418, RE=6378.137;
  function apsides(f){
    if(!(f.periodMin>0)) return null;
    const n=2*Math.PI/(f.periodMin*60);                      /* rad s⁻¹ */
    const a=Math.cbrt(MU/(n*n));                             /* km */
    const e=Math.max(0,Math.min(0.98,f.ecc||0));
    return { apoKm:a*(1+e)-RE, periKm:a*(1-e)-RE, aKm:a };
  }

  const clock=(ms)=>{ try{ return new Date(ms).toLocaleTimeString(window.IntMapLang.locale(HOST.lang,"en-GB"),{hour:'2-digit',minute:'2-digit',second:'2-digit'}); }catch(_){ return ''; } };
  function inTxt(ms){ const s=Math.max(0,Math.round((ms-Date.now())/1000));
    if(s<60) return s+(window.IntMapLang.t(HOST.lang,' s',' 秒後',' Sek',' с',' s'));
    const m=Math.floor(s/60); if(m<60) return m+(window.IntMapLang.t(HOST.lang,' min',' 分後',' Min',' мин',' min'))+' '+String(s%60).padStart(2,'0')+(window.IntMapLang.t(HOST.lang,' s',' 秒',' Sek',' с',' s'));
    return Math.floor(m/60)+(window.IntMapLang.t(HOST.lang,' h',' 時間',' Std',' ч',' h'))+' '+String(m%60).padStart(2,'0')+(window.IntMapLang.t(HOST.lang,' min',' 分後',' Min',' мин',' min')); }
  function ageTxt(h){ if(h==null||!isFinite(h)) return '';
    if(h<1) return Math.round(h*60)+(window.IntMapLang.t(HOST.lang,' min',' 分前',' Min',' мин',' min'));
    if(h<48) return h.toFixed(1)+(window.IntMapLang.t(HOST.lang,' h',' 時間前',' Std',' ч',' h'));
    return (h/24).toFixed(1)+(window.IntMapLang.t(HOST.lang,' d',' 日前',' T',' сут',' d')); }

  /* ─── the card itself ─── */
  let el=null, curId=null, pass=null, passFor=null, passBusy=false;
  function ensureEl(){
    if(el&&document.body.contains(el)) return el;
    el=document.createElement('div');
    el.className='country-popup sat-popup'; el.id='sat-popup';
    el.innerHTML='<button class="country-popup-close" id="satp-close" type="button" title="'+S(L('Close','閉じる','Schließen','Закрыть','Cerrar'))+'">×</button>'
      +'<div class="country-popup-header"><h3 id="satp-title"></h3></div><div id="satp-body"></div>';
    (document.getElementById('map-container')||document.body).appendChild(el);
    el.querySelector('#satp-close').addEventListener('click',()=>close());
    try{ HOST.makeDraggable(el, el.querySelector('.country-popup-header')); }catch(_){}
    el.addEventListener('mousedown',()=>{ try{ HOST.bringToFront(el); }catch(_){} });
    /* delegated so a re-render (once a second, while the object moves) never leaves a dead button */
    el.addEventListener('click',(ev)=>{
      const b=ev.target&&ev.target.closest?ev.target.closest('[data-satp]'):null; if(!b) return;
      if(b.dataset.satp==='goto') gotoSat();
      else if(b.dataset.satp==='pass') computePass(true);
    });
    return el;
  }

  const row=(k,v)=>(v===''||v==null)?'':'<div class="acp-row"><span class="acp-k">'+S(k)+'</span><span class="acp-v">'+S(v)+'</span></div>';
  const sec=(title)=>'<div class="acp-sec">'+S(title)+'</div>';

  /* THE PASS PREDICTION is a search over up to 24 h of propagation, so it is not run on every one of
     the card's per-second re-renders — once per object, and again only when the user asks. */
  function computePass(force){
    const A=SATS(); if(!A||curId==null) return;
    if(!force&&passFor===curId) return;
    if(passBusy) return;
    passBusy=true; passFor=curId;
    /* next frame, so the click that asked for it has already painted the "computing" state */
    setTimeout(()=>{ try{ pass=A.nextPass(curId,new Date(),24); }catch(_){ pass=null; } passBusy=false; render(); },0);
  }

  function bodyHTML(){
    const A=SATS(); if(!A) return '';
    const f=A.get(curId); if(!f) return '<div class="tp-hint">'+S(L('This satellite is no longer in the current catalog.','この衛星は現在のカタログにありません。','Dieser Satellit ist nicht mehr im aktuellen Katalog.','Этого спутника нет в текущем каталоге.','Este satélite ya no está en el catálogo actual.'))+'</div>';
    const obs=A.observer(), la=A.lookFrom(obs,f), ap=apsides(f), ageH=A.elementAgeH(f);
    const up=!!(la&&la.elDeg>0);

    const badge='<span class="acp-badge '+(up?'civ':'')+'">'+S(up
      ?L('Above the horizon','地平線の上','Über dem Horizont','Над горизонтом','Sobre el horizonte')
      :L('Below the horizon','地平線の下','Unter dem Horizont','Под горизонтом','Bajo el horizonte'))+'</span>';
    const sun=(f.sunlit==null)?'':'<span class="acp-badge '+(f.sunlit?'sunlit':'ecl')+'">'+S(f.sunlit
      ?L('Sunlit','太陽光を受けている','Sonnenbeschienen','Освещён Солнцем','Iluminado')
      :L('In eclipse','地球の影の中','Im Erdschatten','В тени Земли','En eclipse'))+'</span>';
    /* naked-eye visibility is the CONJUNCTION of three facts, and saying so is the point: the object
       has to be up, it has to be in sunlight, and the observer has to be in the dark. */
    const nakedEye=up&&f.sunlit===true;

    /* the pass block */
    let passHTML='';
    if(passBusy) passHTML='<div class="tp-hint">'+S(L('Searching the next 24 hours…','今後24時間を計算中…','Suche in den nächsten 24 Stunden…','Ищем в ближайшие 24 часа…','Buscando en las próximas 24 horas…'))+'</div>';
    else if(pass&&passFor===curId){
      if(pass.none) passHTML='<div class="tp-hint">'+S(L('This satellite does not rise above the horizon here in the next 24 hours.','今後24時間、この地点では地平線の上に出ません。','Er geht hier in den nächsten 24 Stunden nicht auf.','В ближайшие 24 часа он здесь не восходит.','No se eleva sobre el horizonte aquí en las próximas 24 horas.'))+'</div>';
      else passHTML=row(pass.inProgress?L('Pass in progress','通過中','Überflug läuft','Пролёт идёт','Paso en curso')
                                       :L('Rises','出現','Aufgang','Восход','Sale'),
                        pass.inProgress?L('now','現在','jetzt','сейчас','ahora'):(clock(pass.riseMs)+' · '+inTxt(pass.riseMs)))
        +row(L('Max elevation','最大仰角','Höchststand','Максимум','Punto más alto'), (pass.maxEl==null?'':pass.maxEl.toFixed(1)+'° · '+clock(pass.maxMs)))
        +row(L('Sets','消失','Untergang','Заход','Se pone'), pass.setMs?clock(pass.setMs):'')
        +row(L('Duration','継続時間','Dauer','Длительность','Duración'), pass.durationS?(Math.floor(pass.durationS/60)+(window.IntMapLang.t(HOST.lang,' min ',' 分 ',' Min ',' мин ',' min '))+String(pass.durationS%60).padStart(2,'0')+(window.IntMapLang.t(HOST.lang,' s',' 秒',' Sek',' с',' s'))):'');
    } else passHTML='<button type="button" class="acp-mini" data-satp="pass">'+S(L('Compute the next pass from here','ここからの次回通過を計算','Nächsten Überflug berechnen','Рассчитать следующий пролёт','Calcular el próximo paso'))+'</button>';

    return '<div class="acp-badges">'+badge+sun+'</div>'
      +sec(L('Object','対象','Objekt','Объект','Objeto'))
      +row(L('Name','名称','Name','Название','Nombre'), f.name||'')
      +row(L('NORAD catalog number','NORADカタログ番号','NORAD-Katalognummer','Номер NORAD','Número NORAD'), f.id==null?'':String(f.id))
      +row(L('International designator','国際標識番号','Internationale Bezeichnung','Международное обозначение','Designador internacional'), f.intl||'')
      +row(L('Orbit class','軌道の種類','Bahnklasse','Класс орбиты','Clase de órbita'), orbitClass(f))
      +sec(L('Where it is now','現在位置','Aktuelle Position','Где сейчас','Dónde está ahora'))
      +row(L('Sub-satellite point','直下点','Subsatellitenpunkt','Подспутниковая точка','Punto subsatelital'), f.lat.toFixed(4)+', '+f.lng.toFixed(4))
      +row(L('Altitude','高度','Höhe','Высота','Altitud'), KM(f.altKm))
      +row(L('Speed','速度','Geschwindigkeit','Скорость','Velocidad'), f.velKmS==null?'':(f.velKmS.toFixed(3)+' km/s · '+n0(f.velKmS*3600)+' km/h'))
      +row(L('Footprint radius','可視範囲の半径','Sichtbarkeitsradius','Радиус зоны видимости','Radio de cobertura'),
           KM(6371*Math.acos(6378.137/(6378.137+Math.max(1,f.altKm)))))
      +sec(L('The orbit','軌道','Die Bahn','Орбита','La órbita'))
      +row(L('Period','周期','Umlaufzeit','Период','Periodo'), f.periodMin==null?'':(f.periodMin.toFixed(2)+(window.IntMapLang.t(HOST.lang,' min',' 分',' Min',' мин',' min'))+' · '+(1440/f.periodMin).toFixed(2)+(window.IntMapLang.t(HOST.lang,' rev/day',' 周/日',' Uml./Tag',' витк/сут',' rev/día'))))
      +row(L('Inclination','軌道傾斜角','Bahnneigung','Наклонение','Inclinación'), f.inclDeg==null?'':f.inclDeg.toFixed(3)+'°')
      +row(L('Eccentricity','離心率','Exzentrizität','Эксцентриситет','Excentricidad'), f.ecc==null?'':f.ecc.toFixed(6))
      +row(L('Apogee / perigee','遠地点 / 近地点','Apogäum / Perigäum','Апогей / перигей','Apogeo / perigeo'), ap?(KM(ap.apoKm)+' / '+KM(ap.periKm)):'')
      +row(L('Revolution at epoch','元期での周回数','Umlauf bei Epoche','Виток на эпоху','Revolución en la época'), f.revNum==null?'':n0(f.revNum))
      +row(L('Drag term (B*)','大気抵抗係数 (B*)','Widerstandsterm (B*)','Баллистический коэффициент (B*)','Término de arrastre (B*)'), (f.bstar==null||!isFinite(f.bstar))?'':f.bstar.toExponential(4))
      +sec(L('From the map center','地図中心から見て','Von der Kartenmitte','От центра карты','Desde el centro del mapa'))
      +row(L('Elevation angle','仰角','Elevation','Угол места','Elevación'), la?(la.elDeg.toFixed(2)+'°'):'')
      +row(L('Azimuth','方位角','Azimut','Азимут','Acimut'), la?(la.azDeg.toFixed(1)+'°'):'')
      +row(L('Slant range','斜距離','Schrägentfernung','Наклонная дальность','Distancia oblicua'), la?KM(la.rangeKm):'')
      +row(L('Doppler factor','ドップラー係数','Dopplerfaktor','Доплеровский коэффициент','Factor Doppler'), (la&&la.doppler!=null)?la.doppler.toFixed(7):'')
      +row(L('Naked-eye conditions','肉眼観測の条件','Sichtbarkeit bloßem Auge','Условия для наблюдения глазом','Condiciones a simple vista'),
           nakedEye?L('met — the satellite is up and in sunlight (needs a dark sky here)','満たす — 上空にあり太陽光を受けています（現地が暗いことが必要）','erfüllt — über dem Horizont und beleuchtet (dunkler Himmel nötig)','выполнены — над горизонтом и освещён (нужно тёмное небо)','se cumplen — está sobre el horizonte e iluminado (hace falta cielo oscuro)')
                   :L('not met','満たさない','nicht erfüllt','не выполнены','no se cumplen'))
      +sec(L('Next pass','次回の通過','Nächster Überflug','Следующий пролёт','Próximo paso'))
      +passHTML
      +sec(L('The element set behind these numbers','この数値の元となる軌道要素','Der zugrunde liegende Elementsatz','Набор элементов в основе','El conjunto de elementos'))
      +row(L('Epoch','元期','Epoche','Эпоха','Época'), f.epoch?String(f.epoch).replace('T',' ').slice(0,19)+' UTC':'')
      +row(L('Age of the elements','軌道要素の経過時間','Alter der Elemente','Возраст элементов','Antigüedad de los elementos'), ageTxt(ageH))
      +row(L('Propagator branch','伝播モデル','Propagator-Zweig','Ветвь пропагатора','Rama del propagador'), f.deep?'SDP4 ('+L('deep space','深宇宙','Deep Space','дальний космос','espacio profundo')+')':'SGP4 ('+L('near Earth','近地球','erdnah','околоземный','cercano a la Tierra')+')')
      +(ageH!=null&&ageH>72?('<div class="acp-note">'+S(L('These elements are more than three days old — an SGP4 position drifts from them, so treat this as approximate.','この軌道要素は3日以上前のものです。SGP4の位置は元期から離れるほど誤差が増えるため、概算として扱ってください。','Diese Elemente sind über drei Tage alt — die SGP4-Position driftet, also nur als Näherung lesen.','Этим элементам более трёх суток — положение SGP4 дрейфует, считайте оценкой.','Estos elementos tienen más de tres días — la posición SGP4 se desvía, tómala como aproximada.'))+'</div>'):'')
      +'<button type="button" class="acp-fly" data-satp="goto">'
        +'<span class="acp-fly-h">'+S(L('Center the map on it','この衛星を地図の中心へ','Karte darauf zentrieren','Центрировать карту на нём','Centrar el mapa en él'))+'</span>'
        +'<span class="acp-fly-s">'+S(f.lat.toFixed(3)+', '+f.lng.toFixed(3)+' · '+KM(f.altKm))+'</span>'
      +'</button>'
      +'<div class="acp-src">'+S('CelesTrak GP/OMM · SGP4/SDP4 (satellite.js)')+'</div>';
  }

  function render(){
    if(curId==null) return; const e=ensureEl();
    const A=SATS(), f=A&&A.get(curId);
    const h=e.querySelector('#satp-title');
    if(h) h.innerHTML='🛰 '+S((f&&f.name)||('#'+curId));
    const b=e.querySelector('#satp-body'); if(!b) return;
    /* The layer re-renders this card every second as the object moves. The card is taller than its box
       and scrolls, so rebuilding the body would jump a reader back to the top once a second — keep
       where they are. (The scroller is the .country-popup shell, which is what has overflow-y.) */
    const top=e.scrollTop;
    b.innerHTML=bodyHTML();
    if(top) e.scrollTop=top;
  }

  function place(){
    const e=ensureEl(); const mc=document.getElementById('map-container');
    if(!mc) return;
    if(e.dataset.placed==='1') return; e.dataset.placed='1';
    const r=mc.getBoundingClientRect();
    e.style.left=Math.max(12,r.width-e.offsetWidth-24)+'px';
    e.style.top='84px';
  }

  function gotoSat(){
    const A=SATS(); if(!A||curId==null) return false;
    const f=A.get(curId); if(!f) return false;
    try{ GE().camera.easeTo({ center:[f.lng,f.lat], duration:900 }); return true; }catch(_){ return false; }
  }

  function open(id){
    if(id==null) return false;
    curId=id; if(passFor!==id){ pass=null; passFor=null; }
    const e=ensureEl(); e.style.display='block';
    render(); place();
    try{ HOST.bringToFront(e); }catch(_){}
    return true;
  }
  function refresh(){ if(isOpen()) render(); }
  function close(){ curId=null; pass=null; passFor=null; if(el) el.style.display='none';
    try{ const A=SATS(); if(A&&A.selected()!=null) A.select(null); }catch(_){} }
  function isOpen(){ return !!(el&&el.style.display!=='none'&&curId!=null); }
  function current(){ return curId; }

  const API={ open, refresh, close, isOpen, current, gotoSat, _orbitClass:orbitClass, _apsides:apsides };
  window.IntMapSatPanel=API;
  return API;
};
