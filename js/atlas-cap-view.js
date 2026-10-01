/* ============================================================================
 *  IntMap · Atlas capabilities — the `view.*` namespace   (js/atlas-cap-view.js)
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
import { str, bool, num, one, lat, lng, noArgs } from './atlas-caps.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { requestFix, FIX_FAILURE } from './locate-me.js';   /* (installable-app) the ONE reading of the device position — view.locate below */

export default [
  {
    row: ['view.projection',            'projection',     '',                                                            'view',    'camera',  'camera',                 'map',                 'session', 'none',   '',         ''],
    schema: () => ({ type: 'object', properties: { mode: one('globe', 'flat') }, required: ['mode'] }),
    async run(a, dctx, K) { const kexec = K.kexec, R = K.R, note = K.note, esc = K.esc, L = K.L, _featTogHtml = K._featTogHtml, warn = K.warn;
      { const flat=(a.mode==='flat'); const ok=kexec(flat?'view.proj.flat':'view.proj.globe', flat?'btn-view-flat':'btn-view-globe'); return R(ok, ok?note('✓ '+esc(flat?L('Flat map','平面地図','Flache Karte','Плоская карта','Mapa plano'):L('Globe','地球儀','Globus','Глобус','Globo')))+_featTogHtml('globe'):warn('⚠')); }   /* (#R151) offer the 3D-globe on/off switch */
    },
  },
  {
    row: ['view.basemap',               'base',           '',                                                            'view',    'layer',   'map.basemap',            'map',                 'session', 'none',   '',         ''],
    schema: () => ({ type: 'object', properties: { mode: one('map', 'satellite', 'sat') }, required: ['mode'] }),
    async run(a, dctx, K) { const kexec = K.kexec, R = K.R, note = K.note, esc = K.esc, L = K.L, _featTogHtml = K._featTogHtml, warn = K.warn;
      { const sat=(a.mode==='satellite'||a.mode==='sat'); const ok=kexec(sat?'view.base.sat':'view.base.map', sat?'btn-view-sat':'btn-view-map'); return R(ok, ok?note('✓ '+esc(sat?L('Satellite','衛星','Satellit','Спутник','Satélite'):L('Map','地図','Karte','Карта','Mapa')))+_featTogHtml('satellite'):warn('⚠')); }   /* (#R147) offer the Satellite on/off button */
    },
  },
  {
    row: ['view.flyTo',                 'flyTo',          '',                                                            'view',    'camera',  'camera',                 'camera,map',          'session', 'none',   'place',    ''],
    schema: () => ({ type: 'object', properties: { place: str(), lng: lng(), lat: lat(), zoom: num(0, 24), scale: str() }, anyOf: [{ required: ['place'] }, { required: ['lat', 'lng'] }] }),
      /* ⚠⚠⚠ (#R740) THE MOVER DECLARES WHERE IT ACTUALLY SENT THE CAMERA (`meta.dest`, read by js/atlas-capabilities.js). Without it a re-flight to where the reader already was answered `no_change`, i.e. FAILED, and 「ヨーロッパの気温を…」 spent 7 steps and 92 s flying to Europe four times (it even switched language) before `repeated_calls` ended the turn. Every branch that moves declares; a branch that resolved nothing declares nothing, which is the honest 「cannot be measured」 and leaves the old verdict. #R736's rule, on the camera. */
    async run(a, dctx, K) { const WORLD_RE = K.WORLD_RE, GE = K.GE, R = K.R, note = K.note, L = K.L, DEIXIS_RE = K.DEIXIS_RE, placeExtent = K.placeExtent, _setLast = K._setLast, flyToBox = K.flyToBox, esc = K.esc, _ambigNote = K._ambigNote, geocode = K.geocode, _bboxOK = K._bboxOK, warn = K.warn;
      { const exZ=(a.zoom!=null)?+a.zoom:null; const placeStr=String(a.place||'').trim(); let _dst=null; const _D=()=>_dst?{meta:{dest:_dst}}:null;
          /* "the whole world / earth / globe" → zoom OUT to the planet, NEVER geocode (was → "World Bank building"). */
          if(WORLD_RE.test(placeStr) || /^(world|globe|earth)$/i.test(String(a.scale||''))){ try{ const _c=GE().camera.getCenter(); _dst={lng:+_c.lng,lat:20,zoom:(exZ!=null?exZ:1.4)}; GE().camera.flyTo({center:[_dst.lng,20],zoom:_dst.zoom,duration:1100}); }catch(_){ _dst=null; try{ GE().camera.zoomTo(1.4); }catch(__){} } return R(true, note('🌍 '+L('Whole world','全世界','Ganze Welt','Весь мир','El mundo entero')), _D()); }
          if(a.lng!=null&&a.lat!=null){ _dst={lng:+a.lng,lat:+a.lat,zoom:exZ!=null?exZ:Math.max(GE().camera.getZoom(),6)}; GE().camera.flyTo({center:[_dst.lng,_dst.lat],zoom:_dst.zoom,duration:1100}); return R(true, note((+a.lat).toFixed(2)+', '+(+a.lng).toFixed(2)), _D()); }
          /* (#R51) DERIVE the view from the place's REAL footprint (dynamic — no per-type zoom constants). */
          if(placeStr && exZ==null && !DEIXIS_RE.test(placeStr)){ const ext=await placeExtent(placeStr);
            if(ext){ try{ _setLast(ext); }catch(_){} const _fb=!!(ext.box&&flyToBox(ext.box)); if(!_fb){ GE().camera.flyTo({center:[ext.lng,ext.lat],zoom:Math.max(GE().camera.getZoom(),9),duration:1100}); } _dst={lng:ext.lng,lat:ext.lat,box:_fb?ext.box:null,name:ext.name||placeStr}; return R(true, note(L('Moved to','移動先','Verschoben nach','Перемещено в','Movido a')+': '+esc(placeStr))+_ambigNote(placeStr,ext.lng,ext.lat), _D()); } }   /* (#R108) name the destination in plain text — no bare ✓, no emoji */
          /* deixis / explicit zoom / footprint-miss → gazetteer + Japanese names; use its bbox if present. */
          const ll=await geocode(placeStr);
          if(ll){ if(exZ!=null){ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:exZ,duration:1100}); _dst={lng:ll.lng,lat:ll.lat,zoom:exZ,name:ll.name||placeStr}; }
            else if(ll.bbox&&_bboxOK(ll.bbox)){ const _fb=flyToBox(ll.bbox); if(!_fb) GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),9),duration:1100}); _dst={lng:ll.lng,lat:ll.lat,box:_fb?ll.bbox:null,name:ll.name||placeStr}; }
            else { GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),9),duration:1100}); _dst={lng:ll.lng,lat:ll.lat,name:ll.name||placeStr}; }
            return R(true, note(L('Moved to','移動先','Verschoben nach','Перемещено в','Movido a')+': '+esc(placeStr))+_ambigNote(placeStr,ll.lng,ll.lat), _D()); }   /* (#R108) name the destination in plain text — no bare ✓, no emoji */
          return R(false, warn('⚠ '+L('Place not found','地名が見つかりません','Ort nicht gefunden','Место не найдено','Lugar no encontrado')+': '+esc(placeStr))); }
    },
  },
  {
    row: ['view.terrain3d',             'terrain3d',      '',                                                            'view',    'layer',   'map.terrain',            'map',                 'session', 'none',   '',         ''],
    schema: () => ({ type: 'object', properties: { on: bool() } }),
    async run(a, dctx, K) { const clickId = K.clickId, R = K.R, note = K.note, _featTogHtml = K._featTogHtml, warn = K.warn;
      { const ok=(a.on===false)?clickId('btn-view-globe'):clickId('btn-view-3d'); return R(ok, ok?note('✓ 3D '+(a.on===false?'off':'on'))+_featTogHtml('terrain3d'):warn('⚠')); }
    },
  },
  {
    row: ['view.grid',                  'grid',           '',                                                            'view',    'layer',   'map.grid',               'map',                 'session', 'none',   '',         ''],
    schema: () => ({ type: 'object', properties: { on: bool() } }),
    async run(a, dctx, K) { const setGrid = K.setGrid, clickId = K.clickId, R = K.R, note = K.note, L = K.L, _featTogHtml = K._featTogHtml, warn = K.warn;
      { let ok=false; try{ if(typeof setGrid==='function'){ setGrid(a.on!==false); ok=true; } else ok=clickId('btn-tool-grid'); }catch(_){ ok=clickId('btn-tool-grid'); } return R(ok, ok?note('✓ '+L('Grid','グリッド','Gitter','Сетка','Cuadrícula')+': '+(a.on===false?'off':'on'))+_featTogHtml('grid'):warn('⚠')); }
    },
  },
  {
    row: ['view.resetNorth',            'resetNorth',     'resetView',                                                   'view',    'camera',  'camera',                 'camera',              'session', 'none',   '',         ''],
    schema: () => (noArgs('resetNorth')),
    async run(a, dctx, K) { const clickId = K.clickId, R = K.R, note = K.note, L = K.L, warn = K.warn;
      { const ok=clickId('btn-compass'); return R(ok, ok?note('✓ '+L('Reset north','北を上に','Norden zurücksetzen','Сброс на север','Restablecer norte')):warn('⚠')); }
    },
  },
  {
    row: ['view.zoom',                  'zoom',           '',                                                            'view',    'camera',  'camera',                 'camera',              'session', 'none',   '',         ''],
    schema: () => ({ type: 'object', properties: { to: num(0, 24), delta: num(), dir: one('in', 'out') } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L;
      { let tz=null; try{ const GE=IntMapGeoEngine.camera; if(a.to!=null){ tz=+a.to; GE.zoomTo(tz,{duration:600}); } else if(a.delta!=null){ tz=GE.getZoom()+(+a.delta); GE.zoomTo(tz,{duration:400}); } else if(String(a.dir||'')==='out'){ tz=GE.getZoom()-1; GE.zoomOut(); } else { tz=GE.getZoom()+1; GE.zoomIn(); } }catch(_){}   /* (#R160) zoom control via IntMapGeoEngine (renderer abstraction) */
          /* (#R61) report the TARGET, not the pre-animation zoom (the old note read the camera mid-flight and
             printed a stale value — a false "done" report). */
          return R(true, note('✓ '+L('Zoom','ズーム','Zoom','Зум','Zoom')+' → '+(tz!=null&&isFinite(tz)?(+tz).toFixed(1):IntMapGeoEngine.camera.getZoom().toFixed(1)))); }
    },
  },
  {
    row: ['view.bearing',               'bearing',        'rotate',                                                      'view',    'camera',  'camera',                 'camera',              'session', 'none',   '',         ''],
    /* `deg` is unbounded on purpose: a bearing may be negative, and pitch reaches 180 once
       settings.tiltLimit is on (the standard ceiling is 78) */
    schema: () => ({ type: 'object', properties: { deg: num(), delta: num(), dir: str(), toward: str(), pitch: num(0, 180) } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L;
      { let tb=null; try{ const GE=IntMapGeoEngine.camera; const DIRB={north:0,n:0,northeast:45,ne:45,east:90,e:90,southeast:135,se:135,south:180,s:180,southwest:225,sw:225,west:270,w:270,northwest:315,nw:315,'北':0,'北東':45,'東':90,'南東':135,'南':180,'南西':225,'西':270,'北西':315}; const dd=DIRB[String(a.dir||a.toward||'').toLowerCase().trim()]; tb=(a.deg!=null)?+a.deg:(dd!=null?dd:(a.delta!=null?(GE.getBearing()+(+a.delta)):0)); GE.easeTo({bearing:tb,pitch:a.pitch!=null?+a.pitch:GE.getPitch(),duration:600}); }catch(_){}   /* (#R152/#R160) camera read+drive via IntMapGeoEngine (renderer abstraction) */
          return R(true, note('✓ '+L('Bearing','方位','Ausrichtung','Азимут','Rumbo')+' → '+Math.round(tb!=null&&isFinite(tb)?tb:IntMapGeoEngine.camera.getBearing())+'°')); }
    },
  },
  {
    row: ['view.pitch',                 'pitch',          'tilt',                                                        'view',    'camera',  'camera',                 'camera',              'session', 'none',   '',         ''],
    schema: () => ({ type: 'object', properties: { deg: num(0, 180), delta: num(), on: bool() } }),
      /* (#R171) the ceiling comes from the CAMERA now, not a literal 85 — with Settings ▸ "Map tilt limit"
         set to Unlimited, Atlas can tilt as far as the map itself can, and an angle past the top is resolved
         into the equivalent (pitch, bearing) instead of being clamped flat. */
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L;
      { let tp=null; try{ const GE=IntMapGeoEngine.camera; tp=(a.deg!=null)?+a.deg:(a.delta!=null?(GE.getPitch()+(+a.delta)):(a.on===false?0:60));
            const _T=window.IntMapTilt, _cap=_T?_T.ceiling():85, opt={duration:600};
            if(_T&&_T.isUnlimited()&&tp>180){ const r=_T.fromAngle(tp,GE.getBearing()); opt.pitch=r.pitch; opt.bearing=r.bearing; }
            else { tp=Math.max(0,Math.min(_cap,tp)); opt.pitch=tp; }
            GE.easeTo(opt); }catch(_){}   /* (#R152/#R160) camera read+drive via IntMapGeoEngine */
          return R(true, note('✓ '+L('Tilt','傾き','Neigung','Наклон','Inclinación')+' → '+Math.round(tp!=null&&isFinite(tp)?tp:IntMapGeoEngine.camera.getPitch())+'°')); }
    },
  },
  {
    row: ['view.pan',                   'pan',            'move',                                                        'view',    'camera',  'camera',                 'camera',              'session', 'none',   '',         ''],
    /* `dir` carries compass words in five languages, so it stays a string — but a pan with no
       direction is a no-op the case reports as success */
    schema: () => ({ type: 'object', properties: { dir: str(), direction: str(), fraction: num(0, 1) }, anyOf: [{ required: ['dir'] }, { required: ['direction'] }] }),
    async run(a, dctx, K) { const GE = K.GE, R = K.R, note = K.note, L = K.L, esc = K.esc;
      { try{ const dir=String(a.dir||a.direction||'').toLowerCase().trim(); const f=(a.fraction!=null?+a.fraction:0.45); const D={north:[0,-1],south:[0,1],east:[1,0],west:[-1,0],northeast:[1,-1],northwest:[-1,-1],southeast:[1,1],southwest:[-1,1],up:[0,-1],down:[0,1],left:[-1,0],right:[1,0],'北':[0,-1],'南':[0,1],'東':[1,0],'西':[-1,0]}; const v=D[dir]||[0,0]; const el=GE().render.container&&GE().render.container(); const W=(el&&el.clientWidth)||800,H=(el&&el.clientHeight)||600; GE().camera.panBy([v[0]*W*f, v[1]*H*f],{duration:700}); }catch(_){} return R(true, note('✓ '+L('Pan','移動','Verschieben','Сдвиг','Desplazar')+(a.dir?(' '+esc(a.dir)):''))); }
    },
  },
  {
    row: ['view.fullscreen',            'fullscreen',     '',                                                            'view',    'none',    'view.fullscreen',        'view',                'session', 'none',   '',         ''],
    schema: () => ({ type: 'object', properties: { on: bool(), mode: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, _featTogHtml = K._featTogHtml, warn = K.warn;
      { const want=!(a.on===false||/^(off|exit)$/i.test(String(a.mode||'')));
          try{ if(want){ if(!document.fullscreenElement&&document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); }
            else if(document.fullscreenElement&&document.exitFullscreen) await document.exitFullscreen();
            return R(true, note('✓ '+L('Fullscreen','全画面','Vollbild','Полный экран','Pantalla completa')+': '+(want?'on':'off'))+_featTogHtml('fullscreen')); }   /* (#R152) offer the fullscreen on/off switch */
          catch(_){ return R(false, warn('⚠ '+L('Fullscreen unavailable here','全画面にできませんでした','Vollbild nicht möglich','Полный экран недоступен','Pantalla completa no disponible'))); } }
    },
  },
  /* ⚠ (#R801) WHAT LEAVES, TO WHOM: the device's position, read from the sensor and returned to
     the MODEL as a fact ({lat,lng,accuracyM}, #R413) — column 8 'explicit', same rule as
     navigation.start above. */
  {
    row: ['view.locate',                'locate',         'myLocation,whereAmI',                                         'view',    'camera',  'camera,map.location',                 'camera,map',          'session', 'explicit','',        ''],
    schema: () => (noArgs('locate')),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, GE = K.GE, _selfLocSeed = K._selfLocSeed, note = K.note;
      { /* (installable-app) THE READING IS js/locate-me.js's — the permission pre-check (#R155), the 25 s
           GPS budget and its guard (#R170) and the five reasons a reading ends without a position. This
           door keeps only what is Atlas's own: the words it says to the reader and the fact it hands the model. */
        const fix=await requestFix();
        if(!fix.ok){ const why=fix.reason;
          return R(false, warn('⚠ '+(why===FIX_FAILURE.UNSUPPORTED
            ? L('Geolocation unavailable','この環境では位置情報が使えません','Standort nicht verfügbar','Геолокация недоступна','Geolocalización no disponible')
            : why===FIX_FAILURE.BLOCKED
            ? L('Location is blocked for this site. Turn it on in your browser (tap the lock/permissions icon in the address bar), then ask me again.','この端末で位置情報がブロックされています。ブラウザで許可（アドレスバーの鍵アイコン→権限）してから、もう一度お尋ねください。','Der Standort ist für diese Seite blockiert. Erlaube ihn im Browser (Schloss-Symbol in der Adressleiste → Berechtigungen) und frag mich erneut.','Геолокация заблокирована для сайта. Включите её в браузере (значок замка в адресной строке → разрешения) и спросите снова.','La ubicación está bloqueada para este sitio. Actívala en el navegador (icono de candado en la barra → permisos) y vuelve a preguntar.')
            : why===FIX_FAILURE.DENIED
            ? L('Location permission was denied. Re-enable it in your browser settings, then ask again.','位置情報の許可が拒否されました。ブラウザ設定で再度許可してから、もう一度お尋ねください。','Standortzugriff wurde verweigert. Aktiviere ihn in den Browsereinstellungen und frag erneut.','Доступ к геолокации отклонён. Включите его в настройках браузера и спросите снова.','Se denegó el permiso de ubicación. Vuelve a activarlo en el navegador y pregunta de nuevo.')
            : why===FIX_FAILURE.TIMEOUT
            ? L('Location timed out','位置情報の取得がタイムアウトしました','Standort-Timeout','Тайм-аут геолокации','Tiempo de ubicación agotado')
            : L('Couldn\'t get your location — please try again.','位置情報を取得できませんでした。もう一度お試しください。','Standort konnte nicht ermittelt werden — bitte erneut versuchen.','Не удалось определить местоположение — повторите попытку.','No se pudo obtener tu ubicación: inténtalo de nuevo.')))); }
        const lng=fix.lng, lat=fix.lat;
        try{ GE().camera.flyTo({center:[lng,lat],zoom:Math.max(GE().camera.getZoom(),11),duration:1100}); }catch(_){}
        /* (#R137) also drop the live accent dot + accuracy circle that follow the user — HANDING OVER the fix
           just read, so the marker draws it instead of reading the sensor a second time (installable-app) */
        try{ window.IntMapLocate&&window.IntMapLocate.start({fly:false,fix}); }catch(_){}
        try{ K._lastPlace={lng,lat,name:L('my location','現在地','mein Standort','моё местоположение','mi ubicación')}; }catch(_){}
        try{ _selfLocSeed({lng,lat,acc:fix.acc}); }catch(_){}   /* (#R413) the next 「現在地から…」 resolves from this fix instead of spending another 25 s on the GPS — ⚠⚠⚠ (#R413) `exec` IS WHY THIS WAS UNUSABLE: js/atlas-toolsurface.js forwards `res.exec` and nothing else, so the note below reaches the READER while the turn that located them learned only `ok:true`. */
        return R(true, note(L('Current location','現在地','Aktueller Standort','Текущее местоположение','Ubicación actual')+' ('+lat.toFixed(3)+', '+lng.toFixed(3)+')'),{exec:{lat,lng,accuracyM:Math.round(fix.acc),provenance:'device_location'}}); }
    },
  },
  /* ⚠ (#R493) THE ONLY CAPABILITY WHOSE RESULT IS A PICTURE. Every other row hands Atlas facts
     it can already read off the state ledger; this one hands it the PIXELS — the frame the
     reader is looking at, attached to the next model call as a real image. It writes nothing
     and moves nothing (observer `none`, empty `writes`), so it holds no conflict key and can
     run beside anything. risk='read' for the same reason.
     ⚠ (#R801) WHAT LEAVES, TO WHOM: the pixels on the reader's screen, to the MODEL as an image
     — column 8 'explicit' (js/atlas-executor.js 4b). */
  {
    row: ['view.inspect',               'inspect',        'lookAtMap,seeMap,viewInspect,readScreen',                     'view',    'none',    '',                       'explanation',         'read',    'explicit','',        ''],
    /* (#R493) `include` is a CLOSED, ASCII set the dispatch really compares against (rule 2 above),
       and neither argument is required: an inspect with no arguments takes the whole screen, which
       is the right default for 「今見えているもの」. `reason` is free text — what Atlas is looking
       FOR — carried into the frame's caption so the reader can see why their view was captured. */
    schema: () => ({ type: 'object', properties: { include: { type: 'string', enum: ['screen', 'map'] }, reason: str() } }),
    async run(a, dctx, K) { const VFRAMES = K.VFRAMES, R = K.R, warn = K.warn, esc = K.esc;
      { const _vf=await VFRAMES.captureFrame(a); return _vf.ok?R(true,_vf.html,{exec:_vf.facts}):R(false,warn('⚠ '+esc(_vf.message))); }   /* ⚠⚠⚠ (#R493) THE ONE CASE WHOSE RESULT IS A PICTURE. `facts` is the mechanical record Atlas reads — bbox, zoom, bearing, pitch, layers, all exact; the PIXELS stay in the ledger and ride the vision channel, because js/atlas-agent.js serialises every tool result into the prompt TEXT and a data URL put there is not an image, it is half a megabyte of base64. The capture itself is the screenshot button's, unchanged: js/atlas-view-capture.js. */
    },
  },
];
