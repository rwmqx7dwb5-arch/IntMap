/* ============================================================================
 *  IntMap · Atlas capabilities — the `map.*` namespace   (js/atlas-cap-map.js)
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
 *  (atlas-capability-single-source) An entry also holds `doc` — its fragment of each catalogue block the planner
 *  reads (js/atlas-catalog-text.js keeps only the blocks' order and headings) — and, where it has them, `phrases`,
 *  `policy`, `goal`, `chips` and `catalogueSilent`. js/atlas-caps.js says what each one is; nothing outside the
 *  entry names them.
 * ==========================================================================*/
import { str, bool, num, int, one, list, obj, loose, noArgs } from './atlas-caps.js';
import { volcanoFilterRun, heritageFilterRun, radiationNearRun } from './atlas-cap-data.js';
import { droneRun } from './atlas-cap-routing.js';
import { icon } from './icons.js';   /* (icon-system) the one icon set — js/icons.js */

export default [
  {
    row: ['map.clearHighlights',        'reset',          '',                                                            'map',     'paint',   'map.highlight,map.compose',          'map',                 'session', 'none',   '',         ''],
    /* ── map, layers, view, panels, country data — the first run of the registry table ──────── */
    doc: [
      { in: 'country-statistics', at: 70, text: '{"type":"reset"} clears highlights & shading.\n' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => (noArgs('reset')),
    async run(a, dctx, K) { const clearHl = K.clearHl, clearChoro = K.clearChoro, clearPolyHl = K.clearPolyHl, clearLineHl = K.clearLineHl, COMPOSE = K.COMPOSE, R = K.R, note = K.note, L = K.L, _CLEARED = K._CLEARED;
      clearHl(); clearChoro(); clearPolyHl(); clearLineHl(); try{ COMPOSE.clear(); }catch(_){} return R(true, note('✓ '+L('Cleared map highlights.','ハイライトを消去しました。','Hervorhebungen gelöscht.','Выделение очищено.','Resaltado borrado.')), _CLEARED('countries','polys','lines','choro'));
    },
  },
  /* ⚠ (#R743) AND DRAWING IS ITS OWN PROMISE. A step that draws only when asked cannot
     honestly declare 'map.object': the observer would measure a map that did not move and
     call a correct answer not_rendered — the shape #R736/#R737 measured, where 21 tool calls
     went into re-drawing a map that had been right from the first. One capability computes
     and promises nothing about the map; this one draws and promises exactly that. */
  {
    row: ['map.drawDataset',            'gisDraw',        'drawDataset,showDataset',                                     'map',     'paint',   'map.object',             'map',                 'session','none',   '',         'gisCore'],
    /* (#R752) ⚠ `band` AND `spec` ARE HERE BECAUSE js/gis-core.js DRAWS WITH THEM. A grid with
       three bands is three pictures, and until this round the Atlas door could name none of them:
       the schema declared `dataset` alone, so no planner could express 「2 番目のバンドで」 and
       js/gis-atlas.js passed no options at all. A capability the model is not told it can pass is
       a capability it does not use ([[intmap-prompt-that-hid-the-tools-in-hand]]). ⚠ The band is
       checked against the grid by js/gis-core.js (`band-out-of-range`), not by a ceiling invented
       here — this file knows how many bands no dataset has. */
    doc: [
      { in: 'spatial-analysis', at: 20, text: '{"type":"gisDraw","dataset":REF,"band"?:int} puts a finished dataset on the map — a GRID HAS ONE PICTURE PER BAND, so name the band you mean (the catalogue row lists them with their units; omitted = the first). So 「施設から5km圏を作り、統合し、その範囲の人口を集計して地図に出して」 is buffer → dissolve → zonal → gisDraw, carrying the id forward each time.\n' },
    ],
    schema: () => ({ type: 'object', properties: { dataset: str(), band: int(0, null), spec: obj() }, required: ['dataset'] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L;
      { await window.IntMapLazy.need('gisCore'); const _GD=window.IntMapGis&&window.IntMapGis.atlas; if(!_GD) return R(false, warn(L('The GIS engine could not be loaded.','GIS エンジンを読み込めませんでした。','Die GIS-Engine konnte nicht geladen werden.','Не удалось загрузить GIS-движок.','No se pudo cargar el motor GIS.'))); const _gd=await _GD.draw(a); return _gd.ok ? R(true,_gd.html,{meta:{gis:{dataset:_gd.dataset.id,drawn:true}}}) : R(false, warn(_gd.html)); }   /* (#R743) the second door: drawing a dataset is a separate promise from making one, because an observer that measures the map must be declared by something that always moves it. */   /* ⚠⚠ (#R743) THE OTHER HALF OF THE LINE ABOVE — 「読める」 に対する 「作らせられる」. The ops, their declarations, the input resolution and the reply are js/gis-atlas.js, which sits inside the gisCore chunk BECAUSE THE OPS DECLARE THEMSELVES: a list of ops written here would be invisible to the op added to DECL tomorrow. This line is the door and the argument binding, because the file it sits in may not grow (tests/atlas-capabilities-checks.test.mjs (#R318) ⓑ). */
    },
  },
  {
    row: ['map.choropleth',             'mapMetric',      'choropleth',                                                  'map',     'paint',   'map.choropleth',         'map',                 'session', 'none',   'metric',   ''],
    doc: [
      { in: 'country-statistics', at: 40, text: '{"type":"mapMetric","metric":KEY,"order":"top"|"bottom","color"?:str} = CHOROPLETH that shades EVERY country by the metric with a legend (use for "color/shade/heat-map the world by …"; optional "color" sets the shading hue, e.g. "red"); ' },
      { in: 'metric-keys', at: undefined },   /* documented by the chunk's own text, not a fragment */
    ],
    chips: 'choropleth',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', properties: { metric: str(), order: one('top', 'bottom'), color: str() }, required: ['metric'] }), /* `mapMetric` */
    async run(a, dctx, K) { const ensureData = K.ensureData, metSpec = K.metSpec, unknownMetric = K.unknownMetric, _fillMetric = K._fillMetric, drawChoro = K.drawChoro;
      { await ensureData(); const _sp=metSpec(a.metric); if(!_sp) return unknownMetric(a.metric);
          try{ await _fillMetric(_sp.key); }catch(_){}   /* (#R740) lifeExp/internet/tfr arrive from the World Bank on demand — shade AFTER they are in countryStats, or a real metric reports "not enough data" */
          return drawChoro(_sp.key,a.order,a.color); }
    },
  },
  {
    row: ['map.isolateCountry',         'isolate',        '',                                                            'map',     'paint',   'map.isolate',            'map',                 'session', 'none',   'country',  ''],
    /* `on:false` (or country "off"/"exit"/"clear") leaves isolation — a complete call with no country */
    doc: [
      { in: 'country', at: 30, text: '{"type":"isolate","country":str,"on":bool} (show only it); ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    chips: 'isolate',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', properties: { country: str(), place: str(), on: bool() }, anyOf: [{ required: ['country'] }, { required: ['place'] }, { required: ['on'] }] }), /* `isolate` */
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, resolveCountry = K.resolveCountry, GE = K.GE, esc = K.esc, warn = K.warn;
      { if(a.on===false||/^(off|exit|clear)$/i.test(String(a.country||''))){ try{ window.IntMapIsolate&&window.IntMapIsolate.exit(); }catch(_){} return R(true, note('✓ '+L('Isolate off','分離解除','Isolierung aus','Изоляция выкл','Aislar: off'))); } const c=await resolveCountry(a.country||a.place); if(c){ if(c.ll){ try{ GE().camera.flyTo({center:[c.ll.lng,c.ll.lat],zoom:Math.max(GE().camera.getZoom(),4)}); }catch(_){} } let ok=false; try{ if(c.code&&window.IntMapIsolate&&window.IntMapIsolate.enter){ window.IntMapIsolate.enter(c.code); ok=true; } else if(c.ll&&window.IntMapIsolate&&window.IntMapIsolate.enterAt){ window.IntMapIsolate.enterAt(c.ll.lng,c.ll.lat,c.name); ok=true; } }catch(_){} return R(ok, ok?note('✓ '+L('Isolate','分離','Isolieren','Изолировать','Aislar')+': '+esc(c.name||'')):warn('')); } return R(false, warn(esc(a.country||a.place||''))); }
    },
  },
  {
    row: ['map.object',                 'object',         'mapObject',                                                   'map',     'object',  'map.object',             'object',              'session', 'explicit','',        ''],
    /* op defaults to `list`, which needs nothing; the kinds are js/map-tools.js's own */
    doc: [
      { in: 'more-features', at: 130, text: '{"type":"object",…} above.)\n' + 'RADIO / SIGNAL COVERAGE FROM A MAST: ' },
      { in: 'map.object', text: 'MAP OBJECTS: {"type":"object","op":"list"|"remove"|"focus"|"rename","id"?:str,"kind"?:"pin"|"radius"|"annot"|"poly"|"outline"|"upload"|"route"|"iso","index"?:num,"name"?:str} = operate on objects ALREADY drawn on the map (ids are listed in CURRENT MAP STATE; "poly"=Atlas-drawn polygons, "outline"=the active boundary outline). "2番目の円を消して" → {"type":"object","op":"remove","kind":"radius","index":2}.\n' },
    ],
    schema: () => ({ type: 'object', properties: { op: one('list', 'remove', 'delete', 'focus', 'zoom', 'rename'), action: one('list', 'remove', 'delete', 'focus', 'zoom', 'rename'), id: str(), kind: one('pin', 'radius', 'annot', 'poly', 'outline', 'upload', 'route', 'iso', 'nogo', 'pt'), index: int(1), name: str(), to: str() } }),
      /* (#R118) MAP-OBJECT operations by id (see IntMapObjects.list in the state context) */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, note = K.note, esc = K.esc, L = K.L;
      {
          const O=window.IntMapObjects; if(!O||!O.list) return R(false, warn(''));
          const op=String(a.op||a.action||'list').toLowerCase();
          if(op==='list'){ const ls=O.list(); return R(true, note(ls.length?ls.map(o=>o.kind+' · '+esc(o.name)+' <span style="color:var(--text-muted);">id='+esc(o.id)+'</span>').join('<br>'):L('No objects on the map.','地図上にオブジェクトはありません。','Keine Objekte.','Объектов нет.','Sin objetos.'))); }
          let id=a.id!=null?String(a.id):null;
          if(!id&&(a.kind||a.index!=null)){ const ls=O.list().filter(o=>!a.kind||o.kind===String(a.kind)); const idx=(a.index!=null?(+a.index-1):(ls.length-1)); if(ls[idx]) id=ls[idx].id; }
          if(!id) return R(false, warn(L('Which object? Give its id (see the map-object list).','どのオブジェクト？idを指定してください。','Welches Objekt? id angeben.','Какой объект? Укажите id.','¿Qué objeto? Indica su id.')));
          let ok=false;
          if(op==='remove'||op==='delete') ok=O.remove(id);
          else if(op==='focus'||op==='zoom') ok=O.focus(id);
          else if(op==='rename') ok=O.rename(id,a.name||a.to||'');
          return R(ok, ok?note('✓ '+op+' · '+esc(id)):warn(L('No object on the map has that id — it may already be gone','そのidのオブジェクトは地図上にありません（すでに消えている可能性があります）','Kein Objekt mit dieser id auf der Karte','На карте нет объекта с таким id','Ningún objeto del mapa tiene ese id')+': '+esc(id))); }   /* ⚠ (#R736) the failure arm printed the BARE INTERNAL ID and nothing else — measured in production, the reader was shown 「⚠ r_1789464310159_keui」 */
    },
  },
  {
    row: ['map.pin',                    'pin',            '',                                                            'map',     'object',  'map.object',             'object,map',          'session', 'none',   'place',    ''],
    doc: [
      { in: 'tools-panels', at: 30, text: '{"type":"pin","place":str,"country"?:str,"title"?:str,"description"?:str,"date"?:str,"source"?:str,"url"?:str,"confidence"?:"high"|"medium"|"low"} = a MARKER THAT CARRIES ITS OWN EXPLANATION: the popup shows the title, the description, the date/source line and a link. Emit ONE pin per concrete place with its own text — never a bare pin followed by a second research pass to describe it, and never a whole province as a pin when what happened happened in a town. ALWAYS pass "country" (and "countryCode" when you have it) with a settlement or district name: a bare 「オクチャブリスキー」 is ambiguous across dozens of places and will fail; ' },
    ],
    chips: 'pin',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', properties: { place: str(), country: str(), title: str(), description: str(), source: str(), url: str(), date: str(), confidence: str(), kind: str(), countryCode: str() }, required: ['place'] }), /* (#R489) a pin may carry what it IS — the marker's popup shows title/description/date/source/link. Before this the action took a bare place, so a turn that wanted described incident markers had to improvise with a second research pass (js/atlas-console.js case 'pin'). `country` is not decoration: 「オクチャブリスキー」 alone is a query that cannot succeed. */
    async run(a, dctx, K) { const GLEDGER = K.GLEDGER, _lnorm = K._lnorm, geocode = K.geocode, addPin = K.addPin, GE = K.GE, HOST = K.HOST, R = K.R, note = K.note, esc = K.esc, warn = K.warn;
      { const _pm={title:String(a.title||a.name||'').trim(),description:String(a.description||a.summary||a.note||a.text||'').trim(),source:String(a.source||a.src||'').trim(),url:String(a.url||'').trim(),when:String(a.date||a.when||'').trim(),confidence:String(a.confidence||'').trim()}; const _pk=GLEDGER.resolve(a.place); const _pp=String(a.place||'').trim(), _pc=String(a.country||'').trim(); const _pq=(_pc&&_pp&&_lnorm(_pp).indexOf(_lnorm(_pc))<0)?(_pp+', '+_pc):_pp;   /* ⚠ (#R489) THE COUNTRY IS APPENDED ONLY WHEN IT IS NOT ALREADY THERE. Measured on the live endpoint: 「Kotovsk, Russia」 returns 1 result and 「Kotovsk, Russia, Russia」 returns 0 — and a model that fills both `place` and `country` writes the doubled form every time. */ const ll=(_pk&&_pk.lng!=null)?{lng:_pk.lng,lat:_pk.lat,name:_pk.canonicalName||_pk.name}:await geocode(_pq||a.place);   /* ⚠⚠ (#R489) A PIN CAN SAY WHAT IT IS, AND THAT IS THE WHOLE OF THE SECOND REPORT. `pin` accepted a place and nothing else, and `addPin(lng,lat)` made a marker whose popup reads 「Pin #3」 — so a turn asked for 「これらの着弾地点を説明付きでピンして」 had NO action that could carry the explanation, and improvised: research → bare pin → research again → pin again, four independent passes whose conclusions disagreed because each one re-searched. The description travels with the marker now. ⚠ AND THE PLACE IS ASKED FOR WITH ITS COUNTRY (js/atlas-geo-ledger.js first, so a name this conversation already resolved is not geocoded a second time) — 「オクチャブリスキー」 with no parent oblast and no country code is a query that cannot succeed, which is what the transcript shows it doing. */
          if(ll){ try{ addPin(ll.lng,ll.lat,_pm); }catch(_){} try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),5)}); }catch(_){} try{ GLEDGER.record({kind:String(a.kind||ll.kind||'point'),name:String(a.place||''),canonicalName:ll.name||String(a.place||''),countryCode:String(a.countryCode||''),countryName:String(a.country||''),lng:ll.lng,lat:ll.lat,role:_pm.title||'pin',summary:_pm.description,source:'pin',provenance:'geocoded_point'}); }catch(_){}
          let _oid=null; try{ _oid=(HOST.userPins&&HOST.userPins.length)?String(HOST.userPins[HOST.userPins.length-1].id):null; }catch(_){}   /* (#R119) creating actions return the created object's id */
          return R(true, note(esc(_pm.title||ll.name||a.place||'')+(_pm.description?('<br><span style="font-size:11px;opacity:0.85;">'+esc(_pm.description)+'</span>'):'')), _oid?{objectIds:[_oid]}:null); } return R(false, warn(esc(a.place||''))); }
    },
  },
  {
    row: ['map.tool',                   'tool',           '',                                                            'map',     'panel',   'map.tool',               'panel',               'session', 'none',   '',         ''],
    doc: [
      { in: 'tools-panels', at: 110, text: '{"type":"tool","name":"measure"|"radius"|"draw"|"volume"} (the drone planner is its own action with arguments — {"type":"drone",…}); ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { name: str() }, required: ['name'] }),
      /* (#R172) …and "volume". The catalogue has advertised {"type":"tool","name":"volume"} since #R170, but
         there was no branch for it, so it fell through to doControl() and quietly did nothing. */
      /* (#R176) The drone planner lost its toolbar button (「どこにも置くな」), so it can no longer be
         reached by clicking an id — it is called directly. Everything else still routes through the
         button it owns, because that button is where the tool's own state lives. */
    async run(a, dctx, K) { const R = K.R, note = K.note, esc = K.esc, warn = K.warn, clickId = K.clickId, doControl = K.doControl;
      { const n=String(a.name||'').toLowerCase();
          /* ⚠ (science-instruments) NO LONGER A SPECIAL CASE THAT TOGGLES THE PANEL. A name that means the drone
             planner is handed to the planner's own capability (routing.drone), which opens it, plans a route
             when given one and reports the planner's own numbers — the same answer {"type":"drone"} gives. */
          if(/drone|ドローン|无人机|무인기/.test(n)) return droneRun({ action:a.action, from:a.from, to:a.to, via:a.via, alt:a.alt, ref:a.ref, aircraft:a.aircraft }, dctx, K);
          const id=/radius/.test(n)?'btn-tool-radius':/draw/.test(n)?'btn-tool-draw':/volume|立体|体積/.test(n)?'btn-tool-volume':/measur|dist|area/.test(n)?'btn-tool-measure':/grid/.test(n)?'btn-tool-grid':null; if(id){ const ok=clickId(id); return R(ok, ok?note('✓ '+esc(a.name||'')):warn('')); } return doControl({target:a.name}); }
    },
  },
  {
    row: ['map.radius',                 'radius',         '',                                                            'map',     'object',  'map.object',             'object,map',          'session', 'none',   'place',    ''],
    doc: [
      { in: 'tools-panels', at: 40, text: '{"type":"radius","place":str,"km":num,"color"?:str} = a STRAIGHT-LINE distance circle and nothing else. A circle is NOT an answer to a travel-TIME question ("現在地から徒歩1時間で行ける範囲", "how far can I get in an hour", "30分で車で行ける範囲", "15 minute walk from the station"): rivers, motorways and dead ends make the real reach nothing like a disc, and the user has explicitly rejected the substitution. For every such request emit "isochrone" (REACHABLE AREA, below) — never a radius circle standing in for it; ' },
    ],
    /* #R115: non-equivalent substitutions the planner has actually made, recorded so it cannot make them again */
    policy: { forbidden: ['routing.isochrone'] },
    schema: () => ({ type: 'object', properties: { place: str(), km: num(0), color: str() }, required: ['place'] }),
    async run(a, dctx, K) { const geocode = K.geocode, HOST = K.HOST, parseColor = K.parseColor, warn = K.warn, L = K.L, esc = K.esc, GE = K.GE, R = K.R, note = K.note;
      { const ll=await geocode(a.place); if(ll){ try{ if(a.km!=null&&typeof HOST.radiusKm!=='undefined') HOST.radiusKm=Math.max(1,+a.km); }catch(_){} let cw=''; if(a.color!=null&&String(a.color).trim()!==''){ const pc=parseColor(a.color); if(pc){ try{ HOST.radiusColor=pc; }catch(_){} } else cw=warn(L('Unknown color','色を認識できません','Unbekannte Farbe','Неизвестный цвет','Color desconocido')+': '+esc(a.color)); } try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),4)}); }catch(_){} let ok=false; try{ if(window._radiusFromPoint){ window._radiusFromPoint(ll.lng,ll.lat); ok=true; } }catch(_){} let _oid=null; try{ _oid=(HOST.radiusItems&&HOST.radiusItems.length)?String(HOST.radiusItems[HOST.radiusItems.length-1].id):null; }catch(_){} return R(ok, (ok?note(icon('radius')+' '+esc(ll.name||a.place||'')+(a.km?(' · '+a.km+' km'):'')):warn(''))+cw, (ok&&_oid)?{objectIds:[_oid]}:null); } return R(false, warn(esc(a.place||''))); }
    },
  },
  {
    row: ['map.volume3d',               'volume3d',       'volume',                                                      'map',     'object',  'map.object,map.volume',             'object,map',          'session', 'none',   'place',    ''],
    /* base and top are ALTITUDES; without both the case refuses, whatever the footprint */
    doc: [
      { in: 'tools-panels', at: 120, text: '{"type":"volume3d","place":str,"km"?:num (footprint size in km, default 5),"base":num,"top":num,"unit"?:"m"|"km"|"ft"|"mi" (the unit "base"/"top" are given in — default "m"),"shape"?:"square"|"circle","color"?:str (hex),"opacity"?:num 0.05-0.95} = draw a REAL-SCALE 3-D VOLUME standing in the air over a place: a square (default) or CIRCULAR footprint centered on it, extruded between the "base" and "top" ALTITUDES ABOVE SEA LEVEL, so a 1000-3000 m band really is 2 km thick against the terrain beside it. There is NO upper limit — a 35,786 km geostationary shell is a valid request (unit:"km"). Use for "東京上空1000mから3000mを立体で描画", "draw the airspace over Paris from 2000 m to 5000 m", "show a 3-D volume above X", "富士山の上に赤い円柱を高度3000-8000mで" (shape:"circle", color:"#ff3b30"), "10kmから14kmの航空路を描いて" (unit:"km", base:10, top:14); ' },
    ],
    schema: () => ({ type: 'object', properties: { place: str(), km: num(0), base: num(), top: num(), unit: one('m', 'km', 'ft', 'mi'), shape: str(), color: str(), opacity: num(0, 1) }, required: ['place', 'base', 'top'] }),
      /* (#R170) 3-D VOLUME — the Atlas face of Measure ▸ 3-D volume (js/volume3d.js). base/top are ALTITUDES
         ABOVE SEA LEVEL in metres; the module compensates for 3-D terrain so the band lands where it was asked for. */
    async run(a, dctx, K) { const geocode = K.geocode, R = K.R, warn = K.warn, esc = K.esc, L = K.L, setTool = K.setTool, HOST = K.HOST, refreshTool = K.refreshTool, updateToolPanel = K.updateToolPanel, GE = K.GE, note = K.note;
      { const ll=await geocode(a.place); if(!ll) return R(false, warn(esc(a.place||''))); await window.IntMapLazy.need('volume3d');   /* (#R311) on-demand: fetch before reading the global */
          const V=window.IntMapVolume3D; if(!V) return R(false, warn(L('3-D volume tool unavailable','3D立体ツールを使えません','3-D-Volumen nicht verfügbar','Инструмент 3-D недоступен','Herramienta 3-D no disponible')));
          const km=Math.max(0.2,Math.min(500,+a.km||5));
          /* (#R172) base/top may now be given in any of the tool's units, and there is no ceiling — a
             geostationary shell at 35,786 km is a legitimate thing to ask for. */
          const UF={m:1,km:1000,ft:0.3048,mi:1609.344};
          const un=UF[String(a.unit||'m').toLowerCase()]?String(a.unit||'m').toLowerCase():'m';
          const base=(+a.base)*UF[un], top=(+a.top)*UF[un];
          if(!isFinite(base)||!isFinite(top)) return R(false, warn(L('Need a base and a top altitude','下端と上端の高度が必要です','Basis- und Obergrenze nötig','Нужны нижняя и верхняя высота','Se necesitan altitud inferior y superior')));
          /* (#R171) the footprint can be a CIRCLE now, not only the square — the shapes the panel offers are
             reachable from Atlas too, along with the colour and opacity. */
          const round=/^(circle|round|circular|円|丸)$/i.test(String(a.shape||''));
          let ring;
          if(round){ ring=V.circleRing([ll.lng,ll.lat], km*500, 96); }   /* km is the DIAMETER, as for the square */
          else { /* square footprint `km` on a side, centred on the place (longitude scaled by latitude) */
            const dLat=km/2/110.574, dLng=km/2/(111.320*Math.max(0.02,Math.cos(ll.lat*Math.PI/180)));
            ring=[[ll.lng-dLng,ll.lat-dLat],[ll.lng+dLng,ll.lat-dLat],[ll.lng+dLng,ll.lat+dLat],[ll.lng-dLng,ll.lat+dLat]]; }
          try{ if(typeof setTool==='function') setTool('volume'); if(typeof HOST.measurePoints!=='undefined') HOST.measurePoints=[];
            if(V.setUnit) V.setUnit(un);
            /* (#R174) the "solid" parameter is gone with the checkbox — a volume is a closed body, and an
               option nobody can act on is worse than no option at all. */
            V.setAltitudes(base,top);
            if(a.color||a.opacity!=null) V.setStyle(a.color||null, a.opacity!=null?+a.opacity:null);
            V.setRing(ring);
            if(typeof refreshTool==='function') refreshTool(); if(typeof updateToolPanel==='function') updateToolPanel();
            /* (#R172) no re-set needed any more: syncClicks() refuses to replace a ring it did not create,
               so the panel rebuild above can no longer wipe an Atlas footprint (it used to, for the square). */
          }catch(_){}
          try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),10),pitch:Math.max(GE().camera.getPitch(),55)}); }catch(_){}
          const st=V.state();
          return R(!!st.points, st.points?note(icon('cube')+' '+esc(ll.name||a.place||'')+' · '+V.fmtAlt(Math.min(base,top))+'–'+V.fmtAlt(Math.max(base,top))+' · '+V.fmtVolume()):warn('')); }
    },
  },
  /* ⚠ `measure` ARMS the tool; the line appears when the USER clicks. Declaring 'map' here made
     the verifier promise a drawing that correctly is not there yet (§6's panel rule). */
  {
    row: ['map.measure',                'measure',        '',                                                            'map',     'panel',   'map.tool',               'panel',               'session', 'none',   '',         ''],
    /* ── tools, workspace, the terrain simulations ──────────────────────────────────────────── */
    doc: [
      { in: 'tools-panels', at: 50, text: '{"type":"measure","from":str,"to":str} (distance); ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { from: str(), to: str() }, required: ['from', 'to'] }),
    async run(a, dctx, K) { const geocode = K.geocode, setTool = K.setTool, HOST = K.HOST, refreshTool = K.refreshTool, updateToolPanel = K.updateToolPanel, GE = K.GE, R = K.R, note = K.note, esc = K.esc, warn = K.warn, L = K.L;
      { const A=await geocode(a.from); const B=await geocode(a.to); if(A&&B){ try{ if(typeof setTool==='function') setTool('measure'); if(typeof HOST.measurePoints!=='undefined') HOST.measurePoints=[[A.lng,A.lat],[B.lng,B.lat]]; if(typeof refreshTool==='function') refreshTool(); if(typeof updateToolPanel==='function') updateToolPanel(); }catch(_){} try{ GE().camera.flyTo({center:[(A.lng+B.lng)/2,(A.lat+B.lat)/2],zoom:Math.max(GE().camera.getZoom()-1,2)}); }catch(_){} let _mr=null; try{ _mr=HOST.measureReading&&HOST.measureReading([[A.lng,A.lat],[B.lng,B.lat]]); }catch(_){}   /* (#R747) the figure travels with the result — see HOST.measureReading in js/app-body.js */
          return R(true, note(icon('ruler')+' '+esc(A.name||a.from||'')+' → '+esc(B.name||a.to||'')+(_mr?(' · '+esc(_mr.text)+' · '+esc(Math.round(_mr.bearing))+'° '+esc(_mr.bearingText||'')):''))); } return R(false, warn(L('Need two places','2地点が必要','Zwei Orte nötig','Нужны два места','Se necesitan dos lugares'))); }
    },
  },
  {
    row: ['map.objectList',             'objects',        'objectList,manageObjects,listObjects,myObjects',              'map',     'panel',   'panel.objects',          'panel',               'session', 'none',   '',         ''],
    doc: [
      { in: 'more-features', at: 120, text: '{"type":"objects"} = open the panel listing EVERY object on the map — pins, drawings, radius circles, polygons, boundary outlines, uploaded layers, routes and reachable areas — each with fly-to / rename / recolour / hide / delete. Use for 「オブジェクト一覧」「地図上のものを管理」, "manage my objects", "show everything I have drawn". (To operate on ONE object by its id use ' },
    ],
    schema: () => (noArgs('objects')),
      /* (#R88) universal object list — see & manage every pin/drawing/radius/route/upload/isochrone in one panel */
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L;
      { let n=0; try{ if(window.IntMapObjects){ n=window.IntMapObjects.count(); window.IntMapObjects.open(); } }catch(_){}
          return R(true, note(icon('folder')+' '+L('Objects','オブジェクト一覧','Objekte','Объекты','Objetos')+' · '+n+' '+L('on the map','件','Objekte','объектов','objetos'))+note(L('Manage every pin, drawing, radius, route, uploaded layer and reachable-area here — rename, recolor, hide or delete.','ピン・図形・半径・経路・アップロード・到達圏をここで一括管理（名称変更・色変更・非表示・削除）。','Alle Objekte hier verwalten.','Управляйте всеми объектами здесь.','Gestiona todos los objetos aquí.'))); }
    },
  },
  {
    row: ['map.clearAll',               'clearAll',       '',                                                            'map',     'paint',   'map.all',                'map',                 'session', 'explicit','',        ''],
    doc: [
      { in: 'tools-panels', at: 240, text: '{"type":"clearAll"} (clear highlights, shading, pins, radius & isolate); ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => (noArgs('clearAll')),
    async run(a, dctx, K) { const clearHl = K.clearHl, clearChoro = K.clearChoro, COMPOSE = K.COMPOSE, clearPolyHl = K.clearPolyHl, clearLineHl = K.clearLineHl, clearPois = K.clearPois, clearFly = K.clearFly, clearBlast = K.clearBlast, clearElev = K.clearElev, clearFac = K.clearFac, clearAllPins = K.clearAllPins, R = K.R, note = K.note, L = K.L, _CLEARED = K._CLEARED;
      { K._herePoint=null; try{ clearHl(); }catch(_){} try{ clearChoro(); }catch(_){} try{ COMPOSE.clear(); }catch(_){} try{ clearPolyHl(); }catch(_){} try{ clearLineHl(); }catch(_){} try{ clearPois(); }catch(_){} try{ clearFly(); }catch(_){} try{ clearBlast(); }catch(_){} try{ clearElev(); }catch(_){} try{ clearFac(); }catch(_){} try{ window.IntMapRouting&&window.IntMapRouting.clear&&window.IntMapRouting.clear(); }catch(_){} try{ window.IntMapRadiation&&window.IntMapRadiation.clear&&window.IntMapRadiation.clear(); }catch(_){} try{ window.IntMapArc3D&&window.IntMapArc3D.hide(); }catch(_){} try{ if(typeof clearAllPins==='function') clearAllPins(); }catch(_){} try{ window.clearAllRadius&&window.clearAllRadius(); }catch(_){} try{ window.IntMapIsolate&&window.IntMapIsolate.exit&&window.IntMapIsolate.exit(); }catch(_){} try{ window.IntMapOutline&&window.IntMapOutline.clear&&window.IntMapOutline.clear(); }catch(_){} return R(true, note('✓ '+L('Cleared the map','地図をクリアしました','Karte geleert','Карта очищена','Mapa despejado')), _CLEARED('countries','era','polys','lines','choro','outline','poi')); }   /* (#R802) …and the markers, which this case takes off (`clearPois()` above) and did not declare */   /* ⚠ (#R760) THE OTHER HALF OF #R747's DECLARATION, WHICH `reset` GOT AND THIS DID NOT: clearing an already-clear map moves no count, so `paint.verify` fell to its last line and called it `not_rendered`. Measured on production 2026-09-16, 「Actually, go back to the previous view」: `map.clearAll` → `not_rendered` while the map was in fact clear. */
    },
  },
  {
    row: ['map.outline',                'outline',        'extent,showExtent',                                           'map',     'paint',   'map.highlight,map.outline',          'object,map',          'session', 'none',   'place',    ''],
    doc: [
      { in: 'navigation-view', at: 110, text: '{"type":"outline","place":str,"color"?:str} draws the real boundary of that place or region as a polygon on the map (and {"type":"outline","place":"clear"} removes it). ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    chips: 'outline',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', properties: { place: str(), country: str(), name: str(), color: str(), on: bool() }, anyOf: [{ required: ['place'] }, { required: ['country'] }, { required: ['name'] }, { required: ['on'] }] }),
    async run(a, dctx, K) { const R = K.R, note = K.note, L = K.L, _CLEARED = K._CLEARED, warn = K.warn, parseColor = K.parseColor, esc = K.esc, placeExtent = K.placeExtent, _ambigNote = K._ambigNote;
      { if(a.on===false||/^(off|clear|hide|none)$/i.test(String(a.place||a.country||''))){ try{ window.IntMapOutline&&window.IntMapOutline.clear(); }catch(_){} return R(true, note('✓ '+L('Outline cleared','範囲表示を消去','Umriss gelöscht','Контур очищен','Contorno borrado')), _CLEARED('outline')); }
          const place=String(a.place||a.country||a.name||'').trim(); if(!place) return R(false, warn(L('Which place to outline?','どの場所の範囲？','Welcher Ort?','Какое место?','¿Qué lugar?')));
          if(!window.IntMapOutline||!window.IntMapOutline.show) return R(false, warn(''));
          let ocw=''; if(a.color!=null&&String(a.color).trim()!==''){ const pc=parseColor(a.color); if(pc){ try{ window.IntMapOutline.setColor&&window.IntMapOutline.setColor(pc); }catch(_){} } else ocw=warn(L('Unknown color','色を認識できません','Unbekannte Farbe','Неизвестный цвет','Color desconocido')+': '+esc(a.color)); }
          let ext=null; try{ ext=await placeExtent(place); }catch(_){}
          /* (#R59) outline = the REAL boundary only (point-in-polygon via ext's point; NO rectangle for regions that
             have no polygon — the user: "領域がわからない地名は全部長方形になるとかクソ"). */
          const ctx=ext?{lng:ext.lng,lat:ext.lat,fit:true}:{fit:true};
          let ok=false; try{ ok=await window.IntMapOutline.show((ext&&ext.name)||place, ctx); }catch(_){} let _olName=null; try{ const _c=window.IntMapOutline.current&&window.IntMapOutline.current(); _olName=(_c&&_c.name)||null; }catch(_){ _olName=null; }   /* (#R760) the name the outline SETTLED on, not the one we asked for: a declaration naming something the reading cannot find is worse than none */
          return R(!!ok, (ok?note('⬡ '+L('Outlined','範囲を表示','Umrissen','Контур','Contorno')+': '+esc((ext&&ext.name)||place))+(ext?_ambigNote(place,ext.lng,ext.lat):''):warn(L('No precise boundary for','正確な境界がありません','Keine genaue Grenze für','Нет точной границы для','Sin límite preciso para')+': '+esc((ext&&ext.name)||place)))+ocw, (ok&&_olName)?{objectIds:['outline'],meta:{painted:{outline:[String(_olName)]}}}:(ok?{objectIds:['outline']}:null)); }   /* (#R120) the outline is a referencable object */
    },
  },
  {
    row: ['map.pandemicDay',            'pandemicDraw',   'drawPandemic,showPandemicDay,pandemicMap',                    'map',     'pandemic','map.object',             'map',                 'session', 'none',   '',         'pandemicSim'],
    doc: [
      { in: 'pandemic', at: 20, text: '{"type":"pandemicDraw","metric"?:"cases"|"deaths"} draws the run you just did. "params" accepts r0, baseFatality, latentDays, infectiousDays, naturalImmunityMonths, naturalImmunityLifelong, seasonality, startDayOfYear, initialCases, initialImmunity, mobility, scenario, interventions, vaccineAtStart, vaccineEfficacy, vaccineMonths, vaccineImmunityLifelong, vaccinateUnreached; a value out of range or a key that does not exist is REFUSED WITH THE RANGE (or the list of keys), so correct it once rather than guessing. Anything you do not set comes from the preset, and the reply states every such assumption with the field it came from — repeat those to the reader rather than presenting the numbers as unconditional. The same seed reproduces a run exactly.' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { metric: str() } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, loadCountryData = K.loadCountryData, countryStats = K.countryStats, HOST = K.HOST;
      { await window.IntMapLazy.need('pandemicSim'); const _P=window.IntMapPandemicAtlas; if(!_P) return R(false, warn(L('The pandemic engine could not be loaded.','パンデミックエンジンを読み込めませんでした。','Die Pandemie-Engine konnte nicht geladen werden.','Не удалось загрузить движок пандемии.','No se pudo cargar el motor de pandemia.'))); _P.bind({loadCountryData, countryStats:()=>countryStats, lang:()=>HOST.lang}); const _pd=await _P.draw(a); return _pd.ok ? R(true,_pd.html,{meta:{pandemic:_pd.meta,painted:true}}) : R(false, warn(_pd.html), {meta:{code:(_pd.meta&&_pd.meta.code)||'failed'}}); }   /* (#R754) the second door: drawing a run is a separate promise from computing one, because an observer that measures the map must be declared by something that ALWAYS moves it — #R743's finding, and the shape that made #R742 call 52 of 207 correct calls failures. */
    },
  },
  {
    row: ['map.highlight',              'highlight',      '',                                                            'map',     'paint',   'map.highlight',          'map',                 'session', 'none',   '',         ''],
    doc: [
      { in: 'country-statistics', at: 60, text: '{"type":"highlight","interpretation":str,"targets":[{"name":"<English country name>","iso3":"<ISO 3166-1 alpha-3>"},…],"color"?:str} = highlight a SET OF WHOLE COUNTRIES with their REAL national borders (THE MAP\'S YEAR APPLIES: while Chronos shows a past year each country is drawn as THAT year\'s polity from the historical border record, possessions included — «Taiwan (Japan)» joins Japan in 1900 — so for "X\'s territory in YEAR" set the year with timeTravel FIRST, then highlight; at the live date the modern polygon is drawn). THE MEANING IS YOURS TO RESOLVE — IntMap has NO concept dictionary and will NOT expand a phrase for you: YOU enumerate the member countries and give EACH its ISO3 code, and IntMap validates every code against real borders and draws them. This is how you highlight ANY cultural / linguistic / ethnic / religious / political / economic / historical / geographic country grouping — "ゲルマン諸国"/Germanic-speaking countries, "スラブ諸国"/Slavic countries, "英語圏"/the English-speaking world, "旧フランス植民地"/former French colonies, "主要産油国"/major oil producers, OPEC, the G7, ASEAN, landlocked countries, the Nordic countries, the former USSR, Western/Eastern/Southern/Northern Europe, "南米"/South America — NEVER pass the concept phrase itself for the code to resolve, ALWAYS the explicit ISO3 list. Put a SHORT plain-language description of the set (in the user\'s language) in "interpretation" — IntMap displays it so the user sees exactly which definition you used. For SEVERAL sets in ONE command, each in its own color: {"type":"highlight","groups":[{"label":str,"targets":[{"name","iso3"},…]},…]}. If a phrase has TWO+ genuinely different common readings that change the members a lot, emit an "ask" instead of guessing; otherwise take the most standard reading, execute, and let the stated interpretation show it. A GENUINE SINGLE FEATURE that is NOT a set of whole countries — an admin SUBDIVISION ("Stavropol Krai","奈良県","Bavaria" → its real sub-national boundary, NOT the whole country), a NAMED/INFORMAL/NATURAL region ("Blue Banana","肥沃な三日月帯","the Sahel","the Alps"), a RIVER ("信濃川","the Danube" → its real course as a line) or a RIVER BASIN ("アマゾン川の流域","the Nile basin" → main stem + tributaries + faint basin fill) — use {"type":"highlight","query":"<the place name exactly as the user said it, keep 流域/basin words>","color"?:str} and IntMap resolves its real geometry; use "query" ONLY for one concrete named feature, NEVER for a country set. "on":false clears; "color" WITHOUT targets recolors the CURRENT highlights. RANKED/FILTERED form (top/bottom N by a metric): {"type":"highlight","metric":KEY,"n":int,"order":"top"|"bottom","minPop"?:num,"maxPop"?:num,"color"?:str} — IntMap computes the members from the REAL data itself (never guess them) after excluding any below "minPop" / above "maxPop" (people; accept "5M"/"5000000"). e.g. "人口5M未満を除外したGDP per capita上位10ヵ国をハイライト" → {"type":"highlight","metric":"gdppc","n":10,"order":"top","minPop":5000000}; "highlight the 5 least populous countries" → {"type":"highlight","metric":"pop","n":5,"order":"bottom"}. metric KEYs are the same as rank/mapMetric below. "color" accepts ANY color: basic + compound names in 5 languages ("emerald green","紺","türkis","бирюзовый") + all CSS names + #rrggbb; ALWAYS pass it when the user names a color. ' },
    ],
    chips: 'highlight',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', properties: { targets: list(), groups: list(), iso3: list(), codes: list(), countries: loose(), country: str(), name: str(), place: str(), region: str(), query: str(), interpretation: str(), metric: str(), rankBy: str(), rankMetric: str(), by: str(), order: str(), rankOrder: str(), n: int(1, 40), top: int(1, 40), count: int(1, 40), minPop: loose(), maxPop: loose(), excludeBelowPop: loose(), filter: obj(), color: str(), on: bool() }, anyOf: [{ required: ['targets'] }, { required: ['groups'] }, { required: ['iso3'] }, { required: ['codes'] }, { required: ['countries'] }, { required: ['country'] }, { required: ['name'] }, { required: ['place'] }, { required: ['region'] }, { required: ['query'] }, { required: ['metric'] }, { required: ['rankBy'] }, { required: ['rankMetric'] }, { required: ['by'] }, { required: ['color'] }, { required: ['on'] }] }),
      /* (#R60) FINE-GRAINED first-class actions ("Atlasで、まだ使えない操作がある。特に細かい指示や操作"):
         highlight named countries, look up ONE country's actual figure, all-layers-off, SELECTIVE clear,
         fullscreen and real GPS locate — plus relative opacity ("delta"), compass-direction bearing and
         date-based timeTravel handled in their existing cases above. Every branch runs REAL engine code. */
    async run(a, dctx, K) { const clearHl = K.clearHl, clearPolyHl = K.clearPolyHl, clearLineHl = K.clearLineHl, R = K.R, note = K.note, L = K.L, _CLEARED = K._CLEARED, parseColor = K.parseColor, setHlColor = K.setHlColor, warn = K.warn, esc = K.esc, ensureData = K.ensureData, _hlReadGptGroups = K._hlReadGptGroups, _codesGeo = K._codesGeo, _validGeo = K._validGeo, _hlValidCodeSet = K._hlValidCodeSet, _hlAdd = K._hlAdd, _hlPaletteColor = K._hlPaletteColor, paintPolys = K.paintPolys, _verifyPolyPaint = K._verifyPolyPaint, _fitGroups = K._fitGroups, GE = K.GE, _hlLegendHtml = K._hlLegendHtml, _wctx = K._wctx, _hlReadNames = K._hlReadNames, metSpec = K.metSpec, _fillMetric = K._fillMetric, countryStats = K.countryStats, nm = K.nm, highlight = K.highlight, unionBox = K.unionBox, fitTo = K.fitTo, lx = K.lx, fmtVal = K.fmtVal, _expandRegionCompound = K._expandRegionCompound, basinIntent = K.basinIntent, riverIntent = K.riverIntent, resolveHlTarget = K.resolveHlTarget, _regionLabel = K._regionLabel, buildBasin = K.buildBasin, fetchRiverLine = K.fetchRiverLine, paintLines = K.paintLines;
      { const _hlMyGen=++K._hlGen;   /* (#R143) a newer highlight supersedes this one → stale async paints bail */
          if(a.on===false||/^(off|clear|none|解除)$/i.test(String(Array.isArray(a.countries)?'':(a.countries||a.country||'')))){ clearHl(); clearPolyHl(); clearLineHl(); return R(true, note('✓ '+L('Highlights cleared','ハイライトを消去しました','Hervorhebungen gelöscht','Выделение снято','Resaltado quitado')), _CLEARED('countries','polys','lines')); }
          /* (#R61) COLOR is honoured for real ("赤でハイライトしてといっても色が変わらない") — parse it, apply it to
             the live paint, and if we cannot parse it SAY SO instead of silently claiming success. */
          let cwarn=''; if(a.color!=null&&String(a.color).trim()!==''){ const pc=parseColor(a.color); if(pc) setHlColor(pc); else cwarn=warn(L('Unknown color','色を認識できません','Unbekannte Farbe','Неизвестный цвет','Color desconocido')+': '+esc(a.color)); }
          await ensureData();
          /* (#R157) GPT-DECIDED TARGETS — the model already interpreted the concept ("ゲルマン諸国" → the Germanic
             countries) and returned explicit ISO3 codes, optionally as several labelled groups. The code's job:
             VALIDATE the codes against the real border data, draw REAL national borders, verify the paint, and
             report honestly stating the interpretation used. This runs BEFORE the legacy name resolver, so a
             country-SET concept never touches regionGroup / resolveHlTarget. `on:false`/recolor were handled above. */
          if(!(a.on===false)){ const _gGroups=_hlReadGptGroups(a);
            if(_gGroups){ if(_hlMyGen!==K._hlGen) return R(true,'');
              const _single=(a.color!=null&&String(a.color).trim()!=='')?parseColor(a.color):null;
              const _FBL=L('Highlighted countries','ハイライトした国','Hervorgehobene Länder','Выделенные страны','Países resaltados');
              const G=[]; const gUnresolved=[]; const _resolvedIso=[]; const gSeen=new Set();
              _gGroups.forEach((grp,gi)=>{ (grp.unresolved||[]).forEach(u=>{ if(u) gUnresolved.push(u); });   /* (#R158) unresolved = OBSERVED, reported to Terra — never silently skipped */
                if(!grp.codes.length) return;
                const cg=_codesGeo(grp.codes);
                (cg.miss||[]).forEach(mc=>gUnresolved.push({name:'',iso3:String(mc),reason:'no_border_geometry',availableIdentifiers:[]}));   /* a valid-looking code with no border feature → observed, not dropped */
                if(!cg.geo||!cg.hit.length) return;
                const vg=_validGeo(cg.geo,{trusted:true,autoclose:true});
                if(!vg.ok){ (cg.hit||[]).forEach(hc=>gUnresolved.push({name:'',iso3:String(hc),reason:'invalid_geometry:'+(vg.reason||'?'),availableIdentifiers:[]})); return; }   /* real borders → trusted */
                const key='codes:'+cg.hit.slice().sort().join(','); if(gSeen.has(key)) return; gSeen.add(key);
                cg.hit.forEach(hc=>{ if(_resolvedIso.indexOf(hc)<0) _resolvedIso.push(hc); });
                const label=String(grp.label||'').trim();
                G.push({name:label||('set'+(gi+1)),displayName:label||_FBL,kind:'set',geo:cg.geo,codes:cg.hit.slice(),nCountries:cg.hit.length,basisShort:L('national borders','国境','Staatsgrenzen','госграницы','fronteras')}); });
              /* (#R158) the MECHANICAL execution result — the structured contract the repair loop feeds back to Terra so it,
                 not IntMap, decides how to recover (correct identifiers / re-search / ask / adopt partial). IntMap only OBSERVES. */
              const _unrSum=arr=>arr.slice(0,14).map(u=>(u.name||u.iso3||'?')+(u.availableIdentifiers&&u.availableIdentifiers.length?(' → '+u.availableIdentifiers.join('/')):'')).join(', ');
              const _mkExec=(painted,features,verified)=>({ status:(gUnresolved.length?'partial_or_failed':'ok'), action:{type:'highlight', interpretation:(a.interpretation||''), originalTargets:(a.groups||a.targets||a.iso3||a.codes||a.countries||null)},
                resolved:_resolvedIso.map(c=>({iso3:c})), unresolved:gUnresolved.slice(0,60),
                renderState:{painted:!!painted, features:(features!=null?features:0), verified:!!verified},
                capabilities:{ identifierScheme:'ISO 3166-1 alpha-3', validIdentifierCount:_hlValidCodeSet().size } });
              if(!G.length){   /* nothing valid to draw → return the STRUCTURED result (not a dead-end) so Terra corrects the identifiers */
                return R(false, warn(L('None of those identifiers could be matched to a boundary in the data IntMap holds — the places may well exist','いずれの識別子も、IntMapが保持する境界データに一致させられませんでした（場所自体は実在する可能性があります）','Keiner dieser Bezeichner ließ sich den vorhandenen Grenzdaten zuordnen — die Orte können durchaus existieren','Ни один идентификатор запроса не сопоставлен с реальной границей','Ninguno de los identificadores de esa solicitud se resolvió a una frontera real'))+(gUnresolved.length?note(esc(_unrSum(gUnresolved))):'')+cwarn, {meta:{partial:true}, exec:_mkExec(false,0,false)}); }
              const _keepA=_hlAdd(a); const _prevA=_keepA?K._hlPolys.slice():[]; if(!_keepA){ clearHl(); clearLineHl(); K._hlLines=[]; } clearPolyHl();   /* (#R489) additive within one turn — see the note beside `_hlAdd` */
              K._hlPolys=_prevA.concat(G.map((g,i)=>{ g.color=_single||_hlPaletteColor(_prevA.length+i); return {name:g.name,geo:g.geo,color:g.color,comp:1,op:0.42}; }));   /* the palette continues from what is already drawn, so the second action's groups are not the first action's colours */
              let paintedP=paintPolys();
              for(let i5=0;i5<8&&!paintedP;i5++){ await new Promise(r5=>setTimeout(r5,700)); if(_hlMyGen!==K._hlGen) return R(true,''); paintedP=paintPolys(); }
              if(!paintedP) return R(false, warn(L('Could not paint the highlight (map still loading) — try again','ハイライトを描画できませんでした（地図読込中）。もう一度お試しください','Hervorhebung konnte nicht gezeichnet werden (Karte lädt) — bitte erneut','Не удалось нарисовать выделение (карта загружается) — повторите','No se pudo dibujar el resaltado (mapa cargando) — reintenta'))+cwarn, {exec:_mkExec(false,0,false)});
              const ver=_verifyPolyPaint(K._hlPolys.length);   /* (#R489) …which is G plus whatever this same turn already drew */
              if(!_fitGroups(K._hlPolys)){ try{ if(GE().camera.getZoom()>2.6) GE().camera.flyTo({center:[GE().camera.getCenter().lng,30],zoom:1.6,duration:1000}); }catch(_){} }
              const totalC=G.reduce((s2,g)=>s2+g.nCountries,0);
              let hh=note('✦ '+G.map(g=>esc(g.displayName)).join(', '))+_hlLegendHtml(G);
              /* (#R157) STATE THE DEFINITION USED (the work order's "採用した定義を結果に明示"). */
              hh+=note(L('Interpreted from your request and drawn from real national borders — '+totalC+' countries.','ご依頼を解釈し、実際の国境データから描画しました — '+totalC+'か国。','Aus Ihrer Anfrage interpretiert und aus realen Staatsgrenzen gezeichnet — '+totalC+' Länder.','Интерпретировано по вашему запросу и построено по реальным госграницам — стран: '+totalC+'.','Interpretado a partir de tu solicitud y dibujado con fronteras reales — '+totalC+' países.'));
              if(gUnresolved.length) hh+=warn(L('Some targets could not be matched to border data — checking with the model','一部の対象を国境データに一致させられませんでした — モデルに確認しています','Einige Ziele ließen sich den Grenzdaten nicht zuordnen — Rückfrage beim Modell','Некоторые цели не сопоставлены с данными границ — уточняем у модели','Algunos objetivos no coincidieron con los datos de fronteras — consultando al modelo')+': '+esc(_unrSum(gUnresolved)));
              if(ver&&!ver.ok) hh+=warn(L('Could not verify the drawn shapes on the map','描画結果を地図上で確認できませんでした','Gezeichnete Formen nicht verifizierbar','Не удалось проверить фигуры на карте','No se pudieron verificar las formas'));
              try{ _wctx.highlight={ name:G.map(g=>g.displayName||g.name).join(', ').slice(0,160), n:totalC, basis:null }; }catch(_){}
              const _partial=!!(gUnresolved.length||(ver&&!ver.ok));
              /* ⚠⚠⚠ (#R742) SAY WHAT WAS PAINTED, so the verdict can hold the map against it instead of
                 against a count. js/atlas-capabilities.js `PAINT_GOAL` reads this and asks whether those
                 names are in the painter's own reading (js/atlas-era-highlight.js `paintState().ids`),
                 using the SAME key `polys` both sides already use. Without it a highlight that redraws the
                 same number of shapes is 「not_rendered」 however perfectly it drew them — measured on
                 production 2026-09-15: three correct highlights, three verdicts of not_rendered, ten steps
                 and 26.2 seconds for 「Which countries border Kazakhstan?」. Declaring is not claiming: the
                 verdict verifies this against the map and refuses it when the shapes are not there. */
              const _painted={polys:K._hlPolys.map(p=>p&&p.name).filter(Boolean)};
              return R(true, hh+cwarn, {meta:Object.assign({painted:_painted}, _partial?{partial:true}:null), exec:_mkExec(true,(ver&&ver.n)||totalC,!!(ver&&ver.ok))});
            } }
          /* (#R150 · geo-target unification) SINGLE ambiguity decision shared by BOTH the multi-region and the
             single-colour paths below. ROOT CAUSE the user reported: candidate-confirmation ("did you mean the
             country or the US state?") was appended as a mere WARNING *alongside* the painted success + not-found
             failures — so confirmation, partial execution, success and failure all showed at once. The spec:
             "意味が排他的なら確認質問を出して実行を停止" — an exclusive/ambiguous name must produce ONE coherent
             confirmation that STOPS execution (paints nothing), never mixed with a success/partial. This helper
             renders that single confirmation; both paths gate on it BEFORE painting. No per-name hardcoding — it is
             driven entirely by resolveHlTarget's ambiguous verdict, so it applies uniformly to admin regions,
             historical regions, natural regions and same-name places. */
          const _hlAmbigConfirm=(ambigArr, clearNames)=>{
            const body=(ambigArr||[]).map(t=>'<b>'+esc(t.name)+'</b>:<br>• '+((t.candidates||[]).slice(0,4).map(c=>esc(String((c&&c.name)||c||'')+((c&&c.country)?(' — '+c.country):'')+((c&&c.note)?(' ('+c.note+')'):''))).join('<br>• ')||esc(String(t.name)))).join('<br>');
            const head=(ambigArr&&ambigArr.length>1)
              ? L('These names are ambiguous — which did you mean for each?','これらの名称には複数の候補があります。それぞれどれを指しますか？','Diese Namen sind mehrdeutig — welchen jeweils?','Названия неоднозначны — какой в каждом случае?','Estos nombres son ambiguos — ¿cuál en cada caso?')
              : L('That name is ambiguous — which did you mean?','その名称には複数の候補があります。どれを指しますか？','Der Name ist mehrdeutig — welchen meinen Sie?','Название неоднозначно — какой вариант?','Ese nombre es ambiguo — ¿cuál quiere decir?');
            let extra=''; const cn=(clearNames||[]).filter(Boolean);
            if(cn.length) extra='<div style="font-size:11px;color:var(--text-muted);margin-top:5px;">'+L(
              'Nothing was drawn on a guess — clarify the above and I\'ll highlight everything (incl. '+esc(cn.slice(0,4).join(', '))+') together.',
              '推測では描画していません。上記を確定いただければ '+esc(cn.slice(0,4).join(', '))+' などまとめてハイライトします。',
              'Nichts wurde geraten — nach der Klärung hebe ich alles (auch '+esc(cn.slice(0,4).join(', '))+') zusammen hervor.',
              'Ничего не нарисовано наугад — уточните, и я выделю всё (включая '+esc(cn.slice(0,4).join(', '))+') сразу.',
              'No se dibujó nada por conjetura — aclara y resaltaré todo (incl. '+esc(cn.slice(0,4).join(', '))+') junto.')+'</div>';
            return warn(head)+note(body)+extra; };
          /* (#R104) RANK + FILTER → highlight ("人口5M未満は除外したGDP per capita上位10ヵ国をハイライトして"): when a
             ranking metric is given instead of explicit country names, compute the ranked, optionally
             population-filtered top/bottom-N DETERMINISTICALLY from the real country data and highlight exactly
             those (no AI guessing which countries). */
          const _rmRaw=a.metric||a.rankBy||a.rankMetric||a.by;
          const _hlExplicit=_hlReadNames(a).length;   /* (#R157) a.query = a concrete single feature from the model (admin region / river / basin) · (#R747) same one reading as `raw` below — a metric must not win over members the caller actually named */
          if(_rmRaw&&!_hlExplicit){
            const _sp=metSpec(_rmRaw);
            if(!_sp||!_sp.m) return R(false, warn(L('Unknown ranking metric','ランキングの指標を認識できません','Unbekannte Kennzahl','Неизвестный показатель','Métrica desconocida')+': '+esc(String(_rmRaw)))+cwarn);
            try{ await _fillMetric(_sp.key); }catch(_){}   /* lazy WB fields (tfr/lifeExp/internet) → filled before ranking */
            const _n=Math.max(1,Math.min(40,parseInt(a.n||a.top||a.count||10,10)||10));
            const _bottom=/^(bottom|low|lowest|least|worst)$/i.test(String(a.order||''))||/下位|最下位|ワースト|少ない|低い/.test(String(a.order||'')+String(a.rankOrder||''));
            const _pn=v=>{ if(v==null) return null; v=String(v).replace(/[, _]/g,'').toLowerCase(); const mm=v.match(/^([\d.]+)\s*(m|million|mn|百万|k|thousand|千|b|billion|bn|億)?$/); if(!mm) return (v!==''&&isFinite(+v))?+v:null; let x=+mm[1]; const u=mm[2]||''; if(/^(m|million|mn|百万)$/.test(u))x*=1e6; else if(/^(k|thousand|千)$/.test(u))x*=1e3; else if(/^(b|billion|bn)$/.test(u))x*=1e9; else if(u==='億')x*=1e8; return x; };
            const _minPop=_pn(a.minPop!=null?a.minPop:(a.excludeBelowPop!=null?a.excludeBelowPop:(a.filter&&a.filter.minPop!=null?a.filter.minPop:null)));
            const _maxPop=_pn(a.maxPop!=null?a.maxPop:(a.filter&&a.filter.maxPop!=null?a.filter.maxPop:null));
            const _rowsF=[];
            for(const cd in countryStats){ const s=countryStats[cd]; if(!s||s.sov===false||!s.nameEn) continue;
              const v=_sp.m.get(s); if(v==null||isNaN(v)) continue;
              if(_minPop!=null&&!(s.pop>=_minPop)) continue;
              if(_maxPop!=null&&!(s.pop<=_maxPop)) continue;
              _rowsF.push({code:cd,name:nm(s),val:+v}); }
            _rowsF.sort((x,y)=>y.val-x.val);
            const _picked=_bottom?_rowsF.slice(-_n).reverse():_rowsF.slice(0,_n);
            if(!_picked.length) return R(false, warn(L('No countries match that filter','条件に合う国がありません','Keine Länder passen zum Filter','Нет стран по фильтру','Ningún país cumple el filtro'))+cwarn);
            const _codes=_picked.map(p=>p.code);
            clearPolyHl(); K._hlPolys=[]; clearLineHl(); K._hlLines=[];
            let _painted=highlight(_codes);
            for(let i3=0;i3<8&&!_painted;i3++){ await new Promise(r3=>setTimeout(r3,700)); _painted=highlight(_codes); }
            if(!_painted) return R(false, warn(L('Could not paint the highlight (map still loading) — try again','ハイライトを描画できませんでした（地図読込中）。もう一度お試しください','Hervorhebung fehlgeschlagen (Karte lädt) — erneut','Не удалось нарисовать (карта загружается) — повторите','No se pudo dibujar (mapa cargando) — reintenta'))+cwarn);
            const _ub=unionBox(_codes,[]); if(_ub){ try{ GE().camera.fitBounds(_ub,{padding:60,maxZoom:7.5,duration:900}); }catch(_){} } else { try{ fitTo(_codes); }catch(_){} }
            const _ord=_bottom?L('Lowest','下位','Niedrigste','Минимум','Menor'):L('Top','上位','Top','Топ','Top');
            let _hh=note('✦ '+_ord+' '+_picked.length+' · '+esc(lx(_sp.m.label))+(_minPop!=null?(' · '+L('excl. pop <','人口<','Bev. <','нас. <','pob. <')+' '+fmtVal('pop',_minPop)):'')+(_maxPop!=null?(' · '+L('excl. pop >','人口>','Bev. >','нас. >','pob. >')+' '+fmtVal('pop',_maxPop)):''));
            _hh+=note(_picked.map((p,i)=>(i+1)+'. '+esc(p.name)+' <span style="color:var(--text-muted);">'+fmtVal(_sp.key,p.val)+'</span>').join('<br>'));
            return R(true, _hh+cwarn);
          }
          const raw=_hlReadNames(a);   /* (#R157) a.query = model-supplied concrete single feature (falls to the resolveHlTarget ladder) · ⚠ (#R747) THIS LIST USED TO BE WRITTEN OUT HERE AND IT OMITTED `targets`, so the very shape js/atlas-catalog-text.js documents first died between the two readers. js/atlas-country-ids.js REQUEST_FIELDS is now the only place that says which fields carry the request, and both readers take it. */
          const pc2=(a.color!=null&&String(a.color).trim()!=='')?parseColor(a.color):null;
          if(!raw.length){ if(a.color&&!cwarn&&(K._hl.size||K._hlPolys.length)){ if(pc2&&K._hlPolys.length){ K._hlPolys.forEach(p=>{ p.color=pc2; }); paintPolys(); } return R(true, note(icon('palette')+' '+L('Recolored the current highlights','ハイライトの色を変更しました','Hervorhebungen umgefärbt','Цвет выделения изменён','Resaltado recoloreado'))); }
            if(a.color&&!cwarn) return R(false, warn(L('Nothing is highlighted yet — name the countries or regions','ハイライト中の対象がありません。国名や地域名を指定してください','Noch nichts hervorgehoben — Länder oder Regionen nennen','Ничего не выделено — укажите страны или регионы','Nada resaltado aún — indica países o regiones')));
            return R(false, warn(L('Which countries or regions?','どの国・地域をハイライトしますか？','Welche Länder oder Regionen?','Какие страны или регионы?','¿Qué países o regiones?'))+cwarn); }
          /* (#R143) MULTI-REGION grouping: expand compound directional forms ("東西南北欧" → the four M49 sub-regions)
             and, when the command names 2+ distinct targets, NO single explicit colour is given, none is a river/basin,
             AND at least one target is a country-SET or a REGION, draw each target as its OWN colour group with a
             legend (凡例). Country sets resolve to REAL national borders (UN M49 where applicable); every shape is
             VALIDATED before drawing; the reply is composed from what actually painted, with successes and failures
             kept separate. Anything else falls through to the single-colour path below. */
          const rawX=_expandRegionCompound(raw);
          if(rawX.length>=2 && !pc2 && !rawX.some(n=>basinIntent(n)||riverIntent(n))){
            const G=[], gMiss=[], gAmbig=[], gRej=[]; const gSeen=new Set();
            for(const nm3 of rawX){ let t3=null; try{ t3=await resolveHlTarget(nm3); }catch(_){}
              if(t3&&t3.ambiguous&&Array.isArray(t3.candidates)&&t3.candidates.length){ gAmbig.push({name:t3.name||nm3,candidates:t3.candidates}); continue; }
              let kind='',codes=null,gj=null; const nm4=(t3&&((t3.poly&&t3.poly.name)||t3.name))||nm3; let composed=false,osm=false,derived=false,approx=false,verified=false,basis='';
              if(t3&&t3.code){ codes=[t3.code]; kind='country'; }
              else if(t3&&t3.codes){ codes=t3.codes.slice(); kind='set'; basis=t3.basis||''; }
              else if(t3&&t3.poly&&t3.poly.geo){ gj=t3.poly.geo; kind='region'; composed=!!t3.composed; osm=(t3.rrMethod==='osm_polygon'); derived=(t3.rrMethod==='derived_anchors'); approx=!!(t3.soft||t3.approx); verified=!!t3.verified; }
              else { gMiss.push(nm3); continue; }
              let nC=0; if(codes){ const cg=_codesGeo(codes); gj=cg.geo; nC=cg.hit.length; if(!gj){ gMiss.push(nm4); continue; } }
              const trusted=(kind==='country'||kind==='set'||osm||composed);
              const vg=_validGeo(gj,{trusted,autoclose:true});
              if(!vg.ok){ gRej.push({name:nm4,reason:vg.reason}); continue; }
              const key=(kind==='region')?('poly:'+nm4):('codes:'+codes.join(',')); if(gSeen.has(key)) continue; gSeen.add(key);
              const basisShort = composed?L('admin borders','行政界','Verwalt.-grenzen','адм. границы','límites adm.')
                : osm?'OpenStreetMap' : derived?('⬡ '+L('web-derived','Web由来','Web-abgeleitet','из веба','de la web'))
                : approx?('⬡ '+L('approx.','近似','ca.','прибл.','aprox.'))
                : (kind==='country'||kind==='set')?L('national borders','国境','Staatsgrenzen','госграницы','fronteras'):'';
              G.push({name:nm4,displayName:_regionLabel(nm4),kind,geo:gj,codes,nCountries:nC,composed,osm,derived,approx,verified,basis,basisShort}); }
            /* (#R150) AMBIGUITY GATE — an exclusive/ambiguous target STOPS the whole request: ask ONE confirmation,
               paint nothing (no partial + confirmation co-display). Gate before the paint so it applies whether or
               not the multi-region branch would have drawn. */
            if(gAmbig.length){ if(_hlMyGen!==K._hlGen) return R(true,''); return R(false, _hlAmbigConfirm(gAmbig, G.map(g=>g.displayName||g.name).concat(gMiss)), {meta:{partial:true}}); }
            if(G.length>=2 && G.some(g=>g.kind==='set'||g.kind==='region')){
              if(_hlMyGen!==K._hlGen) return R(true,'');   /* superseded by a newer highlight → don't overwrite it */
              const _keepB=_hlAdd(a); const _prevB=_keepB?K._hlPolys.slice():[]; if(!_keepB){ clearHl(); clearLineHl(); K._hlLines=[]; } clearPolyHl();   /* (#R489) additive within one turn — see the note beside `_hlAdd` */
              K._hlPolys=_prevB.concat(G.map((g,i)=>{ g.color=_hlPaletteColor(_prevB.length+i); return {name:g.name,geo:g.geo,color:g.color,comp:(g.kind!=='region'||g.composed)?1:0,op:0.42}; }));
              let paintedP=paintPolys();
              for(let i4=0;i4<8&&!paintedP;i4++){ await new Promise(r4=>setTimeout(r4,700)); if(_hlMyGen!==K._hlGen) return R(true,''); paintedP=paintPolys(); }
              if(!paintedP) return R(false, warn(L('Could not paint the highlight (map still loading) — try again','ハイライトを描画できませんでした（地図読込中）。もう一度お試しください','Hervorhebung konnte nicht gezeichnet werden (Karte lädt) — bitte erneut','Не удалось нарисовать выделение (карта загружается) — повторите','No se pudo dibujar el resaltado (mapa cargando) — reintenta'))+cwarn);
              const ver=_verifyPolyPaint(K._hlPolys.length);   /* (#R489) …which is G plus whatever this same turn already drew */
              if(!_fitGroups(K._hlPolys)){ try{ if(GE().camera.getZoom()>2.6) GE().camera.flyTo({center:[GE().camera.getCenter().lng,30],zoom:1.6,duration:1000}); }catch(_){} }
              let hh=note('✦ '+G.map(g=>esc(g.displayName||g.name)).join(', '))+_hlLegendHtml(G);
              if(G.some(g=>g.kind==='set'||g.kind==='country')) hh+=note(L('Country sets drawn from real national borders (UN M49 standard where applicable)','国集合は実際の国境データから描画（該当時はUN M49標準）','Ländergruppen aus realen Staatsgrenzen (ggf. UN-M49-Standard)','Наборы стран построены по реальным госграницам (при наличии — стандарт UN M49)','Conjuntos de países con fronteras reales (estándar UN M49 cuando aplica)'));
              if(G.some(g=>g.composed)) hh+=note(L('Some regions built from member administrative boundaries','一部の地域は構成行政区画の境界から構築','Einige Regionen aus Verwaltungsgrenzen der Teilgebiete','Некоторые регионы построены из адм. границ','Algunas regiones a partir de límites administrativos'));
              if(G.some(g=>g.osm)) hh+=note(L('Some regions from real OpenStreetMap boundaries','一部の地域は実際のOpenStreetMap境界','Einige Regionen aus realen OpenStreetMap-Grenzen','Некоторые регионы — реальные границы OSM','Algunas regiones de límites reales de OpenStreetMap'));
              if(G.some(g=>g.derived||g.approx)) hh+=note(L('⬡ = approximate extent (no official boundary exists)','⬡ = 近似範囲（公式境界が存在しない）','⬡ = ungefähre Ausdehnung (keine offizielle Grenze)','⬡ = приблизительный контур (нет офиц. границы)','⬡ = extensión aproximada (sin límite oficial)'));
              /* (#R150) gAmbig is now impossible here — the ambiguity gate above returned before painting. Only
                 honest "drawn, but these couldn't be located/were invalid" disclosure remains (no pending question). */
              if(gRej.length) hh+=warn(L('Rejected — invalid/degenerate shape (not drawn)','不正・退化した形状のため未描画','Abgelehnt — ungültige/entartete Form','Отклонено — некорректная форма','Rechazado — forma inválida')+': '+esc(gRej.map(r=>r.name).join(', ')));
              if(gMiss.length) hh+=warn(L('Not found','見つからず','Nicht gefunden','Не найдено','No encontrado')+': '+esc(gMiss.join(', ')));
              if(ver&&!ver.ok) hh+=warn(L('Could not verify the drawn shapes on the map','描画結果を地図上で確認できませんでした','Gezeichnete Formen nicht verifizierbar','Не удалось проверить фигуры на карте','No se pudieron verificar las formas'));
              try{ _wctx.highlight={ name:G.map(g=>g.displayName||g.name).join(', ').slice(0,160), n:G.length, basis:(G.map(g=>g.basis).filter(Boolean).join(' / ')||null) }; }catch(_){}
              const partial=!!(gRej.length||gMiss.length||(ver&&!ver.ok));
              return R(true, hh+cwarn, partial?{meta:{partial:true}}:undefined);
            }
            /* not multi-region-eligible (1 shape drew, or a plain country list) → single-colour path below */
          }
          /* (#R62) countries AND subdivisions AND fuzzy regions, freely mixed.
             (#R64) + country GROUPS (旧ソ連諸国, EU…) and real-boundary COMPOSITIONS (東海地方, 肥沃な三日月帯…).
             (#R65) + RIVERS as their real course (line) and BASINS (tributaries + faint basin fill) — judged
             BEFORE any admin-unit logic. */
          const found=[],polys=[],lines=[],lineNames=[],miss=[],ambig=[],rejected=[],seen=new Set(),grpNames=[],grpBases=[]; let anyApprox=false,anyComposed=false,anyPartial=false,basinInfo=null,anyVerified=false,anyOsm=false,anyDerived=false,anyAdm1=false;
          for(const nm2 of rawX){
            const bi=basinIntent(nm2);
            if(bi){ let B=null; try{ B=await buildBasin(bi.base); }catch(_){}
              if(!B||(!B.river&&!B.basin)){ miss.push(nm2); continue; }
              if(B.basin){ const bp={name:nm2,geo:B.basin.geo,op:0.14,comp:true}; if(pc2) bp.color=pc2; polys.push(bp); if(B.approx) anyApprox=true; }
              if(B.trib&&B.trib.geo) lines.push({geo:B.trib.geo,w:1.1,op:0.75,color:pc2||null});
              if(B.river) lines.push({geo:B.river.geo,w:3.2,color:pc2||null,name:B.river.name});
              if(!B.basin&&B.river) lineNames.push(B.river.name);
              basinInfo={trib:(B.trib&&B.trib.n)||0, trunc:!!(B.trib&&B.trib.truncated), noBasin:!B.basin, noTrib:!B.trib, src:B.src||''};
              continue; }
            if(riverIntent(nm2)){ let rl=null; try{ rl=await fetchRiverLine(nm2); }catch(_){}
              if(rl){ lines.push({geo:rl.geo,w:3.2,color:pc2||null,name:rl.name}); lineNames.push(rl.name); continue; } }
            let t2=null; try{ t2=await resolveHlTarget(nm2); }catch(_){}
            if(t2&&t2.verified) anyVerified=true;   /* (#R130) at least one target's location was web-search-verified */
            if(t2&&t2.ambiguous&&Array.isArray(t2.candidates)&&t2.candidates.length){ ambig.push({name:t2.name||nm2, candidates:t2.candidates}); }   /* (#R132) ambiguous → ask instead of guessing */
            else if(t2&&t2.code){ if(!seen.has(t2.code)){ seen.add(t2.code); found.push(t2); } }
            else if(t2&&t2.codes){ let nAdd=0; t2.codes.forEach(cd=>{ if(!seen.has(cd)){ seen.add(cd); found.push({code:cd,_grp:1}); nAdd++; } }); grpNames.push(_regionLabel(t2.name||nm2)+' ('+nAdd+')'); if(t2.basis) grpBases.push(t2.basis); }
            else if(t2&&t2.poly&&t2.poly.geo){
              /* (#R143) VALIDATE before drawing — reject unclosed rings, degenerate "giant triangles", abnormal long
                 edges, self-intersections, whole-world blobs, tiny slivers. Real OSM/admin/composed borders are trusted
                 (skip the crude-approximation heuristics); AI/derived/soft outlines get the full battery. A rejected
                 shape is reported honestly (never drawn as a "close enough" blob). */
              const _tr=!(t2.soft||t2.approx||t2.rrMethod==='derived_anchors'); const _vg=_validGeo(t2.poly.geo,{trusted:_tr,autoclose:true});
              if(!_vg.ok){ rejected.push({name:t2.poly.name||nm2,reason:_vg.reason}); }
              else { if(pc2) t2.poly.color=pc2; if(t2.composed) t2.poly.comp=true; polys.push(t2.poly); if(t2.composed) anyComposed=true; if(t2.partial) anyPartial=true;
                /* (#R132) precise BASIS per method — real OSM boundary vs web-anchor-derived vs curated gazetteer/AI outline */
                if(t2.rrMethod==='admin1_index') anyAdm1=true; else if(t2.rrMethod==='osm_polygon') anyOsm=true; else if(t2.rrMethod==='derived_anchors') anyDerived=true; else if(t2.soft||t2.approx) anyApprox=true; } }
            else miss.push(nm2); }
          /* (#R150) AMBIGUITY GATE (shared decision with the multi-region path via _hlAmbigConfirm): ANY ambiguous
             target STOPS the request with ONE confirmation and paints nothing — never "highlighted A" + "did you
             mean B or C?" + "not found: D" at once. What WOULD be drawn is listed so the user sees nothing was guessed. */
          if(ambig.length){ if(_hlMyGen!==K._hlGen) return R(true,''); const clear=found.filter(c=>!c._grp).map(c=>c.name).concat(grpNames).concat(polys.map(p=>p.name)).concat(lineNames).concat(miss); return R(false, _hlAmbigConfirm(ambig, clear)+cwarn, {meta:{partial:true}}); }
          if(!found.length&&!polys.length&&!lines.length){
            if(rejected.length) return R(false, warn(L('The shape resolved for that region was invalid (degenerate/self-intersecting) and was not drawn','その地域の形状が不正（退化・自己交差）なため描画しませんでした','Die aufgelöste Form dieser Region war ungültig (entartet/selbstschneidend)','Форма региона оказалась недействительной (вырожденная/самопересекающаяся)','La forma resuelta para esa región no era válida (degenerada/autointersecante)')+': '+esc(rejected.map(r=>r.name).join(', ')))+cwarn);
            return R(false, warn(L('No boundary could be resolved for','境界データを解決できませんでした','Keine Grenze auflösbar für','Не удалось разрешить границу для','No se pudo resolver la frontera de')+': '+esc(raw.join(', ')))+cwarn); }   /* ⚠ (#R489) IT SAYS WHAT FAILED. 「見つかりません」 reads as 「その場所は無い」, and the reported case was the opposite: Belgorod Oblast exists, has a real administrative outline, and the lookup returned the CITY. A message that blames the world for a lookup's failure sends the next turn off to re-verify a place that was never in doubt. */
          /* (#R61) VERIFY the paint really happened (style may still be loading) — bounded retry, then honesty. */
          if(_hlMyGen!==K._hlGen) return R(true,'');   /* (#R143) superseded by a newer highlight */
          const _keepC=_hlAdd(a); const _prevP=_keepC?K._hlPolys.slice():[], _prevL=_keepC?K._hlLines.slice():[], _prevC=_keepC?Array.from(K._hl):[]; clearPolyHl(); clearLineHl(); K._hlPolys=_prevP.concat(polys); K._hlLines=_prevL.concat(lines);   /* (#R489) additive within one turn — see the note beside `_hlAdd` */
          const codes2=found.map(c=>c.code); const _allC=_prevC.concat(codes2.filter(c=>_prevC.indexOf(c)<0));   /* `highlight()` clears the feature-state set before it paints, so the countries this turn already lit have to be asked for again */
          let painted=(_allC.length?highlight(_allC):(_keepC?true:(clearHl(),true))); let paintedP=paintPolys(); let paintedL=paintLines();
          for(let i2=0;i2<8&&((codes2.length&&!painted)||(polys.length&&!paintedP)||(lines.length&&!paintedL));i2++){ await new Promise(r2=>setTimeout(r2,700)); if(_hlMyGen!==K._hlGen) return R(true,''); if(codes2.length&&!painted) painted=highlight(_allC); if(polys.length&&!paintedP) paintedP=paintPolys(); if(lines.length&&!paintedL) paintedL=paintLines(); }
          const ub=unionBox(_allC,K._hlPolys.concat(K._hlLines)); if(ub){ try{ GE().camera.fitBounds(ub,{padding:60,maxZoom:7.5,duration:900}); }catch(_){} } else if(_allC.length){ const fitOk=fitTo(_allC);   /* (#R489) frame EVERYTHING this turn drew — framing only the last action's target is how fourteen oblasts ended as a close-up of one */
            /* (#R64) antimeridian-spanning sets (旧ソ連諸国: Chukotka wraps the date line) defeat a bbox fit —
               zoom out to the planet so the highlight is actually visible instead of silently not moving. */
            if(!fitOk){ try{ if(GE().camera.getZoom()>2.6) GE().camera.flyTo({center:[GE().camera.getCenter().lng,30],zoom:1.6,duration:1000}); }catch(_){} } }
          if((codes2.length&&!painted)||(polys.length&&!paintedP)||(lines.length&&!paintedL)) return R(false, warn(L('Could not paint the highlight (map still loading) — try again','ハイライトを描画できませんでした（地図読込中）。もう一度お試しください','Hervorhebung konnte nicht gezeichnet werden (Karte lädt) — bitte erneut','Не удалось нарисовать выделение (карта загружается) — повторите','No se pudo dibujar el resaltado (mapa cargando) — reintenta'))+cwarn);
          const shown=found.filter(c=>!c._grp).map(c=>esc(c.name)).concat(grpNames.map(esc)).concat(polys.map(p=>esc(p.name))).concat(lineNames.map(esc));
          let hh=note((found.length?'✦ ':'')+shown.join(', '));
          /* (#R118) HISTORICAL-membership basis stated up front + remembered — kills the "それは何年のもの？"
             death-spiral: the reply itself says what year-basis the highlight uses, and follow-up questions can
             read it from the working context instead of guessing (or citing the time-travel date). */
          if(grpBases.length){ hh+=note('◷ '+grpBases.map(esc).join('<br>◷ ')); }
          try{ _wctx.highlight={ name:(grpNames.concat(polys.map(p=>p.name),found.filter(c=>!c._grp).map(c=>c.name)).join(', ')).slice(0,160), n:codes2.length+polys.length+lines.length, basis:(grpBases.join(' / ')||null) }; }catch(_){}
          if(basinInfo){
            if(basinInfo.trib) hh+=note(L(basinInfo.trib+' tributary/branch waterways drawn (every river/canal tagged in OpenStreetMap inside the basin)','支流・分流 '+basinInfo.trib+' 本を描画（流域内にOSM登録された河川・運河すべて）','' +basinInfo.trib+' Nebenflüsse gezeichnet (alle in OSM erfassten Wasserläufe im Einzugsgebiet)','Нарисовано притоков: '+basinInfo.trib+' (все реки/каналы OSM в бассейне)','Dibujados '+basinInfo.trib+' afluentes (todos los ríos/canales de OSM en la cuenca)'));
            if(basinInfo.trunc) hh+=note(L('Note: a small share of the tiniest streams was omitted at the display cap (all major tributaries are drawn)','注: 表示上限により最小級の細流の一部のみ省略（主要な支流はすべて描画済み）','Hinweis: nur ein kleiner Teil der kleinsten Bäche wurde am Limit ausgelassen','Примечание: опущена лишь малая часть мельчайших ручьёв','Nota: solo se omitió una pequeña parte de los arroyos más pequeños'));
            if(basinInfo.src&&basinInfo.src!=='AI outline') hh+=note(L('Basin boundary: real hydrological data — ','流域界: 実測の水文データ — ','Beckengrenze: reale Hydrologiedaten — ','Граница бассейна: реальные гидрологические данные — ','Límite de cuenca: datos hidrológicos reales — ')+esc(basinInfo.src));
            if(basinInfo.noBasin) hh+=warn(L('Basin outline unavailable — main stem only','流域の輪郭を取得できませんでした（本流のみ描画）','Beckenumriss nicht verfügbar — nur Hauptstrom','Контур бассейна недоступен — только главное русло','Contorno de la cuenca no disponible — solo el cauce principal'));
            else if(basinInfo.noTrib) hh+=note(L('No tributaries returned by OpenStreetMap here','OpenStreetMapから支流を取得できませんでした','Keine Nebenflüsse von OSM','OSM не вернул притоков','OSM no devolvió afluentes'));
          }
          if(anyComposed) hh+=note(L('Drawn from the real administrative boundaries of the region\'s member units','構成する行政区画の実際の境界データから描画','Aus den realen Verwaltungsgrenzen der Teilgebiete gezeichnet','Построено из реальных административных границ','Dibujado a partir de los límites administrativos reales'));
          /* (#R132) explicit BASIS lines for the general resolver */
          if(anyAdm1) hh+=note(L('Drawn from real first-level administrative boundaries (the bundled Natural Earth index)','実際の第1レベル行政境界（同梱のNatural Earth索引）から描画','Aus realen Verwaltungsgrenzen der ersten Ebene gezeichnet (mitgelieferter Natural-Earth-Index)','Построено по реальным границам регионов первого уровня (встроенный индекс Natural Earth)','Dibujado con fronteras administrativas reales de primer nivel (índice Natural Earth incluido)'));   /* (#R489) js/atlas-admin1.js */ if(anyOsm) hh+=note(L('Drawn from real OpenStreetMap boundary data','実際のOpenStreetMapの境界データから描画','Aus realen OpenStreetMap-Grenzdaten gezeichnet','Построено по реальным границам OpenStreetMap','Dibujado a partir de límites reales de OpenStreetMap'));
          if(anyDerived) hh+=note(L('⬡ = approximate extent derived from web-verified boundary anchors (no official boundary exists for this region)','⬡ = 近似範囲（公式境界が存在しない地域を、Web検索で照合した境界アンカーから構築）','⬡ = ungefähre Ausdehnung aus web-verifizierten Grenzankern (keine offizielle Grenze)','⬡ = приблизительный контур из проверенных веб-поиском опорных точек (официальной границы нет)','⬡ = extensión aproximada a partir de anclas verificadas por búsqueda web (no hay límite oficial)'));
          if(anyPartial) hh+=warn(L('Some member boundaries could not be fetched — the shape may be missing pieces','一部の構成区画の境界を取得できませんでした（欠けがある可能性）','Einige Teilgrenzen fehlen','Часть границ получить не удалось','Faltan algunos límites'));
          if(anyApprox) hh+=note(L('⬡ = approximate extent (no official boundary exists — AI-traced outline)','⬡ = 近似輪郭（公式境界が存在しない地域のAIトレース）','⬡ = ungefähre Ausdehnung (KI-Umriss)','⬡ = приблизительный контур (ИИ)','⬡ = contorno aproximado (IA)'));
          if(anyVerified) hh+=note('✓ '+L('location web-verified','位置をWeb検索で照合','Standort per Websuche geprüft','местоположение проверено веб-поиском','ubicación verificada con búsqueda web'));
          /* (#R150) ambig is impossible here — the ambiguity gate above stopped and asked before any painting. */
          if(miss.length) hh+=warn(L('No boundary resolved','境界を解決できず','Keine Grenze aufgelöst','Граница не разрешена','Sin frontera resuelta')+': '+esc(miss.join(', ')));   /* (#R489) the same correction as above — this lists what could not be DRAWN, not what does not exist */
          if(rejected.length) hh+=warn(L('Rejected — invalid/degenerate shape (not drawn)','不正・退化した形状のため未描画','Abgelehnt — ungültige/entartete Form','Отклонено — некорректная форма','Rechazado — forma inválida')+': '+esc(rejected.map(r=>r.name).join(', ')));   /* (#R143) */
          /* (#R142) PARTIAL result → the planner's pre-written "…をハイライトしました" over-claims the targets that were NOT
             drawn. Flag partial so runActions suppresses that say (#3) and lets this honest body — which lists exactly what
             WAS drawn plus "Not found: X" / "Ambiguous: Y" — lead. (Total miss already returns ok:false above.) */
          return R(true,hh+cwarn, (miss.length||ambig.length||rejected.length)?{meta:{partial:true}}:undefined); }
    },
  },
  /* (#R511) one map explanation in one call — numbered places with roles, arcs between them,
     shaded regions, one frame, a legend. `paint`: the observer counts its own source
     (`atl-compose-src`, in paintNow below) to know it drew. Writes the highlight key too,
     because a shaded item goes through the highlight path. */
  {
    row: ['map.compose',                'compose',        'mapCompose,composeMap,explainOnMap',                          'map',     'mapCompose', 'map.compose,map.highlight', 'map,explanation', 'session', 'none',   '',         ''],
    /* ⚠ THE ONE THIS ROUND IS NAMED AFTER. Four complete forms, and `{}` is none of them:
       a GPT-resolved country set (`targets`/`groups`/`iso3`/`codes`/`countries`), one concrete
       named feature (`query` — a subdivision, a river, a basin), a computed top/bottom N
       (`metric` and its spellings), and the two that operate on the CURRENT highlights —
       `on:false` clears, `color` alone recolours. `minPop`/`maxPop` accept "5M" as well as a
       number, and `filter` is the object form of the same two. */
    /* (#R511) one map explanation. `from`/`to` are loose because an endpoint may be an item's NAME
       or its 1-based NUMBER — both are how a person refers to «the second one». No coordinate
       field exists here and none may be added: the model names, IntMap resolves. */
    doc: [
      { in: 'map.compose', text: 'EXPLAIN WITH THE MAP, IN ONE CALL (the map as an OUTPUT of your answer, not a side effect): {"type":"compose","title"?:str,"items":[{"name":str,"country"?:str,"kind"?:str,"role"?:str,"color"?:str,"fill"?:bool}],"relations"?:[{"from":str|int,"to":str|int,"type"?:"flow"|"route"|"supply"|"link"|"influence"|"border"|"claim","label"?:str}],"camera"?:"fit"|"keep"}. `items` are the places IN THE ORDER TO NUMBER THEM; `role` is what the place IS in your explanation (「主要な輸入経路の入口」, "chokepoint", "capital"); `fill:true` shades a country or region through the highlight path instead of (as well as) marking a point. `relations` join two items by NAME or by their 1-based NUMBER: "flow"/"route"/"supply" draw a great-circle arc with arrowheads, "influence"/"border"/"claim" a dashed line, "link" a plain line. IntMap resolves every name itself — the ledger of places this conversation already resolved first, the gazetteer second, and for anything the gazetteer cannot name, one live web-search-grounded verification third (those come back with `provenance":"web_verified"`, and are worth naming as such if the answer turns on exactly where the point is) — numbers the markers, frames the camera over everything that landed ("camera":"keep" leaves it), shows a legend with the same numbers, and links each name in your final_text to its marker. NEVER write a coordinate: name the place and its country. The result’s `placed` / `unplaced` lists are the truth about what is on the map — an unplaced item is NOT shown; say so. A NAME THE GAZETTEER CANNOT FIND IS REPORTED AS `not_found`, NEVER SUBSTITUTED: IntMap would rather place nothing than stand a stranger under your label, so when another name means the same place (the municipality it sits in, its official or local spelling) you may call this again with that name. A RELATION IS A CLAIM YOU ARE MAKING, and the line is drawn as a GREAT-CIRCLE ARC between the two points — the shortest path over the globe, NOT a surveyed road, shipping lane or pipeline. Draw one only for a connection you would defend in the prose and can name in `label`; sharing an industry, a region or a list is not a connection — when that is all you can say, number the places and leave them unjoined. For an actual path over the road or rail network between two points, use `directions` instead. When the map carries part of your answer, declare answer_mode "map" or "mixed" and make this (or highlight / map_view) the call that fulfils it.\n' },
    ],
    chips: 'map.compose',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', required: ['items'], properties: { title: str(), camera: one('fit', 'keep'),
        items: list({ type: 'object', required: ['name'], properties: { name: str(), country: str(), kind: str(), stableId: str(), geoId: str(), role: str(), note: str(), color: str(), fill: bool(), style: one('marker', 'fill') } }, 1, 24),
        relations: list({ type: 'object', required: ['from', 'to'], properties: { from: loose(), to: loose(), type: one('flow', 'route', 'supply', 'link', 'influence', 'border', 'claim'), label: str(), color: str() } }, null, 24) } }),
    async run(a, dctx, K) { const COMPOSE = K.COMPOSE;
      return await COMPOSE.run(a,dctx);   /* (#R551) the execution context — which TURN this is — reaches the module, so two composes in one turn are two revisions of ONE map rather than two maps */
    },
  },
  /* (#R546) one earthquake's ground-motion FIELD from USGS ShakeMap — the contours, the painted
     intensity surface, and who was inside which shaking. `paint`: the observer counts the contour
     source, which is the one every metric produces (a metric USGS ships no palette for has lines
     and no surface, and `state().painted` is how Atlas tells those two apart). Lazy: js/shakemap.js. */
  {
    row: ['map.shakemap',               'shakemap',       'shakeMap,groundShaking,intensityMap,shaking',                  'map',     'paint',   'map.shakemap',           'map,explanation',     'session', 'none',   '',         'shakeMap'],
    /* (#R546) ShakeMap. `eventId` is a USGS event id and is the exact form; everything else is how
       to FIND one in the USGS catalogue when the reader described the quake instead of naming it.
       `metric` is not an enum: the roster is discovered from the product, so a period USGS adds
       tomorrow must be passable today. */
    doc: [
      { in: 'map.shakemap', text: 'WHAT THE GROUND ACTUALLY DID IN ONE EARTHQUAKE (USGS ShakeMap — the ground-motion FIELD, not the magnitude): {"type":"shakemap","action"?:"open"|"close"|"exposure","eventId"?:str,"metric"?:str,"place"?:str,"from"?:"YYYY-MM-DD","to"?:"YYYY-MM-DD","minMagnitude"?:num,"minMMI"?:num,"limit"?:int}. "open" draws USGS\'s own contours for that quake and, where USGS ships a colour scale for the measure, paints the intensity surface under them. NAME THE EVENT with "eventId" when you have one (the earthquakes layer and the earthquakes table both carry USGS ids); otherwise describe it — "from"/"to" bound the date, "minMagnitude" the size, and "place" is matched against the place strings USGS itself writes. "metric" picks WHICH measure is drawn, out of the roster the product actually contains ("mmi" = Modified Mercalli intensity, "pga", "pgv", and the spectral periods such as "psa1p0"); leave it out for intensity. "action":"exposure" answers WHO WAS INSIDE WHICH SHAKING: it samples the intensity grid at every named city in the gazetteer and returns how many cities, and how much of their population, were at or above "minMMI" (default 6). THAT POPULATION IS THE POPULATION OF NAMED CITIES, not everyone inside the contour — say so, in those words, whenever you quote the number; there is no population raster behind it. MAGNITUDE IS NOT INTENSITY. Magnitude is one number about the source; ShakeMap is a field over the land, so a distant M7 can shake a city less than a shallow M5 beneath it, and an answer about who felt what has to come from here rather than from the magnitude. NOT EVERY EARTHQUAKE HAS ONE — the result says `no_shakemap` when USGS published only a catalogue entry, and that is an answer about the record, not a failure of the tool. When this carries part of your answer, declare answer_mode "map" or "mixed".\n' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    chips: 'map.shakemap',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', properties: { action: one('open', 'close', 'exposure'), eventId: str(), metric: str(), place: str(), from: str(), to: str(), minMagnitude: num(0, 10), minMMI: num(1, 12), limit: int(1, 200) } }),
    async run(a, dctx, K) { const R = K.R;
      { await window.IntMapLazy.need('shakeMap'); const _sk=await window.IntMapShakeMap.run(a); return R(_sk.ok,_sk.html,_sk.meta); }   /* (#R546) map.shakemap — js/shakemap.js owns the body BECAUSE this file has no line left */   /* (#R511) map.compose — js/atlas-map-compose.js. ⚠ THE LINE CAME FROM A BLANK ONE ABOVE THE TIME-AXIS BLOCK: this file is at its ceiling (tests/atlas-capabilities-checks.test.mjs (#R318) ⓑ) */
    },
  },
  {
    row: ['map.clear',                  'clear',          '',                                                            'map',     'clear',   'map.all',                'map',                 'session', 'none',   '',         ''],
    doc: [
      { in: 'tools-panels', at: 230, text: '{"type":"clear","what":"pins"|"radius"|"highlights"|"outline"|"measure"|"isolate"|"poi"|"flight"|"lines"|"route"|"historical"|"elevation"|"weather"|"satellite"} removes ONE kind of thing (fine-grained — use when the user names what to remove; "weather" / "satellite" close the floating cards those capabilities opened; a clear that finds nothing of that kind is complete, not a failure); ' },
      { in: 'facilities', at: 20, text: '{"type":"clear","what":"poi"} removes the pins.\n' },
      { in: 'animated-flight', at: 20, text: '{"type":"clear","what":"flight"} removes the trajectory.\n' },
      { in: 'ballistic', at: 20, text: '{"type":"clear","what":"missile"} removes it.\n' },
      { in: 'elevation-highlight', at: 20, text: '{"type":"clear","what":"elevation"} removes it.\n' },
      { in: 'historical-alliances', at: 20, text: '{"type":"clear","what":"historical"} removes it.\n' },
      { in: 'radiation-dispersion', at: 20, text: '{"type":"clear","what":"radiation"} removes it.\n' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { what: str(), target: str() } }),
    async run(a, dctx, K) { const clearAllPins = K.clearAllPins, L = K.L, clearHl = K.clearHl, clearChoro = K.clearChoro, clearPolyHl = K.clearPolyHl, clearLineHl = K.clearLineHl, exitTool = K.exitTool, clearPois = K.clearPois, clearFly = K.clearFly, clearBlast = K.clearBlast, clearElev = K.clearElev, clearFac = K.clearFac, R = K.R, warn = K.warn, esc = K.esc, note = K.note;
      { const w=String(a.what||a.target||'all').toLowerCase(); const did=[]; const all=/^(all|everything|全部|すべて|todo|alles|всё)$/.test(w); const wants=re=>all||re.test(w);
          if(wants(/pin|ピン|метк|pines/)){ try{ if(typeof clearAllPins==='function'){ clearAllPins(); did.push(L('pins','ピン','Pins','метки','pines')); } }catch(_){} }
          if(wants(/radius|circle|半径|円|круг|círculo/)){ try{ if(window.clearAllRadius){ window.clearAllRadius(); did.push(L('circles','円','Kreise','круги','círculos')); } }catch(_){} }
          if(wants(/highlight|shad|choro|ハイライト|濃淡|色分け|выделен|resalt/)){ try{ clearHl(); clearChoro(); clearPolyHl(); clearLineHl(); did.push(L('highlights','ハイライト','Hervorhebungen','выделение','resaltado')); }catch(_){} }
          if(wants(/outline|contour|輪郭|範囲|контур/)){ try{ if(window.IntMapOutline&&window.IntMapOutline.clear){ window.IntMapOutline.clear(); did.push(L('outline','輪郭','Umriss','контур','contorno')); } }catch(_){} }
          if(wants(/measure|draw|tool|volume|計測|測定|描画|ツール|立体|инструмент|объём|volumen|herramienta/)){   /* (#R170) +the 3-D volume box (exitTool drops it) */ try{ if(typeof exitTool==='function'){ exitTool(); did.push(L('tools','ツール','Werkzeuge','инструменты','herramientas')); } }catch(_){} }
          if(wants(/isolat|分離|изоляц|aisla/)){ try{ if(window.IntMapIsolate&&window.IntMapIsolate.exit){ window.IntMapIsolate.exit(); did.push(L('isolate','分離','Isolierung','изоляция','aislar')); } }catch(_){} }
          if(wants(/poi|facilit|marker|施設|マーカー|объект|instalacion|report|レポート|調査/)){ try{ clearPois(); did.push(L('facilities','施設マーカー','Einrichtungen','объекты','instalaciones')); }catch(_){} }
          if(wants(/fly|flight|trajector|missile|ballistic|飛行|軌道|ミサイル|弾道|полёт|полет|vuelo|trayector|misil/)){ try{ clearFly(); }catch(_){} try{ clearBlast(); }catch(_){} try{ window.IntMapArc3D&&window.IntMapArc3D.hide(); }catch(_){} did.push(L('flight path','飛行経路','Flugbahn','траектория','trayectoria')); }
          if(wants(/lines?|polygons?|drawing|ライン|線|ポリゴン|描画|линии|líneas|polígono/)){ try{ clearLineHl(); clearPolyHl(); did.push(L('drawings','描画','Zeichnungen','рисунки','dibujos')); }catch(_){} }
          if(wants(/route|directions|経路|ルート|道順|путь|маршрут|ruta|weg|route/)){ try{ window.IntMapRouting&&window.IntMapRouting.clear&&window.IntMapRouting.clear(); did.push(L('route','経路','Route','маршрут','ruta')); }catch(_){} }
          if(wants(/radiation|fallout|dispersion|plume|放射|拡散|радиац|radiac/)){ try{ window.IntMapRadiation&&window.IntMapRadiation.clear&&window.IntMapRadiation.clear(); did.push(L('dispersion','拡散','Ausbreitung','рассеивание','dispersión')); }catch(_){} }
          if(wants(/elevation|sea ?level|標高|海抜|elevación|höhe|высот/)){ try{ clearElev(); did.push(L('elevation shading','標高ハイライト','Höhenschattierung','высотная заливка','sombreado de elevación')); }catch(_){} }
          if(wants(/faction|historical|alliance|power ?map|勢力|歴史|同盟|historisch|históric|историческ/)){ try{ clearFac(); did.push(L('historical map','歴史地図','historische Karte','историческая карта','mapa histórico')); }catch(_){} }
          /* (#R176) the three simulators this round added — each paints a raster, so each needs a way off */
          if(wants(/water|terrain ?edit|sculpt|levee|dam|水|流|地形編集|堤防|ダム|вод|дамб|agua|dique/)){ try{ if(window.IntMapTerrainWater&&window.IntMapTerrainWater.isOpen()){ window.IntMapTerrainWater.close(); did.push(L('terrain & water','地形編集・水流','Gelände & Wasser','рельеф и вода','terreno y agua')); } }catch(_){} }
          if(wants(/quake|seismic|earthquake|地震|震源|波|землетряс|сейсм|sismo|sísmic|beben/)){ try{ if(window.IntMapSeismic){ window.IntMapSeismic.close(); did.push(L('seismic waves','地震波','seismische Wellen','сейсмические волны','ondas sísmicas')); } }catch(_){} }
          if(wants(/sun|shad|shade|insolation|日照|日射|影|солн|тен|sol|sombra|sonne|schatten/)){ try{ if(window.IntMapInsolation) window.IntMapInsolation.clear(); if(window.IntMapSun) window.IntMapSun.close(); did.push(L('sun & shadow','日照・影','Sonne & Schatten','солнце и тень','sol y sombra')); }catch(_){} }
          if(wants(/sight|viewshed|coverage|見通し|視通|圏|видимост|visión|sicht/)){ try{ if(window.IntMapLOS) window.IntMapLOS.clear(); did.push(L('line of sight','見通し線','Sichtlinie','линия видимости','línea de visión')); }catch(_){} }
          if(wants(/weather|forecast|天気|予報|wetter|погод|tiempo|clima|panel|card|パネル|カード/)){ try{ const WP=window.IntMapWeather; const el=document.getElementById('weather-panel'); if(WP&&WP.close&&el&&el.style.display!=='none'){ WP.close(); did.push(L('weather card','天気パネル','Wetterkarte','карточка погоды','tarjeta del tiempo')); } }catch(_){} } if(wants(/satellite|衛星|satellit|спутник|satélite|panel|card|パネル|カード/)){ try{ const SP=window.IntMapSatPanel; const el=document.getElementById('sat-popup'); if(SP&&SP.close&&el&&el.style.display!=='none'){ SP.close(); did.push(L('satellite card','衛星パネル','Satellitenkarte','карточка спутника','tarjeta del satélite')); } }catch(_){} }   /* the two floating cards Atlas opens close through the same verb (measured 2026-09-15: nothing could reach the weather card) */
          if(!did.length) return R(false, warn(L('Nothing to clear for','消去対象がありません','Nichts zu löschen für','Нечего очищать','Nada que borrar')+': '+esc(w)));
          return R(true, note('✓ '+L('Cleared','消去','Gelöscht','Очищено','Borrado')+': '+did.join(', ')), {exec:{cleared:did.slice()}}); }
    },
  },
  /* (atlas-observer-undo) PUT THE MAP BACK THE WAY IT WAS BEFORE A TURN. ONE mechanism, not one undo
     per capability: js/atlas-state.js snapshots every restorable section when a turn opens (camera,
     clock, layer switches, Atlas's own drawings, the object list, the claimed surfaces) and this
     puts the snapshot back. Column 5 is what it touches — and therefore what `hasUndo` below
     reports for every other row: a capability whose effects all fall inside it is reversible. What
     it cannot put back (a drawing the turn REPLACED, an object it deleted) the verdict names. */
  {
    row: ['map.undo',                   'undo',           'undoTurn,undoLast,revertTurn',                                'map',     'undo',    'camera,time,map.basemap,map.layer,map.highlight,map.choropleth,map.polygon,map.line,map.poi,map.object,map.isochrone,map.fly,map.ballistic,map.elevation,map.factions,map.compose,map.shakemap', 'map', 'session', 'none', '', ''],
    doc: [
      { in: 'map.undo', text: 'UNDO — PUT THE MAP BACK TO HOW IT WAS BEFORE A TURN (元に戻す・取り消し・さっきの変更を戻して・undo that, go back, revert): {"type":"undo","turn"?:int} — 元に戻す／取り消し: 直前の依頼で地図に加えた変更を取り消し、その依頼の前の地図に戻す. With no `turn` it takes back the most recent turn that changed the map (a second undo in a later turn walks one further back; a turn that was itself an undo is skipped, so it never redoes). It restores, as they were when that turn began: the camera and the globe/flat/3-D and map/satellite view, the Chronos date, which layers were switched on and their opacity, the highlights, shading, polygons, lines and markers you drew, and it takes off the objects and drawn surfaces that turn added. Its result names every section it could NOT put back and every operation whose effect no snapshot holds (`unresolved` — e.g. a drawing that turn REPLACED, an object it deleted, a forecast-model switch); say so to the reader rather than claiming the map is as it was. Calling it twice in one turn does not rewind twice — the second answers already_there.' },
    ],
    schema: () => ({ type: 'object', properties: { turn: int() } }), /* (atlas-observer-undo) no `turn` = the most recent turn that changed the map */  /* no `what` = everything, which is the case's own default */
      /* (atlas-observer-undo) put the map back to before a turn — the ONE undo, js/atlas-state.js `undo()`. The verdict re-reads every section (js/atlas-capabilities.js OBSERVERS.undo). */
    async run(a, dctx, K) { const ASTATE = K.ASTATE, R = K.R, warn = K.warn, L = K.L, note = K.note, esc = K.esc;
      { const u=await ASTATE.undo((dctx&&dctx.turnId!=null)?dctx.turnId:null,{turn:(a.turn!=null&&a.turn!=='')?+a.turn:null});
          if(!u.ok) return R(false, warn(L('There is no earlier change to the map to undo.','元に戻せる地図の変更がありません。')), {meta:{code:'nothing_to_undo',permanent:true}});
          if(u.already) return R(true, note('✓ '+L('The map was already put back in this turn.','このターンですでに地図を元に戻しています。')), {exec:{already:true,turnId:u.turnId}});
          return R(true, note('✓ '+L('Put the map back to how it was before: ','次の依頼の前の状態に地図を戻しました: ')+esc(u.question||''))+(u.unresolved.length?warn(L('Could not put back','戻せなかったもの')+': '+esc(u.unresolved.join(', '))):''), {exec:{turnId:u.turnId,restored:u.restored.slice(),unresolved:u.unresolved.slice()}}); }
    },
  },
  {
    row: ['map.poi',                    'poi',            'mapPois,facilities',                                          'map',     'paint',   'map.poi',                'map',                 'session', 'none',   'place?',   ''],
    /* the place is optional (no place = the current view) but the KIND is not: without it the
       case asks «what kind of facilities?» */
    doc: [
      { in: 'facilities', at: 10, text: '{"type":"poi","kind":str,"place"?:str,"color"?:str} = find REAL facilities from OpenStreetMap AND Wikidata (merged, per-source counts reported) and PIN them on the map with name labels + click popups (use for "show the oil facilities in X", "map the nuclear plants in Y", 「日本の原子力発電所を地図に出して」「ドイツの発電所を表示」, "軍事基地を表示"). kind understands oil/gas/nuclear/wind/solar/power plants/dams/airports/ports/military/mines/steel/factories/hospitals/universities/stadiums/prisons/lighthouses/embassies/stations/data centers in 5 languages, and falls back to a name search. THE SCOPE IS ONE PLACE, NOT THE PLANET: a country or region in "place" is searched WHOLE (an area query over its real boundary), and with "place" omitted — or set to "world" — the search is the CURRENT VIEW clamped to about 30°×24°. So 「世界の原子力発電所を地図に表示して」 is answered COUNTRY BY COUNTRY — one call per country, naming each one — never by a single global call, and the reply says which countries were mapped. This — not flyTo, not highlight — is the action for "show me the X facilities in Y". ' },
    ],
    chips: 'map.poi',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', properties: { kind: str(), query: str(), what: str(), name: str(), place: str(), color: str() }, anyOf: [{ required: ['kind'] }, { required: ['query'] }, { required: ['what'] }, { required: ['name'] }] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, WORLD_RE = K.WORLD_RE, DEIXIS_RE = K.DEIXIS_RE, placeExtent = K.placeExtent, geocode = K.geocode, esc = K.esc, resolveCountrySync = K.resolveCountrySync, _nomExtent = K._nomExtent, _bboxOK = K._bboxOK, GE = K.GE, parseColor = K.parseColor, wikidataPOIs = K.wikidataPOIs, overpassPOIs = K.overpassPOIs, aiFacilities = K.aiFacilities, clearPois = K.clearPois, paintPois = K.paintPois, flyToBox = K.flyToBox, note = K.note, _PINNED = K._PINNED;
      { /* (#R62) "○○にある石油施設を表示して" → REAL facilities mapped from OpenStreetMap */
          const kindStr=String(a.kind||a.query||a.what||a.name||'').trim();
          if(!kindStr) return R(false, warn(L('What kind of facilities?','どんな施設を表示しますか？','Welche Einrichtungen?','Какие объекты?','¿Qué instalaciones?')));
          let box=null,pname='',areaRel=null,isoPoi=null; const placeStr2=String(a.place||'').trim();
          if(placeStr2&&!WORLD_RE.test(placeStr2)&&!DEIXIS_RE.test(placeStr2)){ let ext=null; try{ ext=await placeExtent(placeStr2); }catch(_){} if(!ext){ try{ ext=await geocode(placeStr2); }catch(_){} }
            if(!ext) return R(false, warn(L('Place not found','地名が見つかりません','Ort nicht gefunden','Место не найдено','Lugar no encontrado')+': '+esc(placeStr2)));
            pname=ext.name||placeStr2;
            /* (#R64) real admin area → search the WHOLE territory via an Overpass area query (fixes "ロシアの
               石油精製施設 → 一部地域だけ": the old 30°×24° bbox clamp cut most of a large country away). */
            const cSync=resolveCountrySync(placeStr2);
            if(cSync&&cSync.code) isoPoi=cSync.code;   /* (#R69) ISO3 → country-wide Wikidata query */
            if(ext.osmType==='relation'&&ext.osmId&&(ext.adminPoly||cSync)) areaRel=ext.osmId;
            else if(cSync){ try{ const e2=await _nomExtent(cSync.name||placeStr2); if(e2&&e2.osmType==='relation'&&e2.osmId){ areaRel=e2.osmId; if(e2.box&&_bboxOK(e2.box)) box=e2.box; } }catch(_){} }
            if(!box){ if(ext.box&&_bboxOK(ext.box)) box=ext.box; else if(ext.lng!=null&&isFinite(ext.lng)){ const d2=1.2; box=[[ext.lng-d2,ext.lat-d2*0.8],[ext.lng+d2,ext.lat+d2*0.8]]; } } }
          if(!box){ try{ const b2=GE().camera.getBounds(); box=[[b2.getWest(),b2.getSouth()],[b2.getEast(),b2.getNorth()]]; }catch(_){} pname=pname||L('the current view','現在の表示範囲','der aktuellen Ansicht','текущая область','la vista actual'); }
          if(!box) return R(false, warn(''));
          /* clamp to a sane Overpass area ONLY for raw-bbox searches (area queries cover the full territory) */
          if(!areaRel){ const cx2=(box[0][0]+box[1][0])/2, cy2=(box[0][1]+box[1][1])/2; const sx2=Math.min(30,box[1][0]-box[0][0])||1, sy2=Math.min(24,box[1][1]-box[0][1])||1; box=[[cx2-sx2/2,cy2-sy2/2],[cx2+sx2/2,cy2+sy2/2]]; }
          if(a.color!=null&&String(a.color).trim()!==''){ const pc3=parseColor(a.color); if(pc3) K._poiColor=pc3; }
          /* (#R63/#R64) staged search: full area/bbox Overpass union → lite retry (2 selectors, 60 s) → bbox
             fallback if the area query failed → AI-known facilities.
             (#R69) Wikidata runs in PARALLEL as an independent second source and is merged in. */
          const wdP=wikidataPOIs(kindStr,box,isoPoi);
          let res=await overpassPOIs(kindStr,box,false,areaRel);
          if(res===null) res=await overpassPOIs(kindStr,box,true,areaRel);
          if(res===null&&areaRel) res=await overpassPOIs(kindStr,box,true,null);
          let wd=null; try{ wd=await wdP; }catch(_){}
          const osmN=(res&&res.length)||0; let wdN=0;
          if(wd&&wd.length){
            const normN=s2=>{ try{ return String(s2||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,''); }catch(_){ return String(s2||'').toLowerCase().replace(/\W+/g,''); } };
            const have=new Set((res||[]).map(p2=>normN(p2.name)).filter(Boolean));
            const merged=(res||[]).slice();
            for(const w of wd){ const nw=normN(w.name);
              if(nw&&have.has(nw)) continue;                                                    /* same facility, same name */
              if(merged.some(p2=>Math.abs(p2.lat-w.lat)<0.02&&Math.abs(p2.lng-w.lng)<0.03)) continue;   /* same site ~2 km */
              merged.push(w); have.add(nw); wdN++; }
            res=merged;
          }
          let aiUsed=false;
          if(!res||!res.length){ try{ const aiL=await aiFacilities(kindStr,pname,box); if(aiL&&aiL.length){ res=aiL; aiUsed=true; } }catch(_){} }
          if(res===null) return R(false, warn(L('Facility search failed (OpenStreetMap Overpass busy, Wikidata had no match) — try again shortly','施設検索に失敗しました（Overpass混雑・Wikidataにも該当なし）。少し待って再試行してください','Suche fehlgeschlagen (Overpass ausgelastet, Wikidata ohne Treffer) — später erneut','Поиск не удался (Overpass занят, в Wikidata нет совпадений) — попробуйте позже','Búsqueda fallida (Overpass ocupado, sin coincidencias en Wikidata) — reintenta luego')));
          clearPois(); K._pois=res; let okP=paintPois();
          for(let i2=0;i2<6&&!okP;i2++){ await new Promise(r2=>setTimeout(r2,700)); okP=paintPois(); }
          try{ flyToBox(box); }catch(_){}
          if(!okP) return R(false, warn(L('Could not draw the markers (map still loading) — try again','マーカーを描画できませんでした（地図読込中）。もう一度お試しください','Marker konnten nicht gezeichnet werden (Karte lädt)','Не удалось отрисовать маркеры (карта загружается)','No se pudieron dibujar los marcadores (mapa cargando)')));
          if(!res.length) return R(true, note('◌ '+L('Nothing found — neither OpenStreetMap nor Wikidata has such facilities recorded here and the AI knows none it is sure of','見つかりませんでした — OpenStreetMapにもWikidataにも該当がなく、AIも確実な施設を知りません','Nichts gefunden — weder in OpenStreetMap noch Wikidata erfasst, KI kennt keine sicheren','Ничего не найдено — нет ни в OpenStreetMap, ни в Wikidata; ИИ также не уверен','Nada encontrado — ni en OpenStreetMap ni en Wikidata, y la IA no conoce ninguno con certeza')+' ("'+esc(kindStr)+'" @ '+esc(pname)+')'));
          const names5=res.filter(p=>p.name).slice(0,5).map(p=>esc(p.name)).join(' · ');
          /* (#R64) state the BASIS explicitly ("何の根拠に選んでいるのかもわからない"): what was searched, over
             what area, and whether the result set is complete or capped. */
          const areaTxt=areaRel||isoPoi
            ?L('the whole territory of '+pname,pname+'の全域','das gesamte Gebiet von '+pname,'вся территория: '+pname,'todo el territorio de '+pname)
            :L('the shown search box','表示範囲のボックス','der gezeigte Suchbereich','показанная область поиска','el área mostrada');
          /* (#R69) per-source counts — OSM live tags + Wikidata curated entities ("何の根拠に選んでいるのか").
             wd===null → the Wikidata query itself failed/didn't apply; wdN counts only NON-duplicate additions. */
          const wdTxt=(wd===null)
            ?L('Wikidata n/a','Wikidata照会なし','Wikidata n. v.','Wikidata недоступна','Wikidata no disponible')
            :L('Wikidata +'+wdN+' additional','Wikidata追加 '+wdN+'件','Wikidata +'+wdN+' zusätzlich','Wikidata +'+wdN,'Wikidata +'+wdN+' adicionales');
          const scopeTxt=L('OpenStreetMap tags ('+osmN+') + '+wdTxt+' across '+areaTxt,'OpenStreetMapの登録施設 '+osmN+'件 + '+wdTxt+'（検索範囲: '+areaTxt+'）','OpenStreetMap-Tags ('+osmN+') + '+wdTxt+' in '+areaTxt,'теги OpenStreetMap ('+osmN+') + '+wdTxt+' — '+areaTxt,'etiquetas de OpenStreetMap ('+osmN+') + '+wdTxt+' en '+areaTxt);
          const truncTxt=(res._truncated)?('<br>'+(icon('warning')+' '+L('Capped at 600 results — zoom into a sub-region for the rest','600件で打ち切り — 残りは範囲を絞って再検索してください','Bei 600 Ergebnissen gekappt — Region eingrenzen für den Rest','Ограничено 600 результатами — сузьте область','Limitado a 600 — acota la zona para ver el resto'))):'';
          const srcTxt=aiUsed
            ?L('Source: AI-estimated (neither OpenStreetMap nor Wikidata had matching entries here — positions are approximate, verify before relying on them)','出典: AI推定（OpenStreetMapにもWikidataにも該当が無かったため。位置は概算です — 重要な用途では確認してください）','Quelle: KI-Schätzung (weder OSM- noch Wikidata-Treffer — Positionen ungefähr)','Источник: оценка ИИ (нет ни в OSM, ни в Wikidata — координаты приблизительны)','Fuente: estimación de IA (sin coincidencias en OSM ni Wikidata — posiciones aproximadas)')
            :(L('Basis','根拠','Basis','Основание','Base')+': '+scopeTxt+' · '+L('click a pin for details · say "clear facilities" to remove','ピンをクリックで詳細 ·「施設を消して」で削除','Pin anklicken für Details','клик по метке — детали','clic en un pin para detalles'));
          return R(true, note(icon('pin')+' '+res.length+' '+L('facilities mapped','件の施設をマッピングしました','Einrichtungen kartiert','объектов нанесено на карту','instalaciones mapeadas')+' — '+esc(kindStr)+' @ '+esc(pname)+(names5?('<br>'+names5+(res.length>5?' …':'')):'')+truncTxt+'<br><span style="opacity:0.75;">'+srcTxt+'</span>'), _PINNED()); }   /* (#R802) the facilities are declared by the painter that placed them — reaching this line means `paintPois()` succeeded (the `!okP` guard above returns) */
    },
  },
  {
    row: ['map.elevationHighlight',     'elevationBelow', 'belowSeaLevel,elevationHighlight,elevationScan',              'map',     'paint',   'map.elevation',          'map',                 'session', 'none',   'place',    ''],
    doc: [
      { in: 'elevation-highlight', at: 10, text: '{"type":"elevationBelow","place":str,"threshold"?:meters,"above"?:bool,"km"?:num} = samples the real Copernicus elevation model on a grid over the place/region and shades every cell below (default) or above the threshold, graduated by depth/height. Use for "カスピ海周辺の海抜0m以下地点をハイライトして" → {"type":"elevationBelow","place":"Caspian Sea","threshold":0}, "highlight land below sea level around the Dead Sea", "show areas above 3000 m in the Alps" → add "above":true,"threshold":3000. Omit place to scan the current view. ' },
    ],
    chips: 'map.elevation',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', properties: { place: str(), region: str(), around: str(), country: str(), threshold: num(), meters: num(), above: bool(), km: num(0), dir: str(), mode: str() }, anyOf: [{ required: ['place'] }, { required: ['region'] }, { required: ['around'] }, { required: ['country'] }] }), /* `elevationBelow` */
    async run(a, dctx, K) { const clearElev = K.clearElev, WORLD_RE = K.WORLD_RE, placeExtent = K.placeExtent, geocode = K.geocode, GE = K.GE, R = K.R, warn = K.warn, L = K.L, elevGrid = K.elevGrid, _mixc = K._mixc, ensureElevLayers = K.ensureElevLayers, note = K.note, esc = K.esc;
      {
          clearElev();
          const place=String(a.place||a.region||a.around||a.country||'').trim();
          let ext=null; if(place&&!WORLD_RE.test(place)){ try{ ext=await placeExtent(place); }catch(_){} if(!ext){ try{ ext=await geocode(place); }catch(_){} } }
          let box=null; if(ext&&ext.box){ const bx=ext.box; if(Array.isArray(bx[0])) box=[[+bx[0][0],+bx[0][1]],[+bx[1][0],+bx[1][1]]]; else if(bx.length===4) box=[[+bx[0],+bx[1]],[+bx[2],+bx[3]]]; }
          if(!box&&ext&&isFinite(ext.lng)){ const d=(a.km!=null&&isFinite(+a.km))?(+a.km/111):3; box=[[ext.lng-d*1.5,Math.max(-84,ext.lat-d)],[ext.lng+d*1.5,Math.min(84,ext.lat+d)]]; }
          if(!box){ try{ const b=GE().camera.getBounds(); box=[[b.getWest(),b.getSouth()],[b.getEast(),b.getNorth()]]; }catch(_){} }
          if(!box) return R(false, warn(L('Which area should I scan?','どの範囲を調べますか？','Welches Gebiet?','Какую область?','¿Qué área?')));
          const spanX=Math.abs(box[1][0]-box[0][0]); if(spanX>64){ const cx=(box[0][0]+box[1][0])/2; box[0][0]=cx-32; box[1][0]=cx+32; }
          const thr=(a.threshold!=null&&isFinite(+a.threshold))?+a.threshold:(a.meters!=null&&isFinite(+a.meters)?+a.meters:0);
          const above=(a.above===true||/above|以上|higher|超え|over/i.test(String(a.mode||a.dir||'')));
          const grid=await elevGrid(box,850); const hw=grid.dx/2, hh=grid.dy/2;
          const feats=[]; let cnt=0,mn=1e9,mx=-1e9;
          grid.pts.forEach(p=>{ if(p.el==null) return; const hit=above?(p.el>=thr):(p.el<=thr); if(!hit) return; cnt++; mn=Math.min(mn,p.el); mx=Math.max(mx,p.el);
            const col=above?_mixc('#ffe08a','#7a1500',Math.min(1,(p.el-thr)/2500)):_mixc('#7fc8ff','#001a4a',Math.min(1,(thr-p.el)/150));
            feats.push({type:'Feature',geometry:{type:'Polygon',coordinates:[[[p.lng-hw,p.lat-hh],[p.lng+hw,p.lat-hh],[p.lng+hw,p.lat+hh],[p.lng-hw,p.lat+hh],[p.lng-hw,p.lat-hh]]]},properties:{color:col}}); });
          if(!cnt) return R(false, warn(L('No sampled points '+(above?'above':'below')+' '+thr+' m in this area','この範囲に'+thr+'m'+(above?'以上':'以下')+'の地点は見つかりませんでした','Keine Punkte '+(above?'über':'unter')+' '+thr+' m in diesem Gebiet','Нет точек '+(above?'выше':'ниже')+' '+thr+' м в этой области','Sin puntos '+(above?'sobre':'bajo')+' '+thr+' m')));
          ensureElevLayers(); try{ GE().layers.setSourceData('nlq-elev-src',{type:'FeatureCollection',features:feats}); }catch(_){}
          try{ GE().camera.fitBounds(box,{padding:50,duration:900}); }catch(_){}
          return R(true, note(icon('waves')+' '+esc((ext&&ext.name)||place||L('current view','現在の表示','aktuelle Ansicht','текущий вид','vista actual'))+' — '+cnt+' '+L('map points','地点','Kartenpunkte','точек карты','puntos del mapa')+' '+(above?'≥':'≤')+' '+thr+' m · '+L('lowest','最低','tiefster','минимум','mínimo')+' '+Math.round(mn)+' m'+(above?(' · '+L('highest','最高','höchster','максимум','máximo')+' '+Math.round(mx)+' m'):''))
            +note(L('Elevation sampled live on a grid from the Copernicus DEM (Open-Meteo) — cells are graduated by depth/height.','標高はCopernicus DEM（Open-Meteo）からグリッド状にライブ取得。セルの濃淡は深さ・高さに応じた段階表示です。','Höhen live vom Copernicus-DEM (Open-Meteo) im Raster.','Высоты в реальном времени из Copernicus DEM (Open-Meteo) по сетке.','Elevación en vivo del DEM Copernicus (Open-Meteo).'))); }
    },
  },
  {
    /* (landcover-class-highlight) 「land coverレイヤーも、ケッペンの気候区分レイヤーと同じように、選択したものだけハイライト表示されるようにして。」
       The legend's class rows are one door; this is the other — both end in js/layer-packs.js wcApplySel (window.IntMapEco.landCover). */
    row: ['map.landCover',              'landCover',      'landCoverClasses,landCoverHighlight',                         'map',     'layer',   'map.layer',              'map',                 'session', 'none',   '',         ''],
    doc: [
      { in: 'layers', at: 22, text: '{"type":"landCover","classes"?:[name|index,...],"only"?:bool,"clear"?:bool,"year"?:"2020"|"2021"} = the ESA WorldCover land cover layer (土地被覆・land cover; 11 classes: tree cover 樹木, shrubland 低木地, grassland 草地, cropland 農地, built-up 市街地, bare / sparse vegetation 裸地, snow and ice 雪氷, permanent water 水域, herbaceous wetland 湿地, mangroves マングローブ, moss and lichen 苔・地衣類) shows ONLY the picked classes in their colours and dims the rest — like the Köppen climate classes. It turns the layer on itself. Use for "land coverで農地だけ表示して" → {"type":"landCover","classes":["cropland"]}, "show only forests and water on the land cover layer" → {"type":"landCover","classes":["tree cover","permanent water"]}, "土地被覆の分類の選択を解除" → {"type":"landCover","clear":true}; "only":false ADDS to the classes already picked; "year" switches the 2020/2021 edition. With no arguments it lists the classes. ' },
    ],
    schema: () => ({ type: 'object', properties: { classes: list(loose()), class: str(), clear: bool(), year: str(), only: bool() } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, note = K.note, esc = K.esc;
      { const API=window.IntMapEco&&window.IntMapEco.landCover; if(!API) return R(false, warn(L('The land cover layer is not available yet.','土地被覆レイヤーはまだ利用できません。')));
        const names=(i)=>{ const c=API.classes()[i]; return c?L(c.name,c.nameJa):''; };
        let yearNote=''; if(a.year!=null&&String(a.year)!==''){ const y=String(a.year); if(API.years().indexOf(y)<0) return R(false, warn(L('Land cover exists for '+API.years().join(' and ')+' only — not '+esc(y)+'.','土地被覆は '+API.years().join('・')+' 年版のみです（'+esc(y)+' 年はありません）。'))); API.setYear(y); yearNote=' · '+esc(y); }
        const want=[].concat(Array.isArray(a.classes)?a.classes:[], a.class!=null&&a.class!==''?[a.class]:[]);
        if(a.clear===true&&!want.length){ API.clear(); return R(true, note(icon('check')+' '+L('Land cover: class selection cleared — all classes shown','土地被覆: 分類の選択を解除しました（全分類を表示）')+yearNote)); }
        if(!want.length){ const sel=API.selected(); const all=API.classes().map(c=>c.index+' '+esc(names(c.index))).join(' · ');
          return R(true, note(L('Land cover classes','土地被覆の分類')+': '+all+(sel.length?'<br>'+L('Highlighted','ハイライト中')+': '+sel.map(i=>esc(names(i))).join(' · '):'')+yearNote)); }
        const r=API.select(want,{only:a.only!==false});
        const unk=r.unknown.length?warn(L('Not a land cover class','土地被覆の分類にありません')+': '+r.unknown.map(esc).join(', ')+' — '+L('classes: ','分類: ')+API.classes().map(c=>esc(names(c.index))).join(' · ')):'';
        if(!r.selected.length) return R(false, unk||warn(L('No class picked','分類が選ばれていません')));
        return R(true, note(icon('check')+' '+L('Land cover — showing only','土地被覆 — 表示中の分類')+': '+r.selected.map(i=>esc(names(i))).join(' · ')+yearNote)+unk); }
    },
  },
  {
    row: ['map.drawLine',               'drawLine',       'line',                                                        'map',     'paint',   'map.line',               'object,map',          'session', 'none',   'points',   ''],
    doc: [
      { in: 'free-drawing', at: 10, text: '{"type":"drawLine","points":[[lng,lat],...]|"places":[str,...],"color"?:str,"width"?:num,"label"?:str} draws a line; ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    chips: 'lines',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', properties: { points: list(list(), 2), places: list(str(), 2), color: str(), width: num(0), label: str() }, anyOf: [{ required: ['points'] }, { required: ['places'] }] }),
    async run(a, dctx, K) { const geocode = K.geocode, R = K.R, warn = K.warn, L = K.L, parseColor = K.parseColor, paintLines = K.paintLines, GE = K.GE, note = K.note, esc = K.esc;
      { /* (#R72) free line drawing — AI-supplied coordinates or place names */
          let pts=[]; if(Array.isArray(a.points)) pts=a.points.filter(p=>Array.isArray(p)&&isFinite(+p[0])&&isFinite(+p[1])).map(p=>[+p[0],+p[1]]);
          if(!pts.length&&Array.isArray(a.places)){ for(const pn of a.places.slice(0,12)){ const g=await geocode(String(pn)); if(g) pts.push([g.lng,g.lat]); } }
          if(pts.length<2) return R(false, warn(L('Need at least two points','2点以上必要です','Mindestens zwei Punkte nötig','Нужно минимум две точки','Se necesitan al menos dos puntos')));
          const col=a.color?parseColor(a.color):null;
          /* ⚠⚠⚠ (#R747) A LINE IS ITS COURSE, NOT ITS CAPTION — the rule `addPin` and `_radiusFromPoint`
             take in js/app-body.js. Measured: 「нарисуй линию」 Lisbon→Cape Town drew the SAME line five
             times because each retry carried a different label and colour. A redraw is a restyling. */
          /* ⚠ (#732) …AND A COURSE HAS NO DIRECTION: Cape Town→Reykjavik is the line Reykjavik→Cape Town already on the map, so the key is the smaller of the two readings */
          const _lnK=ps=>{ const f=ps.map(p=>(+p[0]).toFixed(5)+','+(+p[1]).toFixed(5)), b=f.slice().reverse().join(' '), a=f.join(' '); return a<b?a:b; }, _lnKey=_lnK(pts);
          const _lnSame=K._hlLines.find(l=>l&&l.geo&&l.geo.type==='LineString'&&_lnK(l.geo.coordinates||[])===_lnKey);
          let _lnObj; if(_lnSame){ _lnObj=_lnSame; _lnSame.key=_lnKey; _lnSame.color=col||undefined; _lnSame.w=(a.width!=null&&isFinite(+a.width))?+a.width:3; if(String(a.label||'')) _lnSame.name=String(a.label||''); } else { _lnObj={geo:{type:'LineString',coordinates:pts},key:_lnKey,color:col||undefined,w:(a.width!=null&&isFinite(+a.width))?+a.width:3,name:String(a.label||'')}; K._hlLines.push(_lnObj); }   /* (#R760) the course IS the identity (see the note above) — js/atlas-era-highlight.js reads `name || key` */
          const okL=paintLines(); try{ let a2=180,b2=90,c2=-180,d2=-90; pts.forEach(p=>{ a2=Math.min(a2,p[0]);b2=Math.min(b2,p[1]);c2=Math.max(c2,p[0]);d2=Math.max(d2,p[1]); }); if(c2-a2<340) GE().camera.fitBounds([[a2,b2],[c2,d2]],{padding:80,maxZoom:9,duration:900}); }catch(_){}
          return R(okL, okL?note(icon('pencil')+' '+L('Line drawn','ラインを描画しました','Linie gezeichnet','Линия нарисована','Línea dibujada')+(a.label?(' — '+esc(a.label)):'')+' ('+pts.length+' pts)'):warn(''), okL?{meta:{painted:{lines:[_lnObj.name||_lnObj.key]},resultKey:'map.line:'+_lnKey}}:null); }   /* (#732) `resultKey` = WHAT this call did, and a caption is not what it did: js/atlas-agent.js reads it to tell Atlas that a relabelled redraw is the line it already drew */   /* (#R760) declared, so a redraw of the same state is `already_there` — tests/atlas-agent-repeat-checks.test.mjs (#R760) */
    },
  },
  {
    row: ['map.drawPolygon',            'drawPolygon',    'polygon',                                                     'map',     'paint',   'map.polygon',            'object,map',          'session', 'none',   'points',   ''],
    doc: [
      { in: 'free-drawing', at: 20, text: '{"type":"drawPolygon","points":[[lng,lat],...]|"places":[str,...],"color"?:str,"label"?:str} draws a polygon. Use these to sketch fronts, corridors, routes, zones or areas that no dataset provides — you supply the real coordinates from your knowledge/search. Combine freely with pin/highlight/outline/poi/mapReport for multi-step tasks ("ピン立てやライン、ポリゴンのハイライト等のマッピングやネット検索や推論等を自在に組み合わせた高度なタスク").\n' },
    ],
    schema: () => ({ type: 'object', properties: { points: list(list(), 3), places: list(str(), 3), color: str(), label: str() }, anyOf: [{ required: ['points'] }, { required: ['places'] }] }),
    async run(a, dctx, K) { const geocode = K.geocode, R = K.R, warn = K.warn, L = K.L, parseColor = K.parseColor, paintPolys = K.paintPolys, GE = K.GE, note = K.note, esc = K.esc;
      { let pts=[]; if(Array.isArray(a.points)) pts=a.points.filter(p=>Array.isArray(p)&&isFinite(+p[0])&&isFinite(+p[1])).map(p=>[+p[0],+p[1]]);
          if(!pts.length&&Array.isArray(a.places)){ for(const pn of a.places.slice(0,12)){ const g=await geocode(String(pn)); if(g) pts.push([g.lng,g.lat]); } }
          if(pts.length<3) return R(false, warn(L('Need at least three points','3点以上必要です','Mindestens drei Punkte nötig','Нужно минимум три точки','Se necesitan al menos tres puntos')));
          if(pts[0][0]!==pts[pts.length-1][0]||pts[0][1]!==pts[pts.length-1][1]) pts.push([pts[0][0],pts[0][1]]);
          const colP=a.color?parseColor(a.color):null;
          const _pgKey=pts.map(p=>(+p[0]).toFixed(5)+','+(+p[1]).toFixed(5)).join(' '); let _pgObj=K._hlPolys.find(p=>p&&p.key===_pgKey); if(_pgObj){ _pgObj.color=colP||undefined; if(String(a.label||'')) _pgObj.name=String(a.label||''); } else { _pgObj={geo:{type:'Polygon',coordinates:[pts]},key:_pgKey,color:colP||undefined,name:String(a.label||'')}; K._hlPolys.push(_pgObj); }   /* ⚠ (#R760) THE RING IS THE IDENTITY, AND A REDRAW OF IT IS A RESTYLING — the rule #R747 gave the line, which drawPolygon never got: measured locally, two identical `map.drawPolygon` calls left TWO polygons stacked on the map and both were reported `ok`, so nothing anywhere said the second one was the first one again */
          const _pgId=(window._imHlPolys&&window._imHlPolys.tagId)?window._imHlPolys.tagId(_pgObj):null;   /* (#R120) drawn polygon becomes a referencable map-object */
          const okPg=paintPolys(); try{ let a2=180,b2=90,c2=-180,d2=-90; pts.forEach(p=>{ a2=Math.min(a2,p[0]);b2=Math.min(b2,p[1]);c2=Math.max(c2,p[0]);d2=Math.max(d2,p[1]); }); if(c2-a2<340) GE().camera.fitBounds([[a2,b2],[c2,d2]],{padding:80,maxZoom:9,duration:900}); }catch(_){}
          return R(okPg, okPg?note('⬠ '+L('Polygon drawn','ポリゴンを描画しました','Polygon gezeichnet','Полигон нарисован','Polígono dibujado')+(a.label?(' — '+esc(a.label)):'')):warn(''), okPg?Object.assign({meta:{painted:{polys:[_pgObj.name||_pgObj.key]},resultKey:'map.polygon:'+_pgKey}},_pgId?{objectIds:[_pgId]}:null):null); }
    },
  },
  {
    row: ['map.myMap',                  'myMap',          'myMaps,customMap,ownMap,storyMap,mapNotes,annotateMap',       'map',     'myMap',   'map.myMap,mymap.doc',    'map,object',          'persist', 'explicit', '',     'myMap'],
    /* (map-next) THE READER'S OWN MAP (js/my-map.js) — pins, lines and areas with names and notes, kept in this browser,
       carried by every share link (js/map-state.js `mymap`), measured with the app's own measure functions, registered
       in the GIS layer for analysis and exported as GeoJSON / GeoPackage. `action`:
         open        show the panel                 add      a pin / line / area (`kind`, `points` or `place` / `places`)
         edit        a feature's name / note / colour (`id`)                         remove   a feature (`id`)
         title       name the map                   show / hide  put it on the map or take it off (nothing is deleted)
         list        what it holds, with lengths and areas                           link     the share link
         export      a file (`format` geojson | geopackage)                          analyze  a dataset in Data and analysis
         new         start another map              collect  move the session's pins, kept shapes and radius circles in
         keep        keep a map a link brought as the reader's own                    draw     hand the reader the pen (`kind`)
       Column 7 'persist' — the map is written to localStorage; column 8 'explicit' — `remove` and `new` change what the
       reader made. Column 5 names `mymap.doc`, which no restorer puts back, so the turn's undo does not claim it. */
    doc: [
      { in: 'free-drawing', at: 30, text: ' MY MAP — THE READER\'S OWN MAP THEY KEEP AND SHARE (マイマップ・自分の地図): {"type":"myMap","action"?:"open"|"add"|"edit"|"remove"|"title"|"show"|"hide"|"list"|"link"|"export"|"analyze"|"new"|"collect"|"keep"|"draw","kind"?:"pin"|"line"|"area","points"?:[[lng,lat],...],"place"?:str,"places"?:[str,...],"name"?:str,"note"?:str,"color"?:"red"|"orange"|"yellow"|"green"|"blue"|"purple","id"?:str,"title"?:str,"format"?:"geojson"|"geopackage"}. Unlike drawPolygon / pin (this turn\'s highlights, gone on reload), a My map feature is the READER\'S: it has a name and a note (メモ・注記), is kept in this browser, rides in every share link together with the place, layers and date (地図を共有), and can be measured (length of a line, area of an area), analysed (analyze → a dataset for gis ops: buffer, clip, zonal statistics) or exported (export → GeoJSON / GeoPackage file). Use it for 「この場所をマイマップに保存」「集合場所にピンを立ててメモを書いて」「この 3 都市を結ぶ線を自分の地図に」「調査範囲を描いて共有リンクを」「自分の地図を書き出して」, "add a pin with a note to my map", "make a shareable map of these places", "draw my study area and analyse it". add needs real coordinates ([lng,lat]) or place names you are sure of; list returns every feature with its id, length and area; draw lets the reader click the vertices themselves. ' },
    ],
    schema: () => ({ type: 'object', properties: { action: one('open', 'add', 'edit', 'remove', 'title', 'show', 'hide', 'list', 'link', 'export', 'analyze', 'new', 'collect', 'keep', 'draw'),
      kind: one('pin', 'line', 'area'), points: list(list()), place: str(), places: list(str()), name: str(), note: str(), color: str(), id: str(), title: str(), format: one('geojson', 'geopackage') } }),
    async run(a, dctx, K) { return myMapRun(a, K); },
  },
  {
    row: ['map.scoreMap',               'scoreMap',       'customLayer,evaluate',                                        'map',     'paint',   'map.choropleth',         'map',                 'session', 'none',   '',         ''],
    /* a composed score is its components; fewer than two is refused by the case */
    doc: [
      { in: 'map.scoreMap', text: 'CUSTOM EVALUATION LAYER (build a NEW map view from criteria): {"type":"scoreMap","name":str,"components":[{"metric":KEY,"weight"?:num,"invert"?:bool} | {"wb":"WB_INDICATOR_CODE","label":str,"weight"?:num,"invert"?:bool}, … 2-8],"color"?:str,"n"?:int} — composes a weighted 0-100 score from REAL indicators and shades every country by it, with an honest method/coverage note (use for "評価して/スコア化して/ランキングを作って from criteria X, Y, Z", e.g. 住みやすさ = hdi + gdppc + dem; "invert" = lower is better, e.g. military burden). metric uses the metric KEYs below + lifeExp, internet; "wb" takes a real World Bank indicator code you are confident exists (e.g. SP.DYN.LE00.IN) — a wrong code is skipped and reported, never faked. When the user then says "weight X more" / "drop Y" / "add Z", re-emit scoreMap with the ADJUSTED components (the current components are in the conversation history).\n' },
      { in: 'metric-keys', at: undefined },   /* documented by the chunk's own text, not a fragment */
    ],
    schema: () => ({ type: 'object', properties: { components: list(obj(), 2), name: str(), color: str(), n: int(1, 40) }, required: ['components'] }),
    async run(a, dctx, K) { const ensureData = K.ensureData, R = K.R, warn = K.warn, L = K.L, _seriesFor = K._seriesFor, _normSeries = K._normSeries, esc = K.esc, countryStats = K.countryStats, isRankableCountry = K.isRankableCountry, parseColor = K.parseColor, rampFrom = K.rampFrom, clearHl = K.clearHl, clearChoro = K.clearChoro, clearPolyHl = K.clearPolyHl, clearLineHl = K.clearLineHl, ensureChoroLayer = K.ensureChoroLayer, GE = K.GE, _choroFillExpr = K._choroFillExpr, nm = K.nm, note = K.note;
      { /* (#R75) vision §13 — a NEW evaluation layer composed
          from weighted real indicators (bundled metrics and/or World-Bank codes), not a canned choropleth. */
          await ensureData();
          const comps=Array.isArray(a.components)?a.components.slice(0,8):[];
          if(comps.length<2) return R(false, warn(L('A custom score needs at least two indicators (components)','カスタム評価には指標が2つ以上必要です','Mindestens zwei Indikatoren nötig','Нужно минимум два показателя','Se necesitan al menos dos indicadores')));
          const resolved=[],missingC=[];
          for(const c of comps){ const w=(c&&c.weight!=null&&isFinite(+c.weight))?Math.max(0.1,Math.min(10,+c.weight)):1;
            const ser=await _seriesFor(c); if(!ser){ missingC.push(String((c&&(c.label||c.metric||c.wb))||'?').slice(0,40)); continue; }
            resolved.push({ser,norm:_normSeries(ser),w,inv:!!(c&&(c.invert||c.lowerIsBetter))}); }
          if(resolved.length<2) return R(false, warn(L('Not enough usable indicators','利用可能な指標が足りません','Zu wenige nutzbare Indikatoren','Недостаточно доступных показателей','Indicadores utilizables insuficientes')+(missingC.length?(' — '+L('unavailable','取得不可','nicht verfügbar','недоступно','no disponibles')+': '+esc(missingC.join(', '))):'')));
          const totW=resolved.reduce((s2,r2)=>s2+r2.w,0);
          const score={}; let excl=0;
          for(const cd in countryStats){ if(!isRankableCountry(countryStats[cd])) continue; let sw=0,sv=0;   /* (#R775) same set as every other ranking */
            resolved.forEach(r2=>{ const nv=r2.norm[cd]; if(nv==null) return; sv+=r2.w*(r2.inv?(1-nv):nv); sw+=r2.w; });
            if(sw>=totW*0.6) score[cd]=sv/sw; else if(sw>0) excl++; }
          const codes=Object.keys(score);
          if(codes.length<10) return R(false, warn(L('Too few countries have enough data for this combination','この組み合わせで十分なデータを持つ国が少なすぎます','Zu wenige Länder mit ausreichenden Daten','Слишком мало стран с данными','Muy pocos países con datos suficientes')));
          let cW=''; if(a.color!=null&&String(a.color).trim()!==''){ const pc=parseColor(a.color); if(pc) K._choroRamp=rampFrom(pc); else cW=warn(L('Unknown color','色を認識できません','Unbekannte Farbe','Неизвестный цвет','Color desconocido')+': '+esc(a.color)); }
          clearHl(); clearChoro(); clearPolyHl(); clearLineHl();
          if(!ensureChoroLayer()) return R(false, warn(L('Could not draw the map shading','地図の濃淡を描けませんでした','Karteneinfärbung fehlgeschlagen','Не удалось окрасить карту','No se pudo sombrear el mapa')));
          try{ GE().layers.setPaint('nlq-choro','fill-color',_choroFillExpr(K._choroRamp)); }catch(_){}
          let lo=1e9,hi=-1e9; codes.forEach(cd=>{ lo=Math.min(lo,score[cd]); hi=Math.max(hi,score[cd]); }); const span=(hi-lo)||1e-9;
          codes.forEach(cd=>{ const nv=(score[cd]-lo)/span; K._choroState[String(cd)]=nv; try{ GE().layers.setFeatureState({source:'nlq-src',id:String(cd)},{choroV:nv}); }catch(_){} });
          K._choroMetric='__custom'; K._customScoreName=String(a.name||'').trim().slice(0,60)||L('Custom score','カスタム評価','Eigener Score','Пользовательская оценка','Puntuación propia');
          try{ GE().camera.flyTo({zoom:Math.min(GE().camera.getZoom(),2.3),duration:600}); }catch(_){}
          const rank=codes.map(cd=>({cd,v:score[cd]})).sort((x,y)=>y.v-x.v);
          const nTop=Math.max(3,Math.min(15,(+a.n||10)));
          const pct=v=>Math.round((v-lo)/span*100);
          let html='<div style="font-weight:600;margin:2px 0 5px;">'+icon('calculator')+' '+esc(K._customScoreName)+' — '+L('custom evaluation layer','カスタム評価レイヤー','eigene Bewertungsebene','пользовательский слой оценки','capa de evaluación propia')+'</div>';
          html+='<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">'+resolved.map(r2=>esc(r2.ser.label)+(r2.w!==1?(' ×'+r2.w):'')+(r2.inv?' ↓':'')).join(' · ')+'</div>';
          html+='<div style="height:12px;border-radius:6px;background:linear-gradient(90deg,'+K._choroRamp.join(',')+');margin:4px 0;"></div>';
          html+='<ol style="margin:2px 0 0;padding-left:22px;line-height:1.6;font-size:12px;">'+rank.slice(0,nTop).map(r2=>'<li>'+esc(nm(countryStats[r2.cd]))+' <span style="color:var(--text-muted);">'+pct(r2.v)+'</span></li>').join('')+'</ol>';
          const worst=rank.slice(-3).reverse().map(r2=>esc(nm(countryStats[r2.cd]))+' ('+pct(r2.v)+')').join(', ');
          html+='<div style="font-size:10.5px;color:var(--text-muted);margin-top:5px;">'+L('Lowest','最下位','Niedrigste','Худшие','Más bajos')+': '+worst+'</div>';
          /* honesty block (vision §15): method, coverage, exclusions, unavailable components */
          html+='<div style="font-size:10px;color:var(--text-muted);margin-top:6px;line-height:1.5;">'
            +L('Method: each indicator normalized 0–1 (5th–95th percentile clamp'+(resolved.some(r2=>r2.ser.log)?', log scale where marked':'')+'), weighted mean; countries with under 60% of the total weight covered are excluded','算出: 各指標を0–1に正規化（5–95パーセンタイルでクランプ'+(resolved.some(r2=>r2.ser.log)?'・対数指標は対数変換':'')+'）し加重平均。総重みの60%未満しかデータの無い国は除外','Methode: Indikatoren 0–1 normalisiert (5.–95. Perzentil), gewichtetes Mittel; Länder unter 60% Abdeckung ausgeschlossen','Метод: нормализация 0–1 (5–95 перцентиль), взвешенное среднее; страны с покрытием <60% исключены','Método: normalización 0–1 (percentil 5–95), media ponderada; países con <60% de cobertura excluidos')
            +' · '+codes.length+' '+L('countries scored','か国を評価','Länder bewertet','стран оценено','países evaluados')+(excl?(' · '+excl+' '+L('excluded for missing data','か国はデータ不足で除外','wegen Datenlücken ausgeschlossen','исключено из-за пропусков','excluidos por falta de datos')):'')
            +(missingC.length?('<br>'+icon('warning')+' '+L('Unavailable components skipped','取得できず除外した指標','Nicht verfügbare Komponenten übersprungen','Недоступные компоненты пропущены','Componentes no disponibles omitidos')+': '+esc(missingC.join(', '))):'')+'</div>';
          /* (#R104) the "会話で調整できます: 「家賃を重視して」…" hint line was REMOVED per request ("この説明はいらない"). */
          return R(true, note(html)+cW); }
    },
  },
  {
    row: ['map.volcanoFilter',          'volcanoFilter',  'volcanoMode,volcanoTime',                                     'map',     'paint',   'map.volcano',            'map',                 'session', 'none',   '',         'volcanoIntel'],
    doc: [
      { in: 'volcanoes', at: 20, text: '{"type":"volcanoFilter","mode"?:"recency"|"vei"|"status"|"people","spoken"?:bool,"elevated"?:bool,"big"?:bool,"recent"?:bool,"clear"?:bool,"time"?:bool,"year"?:num} = change WHICH volcanoes are drawn and what their colour answers. "mode" is the colour question: recency = when it last erupted, vei = the largest explosion it has produced, status = what an observatory says today, people = how many live within 30 km. The filters AND together and narrow the catalog: "spoken" = only volcanoes some observatory publishes a current level for, "elevated" = only those above normal, "big" = only those that have produced VEI 4 or more, "recent" = only those that have erupted since 1950, "clear" = drop every filter. "time":true puts the ERUPTION RECORD on the master clock — the map then shows only the volcanoes GVP records as erupting in the year the map is set to, and "year" moves that clock (the clock reaches back to AD 1, and GVP’s record runs back further still — those earlier eruptions stay readable in the volcano’s card). Use for 「今活動している火山だけ表示」「VEI4以上の火山」「1883年に噴火していた火山」, "show only erupting volcanoes", "colour volcanoes by explosivity", "which volcanoes were erupting in 1980". THE GREY DOTS ARE NOT CALM VOLCANOES — in "status" they are volcanoes no observatory publishes a readable level for, and the answer must never call them quiet.\n' },
    ],
    schema: () => ({ type: 'object', properties: { mode: one('recency', 'vei', 'status', 'people'), time: bool(), year: int(), spoken: bool(), elevated: bool(), big: bool(), recent: bool(), clear: bool() }, anyOf: [{ required: ['mode'] }, { required: ['time'] }, { required: ['year'] }, { required: ['spoken'] }, { required: ['elevated'] }, { required: ['big'] }, { required: ['recent'] }, { required: ['clear'] }] }),
    /* the same case as `volcanoFilter` — shared with a spelling that fell through to it */
    run: volcanoFilterRun,
  },
  {
    row: ['map.heritageFilter',         'heritageFilter', '',                                                            'map',     'paint',   'map.heritage',           'map',                 'session', 'none',   '',         ''],
    doc: [
      { in: 'world-heritage', at: 20, text: '{"type":"heritageFilter","categories"?:[str],"danger"?:bool,"clear"?:bool} = change WHICH properties are drawn. "categories" NAMES THE ONES TO KEEP and the rest go off — the vocabulary is UNESCO’s own (Cultural, Natural, Mixed) and travels in the data file, so a name it does not hold is answered with the list of names it does. "danger":true narrows to the List of World Heritage in Danger; "clear" drops every narrowing. Use for 「自然遺産だけ表示」「危機遺産は？」, "show only natural sites", "which World Heritage sites are in danger". WHETHER A PROPERTY IS IN DANGER COMES FROM WIKIDATA, NOT FROM UNESCO’S OWN FEED — that feed’s danger column has not been maintained since 2014 and is empty for Palmyra, Sana’a, Odesa and Kyiv. Say the source when the answer turns on it. THREE INSCRIBED PROPERTIES PUBLISH NO COORDINATE AT ALL and cannot be drawn; the action says so rather than reporting that it could not find them. Never invent a location for one.\n' },
    ],
    schema: () => ({ type: 'object', properties: { categories: { type: 'array', items: str() }, category: str(), danger: bool(), clear: bool() }, anyOf: [{ required: ['categories'] }, { required: ['category'] }, { required: ['danger'] }, { required: ['clear'] }] }),
    /* the same case as `heritageFilter` — shared with a spelling that fell through to it */
    run: heritageFilterRun,
  },
  /* (#R585) MEASURED radiation. Two rows, and they are not one row: switching the layer on is a
     claim about the MAP, while «what are the instruments around Zaporizhzhia reading» is a claim
     about DATA and must be answerable without the reader having the layer on. The same split
     volcano needed for the same reason.
     ⚠ NEITHER OF THESE IS THE PLUME SIMULATION. `sim.radiation` models where material would go;
     these report what was measured. Keeping them distinct in the registry is what stops the
     planner answering a question about a real reading with a model — docs/RADIATION.md. */
  {
    row: ['map.radiation',              'radiationObserved','radiationLayer,doseRate,gammaDoseRate',                     'map',     'paint',   'map.radiation',          'map',                 'session', 'none',   '',         'radiationLayer'],
    /* (#R585) 実測放射線。Switching the layer takes nothing — `on` defaults to true, which is what
       「放射線量を見せて」 means. The reading-around-a-point call REQUIRES a real coordinate and
       takes no place name: a dose rate quoted for the wrong town is worse than no answer, so
       resolving the name is the caller's job and this schema refuses to paper over it. `km`
       defaults in the code to 150 and is capped here at the width of a national network. */
    doc: [
      { in: 'measured-radiation', at: 10, text: '{"type":"radiationObserved","on"?:bool} = switch the measured ambient gamma dose-rate layer on (default) or off (use for 「実測の空間線量を地図に出して」「放射線量の観測値を見せて」, "show the measured radiation levels"). Every station is normalised to nSv/h server-side so one legend covers every country, and each dot carries the quantity its own network named (H*(10), ambient gamma, air kerma) rather than being silently treated as identical. ' },
    ],
    schema: () => ({ type: 'object', properties: { on: bool() } }),
    /* the same case as `radiationNear` — this spelling fell through to it in the dispatch switch */
    run: radiationNearRun,
  },
  /* (#R650) WHO Disease Outbreak News as an event layer — js/outbreaks.js. It PAINTS (one
     circle per country the window holds items for) and it EXPLAINS (the counts, the leading
     countries, and the items themselves in `meta.items`), which is why column 7 carries both.
     ⚠ COLUMN 11 IS EMPTY BECAUSE THE MODULE IS EAGER, not because it was forgotten: the layer
     row has to exist before anyone can ask for it, so js/outbreaks.js rides the shell the way
     js/industry-web.js and js/ocean-currents.js do. The 3,195-item archive it reads is the part
     that is deferred — nothing is fetched until the layer is switched on. */
  {
    row: ['map.outbreaks',              'outbreaks',      'diseaseOutbreaks,outbreakLayer,epidemics,whoOutbreaks,diseaseMap', 'map', 'paint', 'map.outbreaks',          'map,explanation',     'session', 'none',   '',         ''],
    /* (#R650) EVERY ARGUMENT IS OPTIONAL, and that is the shape of the feature rather than a
       relaxation of rule (3): 「感染症のアウトブレイクを見せて」 is a complete request, and the
       layer answers it with WHO's most recent year. The arguments only NARROW it. */
    doc: [
      { in: 'map.outbreaks', text: 'DISEASE OUTBREAKS, FROM WHO ITSELF (every Disease Outbreak News item WHO has published since 1996 — 3,195 of them — placed on the countries WHO tagged them with): {"type":"outbreaks","action"?:"open"|"close","pathogen"?:str,"country"?:str,"days"?:int,"all"?:bool}. Each circle is ONE COUNTRY and its size is HOW MANY WHO notes fall inside the window ending at the map’s clock; its colour is how recent the newest of them is. "days" sets that window (90 / 365 / 1826 are the presets; "all":true is everything WHO has ever published up to that date), and MOVING THE MAP’S CLOCK moves the window, so this is how to show what was breaking out in any past year. "pathogen" narrows to one disease AS WHO NAMES IT (「Cholera」「Ebola disease caused by Bundibugyo virus」「Mpox」) and is matched against the names actually present — a name that matches nothing is REFUSED with the list of what is there, never quietly ignored. "country" selects one country and opens its items. Use for 「感染症のアウトブレイクを見せて」「コレラの発生状況」「2014年の流行は？」, "show disease outbreaks", "where is cholera right now", "what was WHO reporting in 2003". THE RESULT’S `meta.items` CARRIES THE ITEMS THEMSELVES — pathogen, countries, the outbreak start date, WHO’s publication date, the case and death counts, and a link to each WHO page — so answer from those rather than from the count alone, and cite the WHO item you used. THE OUTBREAK START DATE IS OFTEN ABSENT AND THE PUBLICATION DATE IS NOT A SUBSTITUTE: WHO records a start for about 88 % of items since 2019 and almost none before it, so say «WHO published this on…» unless `outbreakStart` is actually there. CASE AND DEATH COUNTS ARE NOT PART OF WHO’S STRUCTURED DATA — they exist only inside the prose of each item and are read out of it separately, so `cases`/`deaths` are null when that has not been done, and `countsKnown` says which. NULL IS NOT ZERO: never report an outbreak as having no deaths because the number is missing. 179 ITEMS ARE NOT ABOUT ONE COUNTRY («Yellow fever – Global», «Cholera – Multi-country») and are DELIBERATELY NOT ON THE MAP; `meta.unplaced` counts them and the panel lists them. Do not describe them as absent from the data, and never place them at a region’s centre. A Disease Outbreak News item is an EPISODE OF REPORTING, not the outbreak itself: several items about one epidemic are several circles’ worth of notes, and the absence of a note means WHO did not publish one, not that nothing was happening. When this carries part of your answer, declare answer_mode "map" or "mixed".\n' },
    ],
    chips: 'map.outbreaks',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', properties: { action: one('open', 'close'), pathogen: str(), country: str(), days: int(), all: bool() } }),
    async run(a, dctx, K) { const R = K.R;
      { const _r=await window.IntMapOutbreaks.run(a); return R(_r.ok,_r.html,_r.meta); }   /* (#R650) map.outbreaks — js/outbreaks.js owns the body for the same reason shakemap does: this file has no line left */
    },
  },
];

/* ══ (map-next) map.myMap — js/my-map.js through its published controller ═══════════════════════════════
   Every result that changes the map carries `meta.want` (js/atlas-capabilities.js `myMap`): the state it set out to
   reach, so a feature that did not land is not called done. */
const MM_COLORS = { red: 0, orange: 1, yellow: 2, green: 3, blue: 4, purple: 5, '赤': 0, 'オレンジ': 1, '橙': 1, '黄': 2, '緑': 3, '青': 4, '紫': 5 };
async function myMapRun(a, K) {
  const R = K.R, L = K.L, warn = K.warn, note = K.note, esc = K.esc;
  let M = null; try { await window.IntMapLazy.need('myMap'); M = window.IntMapMyMap; } catch (_) { M = null; }
  if (!M || typeof M.state !== 'function') return R(false, warn(esc(L('My map could not be loaded', 'マイマップを読み込めませんでした'))));
  const act = String(a.action || (a.kind || a.points || a.place || a.places ? 'add' : 'open')).trim();
  const why = (r) => ({ 'received': L('a shared map is read-only — keep it first', '共有された地図は読み取り専用です（先に保存してください）'), 'no-feature': L('there is no such item', 'その項目はありません'),
    'empty': L('the map has nothing on it yet', '地図にまだ何もありません'), 'too-few-vertices': L('not enough points', '点が足りません'), 'kind-unknown': L('kind must be pin, line or area', 'kind は pin・line・area のいずれかです'),
    'nothing-to-collect': L('there are no pins or shapes on the map to move', '移せるピンや図形が地図上にありません'), 'nothing-received': L('no shared map is on show', '共有された地図は表示されていません'),
    'gis-unavailable': L('the analysis module did not load', '分析モジュールを読み込めませんでした'), 'no-map': L('there is no such map', 'その地図はありません') }[r && r.reason] || String((r && r.reason) || ''));
  const fail = (head, r) => R(false, warn(esc(head) + ' — ' + esc(why(r))));
  const colorOf = (c) => (c == null ? null : (String(c).toLowerCase() in MM_COLORS ? MM_COLORS[String(c).toLowerCase()] : c));
  const listHtml = () => {
    const s = M.state(); const m = s.shown === 'received' ? s.received : s.map;
    if (!m) return '<div>' + esc(L('No map yet', 'まだ地図がありません')) + '</div>';
    const unit = (f) => (f.lengthKm != null ? ' · ' + f.lengthKm.toFixed(2) + ' km' : f.areaKm2 != null ? ' · ' + f.areaKm2.toFixed(3) + ' km²' : f.at ? ' · ' + f.at[1].toFixed(5) + ', ' + f.at[0].toFixed(5) : '');
    return '<div style="font-weight:600;margin:2px 0;">' + esc(m.title || L('Untitled map', '無題の地図')) + ' (' + s.features.length + ')</div><ol style="margin:4px 0 4px 18px;padding:0;">'
      + s.features.map((f) => '<li>' + esc(f.name || f.kind) + esc(unit(f)) + (f.note ? ' — ' + esc(f.note) : '') + ' <span style="opacity:.6">[' + esc(f.id) + ']</span></li>').join('') + '</ol>';
  };
  if (act === 'open') { M.open(); return R(true, note('✓ ' + esc(L('My map opened', 'マイマップを開きました'))) + listHtml()); }
  if (act === 'list') return R(true, listHtml(), { myMap: M.state() });
  if (act === 'add') {
    const kind = String(a.kind || (a.places || (a.points && a.points.length > 1) ? 'line' : 'pin'));
    const pts = Array.isArray(a.points) ? a.points.filter((p) => Array.isArray(p) && isFinite(+p[0]) && isFinite(+p[1])).map((p) => [+p[0], +p[1]]) : [];
    const unresolved = [];
    if (!pts.length) {
      const names = a.places ? a.places : (a.place ? [a.place] : []);
      for (const pn of names) { const g = await K.geocode(String(pn)); if (g) pts.push([g.lng, g.lat]); else unresolved.push(String(pn)); }
    }
    /* a name that did not resolve is not dropped from a line in silence — the line would join the wrong places */
    if (unresolved.length) return R(false, warn(esc(L('Could not find', '見つかりませんでした')) + ': ' + esc(unresolved.join(', '))));
    const r = M.add({ kind, coords: pts, name: a.name != null ? a.name : (a.place || ''), note: a.note, color: colorOf(a.color) });
    if (!r.ok) return fail(L('Could not add to my map', 'マイマップに追加できませんでした'), r);
    try { M.zoomTo(r.id); } catch (_) { }
    return R(true, note('✓ ' + esc(L('Added to my map', 'マイマップに追加しました'))) + listHtml(), { want: { shown: 'own', has: [r.id] }, objectIds: ['mm_' + r.id] });
  }
  if (act === 'edit') {
    const o = {}; if (a.name != null) o.name = a.name; if (a.note != null) o.note = a.note; if (a.color != null) o.color = colorOf(a.color);
    const r = M.edit(String(a.id || ''), o); if (!r.ok) return fail(L('Could not edit', '編集できませんでした'), r);
    const f = M.state().features.find((x) => x.id === r.id) || {}; const w = {}; Object.keys(o).forEach((k) => { w[k] = f[k]; });
    return R(true, note('✓ ' + esc(L('My map item updated', 'マイマップの項目を更新しました'))) + listHtml(), { want: { features: { [r.id]: w } } });
  }
  if (act === 'remove') {
    const id = String(a.id || ''); const r = M.remove(id); if (!r.ok) return fail(L('Could not delete', '削除できませんでした'), r);
    return R(true, note('✓ ' + esc(L('Deleted from my map', 'マイマップから削除しました'))) + listHtml(), { want: { lacks: [id] } });
  }
  if (act === 'title') {
    M.setTitle(a.title != null ? a.title : a.name); const s = M.state();
    return R(true, note('✓ ' + esc(L('Map named', '地図の題を付けました'))), { want: { title: s.map ? s.map.title : '' } });
  }
  if (act === 'show') {
    if (!M.state().map) return fail(L('Nothing to show', '表示するものがありません'), { reason: 'empty' });
    M.show(); return R(true, note('✓ ' + esc(L('My map is on the map', 'マイマップを表示しました'))), { want: { shown: 'own' } });
  }
  if (act === 'hide') { M.hide(); return R(true, note('✓ ' + esc(L('My map hidden (nothing deleted)', 'マイマップを隠しました（削除はしていません）'))), { want: { shown: null } }); }
  if (act === 'new') { const r = M.newMap(a.title || ''); return R(true, note('✓ ' + esc(L('New map started', '新しい地図を始めました'))), { want: { mapId: r.id, shown: 'own' } }); }
  if (act === 'collect') {
    const r = M.collect(); if (!r.ok) return fail(L('Nothing moved', '移せませんでした'), r);
    return R(true, note('✓ ' + esc(L('Moved into my map: ', 'マイマップへ移しました: ')) + r.moved) + listHtml(), { want: { shown: 'own', atLeast: r.moved } });
  }
  if (act === 'keep') {
    const r = M.keepReceived(); if (!r.ok) return fail(L('Nothing to keep', '保存するものがありません'), r);
    return R(true, note('✓ ' + esc(L('Kept as your map', '自分の地図として保存しました'))), { want: { shown: 'own', mapId: r.id } });
  }
  if (act === 'draw') {
    M.open(); const r = M.startDraw(String(a.kind || 'pin')); if (!r.ok) return fail(L('Could not start drawing', '描き始められませんでした'), r);
    return R(true, note('✓ ' + esc(L('The reader can now click the map to draw: ', '地図をクリックして描けます: ')) + esc(r.kind)));
  }
  if (act === 'link') {
    const r = M.link(); if (!r.ok) return fail(L('No link', 'リンクを作れません'), r);
    return R(true, note('✓ ' + esc(L('Link to this map', 'この地図のリンク'))) + ' · ' + r.count + ' · ' + (r.bytes / 1024).toFixed(1) + ' KB<div style="font-size:12px;word-break:break-all;margin:4px 0;"><a href="' + esc(IntMapSafe.url(r.url)) + '">' + esc(r.url) + '</a></div>');
  }
  if (act === 'export') {
    const r = await M.exportFile(a.format || 'geojson'); if (!r.ok) return fail(L('Could not export', '書き出せませんでした'), r);
    return R(true, note('✓ ' + esc(L('Saved ', '保存しました: ')) + esc(r.filename)) + ' · ' + r.features);
  }
  if (act === 'analyze') {
    const r = await M.analyze(); if (!r.ok) return fail(L('Could not hand it to analysis', '分析に渡せませんでした'), r);
    return R(true, note('✓ ' + esc(L('Added to Data and analysis as dataset ', 'データと分析に追加しました: ')) + esc(r.datasetId)) + ' (' + r.features + ') — ' + esc(L('run the gis capability on this id', 'この id で gis を実行できます')), { datasetId: r.datasetId });
  }
  return R(false, warn(esc(L('Unknown action', '不明な操作')) + ' «' + esc(act) + '»'));
}
