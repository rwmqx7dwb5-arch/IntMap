/* ============================================================================
 *  IntMap · Atlas capabilities — the `data.*` namespace   (js/atlas-cap-data.js)
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
import { str, num, int, one, list, obj, lat, lng, loose } from './atlas-caps.js';
import { weatherFacts } from './atlas-result-facts.js';

export default [
  {
    row: ['data.weather',               'weather',        '',                                                            'data',    'panel',   'panel.weather',          'panel,explanation',   'read',    'none',   'place',    ''],
    schema: () => ({ type: 'object', properties: { place: str() }, required: ['place'] }),
    async run(a, dctx, K) { const geocode = K.geocode, GE = K.GE, L = K.L, R = K.R, note = K.note, esc = K.esc, warn = K.warn;
      { const ll=await geocode(a.place); if(ll){ let ok=false; try{ if(window.IntMapWeather&&window.IntMapWeather.open){ window.IntMapWeather.open({lng:ll.lng,lat:ll.lat}); ok=true; } }catch(_){} GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),5)});
          let facts=''; try{ const WX=window.IntMapWx, WP=window.IntMapWeather; const j=WX&&WX.point?await WX.point(ll.lat,ll.lng,{days:5,uv:false,gusts:true,ttl:300000}):null; facts=weatherFacts(j, WP&&WP.describe, L); }catch(_){}   /* the card's own numbers on the result (js/atlas-result-facts.js) — it used to say only 「🌤 大阪市」 */
          return R(ok, ok?note('🌤 '+esc(ll.name||a.place)+esc(facts)):warn('⚠')); } return R(false, warn('⚠ '+esc(a.place||''))); }
    },
  },
  /* ⚠⚠ (#R495) THE JOIN. Every row above answers about ONE dataset — rank a metric, read a point,
     sum an area, score countries — and 「人口100万人以上で、年間降水量500mm未満、海から200km以上、
     過去30日でM5以上の地震があった都市」 is a question about four at once. `read` and `none`: it
     measures and pins, it changes no setting the reader has to undo. */
  {
    row: ['data.query',                 'query',          'crossQuery,dataQuery',                                        'data',    'queryRows','map.object',           'map,explanation',     'session','none',   '',         'atlasQuery', 'external'],
    /* (#R495) the cross-dataset query. `from` names a table, `where` a list of {col, op, value}
       over that table's COLUMNS, `near` a spatial join with its own conditions. Deliberately not
       an `enum`: js/atlas-query.js's registry is what decides which tables and columns exist, and
       a closed list here would refuse a dataset the day it is registered (rule (2) of this file). */
    /* ⚠ (#R735) `spatial` WAS MISSING FROM THIS LINE AND IMPLEMENTED EVERYWHERE ELSE. #R732 built
       the clause that asks by SHAPE — 「この道路から 500 m 以内」「この区域の中」 — wired it into
       js/atlas-query.js's evaluator, and wrote it into the catalogue prose the model reads. The one
       place it was not written is the argument schema, which is the list of properties the model is
       actually shown. A capability the model is not told it can pass is a capability it does not
       use: #R733 measured the same shape costing eight steps of a turn. It ran when it arrived
       because nothing here uses `additionalProperties:false` — so the defect was invisible to every
       test and to the model at the same time. */
    schema: () => ({ type: 'object', properties: { from: str(), where: list(obj()), near: list(obj()), spatial: list(obj()), in: obj(), show: list(str()), order: obj(), limit: int(1, 200) }, required: ['from'] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, ensureData = K.ensureData, _mirrorLang = K._mirrorLang, countryStats = K.countryStats, _fillMetric = K._fillMetric, metSpec = K.metSpec, fmtVal = K.fmtVal, nm = K.nm, _fetchJSON = K._fetchJSON, overpassPOIs = K.overpassPOIs, wikidataPOIs = K.wikidataPOIs, resolveCountrySync = K.resolveCountrySync, _nomExtent = K._nomExtent, _bboxOK = K._bboxOK;
      { await window.IntMapLazy.need('atlasQuery'); const _Q=window.IntMapQuery; if(!_Q) return R(false, warn('⚠ '+L('The query engine could not be loaded.','クエリエンジンを読み込めませんでした。','Die Abfrage-Engine konnte nicht geladen werden.','Не удалось загрузить движок запросов.','No se pudo cargar el motor de consultas.'))); await ensureData(); _Q.bind({lang:()=>_mirrorLang(), countryStats:()=>countryStats, ensureData, fillMetric:_fillMetric, metricSpec:metSpec, fmtVal, countryName:nm, fetchJSON:_fetchJSON, overpassPOIs, wikidataPOIs, resolveArea:async n2=>{ const c2=resolveCountrySync(n2); let e2=null; try{ e2=await _nomExtent((c2&&c2.name)||n2); }catch(_){} return {osmRel:(e2&&e2.osmType==='relation')?e2.osmId:null, iso3:(c2&&c2.code)||null, box:(e2&&e2.box&&_bboxOK(e2.box))?e2.box:null}; }}); const _qr=await _Q.answer(a,{}); /* ⚠⚠ (#R620) THE RESULT DECLARES WHAT IT RESOLVED. Without a `resultKey`, js/atlas-turn-results.js identifies this operation by its ARGUMENTS, and `show` is an argument — so asking the same question twice while asking for one more column printed the same rows in two tables. The engine builds the key from the table, conditions, scope, joins, ordering and limit, which is exactly «what it did» and not «how it rendered». */ const _qx={}; if(_qr.objectIds&&_qr.objectIds.length) _qx.objectIds=_qr.objectIds; if(_qr.resultKey) _qx.meta={resultKey:_qr.resultKey}; return R(_qr.ok, _qr.html, Object.keys(_qx).length?_qx:null); }   /* ⚠⚠ (#R495) THE CROSS-DATASET QUERY — the action every multi-condition question needed and none of the 126 above could serve. The engine, the tables, the columns and the honesty rules are js/atlas-query.js; this line is the door and the argument binding, because the file it sits in may not grow (tests/atlas-capabilities-checks.test.mjs (#R318) ⓑ). */
    },
  },
  /* ⚠⚠ (#R743) THE OTHER HALF OF THE LINE ABOVE. `data.query` READS the datasets a reader has
     imported; nothing could ask for one to be MADE. So every spatial analysis Atlas could
     perform was one somebody had already built as a feature of the app, and a request like
     「施設から5km圏を作り、統合し、その範囲の人口を集計して地図に出して」 had no door at all.
     ⚠ ONE ROW, NOT ONE PER OP. js/gis-ops.js declares its ops — inputs, accepted geometry,
     payload kind, parameters, types — and js/gis-atlas.js hands the planner THAT declaration
     rather than a copy of it. A row per op here would be the hand-written list this project
     keeps re-learning not to write: the op added to DECL tomorrow would answer run() and be
     invisible to the planner. `writes` is 'map.object' only because a step may be asked to draw
     its result; the analysis itself changes no setting the reader has to undo. */
  {
    row: ['data.gis',                   'gis',            'gisRun,spatialOp,runGisOp',                                   'data',    'none',    '',                       'explanation',         'read',    'none',   '',         'gisCore'],
    /* (#R743) ⚠ `op` AND `params` ARE DELIBERATELY UNENUMERATED HERE. The vocabulary is
       js/gis-ops.js's DECL, which this file cannot read at planning time — and a copy of it here
       would be a second list to keep in step, which is the defect this round removed from the
       union op and from the panel before it. The refusals carry the vocabulary instead:
       `op-unknown` answers with every op id, and a refused step answers with that op's whole
       declaration, so one wrong call becomes one corrected call rather than a search. */
    /* ⚠⚠ (#R759) `acquire` IS THE REQUEST, AND `op` IS NO LONGER REQUIRED. js/gis-sources.js states
       an acquisition contract — window, time, attribute conditions, projection, page — and
       js/gis-atlas.js passed NOTHING from it, so every plan started from whatever the renderer
       happened to hold for wherever the camera happened to be. Declaring the field is what makes it
       reachable at all (the measured half of [[intmap-prompt-that-hid-the-tools-in-hand]]).
       ⚠ ITS KEYS ARE UNENUMERATED FOR THE REASON `params` IS, one line down: js/gis-layers.js
       acquireFields() is the vocabulary, this file cannot read it at planning time, and a copy here
       would be the second list that drifts. A key it does not accept is refused BY NAME with the
       whole set. ⚠ AND DROPPING `op` FROM `required` IS THE ACQUISITION STEP ITSELF — inputs with
       no op means 「取ってくるところまで」, which had no expression before and is the first move of
       any analysis that wants to know whether its window was answered. */
    schema: () => ({ type: 'object', properties: { op: str(), inputs: list(str()), params: obj(), title: str(), acquire: obj(), kind: one('vector', 'raster'), sample: obj() }, required: ['inputs'] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L;
      { await window.IntMapLazy.need('gisCore'); const _G=window.IntMapGis&&window.IntMapGis.atlas; if(!_G) return R(false, warn('⚠ '+L('The GIS engine could not be loaded.','GIS エンジンを読み込めませんでした。','Die GIS-Engine konnte nicht geladen werden.','Не удалось загрузить GIS-движок.','No se pudo cargar el motor GIS.'))); const _gr=await _G.run(a); return _gr.ok ? R(true,_gr.html,{meta:{gis:{op:_gr.op,dataset:_gr.dataset.id,count:_gr.dataset.count,drawn:!!_gr.drawn}}}) : R(false, warn(_gr.html)); }
    },
  },
  {
    row: ['data.rank',                  'rank',           '',                                                            'data',    'paint',   'map.choropleth',         'map,explanation',     'session', 'none',   'metric',   ''],
    schema: () => ({ type: 'object', properties: { metric: str(), order: one('top', 'bottom'), n: int(1, 40) }, required: ['metric'] }),
      /* ⚠ (#R740) THE KEY IS RESOLVED BEFORE ANYTHING USES IT. `_fillMetric(a.metric)` was handed
         whatever the planner typed, so 「life expectancy」 fetched nothing and the rank then said
         the metric was unavailable — a real metric reported as missing data. */
    async run(a, dctx, K) { const ensureData = K.ensureData, metSpec = K.metSpec, unknownMetric = K.unknownMetric, _fillMetric = K._fillMetric, clampN = K.clampN, rank = K.rank, L = K.L, lx = K.lx, R = K.R, listHtml = K.listHtml;
      { await ensureData(); const _sp=metSpec(a.metric); if(!_sp) return unknownMetric(a.metric);
          try{ await _fillMetric(_sp.key); }catch(_){}   /* (#R105) load lazy WB metrics (lifeExp/internet/tfr) before ranking so it never falsely reports "metric unavailable" */
          const n=clampN(a.n); const list=rank(_sp.key,a.order==='bottom'?'bottom':'top',n); const t=(a.order==='bottom'?L('Lowest ','下位 ','Niedrigste ','Минимум ','Menor '):L('Top ','上位 ','Top ','Топ ','Top '))+n+' · '+lx(_sp.m.label); return R(!!(list&&list.length), listHtml(t,list,_sp.key)); }
    },
  },
  {
    row: ['data.ratio',                 'ratio',          '',                                                            'data',    'paint',   'map.choropleth',         'map,explanation',     'session', 'none',   'metric',   ''],
    schema: () => ({ type: 'object', properties: { metricA: str(), metricB: str(), order: one('top', 'bottom'), n: int(1, 40) }, required: ['metricA', 'metricB'] }),
    async run(a, dctx, K) { const ensureData = K.ensureData, metSpec = K.metSpec, unknownMetric = K.unknownMetric, _fillMetric = K._fillMetric, clampN = K.clampN, ratio = K.ratio, lx = K.lx, R = K.R, listHtml = K.listHtml;
      { await ensureData(); const _a=metSpec(a.metricA),_b=metSpec(a.metricB); if(!_a) return unknownMetric(a.metricA); if(!_b) return unknownMetric(a.metricB);
          try{ await _fillMetric(_a.key); await _fillMetric(_b.key); }catch(_){}
          const n=clampN(a.n); const list=ratio(_a.key,_b.key,a.order==='bottom'?'bottom':'top',n); const t=lx(_a.m.label)+' / '+lx(_b.m.label); return R(!!(list&&list.length), listHtml(t,(list||[]).map(r=>({code:r.code,name:r.name,val:r.val})),'_ratio')); }
    },
  },
  {
    row: ['data.relate',                'relate',         '',                                                            'data',    'paint',   'map.choropleth',         'map,explanation',     'session', 'none',   'metric',   ''],
    schema: () => ({ type: 'object', properties: { metricY: str(), metricX: str(), find: one('low', 'high'), n: int(1, 40) }, required: ['metricY', 'metricX'] }),
    async run(a, dctx, K) { const ensureData = K.ensureData, metSpec = K.metSpec, unknownMetric = K.unknownMetric, _fillMetric = K._fillMetric, clampN = K.clampN, relate = K.relate, L = K.L, lx = K.lx, R = K.R, listHtml = K.listHtml;
      { await ensureData(); const _y=metSpec(a.metricY),_x=metSpec(a.metricX); if(!_y) return unknownMetric(a.metricY); if(!_x) return unknownMetric(a.metricX);
          try{ await _fillMetric(_y.key); await _fillMetric(_x.key); }catch(_){}
          const n=clampN(a.n); const list=relate(_y.key,_x.key,a.find==='high'?'high':'low',n);
          const t=(a.find==='high'?L('High ','高い ','Hoch ','Высокий ','Alto '):L('Low ','低い ','Niedrig ','Низкий ','Bajo '))+lx(_y.m.label)+' '+L('relative to','に対する','relativ zu','относительно','en relación con')+' '+lx(_x.m.label);
          return R(!!(list&&list.length), listHtml(t,list,_y.key)); }
    },
  },
  {
    row: ['data.countryCard',           'selectCountry',  'country',                                                     'data',    'panel',   'panel.country',          'panel',               'session', 'none',   'country',  ''],
    schema: () => ({ type: 'object', properties: { country: str(), name: str(), place: str() }, anyOf: [{ required: ['country'] }, { required: ['name'] }, { required: ['place'] }] }), /* `selectCountry` */
    async run(a, dctx, K) { const ensureData = K.ensureData, resolveCountry = K.resolveCountry, showCountryDetail = K.showCountryDetail, GE = K.GE, R = K.R, note = K.note, esc = K.esc, warn = K.warn, L = K.L;
      { await ensureData(); const c=await resolveCountry(a.country||a.name||a.place); if(c&&c.code&&typeof showCountryDetail==='function'){ try{ showCountryDetail(c.code,c.name); }catch(_){} if(c.ll){ try{ GE().camera.flyTo({center:[c.ll.lng,c.ll.lat],zoom:Math.max(GE().camera.getZoom(),3.5),duration:1000}); }catch(_){} } return R(true, note('🏳 '+esc(c.name))); } return R(false, warn('⚠ '+L('Country not found','国が見つかりません','Land nicht gefunden','Страна не найдена','País no encontrado')+': '+esc(a.country||a.name||a.place||''))); }
    },
  },
  {
    row: ['data.timeSeries',            'timeSeries',     'timeseries',                                                  'data',    'panel',   'panel.timeseries',       'panel',               'session', 'none',   'country',  ''],
    schema: () => ({ type: 'object', properties: { country: str(), name: str(), place: str() }, anyOf: [{ required: ['country'] }, { required: ['name'] }, { required: ['place'] }] }),
    async run(a, dctx, K) { const ensureData = K.ensureData, resolveCountry = K.resolveCountry, showCountryDetail = K.showCountryDetail, R = K.R, note = K.note, L = K.L, esc = K.esc, warn = K.warn;
      { await ensureData(); const c=await resolveCountry(a.country||a.place||a.name); if(c&&c.code&&typeof showCountryDetail==='function'){ try{ showCountryDetail(c.code,c.name); }catch(_){} let ok=false; try{ if(window.IntMapTimeSeries&&window.IntMapTimeSeries.open){ window.IntMapTimeSeries.open(); ok=true; } }catch(_){} return R(ok, ok?note('📈 '+L('Time-series','時系列','Zeitreihe','Динамика','Series temporales')+': '+esc(c.name)):warn('⚠')); } return R(false, warn('⚠ '+L('Country not found','国が見つかりません','Land nicht gefunden','Страна не найдена','País no encontrado')+': '+esc(a.country||a.place||''))); }
    },
  },
  {
    row: ['data.populationIn',          'population',     'populationIn,popIn',                                          'data',    'none',    '',                       'explanation',         'read',    'none',   'area',     ''],
    schema: () => ({ type: 'object', properties: { target: one('drawn', 'area', 'polygon', 'radius', 'circle'), area: str(), place: str(), radiusKm: num(0), km: num(0) }, anyOf: [{ required: ['target'] }, { required: ['area'] }, { required: ['place'] }, { required: ['radiusKm'] }, { required: ['km'] }] }), /* `population` */
      /* (#R118) POPULATION inside an area — drawn polygon / radius circles / a named place / an explicit radius
         around a place. Real WorldPop 100m-grid sum (IntMapPopArea), never an AI guess. */
    async run(a, dctx, K) { const HOST = K.HOST, L = K.L, R = K.R, note = K.note, geocode = K.geocode, warn = K.warn, esc = K.esc, _nomExtent = K._nomExtent;
      {
          try{
            let geom=null, label='';
            const tgt=String(a.target||a.area||'').toLowerCase();
            if(tgt==='drawn'||tgt==='area'||tgt==='polygon'||(!a.place&&typeof HOST.measurePoints!=='undefined'&&HOST.measurePoints&&HOST.measurePoints.length>=3&&!a.radiusKm)){
              if(typeof HOST.measurePoints!=='undefined'&&HOST.measurePoints.length>=3){ geom={type:'Polygon',coordinates:[[...HOST.measurePoints,HOST.measurePoints[0]]]}; label=L('the drawn area','描画した範囲','das gezeichnete Gebiet','нарисованная область','el área dibujada'); } }
            if(!geom&&(tgt==='radius'||tgt==='circle'||(!a.place&&typeof HOST.radiusItems!=='undefined'&&HOST.radiusItems&&HOST.radiusItems.length))&&typeof HOST.radiusItems!=='undefined'&&HOST.radiusItems&&HOST.radiusItems.length&&!a.place){
              let tot=0; for(const c of HOST.radiusItems){ const g=window.IntMapPopArea.circleGeom(c.center,c.radiusKm); const r2=await window.IntMapPopArea.estimate(g); tot+=r2.pop; }
              return R(true, note('👥 '+L('Population inside the circle(s): ','円内の人口: ','Bevölkerung im Kreis: ','Население в круге: ','Población en el círculo: ')+'<b>'+tot.toLocaleString()+'</b> · WorldPop 2020 (100m)'+(HOST.radiusItems.length>1?(' · '+L('sum of circles (overlaps counted twice)','複数円の合算（重なりは二重計上）','Summe der Kreise','сумма кругов','suma de círculos')):''))); }
            if(!geom&&a.place){ const km=+a.radiusKm||+a.km||0;
              if(km>0){ const ll=await geocode(a.place); if(!ll) return R(false, warn('⚠ '+esc(a.place)));
                geom=window.IntMapPopArea.circleGeom([ll.lng,ll.lat],km); label=esc(ll.name||a.place)+' · '+km+' km'; }
              else{ let e=null; try{ e=await _nomExtent(a.place); }catch(_){}
                if(e&&e.geojson&&/Polygon/.test(e.geojson.type||'')){ geom=e.geojson; label=esc(e.name||a.place); }
                else return R(false, warn('⚠ '+L('No boundary polygon found for','境界ポリゴンが見つかりません','Keine Grenze gefunden für','Не найдена граница','Sin límite para')+' '+esc(a.place))); } }
            if(!geom) return R(false, warn('⚠ '+L('Draw an area / place a circle first, or name a place.','先に範囲を描くか円を置くか、地名を指定してください。','Erst Gebiet zeichnen / Kreis setzen oder Ort nennen.','Сначала нарисуйте область/круг или укажите место.','Dibuja un área / círculo o indica un lugar.')));
            const r=await window.IntMapPopArea.estimate(geom);
            return R(true, note('👥 '+(label?label+' — ':'')+L('population: ','人口: ','Bevölkerung: ','население: ','población: ')+'<b>'+r.pop.toLocaleString()+'</b> · '+esc(r.src)+' '+r.year));
          }catch(e){ return R(false, warn('⚠ '+L('Population lookup failed (WorldPop busy) — try again.','人口を取得できませんでした（WorldPop混雑）— 再試行してください。','Bevölkerungsabfrage fehlgeschlagen — erneut.','Не удалось получить население — повторите.','Fallo al obtener población — reintenta.'))); } }
    },
  },
  /* (#R760) WHICH FIRST-LEVEL UNITS A SHAPE COVERS — prefectures, states, provinces, oblasts.
     Answered entirely from the bundled data/admin1-world.json.gz (4,515 units, in the repository
     since #R290), so it reaches no network: measured in this worktree at 32 prefectures in 121 ms
     for a 500 km circle on Tokyo.
     ⚠ OBSERVER 'none', AND THAT IS THE POINT (#R743). Computing which units a shape covers and
     PAINTING them are two capabilities. This one writes nothing and produces prose; an observer
     that measured the map would report a perfectly correct run as not_rendered, which is the
     defect #R743 removed from the GIS ops. Painting is map.highlight, given the names this returns.
     ⚠ COLUMN 9 IS EMPTY, NOT 'area'. The two argument shapes the case accepts — place + km, and a
     bare ring in points — are not both spellings of one target kind: hasTarget('area') reads
     area/target/place/region/polygon/radiusKm/km/bbox and NOT points, so a ring-only call would
     answer needs_input. Widening that list would widen it for data.populationIn as well. What
     refuses an argument-less call is the anyOf in js/atlas-schemas.js — before anything runs,
     which is what #R406 required of every capability that cannot act on an empty object. */
  {
    row: ['data.coverage',              'admin1Coverage', 'subdivisionsCovered,regionsCovered',                          'data',    'none',    '',                       'explanation',         'read',    'none',   '',         ''],
    /* (#R760) `admin1Coverage`. TWO ARGUMENT SHAPES, AND THE anyOf IS THE WHOLE GATE: a circle is
       place AND km together (a place with no radius is a flyTo, not a coverage question), or the
       ring itself in `points`, spelled the way map.drawPolygon spells it — [lng,lat] pairs, three
       at minimum. The centre has THREE spellings and the radius TWO because the case really reads
       `a.place||a.country||a.name` and `a.km!=null?a.km:a.radiusKm` — rule (1): a single canonical
       name would reject the plans the dispatch was written to accept.
       `limit` is capped at the size of the bundled index — 4,515 units is every first-level unit
       IntMap ships, so a larger number could not name one more. It expires if the pack grows. */
    schema: () => ({ type: 'object', properties: { place: str(), country: str(), name: str(), km: num(0), radiusKm: num(0), points: list(list(), 3), limit: int(1, 4515) }, anyOf: [{ required: ['place', 'km'] }, { required: ['place', 'radiusKm'] }, { required: ['country', 'km'] }, { required: ['name', 'km'] }, { required: ['points'] }] }),
    async run(a, dctx, K) { const ADM1 = K.ADM1, L = K.L, esc = K.esc, note = K.note, warn = K.warn, geocode = K.geocode, R = K.R;
      { const _cv=await ADM1.coverageAnswer(a,{L,esc,note,warn,geocode}); return R(_cv.ok,_cv.html,_cv.meta?{meta:_cv.meta}:null); }   /* ⚠ (#R760) WHICH first-level subdivisions a shape covers — 「which prefectures does a 500 km buffer round Tokyo cover」 spent 4 m 42 s on production 2026-09-16 and listed none, because the shipped index (4,515 units) could only be asked BY NAME. The body is js/atlas-admin1.js `coverageAnswer`; it does NOT paint (#R743) — the names go to `map.highlight`. */
    },
  },
  {
    row: ['data.satelliteCompare',      'satelliteCompare','satCompare,satChange',                                       'data',    'panelPaint','panel.satcompare',     'panel,map',           'session', 'none',   'place',    ''],
    /* two dates or nothing — `from`/`to` are DATES here, not endpoints */
    schema: () => ({ type: 'object', properties: { dateA: str(), dateB: str(), before: str(), after: str(), from: str(), to: str(), place: str() }, anyOf: [{ required: ['dateA', 'dateB'] }, { required: ['before', 'after'] }, { required: ['from', 'to'] }] }),
      /* (#R119) SATELLITE CHANGE DETECTION inside the Atlas thread (absorbs the standalone panel feature —
         same capture + vision pipeline, result returned as a normal reply with both frames embedded). */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, geocode = K.geocode, GE = K.GE, L = K.L, esc = K.esc, mdMini = K.mdMini;
      {
          if(!window._imSatCapture) return R(false, warn('⚠'));
          if(a.place){ const ll=await geocode(a.place); if(ll){ try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),11),duration:800}); }catch(_){} await new Promise(r=>setTimeout(r,1400)); } }
          const va=String(a.dateA||a.before||a.from||'').slice(0,10), vb=String(a.dateB||a.after||a.to||'').slice(0,10);
          if(!va||!vb) return R(false, warn('⚠ '+L('Give two dates (dateA / dateB, YYYY-MM-DD).','2つの日付（dateA / dateB、YYYY-MM-DD）を指定してください。','Zwei Daten angeben (dateA/dateB).','Укажите две даты (dateA/dateB).','Indica dos fechas (dateA/dateB).')));
          const cap=await window._imSatCapture(va,vb);
          if(cap.err) return R(false, warn('⚠ '+esc(cap.err)));
          let txt2=''; try{ txt2=await window._imSatAnalyze(va,vb,cap.imgA,cap.imgB); }catch(e){ return R(false, warn('⚠ '+esc((e&&e.message)||'AI error'))); }
          let hh='<div style="display:flex;gap:6px;margin:4px 0;"><figure style="margin:0;flex:1;"><img src="'+esc(IntMapSafe.url(cap.imgA,{allowData:true}))+'" style="width:100%;border-radius:8px;" alt=""><figcaption style="font-size:10px;color:var(--text-muted);text-align:center;">'+esc(va)+'</figcaption></figure>'
            +'<figure style="margin:0;flex:1;"><img src="'+esc(IntMapSafe.url(cap.imgB,{allowData:true}))+'" style="width:100%;border-radius:8px;" alt=""><figcaption style="font-size:10px;color:var(--text-muted);text-align:center;">'+esc(vb)+'</figcaption></figure></div>'
            +'<div style="font-size:12px;line-height:1.6;">'+mdMini(txt2||'')+'</div>';
          return R(true, hh); }
    },
  },
  {
    row: ['data.layerValues',           'layerData',      'layerValue,layerQuery',                                       'data',    'none',    '',                       'explanation',         'read',    'none',   'point',    ''],
    schema: () => ({ type: 'object', properties: { place: str(), lng: lng(), lat: lat(), layer: str(), layers: list(str()) }, anyOf: [{ required: ['place'] }, { required: ['lat', 'lng'] }] }), /* `layerData` */
      /* (#R119) LAYER DATA — read the REAL values of displayed layers at a point, or the real features in view.
         This is the query side of the IntMapLayers contract. */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, layerDoor = K.layerDoor, geocode = K.geocode, L = K.L, esc = K.esc, GE = K.GE, note = K.note;
      {
          const LY=window.IntMapLayers; if(!LY) return R(false, warn('⚠'));
          const asked=a.layer?[String(a.layer)]:(Array.isArray(a.layers)?a.layers.map(String):null); const doors=asked?asked.map(s=>({q:s,d:layerDoor(s)})):null; const ids=doors?doors.map(x=>x.d&&x.d.read).filter(Boolean):null;   /* ⚠⚠⚠ (#R802) THE NAME ATLAS HOLDS IS THE PANEL'S NAME, AND THIS DOOR ONLY EVER ACCEPTED THE READING REGISTER'S OWN ids. Measured on production 2026-09-17, 「Compare the population density of Tokyo, Delhi and Lagos on the map.」: `data.layerValues` ran SEVENTEEN times, failed seventeen times and died at `step_budget`, while 「Population density (1 km grid)」 was on and drawn — `REG['Population density (1 km grid)']` is undefined, so `sampleAt` skipped it and this case told a reader who already had the layer on to turn a layer on. `layerDoor` reconciles the two registers; the sentences below say WHICH of five things went wrong. */
          /* point resolution: explicit place → geocode; "here" pin; else map centre */
          let px=null,py=null,pname='';
          if(a.place){ const ll=await geocode(a.place); if(ll){ px=ll.lng; py=ll.lat; pname=ll.name||a.place; } else return R(false, warn('⚠ '+L('IntMap could not place «','IntMap は「','IntMap konnte «','IntMap не смог найти «','IntMap no pudo ubicar «')+esc(String(a.place))+L('», so there is no point to read the layers at. Give coordinates, or name a place IntMap holds.','」を地図上に特定できなかったため、レイヤーを読む地点がありません。座標を指定するか、IntMap が持つ地名で言い直してください。','» verorten — kein Punkt, an dem die Ebenen gelesen werden könnten.','» — нет точки для чтения слоёв.','», así que no hay punto donde leer las capas.'))); }   /* ⚠⚠⚠ (#R802) A NAMED PLACE THAT DID NOT RESOLVE IS NOT 「the map centre」. Measured on this round's local build: `layerData {place:'Korean Peninsula'}` and `{place:'Amazon Basin'}` fell through to the camera centre and answered 「◈ map center — BWh · Hot desert」 — a reading of wherever the reader happened to be looking, handed back as an answer about the place they named. Falling through to the centre is right when NO place was named (#R119's 「here」 reading) and wrong the moment one was: it is the same sentence the layer half of this case says one line down about a named layer that resolved to nothing. */
          if(px==null&&a.lng!=null&&isFinite(+a.lng)){ px=+a.lng; py=+a.lat; }
          if(px==null&&K._herePoint&&isFinite(K._herePoint.lng)){ px=K._herePoint.lng; py=K._herePoint.lat; pname=K._herePoint.name||''; }
          if(px==null){ const c3=GE().camera.getCenter(); px=c3.lng; py=c3.lat; pname=L('map center','地図中心','Kartenmitte','центр карты','centro del mapa'); }
          const rows=(asked&&!ids.length)?[]:(await LY.sampleAt(px,py,(ids&&ids.length)?ids:null)); const vals=rows.filter(v=>v&&v.value!=null); const featLines=[];   /* (#R763) a row that was asked and could not answer carries `failed` and no value — 「訊けなかった」 is not a reading */   /* ⚠ (#R802) a NAMED layer that resolved to nothing is NOT widened back to 「all the active layers」: that answers a question nobody asked. */
          ((ids&&ids.length)?ids:LY.active()).forEach(id=>{ try{ const fs=LY.featuresIn(id,null); if(fs&&fs.length){ const nm2=(LY.state(id)||{}).label||id;
            const names=fs.slice(0,8).map(f=>{ const p2=f.properties||{}; const nm3=String(p2.name||((p2.mag!=null&&p2.place)?p2.place:'')||p2.title||p2.NAME||p2.callsign||p2.ident||p2.place||'').slice(0,40); return (p2.mag!=null&&nm3)?('M'+(+p2.mag).toFixed(1)+' '+nm3).slice(0,46):nm3; }).filter(Boolean);   /* (#R120) aircraft have a callsign, not a name; (#R121) quakes = M{mag} + place (their `title` already repeats the magnitude) */
            featLines.push(nm2+': '+fs.length+(names.length?(' — '+names.join(', ')+(fs.length>names.length?', …':'')):'')); } }catch(_){} });
          if(!vals.length&&!featLines.length){ const miss=(doors||[]).filter(x=>!x.d), mute=(doors||[]).filter(x=>x.d&&!x.d.read), off=(doors||[]).filter(x=>x.d&&x.d.read&&!x.d.on), nore=rows.filter(v=>v&&v.asked&&v.value==null&&!v.failed), blew=rows.filter(v=>v&&v.failed); const _dl=xs=>xs.map(x=>esc(x.d?x.d.label:x.q)).join(', '), _rl=xs=>xs.map(v=>esc(v.label||v.id)).join(', ');   /* ⚠ (#R802) FIVE DIFFERENT FACTS, FIVE DIFFERENT SENTENCES. The one sentence this case used to print told a reader with the layer already on to turn it on — the shape .agents/rules/one-pass-or-a-reason.md §2-1 calls 「the observer lied」, and Atlas rephrased and fired again seventeen times. ⚠ NONE OF THEM MOVES THE CAMERA: this capability is `read` in the CAPS table and must not change the map, so the fourth one STATES the repair and leaves the next step to Atlas. */
            if(miss.length) return R(false, warn('⚠ '+L('There is no layer called '+_dl(miss)+'. Name it as it appears in the layer panel, or ask for the layer list first.','「'+_dl(miss)+'」というレイヤーはありません。レイヤーパネルの表記で指定するか、先にレイヤー一覧を尋ねてください。','Es gibt keine Ebene namens '+_dl(miss)+'. Verwende die Bezeichnung aus dem Ebenen-Panel oder frage zuerst die Ebenenliste ab.','Слоя с именем '+_dl(miss)+' нет. Укажите название как в панели слоёв или сначала запросите список слоёв.','No existe ninguna capa llamada '+_dl(miss)+'. Usa el nombre del panel de capas o pide primero la lista de capas.')));   if(mute.length) return R(false, warn('⚠ '+L(_dl(mute)+': IntMap draws this layer but does not sample it at a point, so there is no value to read here. Ask for the features in view instead.',_dl(mute)+'：IntMap はこのレイヤーを描画しますが、地点の値としては提供していないため、ここで読み取れる値はありません。表示範囲内の地物を尋ねてください。',_dl(mute)+': IntMap zeichnet diese Ebene, tastet sie aber nicht punktweise ab — hier gibt es keinen Wert zu lesen.',_dl(mute)+': IntMap рисует этот слой, но не измеряет его в точке — значения здесь нет.',_dl(mute)+': IntMap dibuja esta capa pero no la muestrea en un punto, así que aquí no hay valor que leer.')));   if(off.length) return R(false, warn('⚠ '+L(_dl(off)+' can be read, but it is switched off, so nothing is loaded for it. Turn it on, then ask again.','「'+_dl(off)+'」は読み取り可能ですが、いまオフなのでデータが読み込まれていません。オンにしてからもう一度お尋ねください。',_dl(off)+' ist lesbar, aber ausgeschaltet — schalte sie ein und frage erneut.',_dl(off)+' читается, но слой выключен — включите его и спросите снова.',_dl(off)+' se puede leer, pero está apagada — actívala y vuelve a preguntar.')));
            if(nore.length) return R(false, warn('⚠ '+L(_rl(nore)+' was asked at '+esc(pname||(py.toFixed(3)+', '+px.toFixed(3)))+' and returned no value there. A raster layer only answers where its tiles are loaded, so if that point is off-screen or the map is zoomed out, move the map onto it first and ask again — this reading never moves the camera itself.','「'+_rl(nore)+'」に '+esc(pname||(py.toFixed(3)+', '+px.toFixed(3)))+' を問い合わせましたが、そこに値はありませんでした。ラスターのレイヤーはタイルが読み込まれている場所しか答えません。その地点が画面外、または縮尺が小さい場合は、先に地図をそこへ移動してからもう一度お尋ねください（この読み取り自体はカメラを動かしません）。',_rl(nore)+' wurde hier abgefragt und lieferte keinen Wert. Eine Rasterebene antwortet nur dort, wo ihre Kacheln geladen sind — bewege die Karte auf den Punkt und frage erneut.',_rl(nore)+' был опрошен здесь и не дал значения. Растровый слой отвечает только там, где загружены его тайлы — переместите карту на эту точку и спросите снова.',_rl(nore)+' fue consultada aquí y no devolvió valor. Una capa ráster solo responde donde sus teselas están cargadas — mueve el mapa sobre ese punto y vuelve a preguntar.')));   if(blew.length) return R(false, warn('⚠ '+L('Reading '+_rl(blew)+' failed at this point — the layer\'s own sampler threw. Try again in a moment.','「'+_rl(blew)+'」の読み取りに失敗しました（レイヤー側のサンプラが例外を返しました）。少し時間を置いてお試しください。','Das Lesen von '+_rl(blew)+' ist hier fehlgeschlagen — bitte gleich noch einmal versuchen.','Не удалось считать '+_rl(blew)+' в этой точке — повторите попытку.','La lectura de '+_rl(blew)+' falló en este punto — inténtalo de nuevo en un momento.')));
            return R(false, warn('⚠ '+(LY.active().length?L('The layers that are on publish no readable value at this point.','現在オンのレイヤーは、この地点で読み取れる値を持っていません。','Die eingeschalteten Ebenen liefern an diesem Punkt keinen lesbaren Wert.','Включённые слои не дают читаемого значения в этой точке.','Las capas activas no dan ningún valor legible en este punto.'):L('No readable data on the active layers here. Turn a data layer on first.','ここで読み取れる表示中レイヤーのデータがありません。先にデータレイヤーをオンにしてください。','Keine lesbaren Layer-Daten hier.','Нет читаемых данных слоёв здесь.','Sin datos de capas legibles aquí.')   /* ⚠ (#R802) #R119's ORIGINAL SENTENCE, KEPT WORD FOR WORD — and now printed only on the ONE branch where it is true: no data layer is on at all, so 「turn a data layer on first」 asks for something the reader has not already done. Nine languages already carry this key (CONSTITUTION.md §0-3: narrowing what IntMap writes next is not licence to delete what a reader has); the four branches above are what used to be said in its place. */))); }
          let hh=note('◈ '+esc(pname||(py.toFixed(3)+', '+px.toFixed(3))));
          if(vals.length) hh+=note(vals.map(v=>'<b>'+esc(v.label)+'</b>: '+esc(String(v.value))).join('<br>'));   if(featLines.length) hh+=note(featLines.map(esc).join('<br>'));
          return R(true, hh); }
    },
  },
  {
    row: ['data.runways',               'runway',         'airports',                                                    'data',    'panel',   'panel.runway',           'panel',               'read',    'none',   'place',    ''],
    schema: () => ({ type: 'object', properties: { place: str() }, required: ['place'] }), /* `runway` */
    async run(a, dctx, K) { const geocode = K.geocode, GE = K.GE, R = K.R, note = K.note, esc = K.esc, warn = K.warn;
      { const ll=await geocode(a.place); if(ll){ try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),7)}); }catch(_){} let ok=false; try{ if(window.RunwaySearch&&window.RunwaySearch.open){ window.RunwaySearch.open({lng:ll.lng,lat:ll.lat}); ok=true; } }catch(_){} return R(ok, ok?note('🛬 '+esc(ll.name||a.place||'')):warn('⚠')); } return R(false, warn('⚠ '+esc(a.place||''))); }
    },
  },
  {
    row: ['data.wxModel',               'wxModel',        'weatherModel,forecastModel',                                  'data',    'wxModel', 'map.layer,map.layerOption',              'map,explanation',     'session', 'none',   '',         ''],
    /* the layer id is resolved by `layerFor`, which also accepts the un-prefixed spelling */
    schema: () => ({ type: 'object', properties: { layer: str(), name: str(), model: one('ecmwf_ifs', 'ncep_gfs013', 'dwd_icon') }, anyOf: [{ required: ['layer', 'model'] }, { required: ['name', 'model'] }] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, note = K.note;
      { const W=window.IntMapWeatherEC; if(!W||!W.setModel) return R(false,warn('⚠')); const want=String(a.layer||a.name||'').trim(), mid=String(a.model||'').trim(); const cfg=W.layerFor(want)||W.layerFor('ec-'+want.replace(/^(dl-)?(ec-)?/,'')); if(!cfg) return R(false,warn('⚠ '+L('no such weather layer','その気象レイヤーはありません','keine solche Wetterebene','нет такого слоя погоды','no existe esa capa meteorológica'))); return W.setModel(cfg.id,mid).then(r=>R(!!(r&&r.ok), (r&&r.ok)?note('🌦 '+(r.modelName||mid)+' · '+cfg.id+(r.validTime?(' · '+r.validTime):'')):warn('⚠ '+((r&&r.code)||'')))); }
    },
  },
  {
    row: ['data.value',                 'value',          'stat,lookup',                                                 'data',    'none',    '',                       'explanation',         'read',    'none',   'country',  ''],
    schema: () => ({ type: 'object', properties: { country: str(), place: str(), name: str(), metric: str(), what: str() }, anyOf: [{ required: ['country'] }, { required: ['place'] }, { required: ['name'] }] }),
    async run(a, dctx, K) { const ensureData = K.ensureData, resolveCountry = K.resolveCountry, countryStats = K.countryStats, R = K.R, warn = K.warn, L = K.L, esc = K.esc, highlight = K.highlight, fitTo = K.fitTo, LA = K.LA, lx = K.lx, metSpec = K.metSpec, _fillMetric = K._fillMetric, fmtVal = K.fmtVal, METRICS = K.METRICS;
      { await ensureData(); const c=await resolveCountry(a.country||a.place||a.name);
          if(!c||!c.code||!countryStats[c.code]) return R(false, warn('⚠ '+L('Country not found','国が見つかりません','Land nicht gefunden','Страна не найдена','País no encontrado')+': '+esc(a.country||a.place||a.name||'')));
          const s=countryStats[c.code]; const mk=String(a.metric||a.what||'').trim();
          try{ highlight([c.code]); fitTo([c.code]); }catch(_){}
          const TXTF={capital:LA('Capital','首都','Hauptstadt','Столица','Capital'),currency:LA('Currency','通貨','Währung','Валюта','Moneda'),languages:LA('Languages','言語','Sprachen','Языки','Idiomas'),flag:LA('Flag','国旗','Flagge','Флаг','Bandera')};
          if(TXTF[mk]){ const v=s[mk]; return R(v!=null&&v!=='', '<div style="font-size:12.5px;line-height:1.6;"><b>'+esc(c.name)+'</b> — '+esc(lx(TXTF[mk]))+': <b>'+esc(v||'—')+'</b></div>'); }
          const _vs=metSpec(mk);   /* (#R740) XMET too — 「日本の平均寿命は？」 fell through to the stat card, which does not carry it */
          if(_vs){ try{ await _fillMetric(_vs.key); }catch(_){} const v=_vs.m.get(s); if(v==null||isNaN(v)) return R(false, warn('⚠ '+esc(c.name)+': '+L('no data for this metric','この指標のデータがありません','keine Daten für diese Kennzahl','нет данных по показателю','sin datos para esta métrica')));
            return R(true,'<div style="font-size:12.5px;line-height:1.6;"><b>'+esc(c.name)+'</b> — '+esc(lx(_vs.m.label))+': <b>'+esc(fmtVal(_vs.key,v))+'</b></div>'); }
          /* no / unknown metric → full compact stat card from everything we hold */
          let rowsH=''; for(const k in METRICS){ const v=METRICS[k].get(s); if(v==null||isNaN(v)) continue; rowsH+='<div style="display:flex;justify-content:space-between;gap:10px;"><span style="color:var(--text-muted);">'+esc(lx(METRICS[k].label))+'</span><b>'+esc(fmtVal(k,v))+'</b></div>'; }
          for(const k of ['capital','currency','languages']){ if(s[k]) rowsH+='<div style="display:flex;justify-content:space-between;gap:10px;"><span style="color:var(--text-muted);">'+esc(lx(TXTF[k]))+'</span><b>'+esc(s[k])+'</b></div>'; }
          return R(true,'<div style="font-weight:600;margin:2px 0 5px;">'+esc((s.flag?s.flag+' ':'')+c.name)+'</div><div style="font-size:12px;line-height:1.7;">'+rowsH+'</div>'); }
    },
  },
  {
    row: ['data.compareStats',          'compareStats',   'compareCountries,statsCompare',                               'data',    'panel',   'panel.compare',          'panel',               'session', 'none',   'country',  ''],
    schema: () => ({ type: 'object', properties: { countries: loose(), country: str(), metrics: list(str()), source: one('wb', 'imf'), view: one('bar', 'bars', 'timeseries', 'ts', 'time-series', 'table', 'pivot'), mode: one('bar', 'bars', 'timeseries', 'ts', 'time-series', 'table', 'pivot') }, anyOf: [{ required: ['countries'] }, { required: ['country'] }] }),
    async run(a, dctx, K) { const ensureData = K.ensureData, resolveCountry = K.resolveCountry, R = K.R, warn = K.warn, L = K.L, _cmpMetricKeys = K._cmpMetricKeys, note = K.note, esc = K.esc;
      { await ensureData(); await window.IntMapLazy.need('statsCompare');   /* (#R311) BEFORE _cmpMetricKeys — that resolver asks the panel for its real IND keys */
          const rawC=Array.isArray(a.countries)?a.countries:String(a.countries||a.country||'').split(/,|、|;| and | und | y | и |と| vs\.? |対/i).map(x=>x.trim()).filter(Boolean);
          const cds=[],missC=[]; for(const nm2 of rawC){ const c=await resolveCountry(nm2); if(c&&c.code){ if(cds.indexOf(c.code)<0) cds.push(c.code); } else missC.push(nm2); }
          if(!cds.length) return R(false, warn('⚠ '+L('Which countries should I compare?','どの国を比較しますか？','Welche Länder vergleichen?','Какие страны сравнить?','¿Qué países comparo?')));
          const viewM=({bar:'bar',bars:'bar',timeseries:'ts',ts:'ts','time-series':'ts',table:'table',pivot:'table'})[String(a.view||a.mode||'').toLowerCase()]||null;   /* (#R70) open straight into a view */
          /* (#R115) honour the REQUESTED indicators ("Compare … — GDP, defense and population" ignored them):
             resolve names/keys tolerantly (5 languages + synonyms) onto the panel's real IND keys. */
          const rawM=Array.isArray(a.metrics)?a.metrics.map(x=>String(x)):(a.metrics?[String(a.metrics)]:[]);
          const mkeys=[],missM=[];
          rawM.forEach(mm=>{ const mr=_cmpMetricKeys(mm); mr.keys.forEach(k=>{ if(mkeys.indexOf(k)<0) mkeys.push(k); }); mr.miss.forEach(x=>missM.push(x)); });
          let okC=false; try{ if(window.IntMapStatsCompare&&window.IntMapStatsCompare.open){ window.IntMapStatsCompare.open(cds.slice(0,10),mkeys.length?mkeys:null,(a.source==='imf'||a.source==='wb')?a.source:null,viewM); okC=true; } }catch(_){}
          /* (#R108/#R115) plain text, NO emoji in Atlas replies; name the indicators actually selected. */
          let mlbl=''; try{ if(okC&&mkeys.length&&window.IntMapStatsCompare.indLabel) mlbl=' — '+mkeys.map(k=>window.IntMapStatsCompare.indLabel(k)).join(', '); }catch(_){}
          let h2=okC?note(L('Country comparison opened','国の比較を開きました','Ländervergleich geöffnet','Сравнение стран открыто','Comparación abierta')+' ('+Math.min(10,cds.length)+')'+esc(mlbl)):warn('⚠');
          if(cds.length>10) h2+=warn('⚠ '+L('Only the first 10 countries are compared','比較は最大10か国です','Nur die ersten 10 Länder','Только первые 10 стран','Solo los primeros 10 países'));
          if(missC.length) h2+=warn('⚠ '+L('Not found','見つからず','Nicht gefunden','Не найдено','No encontrado')+': '+esc(missC.join(', ')));
          if(missM.length) h2+=warn('⚠ '+L('Not an available indicator','比較指標にない項目','Kein verfügbarer Indikator','Нет такого показателя','Indicador no disponible')+': '+esc(missM.join(', ')));
          return R(okC,h2); }
    },
  },
  {
    row: ['data.exploreRelated',        'explore',        'findRelated,relatedMetrics',                                  'data',    'none',    '',                       'explanation',         'read',    'none',   'metric',   ''],
    schema: () => ({ type: 'object', properties: { metric: str(), target: str(), key: str(), name: str(), n: int(1, 40) }, anyOf: [{ required: ['metric'] }, { required: ['target'] }, { required: ['key'] }, { required: ['name'] }] }), /* `explore` */
    async run(a, dctx, K) { const ensureData = K.ensureData, metSpec = K.metSpec, unknownMetric = K.unknownMetric, _fillMetric = K._fillMetric, countryStats = K.countryStats, isRankableCountry = K.isRankableCountry, R = K.R, warn = K.warn, L = K.L, METRICS = K.METRICS, XMET = K.XMET, _pearson = K._pearson, _ranks = K._ranks, lx = K.lx, nm = K.nm, esc = K.esc, note = K.note;
      { /* (#R75) vision §10 — which indicators MOVE WITH a
          target metric, computed on the real country data (Pearson + Spearman), reported without causal claims. */
          await ensureData();
          const sp=metSpec(a.metric||a.target||a.key||a.name);
          if(!sp) return unknownMetric(a.metric||a.target);   /* (#R740) the list was typed here by hand and had already drifted from `METRICS`+`XMET` — it is counted now */
          await _fillMetric(sp.key); await _fillMetric('lifeExp'); await _fillMetric('internet'); await _fillMetric('tfr');   /* lazy fields → WB bulk (sequential — WB throttles bursts) */
          const tv={}; for(const cd in countryStats){ const s=countryStats[cd]; if(!isRankableCountry(s)) continue; let v=sp.m.get(s); if(v==null||isNaN(v)) continue; if(sp.m.log&&v<=0) continue; tv[cd]=sp.m.log?Math.log(v):v; }
          if(Object.keys(tv).length<25) return R(false, warn('⚠ '+L('Not enough data for this metric','この指標はデータ不足です','Zu wenig Daten','Недостаточно данных','Datos insuficientes')));
          const ALL=Object.assign({},METRICS,XMET); const out=[];
          for(const k in ALL){ if(k===sp.key) continue; const m2=ALL[k]; const xs=[],ys=[],cds=[];
            for(const cd in tv){ const s=countryStats[cd]; let v=m2.get(s); if(v==null||isNaN(v)) continue; if(m2.log&&v<=0) continue; xs.push(m2.log?Math.log(v):v); ys.push(tv[cd]); cds.push(cd); }
            if(xs.length<25) continue;
            const r=_pearson(xs,ys); const rho=_pearson(_ranks(xs),_ranks(ys)); if(r==null||rho==null) continue;
            /* biggest outlier = country least explained by the linear fit (vision §10: 反証となる事例) */
            let mx2=0,mi=-1; const mxv=xs.reduce((s2,v)=>s2+v,0)/xs.length, myv=ys.reduce((s2,v)=>s2+v,0)/ys.length;
            const sdx=Math.sqrt(xs.reduce((s2,v)=>s2+(v-mxv)*(v-mxv),0)/xs.length)||1, sdy=Math.sqrt(ys.reduce((s2,v)=>s2+(v-myv)*(v-myv),0)/ys.length)||1;
            for(let i2=0;i2<xs.length;i2++){ const e=Math.abs(((ys[i2]-myv)/sdy)-r*((xs[i2]-mxv)/sdx)); if(e>mx2){ mx2=e; mi=i2; } }
            out.push({k,label:lx(m2.label),r,rho,n:xs.length,outlier:mi>=0?nm(countryStats[cds[mi]]):null}); }
          if(!out.length) return R(false, warn('⚠ '+L('No overlapping data to correlate','相関を計算できる重複データがありません','Keine überlappenden Daten','Нет пересекающихся данных','Sin datos superpuestos')));
          out.sort((x,y)=>Math.abs(y.rho)-Math.abs(x.rho));
          const top=out.slice(0,Math.max(3,Math.min(8,(+a.n||5))));
          let html='<div style="font-weight:600;margin:2px 0 5px;">🔗 '+esc(lx(sp.m.label))+' — '+L('related indicators (all countries)','関連する指標（全カ国データ）','verwandte Indikatoren','связанные показатели','indicadores relacionados')+'</div>';
          html+=top.map(t2=>{ const dir=t2.rho>0?'↗':'↘'; const st=Math.abs(t2.rho)>=0.7?L('strong','強い','stark','сильная','fuerte'):Math.abs(t2.rho)>=0.4?L('moderate','中程度','mittel','умеренная','moderada'):L('weak','弱い','schwach','слабая','débil');
            return '<div style="display:flex;gap:8px;align-items:baseline;padding:3px 0;border-top:1px solid rgba(128,128,128,0.12);font-size:12px;"><span style="flex:0 0 auto;font-weight:700;">'+dir+'</span><span style="flex:1;min-width:0;">'+esc(t2.label)+'<br><span style="font-size:10.5px;color:var(--text-muted);">ρ='+t2.rho.toFixed(2)+' · r='+t2.r.toFixed(2)+' · n='+t2.n+(t2.outlier?(' · '+L('biggest exception','最大の例外','größte Ausnahme','главное исключение','mayor excepción')+': '+esc(t2.outlier)):'')+'</span></span><span style="flex:0 0 auto;font-size:10.5px;color:var(--text-muted);">'+st+'</span></div>'; }).join('');
          html+='<div style="font-size:10px;color:var(--text-muted);margin-top:6px;line-height:1.5;">'
            +L('ρ = Spearman rank correlation, r = Pearson (log scale where the metric is log-distributed). Correlation is NOT causation — third factors (income, region) can drive both sides; the listed exception countries are good places to test any explanation.','ρ=スピアマン順位相関、r=ピアソン（対数分布の指標は対数変換）。相関は因果ではありません — 所得や地域など第三の要因が両方を動かしている可能性があります。「最大の例外」の国は説明を検証する良い材料です。','ρ=Spearman, r=Pearson (log wo markiert). Korrelation ist keine Kausalität.','ρ=Спирмен, r=Пирсон (лог. где отмечено). Корреляция — не причинность.','ρ=Spearman, r=Pearson (log donde corresponde). Correlación no es causalidad.')+'</div>';
          return R(true, note(html)); }
    },
  },
  /* (#R395) THE VOLCANO SUBSYSTEM WAS RUNNABLE AND UNREACHABLE. js/beta-overlays.js has
     registered volcano.* kernel commands since #R353, and the registry had no row for any of
     them — so a reader could press the buttons and Atlas could not, which is precisely the
     five-disagreeing-lists failure this file exists to end. `data.layerValues` already answers
     «how many volcanoes are on screen» and these two do not overlap it: one opens the record for
     a NAMED volcano, the other narrows the catalog to a question.
     ⚠ THESE ROWS SIT ABOVE `dialog.answer` ON PURPOSE — tests/geo-navigation-checks.test.mjs #R347 ㉒ reads the `lazy`
     column with a regex that only matches rows ending in a comma, and the last row has none, so
     a row appended after it would never have its lazy module checked. */
  {
    row: ['data.volcano',               'volcano',        'volcanoCard,volcanoInfo',                                     'data',    'panel',   'panel.volcano',          'panel',               'session', 'none',   'text',     'volcanoIntel'],
    /* ══ (#R395) THE VOLCANO PAIR ══════════════════════════════════════════════════════════════
       One opens the record for a NAMED volcano — the case refuses with «name a volcano» when it
       has none. The other changes WHICH volcanoes are drawn, and refuses when told nothing to
       change: a colour mode, a filter flag, or the map's year. */
    schema: () => ({ type: 'object', properties: { name: str(), text: str(), query: str(), place: str() }, anyOf: [{ required: ['name'] }, { required: ['text'] }, { required: ['query'] }, { required: ['place'] }] }),
    /* the same case as `volcanoFilter` — this spelling fell through to it in the dispatch switch */
    run: volcanoFilterRun,
  },
  /* (#R567) THE WORLD HERITAGE PAIR, and it is the volcano pair's shape for the volcano pair's
     reason: one opens the record for a NAMED property, the other narrows which properties are
     drawn. Column 10 is empty because the layer is not lazy — it lives in js/beta-overlays.js,
     which is eager, so both commands exist from boot rather than after a download. */
  {
    row: ['data.heritage',              'heritage',       'worldHeritage,heritageInfo',                                  'data',    'panel',   'panel.heritage',         'panel',               'session', 'none',   'text',     ''],
    /* (#R567) THE WORLD HERITAGE PAIR. One opens the record for a NAMED property — the case
       refuses with «name a World Heritage site» when it has none. The other changes WHICH
       properties are drawn: `categories` NAMES THE ONES TO KEEP (the vocabulary is UNESCO's own
       and travels in the data file, so it is not enumerated here), `danger` narrows to the List
       in Danger, `clear` drops every narrowing. */
    schema: () => ({ type: 'object', properties: { name: str(), text: str(), query: str(), place: str(), id: int() }, anyOf: [{ required: ['name'] }, { required: ['text'] }, { required: ['query'] }, { required: ['place'] }, { required: ['id'] }] }),
    /* the same case as `heritageFilter` — this spelling fell through to it in the dispatch switch */
    run: heritageFilterRun,
  },
  /* ⚠⚠ (#R783) AND COLUMN 9 IS EMPTY HERE FOR THE SAME REASON, ONE SPELLING DOWN. It said
     'point', and `hasTarget('point')` reads `lng`+`lat`; this case reads `a.lon`
     (js/atlas-controls.js), its schema requires `lat`+`lon` (js/atlas-schemas.js) and the
     catalogue shows the reader-facing shape as `"lon"` (js/atlas-catalog-text.js) — so the
     coordinate every other reader of this capability calls `lon` was the one the target gate
     could not see, and a call carrying exactly what the schema demanded answered `needs_input`
     asking for the coordinate it had just been given. ⚠ THE SPELLING CONVERGES ON THE CASE,
     NOT ON THE GATE: teaching `hasTarget('point')` to accept `lon` would let a lat/lon call
     past the gate into the nine other point capabilities whose cases read `a.lng` only — the
     false refusal would move one level down instead of going away. With the column empty the
     gate is `required:['lat','lon']`, and the case still names its own refusal 「中心となる
     座標を指定してください」 rather than quietly taking the map centre (#R302). */
  {
    row: ['data.radiationNear',         'radiationNear',  'measuringStations,doseNear',                                  'data',    'none',    '',                       'explanation',         'read',    'none',   '',         'radiationLayer'],
    schema: () => ({ type: 'object', properties: { lat: num(-90, 90), lon: num(-180, 180), km: num(1, 1000) }, required: ['lat', 'lon'] }),
    /* the same case as `radiationNear` — shared with a spelling that fell through to it */
    run: radiationNearRun,
  },
];

export async function volcanoFilterRun(a, dctx, K) { const doVolcano = K.doVolcano;
      return doVolcano(a);
}

export async function heritageFilterRun(a, dctx, K) { const doHeritage = K.doHeritage;
      return doHeritage(a);   /* (#R567) ON THIS LINE, not a new one: js/atlas-console.js stands at 4,908 against a ceiling of 4,910 that only ever comes down (#R199/#R318/#R491), and a subject whose answers are thirty lines long belongs in js/atlas-controls.js beside doVolcano anyway. */   /* (#R395) the answers are in js/atlas-controls.js — this file's ceiling is full (#R199/#R318) and a subject that needs thirty lines belongs beside the other control-surface helpers */   /* (#R395) the answers are in js/atlas-controls.js — this file's ceiling is full (#R199/#R318) and a subject that needs thirty lines belongs beside the other control-surface helpers */
}

export async function radiationNearRun(a, dctx, K) { const doRadiationObs = K.doRadiationObs;
      return doRadiationObs(a);   /* (#R585) MEASURED radiation — the body is in js/atlas-controls.js for the same ceiling reason. ⚠ NOT the plume simulation, which is `sim`/`radiation` above; docs/RADIATION.md says why they must stay two answers */
}
