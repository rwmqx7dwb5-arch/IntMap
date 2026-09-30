/* ============================================================================
 *  IntMap · Atlas capabilities — the `routing.*` namespace   (js/atlas-cap-routing.js)
 * ----------------------------------------------------------------------------
 *  One entry per capability, and everything about it in the one place:
 *    row     its registry row (its columns are documented at «THE TABLE» in js/atlas-capabilities.js) — the id, the dispatch
 *            spelling, the aliases, the observer, the effects that are also its conflict keys …
 *    schema  its argument schema, built fresh on every call (the builders are in js/atlas-caps.js)
 *    run     what the dispatch runs for it: `run(a, dctx, K)` — the action, the execution context, and
 *            K, the Atlas kernel's internals it needs (js/atlas-console.js builds K; a `let` there is
 *            read and written as `K.name`, so the value is always the live one).
 *  The registry rows (copied into js/atlas-capabilities.js), the dispatch and the schema table are
 *  DERIVED from these entries — `node scripts/atlas-caps.mjs --write` rewrites what is generated after
 *  an entry is added or removed, and `npm run check:capabilities` fails while they disagree.
 *  The prose the planner reads stays in js/atlas-catalog-text.js (a block names the ids it documents).
 * ==========================================================================*/
import { str, bool, num, one, list, lat, lng, loose } from './atlas-caps.js';
import { routeFacts } from './atlas-result-facts.js';

export default [
  /* ⚠ (#R740) `isochrone`, NOT `paint` — a reachable area that is on the map is rendered whether
     or not the count moved. The measurement and the general rule are at the observer below. */
  {
    row: ['routing.isochrone',          'isochrone',      'reach,reachability,reachable,catchment',                      'routing', 'isochrone','map.isochrone',         'map',                 'session', 'none',   'place',    ''],
    /* ── routing ────────────────────────────────────────────────────────────────────────────── */
    schema: () => ({ type: 'object', properties: { place: str(), from: str(), origin: str(), center: str(), lng: lng(), lat: lat(), minutes: loose(), time: num(1, 120), mins: num(1, 120), mode: str(), profile: str(), by: str() }, anyOf: [{ required: ['place'] }, { required: ['from'] }, { required: ['origin'] }, { required: ['center'] }, { required: ['lat', 'lng'] }] }),
    async run(a, dctx, K) { const geocode = K.geocode, R = K.R, warn = K.warn, whereMiss = K.whereMiss, L = K.L, esc = K.esc, GE = K.GE, note = K.note;
      {   /* ⚠ (#R278) lng/lat used to be DROPPED here: every sibling case (rfCoverage, earthquake, tsunami, nightSky, sunHours…) reads explicit coordinates first, this one only ever called geocode(a.place||…), and geocode('') falls back to the last place or the map centre. So {type:'isochrone',lng:136.934,lat:35.133} answered «✓ 60分の到達圏» and drew it at 10°E 20°N — measured, not supposed. A wrong place reported as success is the same lie as a circle reported as a reach. */
          /* ⚠ (#R299) …AND WITH NO PLACE NAMED IT ASKED `geocode('')`, whose documented answer is the last place or THE MAP CENTRE
             (js/atlas-geo-resolve.js): 「到達圏」 alone drew an area around whatever was on screen and reported it. A name, a coordinate or the reader's own pinned point — otherwise the question comes back. */
          const _org=a.place||a.from||a.origin||a.center; const ll=(a.lng!=null&&a.lat!=null&&isFinite(+a.lng)&&isFinite(+a.lat))?{lng:+a.lng,lat:+a.lat,name:String(a.place||a.from||'')}:(_org?await geocode(_org):((typeof K._herePoint!=='undefined'&&K._herePoint)?K._herePoint:null)); if(!ll) return R(false, warn('⚠ '+whereMiss(L('From where? Give a place.','どこから？地点を指定してください。','Von wo? Ort angeben.','Откуда? Укажите место.','¿Desde dónde? Indica un lugar.')+' '+esc(a.place||a.from||''), a.place||a.from||a.origin||a.center)));
          const rawM=String(a.mode||a.profile||a.by||'').toLowerCase();
          if(/transit|train|rail|metro|subway|tram|電車|鉄道|地下鉄|列車|公共/.test(rawM)){   /* (#R91) rail reachability isochrone */
            let tmin=Array.isArray(a.minutes)?Math.max.apply(null,a.minutes.map(Number)):(+a.minutes||+a.time||+a.mins||60);
            try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(8,11-tmin/20)}); }catch(_){}
            let tr=null; try{ tr=await window.IntMapTransitReach.open({lng:ll.lng,lat:ll.lat},tmin); }catch(_){}
            if(tr&&tr.ok) return R(true, note('🚆 '+esc(ll.name||a.place||'')+' — '+tr.minutes+' '+L('min by rail','分・鉄道到達圏','Min per Bahn','мин по ж/д','min en tren'))+note(tr.stations.length+' '+L('stations reachable within the time budget, riding the REAL OSM rail network (edge time = length ÷ line-class speed) — colored green→orange by minutes. Not a live timetable.','駅に時間内で到達可能。実在のOSM鉄道網を辿り（所要＝距離÷路線種別速度）、緑→橙で所要時間を色分け。実時刻表ではありません。','Bahnhöfe im Zeitbudget erreichbar (echtes OSM-Bahnnetz).','станций достижимо (реальная ж/д сеть OSM).','estaciones alcanzables (red ferroviaria real OSM).')));
            return R(false, warn('🚆 '+L('No rail reachable here in that time (or the rail-data service is busy). Try a point nearer a station, or 🚗/🚶.','この時間で到達できる鉄道が見つかりません（またはデータ混雑）。駅の近くや車・徒歩をお試しください。','Kein Bahnnetz erreichbar.','Ж/д недоступна.','Sin ferrocarril alcanzable.')));
          }
          const mode=/walk|foot|徒歩|pedestr|zu ?fu|пешк|a ?pie/.test(rawM)?'pedestrian':(/bike|bicycle|cycl|自転車|\brad\b|вело|bici/.test(rawM)?'bicycle':'auto');
          let mins=[]; if(Array.isArray(a.minutes)) mins=a.minutes.map(Number); else if(a.minutes!=null) mins=[+a.minutes]; else if(a.time!=null) mins=[+a.time]; else if(a.mins!=null) mins=[+a.mins];
          const _asked=mins.length; mins=mins.filter(x=>isFinite(x)&&x>0&&x<=120); if(!mins.length&&_asked) return R(false, warn('🎯 '+L('The reachable area is computed for 1 to 120 minutes — ask again inside that range.','到達圏は1〜120分の範囲で計算します。その範囲で指定してください。','Erreichbarkeit wird für 1 bis 120 Minuten berechnet — bitte in diesem Bereich fragen.','Зона доступности считается на 1–120 минут — укажите время в этом диапазоне.','El área alcanzable se calcula de 1 a 120 minutos — pídelo dentro de ese rango.')));   /* ⚠ (#R278) it used to silently fall back to [15,30] here, so 「3時間で行ける範囲」 drew a 30-minute area under a ✓ — the same lie as the circle */ if(!mins.length) mins=[15,30];
          try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(9,12-Math.max.apply(null,mins)/15)}); }catch(_){}
          let r=null; try{ r=await window.IntMapIsochrone.run({lng:ll.lng,lat:ll.lat},{mode,minutes:mins}); }catch(_){}
          const ic=mode==='pedestrian'?'🚶':mode==='bicycle'?'🚲':'🚗';
          if(r&&r.ok) return R(true, note('🎯 '+ic+' '+esc(ll.name||a.place||'')+' — '+r.minutes.join(' / ')+' '+L('min reachable','分の到達圏','Min erreichbar','мин зона','min alcanzable'))
            +note(L('Reachable area along the REAL road network (Valhalla / OpenStreetMap) — drive / walk / cycle, not a distance circle. Adjust mode & time in the 🎯 panel.','実際の道路網に沿った到達圏（Valhalla／OpenStreetMap）— 車・徒歩・自転車で、距離の円ではありません。モードと時間は🎯パネルで調整できます。','Erreichbarkeit entlang des echten Straßennetzes (Valhalla/OSM) — Auto/Fuß/Rad, kein Distanzkreis.','Зона доступности по реальной дорожной сети (Valhalla/OSM) — авто/пешком/вело, не круг.','Área alcanzable por la red vial real (Valhalla/OSM) — coche/pie/bici, no un círculo.')));
          return R(false, warn('🎯 '+((r&&r.reason==='render')?L('The reachable area was computed, but the map layer could not be created (the map style was still loading) — try again in a moment.','到達圏は計算できましたが、地図レイヤーを作成できませんでした（地図の読み込み中）— 少し待って再試行してください。','Die Erreichbarkeit wurde berechnet, aber die Kartenebene konnte nicht angelegt werden (Kartenstil lädt noch) — gleich erneut versuchen.','Зона доступности рассчитана, но слой карты не удалось создать (стиль карты ещё загружается) — повторите через момент.','El área alcanzable se calculó, pero no se pudo crear la capa del mapa (el estilo aún se está cargando) — inténtalo en un momento.'):L('Could not compute the reachable area (routing service busy) — try again.','到達圏を算出できませんでした（サービス混雑）— 再試行してください。','Erreichbarkeit fehlgeschlagen — erneut versuchen.','Не удалось рассчитать — попробуйте снова.','No se pudo calcular — reintenta.')))); }
    },
  },
  {
    row: ['routing.setEndpoints',       'route',          '',                                                            'routing', 'route',   'map.route',              'panel',               'session', 'none',   'place',    ''],
    schema: () => ({ type: 'object', properties: { from: str(), to: str() }, required: ['from', 'to'] }), /* `route` = the MARITIME route */
    async run(a, dctx, K) { const geocode = K.geocode, GE = K.GE, R = K.R, note = K.note, L = K.L, esc = K.esc, warn = K.warn;
      { const A=await geocode(a.from); const B=await geocode(a.to); let any=false; try{ if(window.IntMapRoute&&window.IntMapRoute.open) window.IntMapRoute.open(); }catch(_){} try{ if(A&&window.IntMapRoute&&window.IntMapRoute.setStart){ window.IntMapRoute.setStart({lng:A.lng,lat:A.lat}); any=true; } }catch(_){} try{ if(B&&window.IntMapRoute&&window.IntMapRoute.setEnd){ window.IntMapRoute.setEnd({lng:B.lng,lat:B.lat}); any=true; } }catch(_){} if(A&&B){ try{ GE().camera.fitBounds([[Math.min(A.lng,B.lng),Math.min(A.lat,B.lat)],[Math.max(A.lng,B.lng),Math.max(A.lat,B.lat)]],{padding:80,duration:900}); }catch(_){} } return R(any, any?note('🚢 '+L('Sea route','海路','Seeroute','Морской путь','Ruta marítima')+': '+esc((A&&A.name)||a.from||'')+' → '+esc((B&&B.name)||a.to||'')):warn('⚠ '+L('Need start & destination','始点と終点が必要','Start & Ziel nötig','Нужны старт и финиш','Origen y destino'))); }
    },
  },
  {
    row: ['routing.optimizeStops',      'optimizeRoute',  'tsp,multiStop,optimize,optimizeStops',                        'routing', 'route',   'map.route',              'route,map,panel',     'session', 'none',   'points',   ''],
    schema: () => ({ type: 'object', properties: { places: loose(), points: loose(), stops: loose(), mode: str(), profile: str() }, anyOf: [{ required: ['places'] }, { required: ['points'] }, { required: ['stops'] }] }), /* `optimizeRoute` */
    async run(a, dctx, K) { const geocode = K.geocode, HOST = K.HOST, L = K.L, R = K.R, warn = K.warn, _tspOrder = K._tspOrder, esc = K.esc, GE = K.GE, note = K.note;
      {
          let names=[]; if(Array.isArray(a.places)) names=a.places; else if(Array.isArray(a.points)) names=a.points; else if(Array.isArray(a.stops)) names=a.stops; else if(typeof a.places==='string') names=a.places.split(/[,、，]/); else if(typeof a.stops==='string') names=a.stops.split(/[,、，]/);
          names=names.map(x=>String(x).trim()).filter(Boolean).slice(0,12);
          const rawM2=String(a.mode||a.profile||'').toLowerCase(); const mode2=/walk|foot|徒歩|zu ?fu|пешк|a ?pie/.test(rawM2)?'walking':(/bike|bicycle|cycl|自転車|\brad\b|вело|bici/.test(rawM2)?'cycling':'driving');
          let pts=[];
          if(names.length){ for(const nm of names){ try{ const g=await geocode(nm); if(g) pts.push({lng:g.lng,lat:g.lat,name:g.name||nm}); }catch(_){} } }
          else if(typeof HOST.userPins!=='undefined' && HOST.userPins && HOST.userPins.length>=2){ pts=HOST.userPins.map((p,i)=>({lng:p.lng,lat:p.lat,name:L('Pin','ピン','Pin','Метка','Pin')+' '+(i+1)})); }
          if(pts.length<2) return R(false, warn('⚠ '+L('Give me at least 2 places to visit (comma-separated), or drop pins first.','巡回する地点を2つ以上（カンマ区切り）指定するか、先にピンを置いてください。','Mind. 2 Orte (kommagetrennt) angeben oder Pins setzen.','Укажите ≥2 места через запятую или поставьте метки.','Indica ≥2 lugares separados por comas o coloca pines.')));
          const ord=_tspOrder(pts); const seq=ord.map(i=>pts[i]);
          const mi=mode2==='walking'?'🚶':mode2==='cycling'?'🚲':'🚗';
          let r=null; try{ r=await window.IntMapRouting.route({lng:seq[0].lng,lat:seq[0].lat},{lng:seq[seq.length-1].lng,lat:seq[seq.length-1].lat},{mode:mode2,via:seq.slice(1,-1).map(p=>({lng:p.lng,lat:p.lat}))}); }catch(_){}
          const listHtml=seq.map((p,i)=>'<div style="display:flex;gap:8px;align-items:baseline;padding:3px 0;border-top:1px solid rgba(128,128,128,0.1);"><span style="flex:0 0 auto;width:20px;height:20px;border-radius:50%;background:var(--primary-fill);color:#fff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;">'+(i+1)+'</span><span style="flex:1;min-width:0;font-size:12.5px;">'+esc(p.name)+'</span></div>').join('');
          let summ=''; if(r&&r.ok&&r.distance!=null){ const km=r.distance/1000, mn=Math.round(r.duration/60), h=Math.floor(mn/60), rm=mn%60; summ=mi+' <b>'+(h?(h+' h '+rm+' min'):(mn+' min'))+'</b> · '+(km<10?km.toFixed(1):Math.round(km).toLocaleString())+' km'; }
          else { try{ GE().camera.fitBounds([[Math.min.apply(null,seq.map(p=>p.lng)),Math.min.apply(null,seq.map(p=>p.lat))],[Math.max.apply(null,seq.map(p=>p.lng)),Math.max.apply(null,seq.map(p=>p.lat))]],{padding:70,duration:900}); }catch(_){} }
          return R(true, note('🧭 '+L('Optimized order','最短順路','Optimierte Reihenfolge','Оптимальный порядок','Orden óptimo')+' · '+pts.length+' '+L('stops','地点','Stopps','точек','paradas'))
            +(summ?('<div style="font-size:13px;margin:3px 0 4px;">'+summ+'</div>'):'')
            +'<div>'+listHtml+'</div>'
            +note(r&&r.ok? L('Ordered shortest-first (nearest-neighbor + 2-opt), then driven on the OSM road network (OSRM). The first stop is fixed as the start.','最近傍＋2-optで最短順に並べ替え、OSMの道路網（OSRM）で経路化。最初の地点を起点に固定します。','Kürzeste Reihenfolge (Nächster-Nachbar + 2-opt), auf dem OSM-Straßennetz (OSRM).','Кратчайший порядок (ближайший сосед + 2-opt) по дорожной сети OSM (OSRM).','Orden más corto (vecino más cercano + 2-opt) por la red vial OSM (OSRM).')
              : L('Ordered shortest-first (nearest-neighbor + 2-opt). Road routing is busy — the optimized ORDER is shown; try again for the drawn route.','最近傍＋2-optで最短順に並べ替えました。道路経路サービスが混雑中 — 順路は表示済み、描画は再試行してください。','Reihenfolge optimiert; Straßenrouting ausgelastet.','Порядок оптимизирован; дорожный маршрут занят.','Orden optimizado; el enrutamiento está ocupado.'))); }
    },
  },
  {
    row: ['routing.route',              'directions',     'roadRoute,navigate,drivingRoute,walkingRoute,transitRoute',   'routing', 'route',   'map.route',              'route,map,panel',     'session', 'none',   'place',    'routeUi'],
    /* `directions` — both endpoints, in any of the spellings the case reads for the destination */
    schema: () => ({ type: 'object', properties: { from: str(), to: str(), place: str(), destination: str(), via: list(str()), mode: str(), profile: str(), time: str(), datetime: str(), depart: str(), arrive: str(), arriveBy: bool(), avoid: loose(), avoids: loose(), exclude: loose(), avoidArea: list(), avoidAreas: list(), transitModes: list(str()), maxWalkM: num(0) }, anyOf: [{ required: ['from', 'to'] }, { required: ['from', 'place'] }, { required: ['from', 'destination'] }] }),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, geocode = K.geocode, GE = K.GE, warn = K.warn, HOST = K.HOST, esc = K.esc;
      {
          /* (#R85d) FULL Google/Apple-Maps-style routing UI INSIDE the Atlas message — NO popup ("よけいなポップアップを
             増設するな。Atlas内のメッセージでUIやれ"). */
          /* ⚠⚠ (#R296) 「交通手段選択タブを表示しないように」「返答の冒頭の文言は削除」 — both were the header:
             the question restated and a second mode switch in a transcript. EMPTIED not deleted: six branches prefix it. */
          /* ⚠⚠ (#R299) A BARE 「経路案内」 OPENS THE PANEL — the parser rule that lands here says so in as many words («open the empty
             directions panel»), and this branch only ever printed a sentence: the one ask that is a REQUEST FOR THE TOOL got told to type more. `IntMapRouteUI` is lazy — fetched as js/map-ui.js's row does. */
          if(!a.from&&!a.to&&!a.place){ let ok=false; try{ await window.IntMapLazy.need('routeUi'); ok=!!(window.IntMapRouteUI&&window.IntMapRouteUI.open()); }catch(_){}
            return R(true, note('🧭 '+L('Tell me a start and destination — e.g. "directions from Tokyo to Osaka" or "電車で新宿から横浜".','出発地と目的地を教えてください（例：「東京から大阪への経路」「電車で新宿から横浜」）。','Nenne Start und Ziel.','Укажите начало и цель.','Dime origen y destino.'))+(ok?note(L('The route planner is open on the map — fill in the two fields there, or say the places here.','経路パネルを地図上に開きました。パネルに入力するか、ここで地点を伝えてください。','Der Routenplaner ist geöffnet — dort ausfüllen oder die Orte hier nennen.','Планировщик маршрута открыт — заполните поля там или назовите места здесь.','El planificador de rutas está abierto — complétalo allí o dime los lugares aquí.')):'')); }
          /* (#R125) endpoint resolution hardened for rail asks: an exact Shinkansen-station name resolves to the
             REAL station (geocode fuzzy-matched 仙台駅 to a POI named 仙太鮨…), and a query ending in 駅/station
             whose geocode hit doesn't even CONTAIN the base name retries with the base (city) name instead. */
          const _geoEP=async q=>{ q=String(q||'').trim(); if(!q) return null;
            try{ const st=window.IntMapRouting.stationLL&&window.IntMapRouting.stationLL(q); if(st) return st; }catch(_){}
            let g=null; try{ g=await geocode(q); }catch(_){}
            const m=q.match(/^(.{2,}?)(駅|\s+station)$/i);
            if(m){ const base=m[1].trim();
              if(!g||(g.name&&String(g.name).indexOf(base)<0)){ try{ const g2=await geocode(base); if(g2) g=g2; }catch(_){} } }
            /* (#R126) 経路10-10 §6.3: SAME-NAME disambiguation — if the hit is far from the current view (>500 km)
               and a same-name candidate exists near the view, prefer the near one ("Potsdam" from a Germany view must
               be Potsdam DE, not Potsdam NY; verified the old path picked the US village). */
            try{ if(g&&GE().hasRenderer()&&GE().camera.getCenter){ const c=GE().camera.getCenter(); const dKm=(a,b)=>{const R=6371,x=(b[0]-a[0])*Math.PI/180*Math.cos((a[1]+b[1])/2*Math.PI/180),y=(b[1]-a[1])*Math.PI/180;return R*Math.sqrt(x*x+y*y);};
              if(dKm([c.lng,c.lat],[+g.lng,+g.lat])>500&&window.IntMapRouting.geoNear){ const n=await window.IntMapRouting.geoNear(q);
                if(n&&dKm([c.lng,c.lat],[+n.lng,+n.lat])<dKm([c.lng,c.lat],[+g.lng,+g.lat])/3) g=n; } } }catch(_){}
            return g; };
          const A=await _geoEP(a.from); const B=await _geoEP(a.to||a.place||a.destination);   /* the journey rides on the result (js/atlas-result-facts.js routeFacts) — with only the cards, Atlas re-ran the route seven times for the duration */
          const rawMode=String(a.mode||a.profile||(a.type==='walkingRoute'?'walking':a.type==='transitRoute'?'transit':'')).toLowerCase();
          const isTr=/transit|train|rail|public|metro|subway|tram|bus|ferry|電車|鉄道|地下鉄|バス|公共|列車/.test(rawMode);
          const mode=isTr?'transit':(({car:'driving',drive:'driving',driving:'driving',foot:'walking',walk:'walking',walking:'walking',bike:'cycling',cycle:'cycling',cycling:'cycling'})[rawMode]||'driving');
          /* (#R296) still recorded: a follow-up 「徒歩で」 re-routes the last journey through this. */
          K._lastRouteCtx={from:a.from,to:(a.to||a.place||a.destination),via:a.via};
          const _hdr='';
          if(!A||!B) return R(false, _hdr+warn('⚠ '+L('Could not find one of those places','地点を特定できませんでした','Ort nicht gefunden','Место не найдено','Lugar no encontrado')));
          let via=[]; if(Array.isArray(a.via)){ for(const v of a.via.slice(0,6)){ try{ const g=await geocode(String(v)); if(g) via.push({lng:g.lng,lat:g.lat}); }catch(_){} } }
          /* (#R132) §7.3: parse an avoid list (array or comma/space string) → toll/motorway/ferry for OSRM exclude= */
          let _avoid=null; { let av=a.avoid||a.avoids||a.exclude; if(typeof av==='string') av=av.split(/[,、\s]+/); if(Array.isArray(av)){ _avoid=av.map(x=>{ x=String(x).toLowerCase(); return /toll|有料/.test(x)?'toll':/motorway|highway|freeway|高速/.test(x)?'motorway':/ferry|フェリー/.test(x)?'ferry':''; }).filter(Boolean); if(!_avoid.length) _avoid=null; } }
          /* (#R184) the three request-shaping options this round added, passed straight through:
             a keep-out AREA (Valhalla exclude_polygons — road modes only), the transit modes MOTIS may
             use, and a walking cap. Each is validated here rather than trusted, because they come from
             a planner's JSON. */
          const _areas=(Array.isArray(a.avoidAreas)?a.avoidAreas:(a.avoidArea?[a.avoidArea]:[]))
            .map(r2=>Array.isArray(r2)?r2.filter(p=>Array.isArray(p)&&isFinite(+p[0])&&isFinite(+p[1])).map(p=>[+p[0],+p[1]]):[])
            .filter(r2=>r2.length>=4).slice(0,8);
          const _TM=['RAIL','SUBWAY','TRAM','BUS','FERRY'];
          const _tmodes=(Array.isArray(a.transitModes)?a.transitModes:[])
            .map(x=>String(x).toUpperCase()).filter(x=>_TM.indexOf(x)>=0);
          const _mw=(isFinite(+a.maxWalkM)&&+a.maxWalkM>0)?Math.min(5000,+a.maxWalkM):null;
          /* ⚠ (#R441) THE JOURNEY'S OWN IDENTITY, FROM WHAT WAS RESOLVED — not from how it was spelled. 「ここから」 and the
             coordinates `my_location` just returned are the same starting point, so a turn that looks the reader up and then
             routes must not draw the same five itineraries twice under two different `data-rset` nonces. Rounded to ~11 m,
             which is finer than any geocoder disagrees by and coarser than float noise. js/atlas-turn-results.js reads it. */
          const _jKey='routing.route|'+mode+'|'+[[A.lng,A.lat]].concat(via.map(v=>[v.lng,v.lat]),[[B.lng,B.lat]]).map(p=>(+p[0]).toFixed(4)+','+(+p[1]).toFixed(4)).join(';')+'|'+((_avoid||[]).join(',')||'-')+'|'+(_tmodes.join(',')||'-')+'|'+(_mw||'-')+'|'+(_areas.length||'-')+'|'+String(a.time||a.datetime||a.depart||a.arrive||'-')+'|'+((a.arriveBy||a.arrive)?'arrive':'depart');
          let r=null; try{ r=await window.IntMapRouting.route({lng:A.lng,lat:A.lat},{lng:B.lng,lat:B.lat},
            Object.assign({mode,via,time:a.time||a.datetime||a.depart||a.arrive,arriveBy:!!(a.arriveBy||a.arrive),avoid:_avoid},
              _areas.length?{avoidAreas:_areas}:{},
              (_tmodes.length&&_tmodes.length<5)?{transitModes:_tmodes}:{},
              _mw?{maxWalkM:_mw}:{})); }catch(_){}
          if(r&&r.transit){
            const totMin=Math.round(r.duration/60), hrs=Math.floor(totMin/60), rem=totMin%60, dur=hrs?(hrs+' h '+rem+' min'):(totMin+' min'); const tf=r.transfers||0;
            const _ic=m=>{ m=String(m||'').toUpperCase(); return /WALK|FOOT/.test(m)?'🚶':/SUBWAY|METRO/.test(m)?'🚇':/TRAM|LIGHT_RAIL|STREETCAR/.test(m)?'🚊':/BUS|COACH/.test(m)?'🚌':/FERRY|BOAT/.test(m)?'⛴':/HIGHSPEED|LONG_DISTANCE/.test(m)?'🚄':/RAIL|TRAIN|REGIONAL|SUBURBAN|NIGHT/.test(m)?'🚆':'🚈'; };
            const _tm=iso=>{ try{ const d=new Date(iso); return isFinite(d.getTime())?d.toLocaleTimeString(window.IntMapLang.locale(HOST.lang,"en-GB"),{hour:'2-digit',minute:'2-digit'}):''; }catch(_){ return ''; } };
            const seq=(r.legs||[]).map(l=>_ic(l.mode)+(l.route&&!l.walk?(' '+esc(l.route)):'')).join(' → ');
            /* ⚠ (#R291) NOT WRITTEN HERE ANY MORE (§17): this and js/routing.js's `legRows()` had drifted apart — Atlas badged a live leg, the panel did not. */
            const _cardOpt=()=>({lang:HOST.lang,units:(typeof HOST.unitMode!=='undefined'?HOST.unitMode:'metric'),tz:(HOST.userTZ&&HOST.userTZ!=='auto')?HOST.userTZ:''});
            const _legRow=(l)=>window.IntMapRouteCards.legRows([l],_cardOpt());
            const legHtml=(r.legs||[]).map(_legRow).join('');
            const summ=r.railEstimate?('<b>~'+dur+'</b> · '+Math.round(r.railKm).toLocaleString()+' km'+(r.lines&&r.lines.length?(' · '+r.lines.slice(0,3).map(esc).join(' → ')):(' '+L('by rail','鉄道','per Bahn','по ж/д','por vía')))):('<b>'+(r.jrEstimate?'~':'')+dur+'</b> · '+tf+' '+L('transfer'+(tf===1?'':'s'),'回乗換','Umst.','пересадок','transb.')+(r.startTime?(' · '+_tm(r.startTime)+'→'+_tm(r.endTime)):''));
            /* (#R86) list EVERY alternative itinerary (Google/Apple-Maps style — the Berlin→Amsterdam screenshot); the
               selected one is expanded, tapping another redraws it on the map via IntMapRouting.selectAlt. */
            const alts=(!r.railEstimate&&r.alternatives&&r.alternatives.length>1)?r.alternatives:null;
            let body;
            if(alts){ const selI=r.sel||0;
              /* ⚠ (#R291) the SHARED cards (§17) — one renderer, two surfaces. */
              /* ⚠ (#R298) …and the SAME SHAPE: the chosen card OPENS, exactly as it does in the panel.
                 It was a sibling block here and an in-card block there — one renderer, two layouts. */
              body=window.IntMapRouteCards.altCards(alts,Object.assign(_cardOpt(),{sel:selI,setId:r.routeSetId,transit:true,
                detail:(i2,a2)=>window.IntMapRouteCards.legRows(a2.legs,_cardOpt())}));
            } else { body='<div style="font-size:13px;margin:3px 0 3px;">'+summ+'</div><div style="font-size:12px;margin-bottom:4px;">'+seq+'</div><div style="max-height:220px;overflow:auto;">'+legHtml+'</div>'; }
            let h=_hdr+(alts?('<div style="font-size:11px;color:var(--text-muted);margin:2px 0 5px;">'+alts.length+' '+L('options — tap one to show it on the map','件の候補 — タップで地図に表示','Optionen — zum Anzeigen antippen','вариантов — нажмите, чтобы показать','opciones — toca para ver en el mapa')+'</div>'):'')+body
              +note(r.jrEstimate
                ? L('Intercity Japan rail: real Shinkansen lines and stations, with times estimated from the operators’ published timetables (express pattern + service frequency) — not live times. Local segments use open GTFS (Transitous) where available; where none exists (e.g. Nagoya) they are distance-based estimates, marked as such. The line between stations is schematic.','日本の都市間鉄道: 実在の新幹線路線・停車駅に基づき、所要時間は各社の公表時刻表（速達パターン＋運行頻度）からの概算です（リアルタイムではありません）。ローカル区間は公開GTFS（Transitous）があれば実データ、無い地域（例: 名古屋圏）は距離ベースの目安と明記しています。駅間の線形は概略です。','Japan-Fernverkehr: echte Shinkansen-Linien/Bahnhöfe, Zeiten aus den veröffentlichten Fahrplänen geschätzt (kein Echtzeitfahrplan). Lokale Abschnitte per offenem GTFS, sonst gekennzeichnete Distanzschätzung. Linienverlauf zwischen Bahnhöfen schematisch.','Междугородние ж/д Японии: реальные линии и станции синкансэна, время — оценка по опубликованным расписаниям (не в реальном времени). Местные участки — открытый GTFS, иначе помеченная оценка по расстоянию. Линия между станциями схематична.','Tren interurbano de Japón: líneas y estaciones reales de Shinkansen, tiempos estimados de los horarios publicados (no en vivo). Tramos locales con GTFS abierto o estimación marcada. Trazado entre estaciones esquemático.')
                : r.railEstimate
                ? L('Routed along the REAL rail network (OpenStreetMap), naming the actual lines and stations it rides (walk to the nearest station). JR/Shinkansen publish no open timetable (GTFS), so the time is estimated from typical speeds per line class (high-speed / conventional) — not a live schedule.','実在の鉄道網（OpenStreetMap）に沿って路線名・駅名まで特定した「列車が走る経路」です（最寄り駅までは徒歩）。JR・新幹線等は公開時刻表（GTFS）が無いため、所要時間は路線種別（新幹線／在来線）の標準速度からの概算で、実際の時刻表ではありません。','Entlang des echten Schienennetzes (OSM), mit echten Linien- und Bahnhofsnamen — Zeit ist aus typischen Geschwindigkeiten geschätzt, kein Fahrplan.','Проложено по реальной ж/д сети (OSM) с реальными названиями линий и станций — время оценено по типовым скоростям, не расписание.','Trazado por la red ferroviaria real (OSM), con nombres reales de líneas y estaciones — tiempo estimado por velocidades típicas, no horario.')
                : r.realtime
                ? L('Public-transit routing (Transitous / MOTIS) — includes REAL-TIME updates for this trip (live departures / delays where the operator publishes them).','公共交通の経路検索（Transitous／MOTIS）— この旅程はリアルタイム運行情報（事業者が公開する実時刻・遅延）を含みます。','ÖPNV (Transitous/MOTIS) — mit ECHTZEIT-Daten für diese Verbindung (Live-Abfahrten/Verspätungen).','Транзит (Transitous/MOTIS) — с данными в РЕАЛЬНОМ ВРЕМЕНИ по этому маршруту (задержки/отправления).','Transporte (Transitous/MOTIS) — con datos en TIEMPO REAL para este viaje (salidas/retrasos).')
                : L('Public-transit routing (Transitous / MOTIS) — timetable-based (no real-time data for this trip).','公共交通の経路検索（Transitous／MOTIS）— 時刻表ベース（この旅程のリアルタイム情報はありません）。','ÖPNV (Transitous/MOTIS) — fahrplanbasiert (keine Echtzeitdaten für diese Verbindung).','Транзит (Transitous/MOTIS) — по расписанию (без данных реального времени).','Transporte (Transitous/MOTIS) — según horario (sin datos en tiempo real para este viaje).'));   /* (#R103) dropped the "walk dotted / colour-coded" wording per request; (#R132) §2.4/§9.6 honest live-vs-timetable */
            if(r.shapeGap) h+=note(L('Some ride-segment shapes could not be retrieved — those legs are listed above but not drawn on the map (no straight-line substitutes).','一部の乗車区間の形状を取得できませんでした — 該当区間は行程に表示しますが、地図には描画しません（直線での代用はしません）。','Einige Fahrt-Abschnittsformen fehlen — diese Abschnitte stehen in der Liste, werden aber nicht gezeichnet (kein Geraden-Ersatz).','Форма части участков недоступна — они в списке, но не рисуются на карте (без замены прямыми).','No se pudo obtener la forma de algunos tramos — se listan pero no se dibujan (sin sustitutos en línea recta).'));
            return R(true, h, {meta:{resultKey:_jKey}, exec:{route:routeFacts(r)}}); }
          if(!r||!r.ok){ const stt=(r&&r.status)||'';
            /* (#R126) 経路10-10 §2.5/§16.8: typed statuses get their OWN honest message instead of one "not found" */
            if(stt==='cancelled') return R(true, _hdr+note(L('Superseded by a newer route request.','新しい経路リクエストに置き換えられました。','Durch eine neuere Routenanfrage ersetzt.','Заменено более новым запросом маршрута.','Sustituido por una solicitud de ruta más reciente.')));
            if(stt==='provider_timeout'||stt==='provider_unavailable'||stt==='rate_limited'){
              const m2=stt==='rate_limited'?L('Too many requests — wait a moment and try again.','リクエストが多すぎます — 少し待って再試行してください。','Zu viele Anfragen — kurz warten und erneut versuchen.','Слишком много запросов — подождите и повторите.','Demasiadas solicitudes — espera y reintenta.')
                :stt==='provider_timeout'?L('The routing service timed out — try again.','経路サービスがタイムアウトしました — 再試行してください。','Zeitüberschreitung beim Routingdienst — erneut versuchen.','Тайм-аут сервиса маршрутов — повторите.','El servicio de rutas agotó el tiempo — reintenta.')
                :L('The routing service is unreachable right now (outage or network) — the route was NOT computed. Try again shortly.','経路サービスに接続できません（障害またはネットワーク）— 経路は計算されていません。しばらくして再試行してください。','Routingdienst nicht erreichbar — Route NICHT berechnet. Später erneut versuchen.','Сервис маршрутов недоступен — маршрут НЕ рассчитан. Повторите позже.','Servicio de rutas no disponible — la ruta NO se calculó. Reintenta en breve.');
              return R(false, _hdr+warn('⚠ '+m2)); }
            if(isTr) return R(true, _hdr+warn('🚆 '+L('No public-transit route here — the area may have no open transit data yet. Try 🚗 or 🚶 above.','この区間の公共交通経路が見つかりません。上のボタンで車・徒歩をお試しください。','Keine ÖPNV-Verbindung — oben 🚗/🚶 versuchen.','Нет транзита — попробуйте 🚗/🚶 выше.','Sin transporte — prueba 🚗/🚶 arriba.')));
            const snapTx=(r&&r.snapKm)?(' '+L('One point is ~'+r.snapKm+' km from the nearest routable road (outside road-data coverage / across water).','一方の地点が最寄りの経路可能な道路から約'+r.snapKm+' km離れています（道路データ対象外／水域越えの可能性）。','Ein Punkt liegt ~'+r.snapKm+' km von der nächsten routbaren Straße (außerhalb der Abdeckung).','Точка в ~'+r.snapKm+' км от ближайшей дороги (вне покрытия).','Un punto está a ~'+r.snapKm+' km de la carretera más cercana (fuera de cobertura).')):'';
            return R(true, _hdr+warn('⚠ '+L('No route found (no road connection between these points).','経路が見つかりません（この2地点間に陸路の接続がありません）。','Keine Route gefunden (keine Straßenverbindung).','Маршрут не найден (нет дорожного соединения).','Sin ruta (sin conexión por carretera).')+snapTx)); }
          /* (#R132) 経路10-10 §7.1/§10/§12/§16: road reply mirrors transit — selectable alternative cards
             (fastest/shortest/+X min) in the SAME .atl-trips/.atl-trip structure the existing selectAlt handler
             drives (data-rset), plus rich turn-by-turn (IntMapRouting.maneuver) with lane guidance and step→map. */
          const _rdur=sec=>{ const t=Math.round(sec/60),hh=Math.floor(t/60),mm=t%60; return hh?(hh+' h '+mm+' min'):(t+' min'); };
          const _rkm=m=>{ const k=m/1000; return (k<10?k.toFixed(1):Math.round(k).toLocaleString())+' km'; };
          const _mvr=s=>{ try{ return window.IntMapRouting.maneuver(s); }catch(_){ return {icon:'↑',text:String(s.name||''),lane:''}; } };
          /* ⚠ (#R291) same rule as `_legRow`: one step renderer, so glyphs, lanes and units match. `data-si` is unchanged. */
          const _cardOpt2=()=>({lang:HOST.lang,units:(typeof HOST.unitMode!=='undefined'?HOST.unitMode:'metric'),tz:(HOST.userTZ&&HOST.userTZ!=='auto')?HOST.userTZ:''});
          const _stepList=(steps)=>window.IntMapRouteCards.stepRows(steps,Object.assign(_cardOpt2(),{maneuver:_mvr}));
          const ralts=(r.alternatives&&r.alternatives.length>1)?r.alternatives:null;
          let h=_hdr;
          if(ralts){ h+='<div style="font-size:11px;color:var(--text-muted);margin:2px 0 5px;">'+ralts.length+' '+L('routes — tap one to show it on the map','経路候補 — タップで地図に表示','Routen — zum Anzeigen antippen','маршрутов — нажмите, чтобы показать','rutas — toca para ver en el mapa')+'</div>'
              /* ⚠ (#R291) THE SAME CARDS THE PANEL DRAWS (§17), with the same `data-rset` / `data-ai`. */
              +window.IntMapRouteCards.altCards(ralts,Object.assign(_cardOpt2(),{sel:0,setId:r.routeSetId,transit:false,
                detail:(i2,a2)=>_stepList(a2.steps)}));   /* (#R298) the card opens — see routing-cards.refreshDetail */
          } else { h+='<div style="font-size:13px;margin:3px 0 5px;"><b>'+_rdur(r.duration)+'</b> · '+_rkm(r.distance)+'</div>'
              +'<div style="max-height:220px;overflow:auto;font-size:11.5px;line-height:1.5;" class="atl-rsteps" data-rset="'+esc(r.routeSetId||'')+'">'+_stepList(r.steps)+'</div>'; }
          h+=note(r.provider==='valhalla'
            /* ⚠ (#R296) 「「所要時間は交通状況を含まない標準値です。」だけでいい」 — it drops the provider's name and a phrase the reader knows. */
            ? L('Times are typical (no live traffic).','所要時間は交通状況を含まない標準値です。','Zeiten sind typisch (kein Live-Verkehr).','Время типовое (без пробок).','Los tiempos son típicos (sin tráfico).')
            : L('Times are typical (no live traffic).','所要時間は交通状況を含まない標準値です。','Zeiten sind typisch (kein Live-Verkehr).','Время типовое (без пробок).','Los tiempos son típicos (sin tráfico).'));
          if(r.avoidDropped) h+=warn('⚠ '+L('Could not apply the avoid options (routing service busy) — showing the normal route.','回避条件を適用できませんでした（経路サービス混雑）— 通常経路を表示。','Meiden-Optionen nicht anwendbar (Dienst ausgelastet) — normale Route.','Не удалось применить исключения — обычный маршрут.','No se pudieron aplicar las exclusiones — ruta normal.'));
          return R(true, h, {meta:{resultKey:_jKey}, exec:{route:routeFacts(r)}}); }
    },
  },
  {
    row: ['routing.drone',              'drone',          '',                                                            'routing', 'route',   'map.drone',              'route,map,panel',     'session', 'none',   '',         ''],
    /* `drone` with nothing opens the planner; `action` is compared lower-cased, so the catalogue's
       own `followTerrain` would fail an enum — it stays a string */
    schema: () => ({ type: 'object', properties: { action: str(), from: str(), to: str(), via: list(str()), alt: num(), ref: one('agl', 'amsl'), aircraft: one('micro', 'prosumer', 'heavylift', 'fixedwing'), name: str() } }),
      /* (#R174) DRONE NAVIGATION — the Atlas face of js/drone-nav.js. Every number in the reply comes
         from the same compute() the panel shows; Atlas never re-derives one, and it never claims a
         route is flyable when the planner said otherwise. */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, note = K.note, geocode = K.geocode, esc = K.esc, GE = K.GE;
      { const D=window.IntMapDrone;
          if(!D) return R(false, warn('⚠ '+L('Drone planner unavailable','ドローン航法を使えません','Drohnenplaner nicht verfügbar','Планировщик дрона недоступен','Planificador de dron no disponible')));
          const act=String(a.action||(a.from||a.to?'plan':'open')).toLowerCase();
          if(act==='close'){ D.close(); return R(true, note('🛸 '+L('Closed','閉じました','Geschlossen','Закрыто','Cerrado'))); }
          if(act==='clear'){ D.clearRoute(); D.open(); return R(true, note('🛸 '+L('Route cleared','経路を消去しました','Route gelöscht','Маршрут очищен','Ruta borrada'))); }
          if(act==='plan'){
            const names=[a.from].concat(Array.isArray(a.via)?a.via:(a.via?[a.via]:[])).concat([a.to]).filter(x=>x!=null&&String(x).trim()!=='');
            if(names.length<2) return R(false, warn('⚠ '+L('Need a start and a destination','出発地と目的地が必要です','Start und Ziel nötig','Нужны старт и цель','Se necesitan origen y destino')));
            const pts=[]; for(const n of names){ const ll=await geocode(n); if(!ll) return R(false, warn('⚠ '+esc(String(n)))); pts.push(ll); }
            D.newRoute();
            if(a.aircraft) D.usePreset(String(a.aircraft).toLowerCase());
            const ref=(String(a.ref||'agl').toLowerCase()==='amsl')?'amsl':'agl';
            D.setTypedRef(ref);
            const alt=isFinite(+a.alt)?+a.alt:80;
            pts.forEach(p=>D.addWaypoint(p.lng,p.lat,alt,ref));
            if(a.name) D.setRoute(Object.assign(D.route(),{name:String(a.name).slice(0,60)}));
            D.open();
            const res=await D.compute();
            try{ const lats=pts.map(p=>p.lat), lngs=pts.map(p=>p.lng);
              GE().camera.fitBounds([[Math.min.apply(null,lngs),Math.min.apply(null,lats)],[Math.max.apply(null,lngs),Math.max.apply(null,lats)]],
                {padding:90,pitch:Math.max(GE().camera.getPitch(),55),duration:900}); }catch(_){}
            if(!res) return R(false, warn('⚠'));
            const bad=res.violations.filter(v=>v.severity==='critical'||v.severity==='error');
            const head='🛸 '+esc(D.route().name)+' · '+(res.dist3DM/1000).toFixed(2)+' km · '+Math.round(res.timeS/60)+' min · '+Math.round(res.batteryPct)+'% '+L('battery','バッテリー','Akku','батарея','batería');
            return R(true, (bad.length?warn('⚠ '+head+'\n'+bad.map(v=>'· '+esc(v.text)).join('\n')):note(head+' · ✓ '+L('all conditions met','全条件を満たします','alle Bedingungen erfüllt','все условия выполнены','todas las condiciones cumplidas')))); }
          if(act==='followterrain'||act==='follow'){ D.open(); const res=await D.followTerrain();
            if(!res) return R(false, warn('⚠ '+L('No route to adjust','調整する経路がありません','Keine Route','Нет маршрута','No hay ruta')));
            return R(true, note('⛰ '+L('Adjusted to the terrain','地形に沿わせました','An das Gelände angepasst','Подогнано под рельеф','Ajustado al terreno')+' · '+D.route().wp.length+' '+L('waypoints','ウェイポイント','Wegpunkte','точек','puntos'))); }
          if(act==='compute'||act==='recompute'){ D.open(); const res=await D.compute();
            if(!res) return R(false, warn('⚠ '+L('No route yet','経路がまだありません','Noch keine Route','Маршрута ещё нет','Aún no hay ruta')));
            return R(true, note('🛸 '+(res.dist3DM/1000).toFixed(2)+' km · '+Math.round(res.timeS/60)+' min · '+res.violations.length+' '+L('findings','指摘','Hinweise','замечаний','hallazgos'))); }
          /* (#R184) the operational checks and the three route actions. Everything below reads its
             answer back out of IntMapDroneOps rather than restating the request, so a reply cannot
             claim a check that did not run. */
          const O=window.IntMapDroneOps;
          const needOps=/^(wind|link|radio|nofly|restricted|reserve|return|sites|landing|prepare|check|compare|variants|rth|returnhome|returntohome|conflicts|conflict|traffic)$/.test(act);
          if(needOps&&!O) return R(false, warn('⚠ '+L('The drone operations module is unavailable','ドローンの運航条件モジュールを利用できません','Das Betriebsmodul ist nicht verfügbar','Модуль эксплуатации недоступен','El módulo de operaciones no está disponible')));
          if(needOps) D.open();
          if(act==='prepare'||act==='check'||act==='wind'||act==='link'||act==='radio'||act==='nofly'||act==='restricted'||act==='reserve'||act==='return'||act==='sites'||act==='landing'){
            /* naming ONE check turns that check on; "prepare"/"check" runs whatever is already on */
            const only={ wind:'wind', link:'link', radio:'link', nofly:'nofly', restricted:'nofly',
                         reserve:'reserve', return:'reserve', sites:'sites', landing:'sites' }[act];
            if(only){ const patch={}; patch[only]=true; O.setEnabled(patch); }
            await O.prepare();
            const s=O.state();
            const bits=[];
            if(s.enabled.wind&&s.wind.report) bits.push(L('wind','風','Wind','ветер','viento')+' '+(Math.round(s.wind.report.maxSpeed*10)/10)+' m/s ('+(s.wind.src||'—')+')');
            if(s.enabled.link&&s.link.report&&s.link.report.worstMarginDb!=null) bits.push(L('link margin','リンク余裕','Funkreserve','запас связи','margen del enlace')+' '+Math.round(s.link.report.worstMarginDb)+' dB, '+s.link.report.losBreaks+' '+L('line-of-sight breaks','箇所で視通が途切れ','Sichtabbrüche','разрывов видимости','cortes de visión'));
            if(s.enabled.nofly&&s.nofly.report) bits.push(s.nofly.report.hits+' '+L('restricted areas within their buffers','件の制限区域が離隔内','Sperrgebiete im Richtabstand','запретных зон в пределах буфера','zonas restringidas dentro del margen'));
            if(s.enabled.sites) bits.push(s.sites.reachable+'/'+s.sites.n+' '+L('landing sites reachable','件の着陸地点に到達可能','erreichbare Landeplätze','достижимых площадок','lugares de aterrizaje alcanzables'));
            if(s.enabled.reserve&&s.reserve&&s.reserve.roundTripWh!=null) bits.push(L('round trip','往復','Umlauf','круг','ida y vuelta')+' '+s.reserve.roundTripWh.toFixed(1)+' Wh');
            const res2=D.result();
            const bad2=res2?res2.violations.filter(v=>v.severity==='critical'||v.severity==='error'):[];
            return R(true, (bad2.length?warn('⚠ '):note('✓ '))+esc(bits.join(' · ')||L('checks run','点検しました','geprüft','проверено','comprobado'))
              +(bad2.length?('\n'+bad2.map(v=>'· '+esc(v.text)).join('\n')):'')); }
          if(act==='compare'||act==='variants'){
            const c=await O.compareVariants();
            if(!c) return R(false, warn('⚠ '+L('Need a route with at least two waypoints','ウェイポイントが2点以上の経路が必要です','Route mit mindestens zwei Wegpunkten nötig','Нужен маршрут минимум с двумя точками','Se necesita una ruta con dos puntos')));
            const line=c.variants.map(v=>v.name+': '+(v.dist3DM/1000).toFixed(2)+' km · '+Math.round(v.timeS/60)+' min · '+v.energyWh.toFixed(1)+' Wh · '+v.violations+' ⚠').join('\n· ');
            return R(true, note('⇄ '+L('Route comparison','経路の比較','Routenvergleich','Сравнение маршрутов','Comparación de rutas')+'\n· '+esc(line))); }
          if(act==='rth'||act==='returnhome'||act==='returntohome'){
            const rr=await O.returnToHome();
            if(!rr) return R(false, warn('⚠ '+L('No route to return from','帰投元の経路がありません','Keine Route','Нет маршрута','No hay ruta')));
            if(rr.alreadyHome) return R(true, note('✓ '+L('The route already ends at the launch point','経路はすでに離陸地点で終わっています','Die Route endet bereits am Startpunkt','Маршрут уже заканчивается в точке взлёта','La ruta ya termina en el punto de despegue')));
            return R(true, note('⤺ '+L('Return leg added','帰投区間を追加しました','Rückflug ergänzt','Возврат добавлен','Tramo de regreso añadido')+' — '+Math.round(rr.safeAmsl)+' m AMSL · '+(rr.result?((rr.result.dist3DM/1000).toFixed(2)+' km · '+Math.round(rr.result.batteryPct)+'%'):''))); }
          if(act==='conflicts'||act==='conflict'||act==='traffic'){
            const cf=await O.checkConflicts();
            if(!cf) return R(false, warn('⚠ '+L('No route to check','点検する経路がありません','Keine Route','Нет маршрута','No hay ruta')));
            if(!cf.checked) return R(true, note('✓ '+L('There is no other saved route to check against','照合できる保存済みの経路がありません','Keine zweite gespeicherte Route','Нет второго сохранённого маршрута','No hay otra ruta guardada')));
            if(!cf.conflicts) return R(true, note('✓ '+L('No conflict with the '+cf.checked+' other saved route(s)','ほかの保存済み経路 '+cf.checked+' 本との干渉はありません','Kein Konflikt mit '+cf.checked+' anderen Routen','Конфликтов с '+cf.checked+' маршрутами нет','Sin conflicto con las otras '+cf.checked+' rutas')));
            return R(true, warn('⚠ '+cf.conflicts+' '+L('conflict(s)','件の干渉','Konflikte','конфликтов','conflictos')+'\n'
              +cf.minima.filter(m=>m.conflict).map(m=>'· '+esc(m.name||m.route)+': '+Math.round(m.horizM)+' m / '+Math.round(m.vertM)+' m / '+Math.round(m.timeS)+' s').join('\n'))); }
          D.open(); return R(true, note('🛸 '+L('Drone planner open','ドローン航法を開きました','Drohnenplaner geöffnet','Планировщик открыт','Planificador abierto'))); }
    },
  },
];
