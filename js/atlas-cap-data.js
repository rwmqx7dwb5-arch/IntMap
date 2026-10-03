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
 *  (atlas-capability-single-source) An entry also holds `doc` — its fragment of each catalogue block the planner
 *  reads (js/atlas-catalog-text.js keeps only the blocks' order and headings) — and, where it has them, `phrases`,
 *  `policy`, `goal`, `chips` and `catalogueSilent`. js/atlas-caps.js says what each one is; nothing outside the
 *  entry names them.
 * ==========================================================================*/
import { str, num, int, one, list, obj, lat, lng, loose } from './atlas-caps.js';
import { weatherFacts } from './atlas-result-facts.js';
import { icon } from './icons.js';   /* (icon-system) the one icon set — js/icons.js */

/* ══ (atlas-os) THE QUERY ENGINE, BOUND TO THE KERNEL — ONE BINDING FOR EVERY CALLER ═══════════════
   `data.query` was the only thing that ran js/atlas-query.js, so the dependency list it binds was written
   inline in its run. `notebook.compare` (js/atlas-cap-notebook.js) runs the same engine on a stored spec,
   and a second inline copy of these thirteen names would be the list that drifts. Loads the lazy module,
   waits for the country data, binds, and answers with the engine — or null when it could not be loaded. */
export async function queryEngine(K) {
  const ensureData = K.ensureData, _mirrorLang = K._mirrorLang, countryStats = K.countryStats, _fillMetric = K._fillMetric, metSpec = K.metSpec, fmtVal = K.fmtVal, nm = K.nm, _fetchJSON = K._fetchJSON, overpassPOIs = K.overpassPOIs, wikidataPOIs = K.wikidataPOIs, resolveCountrySync = K.resolveCountrySync, _nomExtent = K._nomExtent, _bboxOK = K._bboxOK;
  await window.IntMapLazy.need('atlasQuery'); const _Q=window.IntMapQuery; if(!_Q) return null; await ensureData();
  _Q.bind({lang:()=>_mirrorLang(), countryStats:()=>countryStats, ensureData, fillMetric:_fillMetric, metricSpec:metSpec, fmtVal, countryName:nm, fetchJSON:_fetchJSON, overpassPOIs, wikidataPOIs, resolveArea:async n2=>{ const c2=resolveCountrySync(n2); let e2=null; try{ e2=await _nomExtent((c2&&c2.name)||n2); }catch(_){} return {osmRel:(e2&&e2.osmType==='relation')?e2.osmId:null, iso3:(c2&&c2.code)||null, box:(e2&&e2.box&&_bboxOK(e2.box))?e2.box:null}; }});
  return _Q;
}

export default [
  {
    row: ['data.weather',               'weather',        '',                                                            'data',    'panel',   'panel.weather',          'panel,explanation',   'read',    'none',   'place',    ''],
    doc: [
      { in: 'tools-panels', at: 10, text: '{"type":"weather","place":str} = THE WEATHER AT ONE PLACE, observed AND forecast: it opens the weather card there and the RESULT carries the numbers themselves — the current conditions (sky, temperature, apparent temperature, humidity, wind and gusts, precipitation, and the valid time of the observation) and the DAILY FORECAST for the next five days (max/min temperature, chance of rain, rainfall). It answers for ONE POINT; the ECMWF/GFS/ICON layers above paint the same fields over the whole map, and "layerData" reads a layer at a point. Use for 「東京の天気を教えて」「今日の天気と、今後3日間の予報は？」「明日の天気予報」「今の気温は？」, "what is the weather in Tokyo", "the current conditions and the three-day forecast"; ' },
    ],
    schema: () => ({ type: 'object', properties: { place: str() }, required: ['place'] }),
    async run(a, dctx, K) { const geocode = K.geocode, GE = K.GE, L = K.L, R = K.R, note = K.note, esc = K.esc, warn = K.warn;
      { const ll=await geocode(a.place); if(ll){ let ok=false; try{ if(window.IntMapWeather&&window.IntMapWeather.open){ window.IntMapWeather.open({lng:ll.lng,lat:ll.lat}); ok=true; } }catch(_){} GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),5)});
          let facts=''; try{ const WX=window.IntMapWx, WP=window.IntMapWeather; const j=WX&&WX.point?await WX.point(ll.lat,ll.lng,{days:5,uv:false,gusts:true,ttl:300000}):null; facts=weatherFacts(j, WP&&WP.describe, L); }catch(_){}   /* the card's own numbers on the result (js/atlas-result-facts.js) — it used to say only 「🌤 大阪市」 */
          return R(ok, ok?note(icon('cloud-sun')+' '+esc(ll.name||a.place)+esc(facts)):warn('')); } return R(false, warn(esc(a.place||''))); }
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
    doc: [
      { in: 'data.query', text: 'CROSS-DATASET QUERY — THE ONE ACTION FOR A QUESTION WITH SEVERAL CONDITIONS AT ONCE: {"type":"query","from":"cities"|"countries"|"earthquakes"|"volcanoes"|"facilities","where":[{"col":COLUMN,"op":">="|">"|"<="|"<"|"=="|"!="|"between"|"in"|"contains","value":num|str,"min"?:num,"max"?:num,"values"?:[…]},…],"near"?:[{"of":TABLE,"withinKm":num,"require"?:bool,"as"?:str,"sinceDays"?:num,"minMagnitude"?:num,"kind"?:str,"country"?:str,"where"?:[…]},…],"in"?:{"countries":["JP","KZ",…ISO 3166-1 alpha-2]},"show"?:[COLUMN,…],"order"?:{"col":COLUMN,"dir":"desc"|"asc"},"limit"?:int} = IntMap FILTERS AND JOINS ITS OWN DATASETS AND ANSWERS WITH THE ACTUAL ROWS, in a table, pinned on the map, with the source of every column printed under it. This is the action for 「AかつBかつCの都市／地点」 — several numeric conditions, or a condition on one dataset AND a condition on another. USE THIS INSTEAD OF "analyze"/"mapReport"/"researchMap" FOR ANY SUCH QUESTION. Those write PROSE from evidence; this COMPUTES the answer from the data IntMap ships. Never answer a multi-condition question by explaining what would have to be checked — emit a query and let IntMap check it. TABLES and their COLUMNS: · cities (GeoNames cities1000, 147,924 places, offline) — pop, country (ISO-2), name, lat, lng, precipMm (annual, CHELSA 1981–2010), coastKm (great-circle distance to the OCEAN coastline), seaKm (same but landlocked seas such as the Caspian count as sea), elevM, tempC, windKmh, humidity, rainMm, and EVERY country statistic through its country: gdppc, pop, hdi, dem, tfr, lifeExp, internet, density, area, milSpendGDP (write them as "gdppc" or "country.gdppc"), plus ANY World Bank indicator as "wb:CODE" (e.g. "wb:SP.POP.GROW" = annual population growth %). · countries — the same metric names, one row per country. · earthquakes (USGS FDSN, live) — mag, depthKm, lat, lng; scope it with "sinceDays", "minMagnitude", "maxDepthKm". · volcanoes (Smithsonian GVP, offline) — name, country, elevM, lastEruptionYear (negative = BCE), lat, lng. · facilities (OpenStreetMap + Wikidata, live) — REQUIRES "kind" (nuclear, military, oil, port, airport, dam, data center… the same vocabulary the "poi" action takes) and optionally "country". coastKm vs seaKm IS A REAL CHOICE AND IT CHANGES ANSWERS: Tehran is 109 km from the Caspian and 611 km from the Persian Gulf. Use coastKm for 「海（外洋）から」 and seaKm when an inland sea should count; IntMap prints which one it used. EXAMPLES — 「人口100万人以上で、年間降水量500mm未満、海から200km以上、過去30日でM5以上の地震があった都市」 → {"type":"query","from":"cities","where":[{"col":"pop","op":">=","value":1000000},{"col":"precipMm","op":"<","value":500},{"col":"coastKm","op":">=","value":200}],"near":[{"of":"earthquakes","withinKm":150,"sinceDays":30,"minMagnitude":5}]}; 「人口500万人以上で40℃を超えている都市」 → {"type":"query","from":"cities","where":[{"col":"pop","op":">=","value":5000000},{"col":"tempC","op":">","value":40}]}; 「過去7日でM6以上の地震があり、半径100km以内に原発がある地点」 → {"type":"query","from":"earthquakes","sinceDays":7,"minMagnitude":6,"near":[{"of":"facilities","kind":"nuclear","withinKm":100}]}; 「GDP/人が2万ドル未満で人口増加率2%以上の沿岸都市」 → {"type":"query","from":"cities","where":[{"col":"gdppc","op":"<","value":20000},{"col":"wb:SP.POP.GROW","op":">=","value":2},{"col":"coastKm","op":"<=","value":25},{"col":"pop","op":">=","value":200000}]}; 「標高1500m以上、人口50万人以上、年間降水量300mm未満の都市」 → {"type":"query","from":"cities","where":[{"col":"pop","op":">=","value":500000},{"col":"precipMm","op":"<","value":300},{"col":"elevM","op":">=","value":1500}]}; 「NATO加盟国の都市で、ロシアの軍事施設から50km以内」 → {"type":"query","from":"cities","in":{"countries":["EE","LV","LT","PL","NO","FI","RO"]},"where":[{"col":"pop","op":">=","value":20000}],"near":[{"of":"facilities","kind":"military","country":"Russia","withinKm":50}]} — YOU enumerate the member countries, exactly as for "highlight". SPATIAL CONDITIONS — 「形そのもの」 FOR DISTANCE, INSIDE AND OVERLAP: "spatial"?:[{"rel":"within"|"contains"|"intersects"|"nearer_than","of"?:TABLE,"geometry"?:GeoJSON,"km"?:num,"where"?:[…],"require"?:bool,"as"?:str},…]. THESE ARE NOT "where" OPERATORS — a relation written into "where" runs nothing. "within" = the row’s own shape lies inside the target (the whole target table is taken as ONE set, so a row inside no single member but inside the union still counts); "contains" = the row’s shape encloses the target; "intersects" = it touches or overlaps; "nearer_than" with "km" = the SHORTEST distance from the row’s own shape to the target — from the road itself, from the boundary itself. THIS IS WHAT "near" CANNOT DO. "near" measures between PINS; a line or an area has no single pin, and before this its pin was the centre of its bounding box — which for a C-shaped ward or a coastal road lies outside the shape entirely. Use "near" for point-to-point (a city and an earthquake); use "spatial" the moment either side is a line or an area, or the question says 「道路から」「境界から」「〜の中に」「〜と重なる」. 「取り込んだ道路から500m以内の施設」 → {"type":"query","from":"facilities","kind":"…","spatial":[{"rel":"nearer_than","of":"<the roads dataset id>","km":0.5}]}; 「この県の中にある都市」 → {"type":"query","from":"cities","spatial":[{"rel":"within","of":"<the prefecture dataset id>"}]}. AND "from" IS NOT ONLY THE FIVE BUILT-IN TABLES: every dataset the reader has imported or produced with an analysis step is a table under its own id, with its own columns, and the "Datasets" list at the end of this prompt names the ones that exist right now. A relation IntMap does not recognise, a target table that is not there, or a session where the shape engine did not load is REPORTED BY NAME with the rows left untouched — never silently answered as 「0 件」. ORDER THE CONDITIONS HOWEVER YOU LIKE — IntMap re-orders them by cost itself and only pays for an expensive column on the rows that survived the cheap ones. A COLUMN THAT DOES NOT EXIST IS REPORTED, NOT GUESSED: IntMap says which condition it could not apply rather than dropping it silently. AN EMPTY RESULT IS AN ANSWER. If nothing matches, IntMap says so and prints what it evaluated; do NOT re-run the question as prose.\n' },
    ],
    schema: () => ({ type: 'object', properties: { from: str(), where: list(obj()), near: list(obj()), spatial: list(obj()), in: obj(), show: list(str()), order: obj(), limit: int(1, 200) }, required: ['from'] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L;
      { const _Q=await queryEngine(K); if(!_Q) return R(false, warn(L('The query engine could not be loaded.','クエリエンジンを読み込めませんでした。','Die Abfrage-Engine konnte nicht geladen werden.','Не удалось загрузить движок запросов.','No se pudo cargar el motor de consultas.'))); const _qr=await _Q.answer(a,{}); /* ⚠⚠ (#R620) THE RESULT DECLARES WHAT IT RESOLVED. Without a `resultKey`, js/atlas-turn-results.js identifies this operation by its ARGUMENTS, and `show` is an argument — so asking the same question twice while asking for one more column printed the same rows in two tables. The engine builds the key from the table, conditions, scope, joins, ordering and limit, which is exactly «what it did» and not «how it rendered». */ const _qx={}; if(_qr.objectIds&&_qr.objectIds.length) _qx.objectIds=_qr.objectIds; if(_qr.resultKey) _qx.meta={resultKey:_qr.resultKey}; return R(_qr.ok, _qr.html, Object.keys(_qx).length?_qx:null); }   /* ⚠⚠ (#R495) THE CROSS-DATASET QUERY — the action every multi-condition question needed and none of the 126 above could serve. The engine, the tables, the columns and the honesty rules are js/atlas-query.js; this line is the door and the argument binding, because the file it sits in may not grow (tests/atlas-capabilities-checks.test.mjs (#R318) ⓑ). */
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
    doc: [
      { in: 'spatial-analysis', at: 10, text: '{"type":"gis","op":OP,"inputs":[REF,…],"params":{…},"title"?:str}. The answer holds the new dataset\'s ID, and THAT ID IS THE INPUT OF THE NEXT STEP — chain them. A REF is a dataset id, a dataset title, or "layer:<id>" for a layer of the map (the refusal lists what exists, so never guess twice). ACQUIRING IS A STEP OF ITS OWN: {"type":"gis","inputs":[REF],"acquire":{…}} with NO "op" just fetches, and answers with the dataset row, its `coverage`, and `next` when the window holds more. `acquire` STATES THE REQUEST AND IS NOT THE CAMERA — {"bounds":[w,s,e,n],"where":[{field,op,value}],"fields":[str],"limit":int,"cursor":str,"time":str} for features, {"bounds":[w,s,e,n],"width":int,"height":int,"where":[…],"unit":str} for a grid; add "kind":"vector"|"raster" when a layer offers both, and pass the same object on an op call to narrow ITS inputs. A key a layer cannot execute is refused by name with the set it accepts. READ `coverage` BEFORE YOU STATE ANYTHING ABOUT THE WORLD: only completeness:"all" means the window you asked for was fully answered; "partial" and "sample" carry the reason, and a dataset computed from others carries theirs (`derived`, `inputs`, `undeclaredInputs` = an input that never said). To page, send the `next` value back as acquire.cursor. THE OPS, with inputs and params (* = required): filter(1){where*:[{field,op:">="|">"|"<="|"<"|"=="|"!="|"contains"|"in"|"between","value"}]}; buffer(1){radiusKm*:num (negative = inward, areas only),steps}; clip(2: target, Polygon window){}; intersect(2: Polygon,Polygon){}; difference(2: Polygon,Polygon){}; union(2: Polygon,Polygon){} (every part of both inputs once — a∩b, a−B, b−A, each row tagged _overlaySide); dissolve(1: Polygon){by: column, omitted = one group}; relate(2: any,any){predicate*:"intersects"|"within"|"contains"|"disjoint"|"nearer-than",maxKm} = THE SPATIAL WHERE, keeping the rows of input 0, and nearer-than measures from the SHAPES and writes _distanceKm; aggregate(2: Polygon,any){stat*:"count"|"sum"|"mean"|"min"|"max"|"areaWeightedMean",field,outName,quantity:{kind,space,time,period,unit}} — declare `quantity` and the aggregation is CHECKED against what the numbers mean: a density cannot be plain-averaged (it answers needs-weight and names the stat that can), a category cannot be summed at all. An UNDECLARED quantity is not permission — the run is unchanged and stats.aggregation records that nobody said; sample(2: Point, GRID){band,method:"nearest"|"bilinear",outName}; zonal(2: Polygon, GRID){band,stat*:"mean"|"sum"|"min"|"max"|"count"|"classes",outName,total:"observations"|"areaIntegral"|"apportioned",quantity:{kind,space,time,period,unit}} = 区域内集計 — `total` PICKS WHICH TOTAL YOU MEAN: observations = Σ of the values, areaIntegral = Σ value·km² (this is how a density becomes a population), apportioned = Σ value·covered fraction (a pixel total split between the zones it straddles). The rule that fits is derived from `quantity`, and an undeclared quantity returns the rule name with a null value rather than a number nobody can defend; rasterMask(1: GRID){band,op*:">="|">"|"<="|"<"|"=="|"!="|"in"|"between",value*}; rasterDiff(2: GRID,GRID){band}; timeWindow(1){from,to,mode:"overlaps"|"within"}; join(2: target, table){leftField*,rightField*,fields,prefix,unmatched:"keep"|"drop",duplicates:"refuse"|"first"} (joins on IDENTIFIERS as text, and reports how many rows found a partner); spatialJoin(2: target, source){predicate*:"intersects"|"within"|"contains"|"nearer-than",maxKm,cardinality*:"all"|"first"|"refuse",fields,prefix,unmatched:"keep"|"drop"} = 空間結合 — 相手の属性ごと結び付ける（区域内の施設、災害範囲と地物）。cardinality* IS REQUIRED because one ward with forty facilities is the ORDINARY case: "all" = one row per pair, "first" = input 1\'s first match with _joinPartners saying how many there were, "refuse" = stop and name the row. nearer-than measures from the SHAPES and writes _distanceKm; nearestJoin(2: target, source){maxKm,idField,fields,prefix,unmatched} = 最近傍結合 — each feature\'s nearest one, with _nearestKm, _nearestRow and (when you pass idField) _nearestId. maxKm is a LIMIT, not a search radius, so a row with nothing inside it has NO partner; timeJoin(2: target, dated){relation:"overlaps"|"within"|"contains",at,from,to,ends:"exclusive"|"inclusive",cardinality*,fields,prefix,unmatched} = 当時の区域・観測時点の統計・期間が重なる出来事。INPUT 1 MUST DECLARE A TIME AXIS; at/from/to REPLACE input 0\'s own axis, so a table with no time column can still ask 「1871 年時点の区域」. The window is HALF-OPEN [from,to) and a bare year is that whole year; convert(1){field*,to*,from,outName,replace,difference} = 単位換算 — ASK THIS INSTEAD OF TYPING A FACTOR INTO compute: the source unit is the column\'s own statement (or `from`), the recipe keeps 換算前後の単位と使った変換 in provenance.resolved, and a pair that is not the same quantity is REFUSED by name (unit-incompatible / unit-unreadable / unit-not-stated) instead of being multiplied anyway. `difference` matters only for °C/°F/K — a 10 °C reading is 283.15 K, a 10 °C gap is 10 K; compute(1){outName*,expr*,replace}; resample(2: GRID, GRID){method*,rule:"finer"|"coarser"|"first"} = PUT INPUT 0 ONTO THE LATTICE OF INPUT 1 — this is what `grid-mismatch` is telling you to do, so rasterDiff/rasterCalc on grids from different sources is resample THEN the op; rasterCalc(2: GRID,GRID){expr*,bandA,bandB,outName,unit} where the expression names ONLY `a` and `b` (the two pixels), e.g. "(a - b) / b" — pass the SAME id twice for single-grid arithmetic; mosaic(2: GRID,GRID){overlap*,method*} = both extents on one sheet, overlap* saying what the pixels both cover become; rasterize(1){width*,height*,field,stat,bbox} = features onto a lattice YOU size (extent defaults to that of the data); polygonize(1: GRID){band,outName} = one area per run of equal values, and it REFUSES a grid of measurements; measure(1){what*:"area"|"length",crs,unit,outName} = area or length per row — omit `crs` for the geodesic answer, or name one (e.g. "EPSG:32654") to measure on that plane, and the distortion lands in the same row; validate(1){prefix} = what is wrong with each geometry, as codes in a column; repair(1){winding,prefix} = fix rings and say per row what was changed and what is still wrong; coverage(1: Polygon){overlaps:"forbid"|"report"|"allow",gaps:"forbid"|"report"|"allow",edges:"forbid"|"report"|"allow",gapToleranceKm,edgeToleranceKm,limit} = 被覆の検査 — IS THIS SET OF AREAS A PARTITION: ground two of them both cover, holes between neighbours, and shared borders that do not actually match. validate/repair answer about ONE shape; this is the question about the SET. NAME AT LEAST ONE CONDITION — a call that states nothing is refused (coverage-nothing-asked) instead of answering an empty green, and a condition you leave out is simply not computed. Each word is yours to choose: "forbid" = a violation, "report" = MEASURE IT WITHOUT CALLING IT WRONG (an overlap is not automatically an error — disputed ground, deliberate double cover and the seam between two records cannot be told apart by geometry), "allow" = do not look. THE ANSWER IS GEOMETRY, NOT A COUNT: one row per finding, carrying _coverage (which kind of finding), _coverageOf (the identities of the features it is about), _coverageTolerated and _areaKm2 — so a finding goes straight into the next step (measure it, draw it, cut it away with difference). Tolerances are km and default to 0 = measured exactly as written; profile(2: Polygon, any){band,field,quantity:{kind,space,time,period,unit},reading:"total"|"typical"|"composition"|"presence",asOf,boundary:"center"|"allTouched"|"fractional",weightBy:"memberArea"|"intersectionArea",total:"observations"|"areaIntegral"|"apportioned",outName} = 同じ区域・同じ条件で、出典をまたいで比べられる列を作る. Input 1 is EITHER features OR a grid — add "kind":"vector"|"raster" when a layer offers both, and a grid needs its window like any GRID slot — and the row says which answered. There is no new arithmetic: it runs aggregate or zonal, and what it adds is ⑴ CHOOSING the arithmetic from what the numbers mean, so `reading` says what you want to know rather than how to compute it (total / typical / composition / presence; omit it and the declared quantity decides, and a category is never averaged), ⑵ STATING the conditions beside the column — <outName>_source, _method, _time, _quantityFrom, plus _asOf and _timeMatch when you give asOf, ⑶ leaving a REASON where the values would be when this source cannot answer (<outName>_why), because a column of nulls reads as 「そこには何も無かった」. asOf is COMPARED WITH what the source declares and is never written into it. Ask again on the same zones with another source to build the group: the columns are prefixed with outName, so the second source cannot overwrite the first (output-column-in-use); compareZones(2: Polygon,Polygon){field,quantity,outName} = 区域区分が変わったときに何を同じ対象として比べるのか — every intersection of the two divisions as a row carrying BOTH identities (_compareA,_compareB), its area, and the share it is of each side (_compareShareOfA,_compareShareOfB), plus the ground that has no partner at all (_compare:"unmatched-a"|"unmatched-b") = 比べられない部分. Name `field` and the value is apportioned by area share, but only where the quantity can be (a population can; a density, a ratio or a category cannot), and the assumption travels in the row (_compareApportionBy,_compareApportionAssumption = uniform-within-source-unit) or the reason it was not done does (_compareApportionWhy). IT RETURNS NO VERDICT: never 「分割」「併合」「同一」. That judgement is a threshold, and the threshold is YOURS to argue from the shares — this layer cannot hold it. Dates are carried when the datasets state them and recorded as unstated when they do not; neither side is given the other side date; reach(2: Polygon, any){band,field,quantity,reading,asOf,boundary,weightBy,total,outName} = 到達圏を他のデータと同じ土俵に乗せる — input 0 is catchments you already have (isochrones, service areas) and the evaluation is EXACTLY profile, column for column under the same conditions, because otherwise the answers are not comparable. What it adds is the ground the catchments SHARE: _reachOverlapKm2, _reachExclusiveKm2 and _reachOf per row, and stats.reach.sumDoubleCounts saying out loud that ADDING THE FACILITIES UP COUNTS THE SAME PEOPLE TWICE. The overlap is measured, not forbidden — catchments overlap as a matter of course, and a table that does not say so hands the reader an error they cannot see. A GRID slot takes a raster dataset, or a samplable map layer WITH {"sample":{"bounds":[w,s,e,n],"width":int,"height":int}} — the same three fields may be given inside `acquire` instead, but never in both at once — saying over what window and how finely to bake it. NOTHING IS DRAWN UNLESS YOU ASK: ' },
    ],
    schema: () => ({ type: 'object', properties: { op: str(), inputs: list(str()), params: obj(), title: str(), acquire: obj(), kind: one('vector', 'raster'), sample: obj() }, required: ['inputs'] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L;
      { await window.IntMapLazy.need('gisCore'); const _G=window.IntMapGis&&window.IntMapGis.atlas; if(!_G) return R(false, warn(L('The GIS engine could not be loaded.','GIS エンジンを読み込めませんでした。','Die GIS-Engine konnte nicht geladen werden.','Не удалось загрузить GIS-движок.','No se pudo cargar el motor GIS.'))); const _gr=await _G.run(a); return _gr.ok ? R(true,_gr.html,{meta:{gis:{op:_gr.op,dataset:_gr.dataset.id,count:_gr.dataset.count,drawn:!!_gr.drawn}}}) : R(false, warn(_gr.html)); }
    },
  },
  {
    row: ['data.rank',                  'rank',           '',                                                            'data',    'paint',   'map.choropleth',         'map,explanation',     'session', 'none',   'metric',   ''],
    doc: [
      { in: 'country-statistics', at: 10, text: '{"type":"rank","metric":KEY,"order":"top"|"bottom","n":int}; ' },
      { in: 'metric-keys', at: undefined },   /* documented by the chunk's own text, not a fragment */
    ],
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
    doc: [
      { in: 'country-statistics', at: 20, text: '{"type":"ratio","metricA":KEY,"metricB":KEY,"order":"top"|"bottom","n":int}; ' },
      { in: 'metric-keys', at: undefined },   /* documented by the chunk's own text, not a fragment */
    ],
    schema: () => ({ type: 'object', properties: { metricA: str(), metricB: str(), order: one('top', 'bottom'), n: int(1, 40) }, required: ['metricA', 'metricB'] }),
    async run(a, dctx, K) { const ensureData = K.ensureData, metSpec = K.metSpec, unknownMetric = K.unknownMetric, _fillMetric = K._fillMetric, clampN = K.clampN, ratio = K.ratio, lx = K.lx, R = K.R, listHtml = K.listHtml;
      { await ensureData(); const _a=metSpec(a.metricA),_b=metSpec(a.metricB); if(!_a) return unknownMetric(a.metricA); if(!_b) return unknownMetric(a.metricB);
          try{ await _fillMetric(_a.key); await _fillMetric(_b.key); }catch(_){}
          const n=clampN(a.n); const list=ratio(_a.key,_b.key,a.order==='bottom'?'bottom':'top',n); const t=lx(_a.m.label)+' / '+lx(_b.m.label); return R(!!(list&&list.length), listHtml(t,(list||[]).map(r=>({code:r.code,name:r.name,val:r.val})),'_ratio')); }
    },
  },
  {
    row: ['data.relate',                'relate',         '',                                                            'data',    'paint',   'map.choropleth',         'map,explanation',     'session', 'none',   'metric',   ''],
    doc: [
      { in: 'country-statistics', at: 30, text: '{"type":"relate","metricY":KEY,"metricX":KEY,"find":"low"|"high","n":int} = countries whose metricY is unusually LOW/HIGH for their metricX (regression residual; use for "Y relative to/for X", e.g. low HDI relative to GDP per capita = {"metricY":"hdi","metricX":"gdppc","find":"low"}); ' },
      { in: 'metric-keys', at: undefined },   /* documented by the chunk's own text, not a fragment */
    ],
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
    doc: [
      { in: 'country', at: 10, text: '{"type":"selectCountry","country":str} (open its info card); ' },
    ],
    /* genuinely interchangeable — the ONLY substitution repair may make */
    policy: { equivalents: ['data.timeSeries'] },
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { country: str(), name: str(), place: str() }, anyOf: [{ required: ['country'] }, { required: ['name'] }, { required: ['place'] }] }), /* `selectCountry` */
    async run(a, dctx, K) { const ensureData = K.ensureData, resolveCountry = K.resolveCountry, showCountryDetail = K.showCountryDetail, GE = K.GE, R = K.R, note = K.note, esc = K.esc, warn = K.warn, L = K.L;
      { await ensureData(); const c=await resolveCountry(a.country||a.name||a.place); if(c&&c.code&&typeof showCountryDetail==='function'){ try{ showCountryDetail(c.code,c.name); }catch(_){} if(c.ll){ try{ GE().camera.flyTo({center:[c.ll.lng,c.ll.lat],zoom:Math.max(GE().camera.getZoom(),3.5),duration:1000}); }catch(_){} } return R(true, note(icon('flag')+' '+esc(c.name))); } return R(false, warn(L('Country not found','国が見つかりません','Land nicht gefunden','Страна не найдена','País no encontrado')+': '+esc(a.country||a.name||a.place||''))); }
    },
  },
  {
    row: ['data.timeSeries',            'timeSeries',     'timeseries',                                                  'data',    'panel',   'panel.timeseries',       'panel',               'session', 'none',   'country',  ''],
    doc: [
      { in: 'country', at: 20, text: '{"type":"timeSeries","country":str} (historical chart); ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { country: str(), name: str(), place: str() }, anyOf: [{ required: ['country'] }, { required: ['name'] }, { required: ['place'] }] }),
    async run(a, dctx, K) { const ensureData = K.ensureData, resolveCountry = K.resolveCountry, showCountryDetail = K.showCountryDetail, R = K.R, note = K.note, L = K.L, esc = K.esc, warn = K.warn;
      { await ensureData(); const c=await resolveCountry(a.country||a.place||a.name); if(c&&c.code&&typeof showCountryDetail==='function'){ try{ showCountryDetail(c.code,c.name); }catch(_){} let ok=false; try{ if(window.IntMapTimeSeries&&window.IntMapTimeSeries.open){ window.IntMapTimeSeries.open(); ok=true; } }catch(_){} return R(ok, ok?note(icon('chart')+' '+L('Time-series','時系列','Zeitreihe','Динамика','Series temporales')+': '+esc(c.name)):warn('')); } return R(false, warn(L('Country not found','国が見つかりません','Land nicht gefunden','Страна не найдена','País no encontrado')+': '+esc(a.country||a.place||''))); }
    },
  },
  {
    row: ['data.populationIn',          'population',     'populationIn,popIn',                                          'data',    'none',    '',                       'explanation',         'read',    'none',   'area',     ''],
    doc: [
      { in: 'data.populationIn', text: 'POPULATION IN AN AREA: {"type":"population","target"?:"drawn"|"radius","place"?:str,"radiusKm"?:num} = EXACT population inside a shape, summed from the WorldPop 100m population grid (2020). target:"drawn" = the user\'s measured polygon; target:"radius" = the placed circle(s); place alone = that place\'s real boundary; place+radiusKm = a circle around it. Use for "この範囲の人口", "population within 30km of X".\n' },
    ],
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
              return R(true, note(icon('users')+' '+L('Population inside the circle(s): ','円内の人口: ','Bevölkerung im Kreis: ','Население в круге: ','Población en el círculo: ')+'<b>'+tot.toLocaleString()+'</b> · WorldPop 2020 (100m)'+(HOST.radiusItems.length>1?(' · '+L('sum of circles (overlaps counted twice)','複数円の合算（重なりは二重計上）','Summe der Kreise','сумма кругов','suma de círculos')):''))); }
            if(!geom&&a.place){ const km=+a.radiusKm||+a.km||0;
              if(km>0){ const ll=await geocode(a.place); if(!ll) return R(false, warn(esc(a.place)));
                geom=window.IntMapPopArea.circleGeom([ll.lng,ll.lat],km); label=esc(ll.name||a.place)+' · '+km+' km'; }
              else{ let e=null; try{ e=await _nomExtent(a.place); }catch(_){}
                if(e&&e.geojson&&/Polygon/.test(e.geojson.type||'')){ geom=e.geojson; label=esc(e.name||a.place); }
                else return R(false, warn(L('No boundary polygon found for','境界ポリゴンが見つかりません','Keine Grenze gefunden für','Не найдена граница','Sin límite para')+' '+esc(a.place))); } }
            if(!geom) return R(false, warn(L('Draw an area / place a circle first, or name a place.','先に範囲を描くか円を置くか、地名を指定してください。','Erst Gebiet zeichnen / Kreis setzen oder Ort nennen.','Сначала нарисуйте область/круг или укажите место.','Dibuja un área / círculo o indica un lugar.')));
            const r=await window.IntMapPopArea.estimate(geom);
            return R(true, note(icon('users')+' '+(label?label+' — ':'')+L('population: ','人口: ','Bevölkerung: ','население: ','población: ')+'<b>'+r.pop.toLocaleString()+'</b> · '+esc(r.src)+' '+r.year));
          }catch(e){ return R(false, warn(L('Population lookup failed (WorldPop busy) — try again.','人口を取得できませんでした（WorldPop混雑）— 再試行してください。','Bevölkerungsabfrage fehlgeschlagen — erneut.','Не удалось получить население — повторите.','Fallo al obtener población — reintenta.'))); } }
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
    doc: [
      { in: 'data.coverage', text: 'FIRST-LEVEL SUBDIVISIONS A SHAPE COVERS (prefectures, states, provinces, oblasts, départements): {"type":"admin1Coverage","place":str,"km":num} = every first-level administrative unit whose REAL outline meets a circle of that radius around that place; {"type":"admin1Coverage","points":[[lng,lat],…closed ring…],"limit"?:int (default 200)} = the same question for a polygon supplied directly — the ring drawPolygon takes, [lng,lat] pairs with the first point repeated last. The answer lists each unit with its country and, where the record carries one, its ISO 3166-2 code. It is read from the index IntMap SHIPS (4,515 first-level units) and touches NO network: a 500 km circle on Tokyo answers 32 prefectures in 121 ms. Use for 「東京から半径500kmの円が覆う都道府県は？」, "which US states does this polygon cross", 「この範囲に入る州を列挙して」, "list the oblasts within 300 km of Kharkiv". THIS IS A GEOMETRIC QUESTION, NOT A STATISTICAL ONE, AND THE DIFFERENCE IS NOT A DETAIL. IntMap holds NO indicator whatsoever for first-level units: no population, no GDP, no area, no density — nothing below the country. So 「都道府県を人口で色分けして」 / "shade the prefectures by population" / "color the German states by GDP" CANNOT BE DONE, and the honest first reply SAYS SO and names what IntMap does have instead (this coverage list, and country-level statistics). {"type":"mapMetric"} — the choropleth — shades WHOLE COUNTRIES only, and every metric KEY in this catalogue is a country figure; aiming it at prefectures shades nothing at all. AND IT DOES NOT TOUCH THE MAP: computing which units a shape covers and PAINTING them are two separate actions. To SHOW them, take the unit names this returns and pass them to {"type":"highlight"} in a second call — the same first-level index resolves a name such as 「神奈川県」 or 「Belgorod Oblast」 to its real outline, so the list and the painting are both real and neither is a substitute for the other.\n' },
    ],
    schema: () => ({ type: 'object', properties: { place: str(), country: str(), name: str(), km: num(0), radiusKm: num(0), points: list(list(), 3), limit: int(1, 4515) }, anyOf: [{ required: ['place', 'km'] }, { required: ['place', 'radiusKm'] }, { required: ['country', 'km'] }, { required: ['name', 'km'] }, { required: ['points'] }] }),
    async run(a, dctx, K) { const ADM1 = K.ADM1, L = K.L, esc = K.esc, note = K.note, warn = K.warn, geocode = K.geocode, R = K.R;
      { const _cv=await ADM1.coverageAnswer(a,{L,esc,note,warn,geocode}); return R(_cv.ok,_cv.html,_cv.meta?{meta:_cv.meta}:null); }   /* ⚠ (#R760) WHICH first-level subdivisions a shape covers — 「which prefectures does a 500 km buffer round Tokyo cover」 spent 4 m 42 s on production 2026-09-16 and listed none, because the shipped index (4,515 units) could only be asked BY NAME. The body is js/atlas-admin1.js `coverageAnswer`; it does NOT paint (#R743) — the names go to `map.highlight`. */
    },
  },
  {
    row: ['data.satelliteCompare',      'satelliteCompare','satCompare,satChange',                                       'data',    'panelPaint','panel.satcompare',     'panel,map',           'session', 'none',   'place',    ''],
    /* two dates or nothing — `from`/`to` are DATES here, not endpoints */
    doc: [
      { in: 'data.satelliteCompare', text: 'SATELLITE CHANGE DETECTION: {"type":"satelliteCompare","dateA":"YYYY-MM-DD","dateB":"YYYY-MM-DD","place"?:str} = capture the dated satellite view at two dates and report the visual changes (construction, vessels, disasters, land use) with both frames shown. REQUIRES the satellite base with a dated provider to be active; if it is not, tell the user to switch to Satellite first. Use for "この2日付で衛星画像を比較", "what changed here between X and Y".\n' },
    ],
    schema: () => ({ type: 'object', properties: { dateA: str(), dateB: str(), before: str(), after: str(), from: str(), to: str(), place: str() }, anyOf: [{ required: ['dateA', 'dateB'] }, { required: ['before', 'after'] }, { required: ['from', 'to'] }] }),
      /* (#R119) SATELLITE CHANGE DETECTION inside the Atlas thread (absorbs the standalone panel feature —
         same capture + vision pipeline, result returned as a normal reply with both frames embedded). */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, geocode = K.geocode, GE = K.GE, L = K.L, esc = K.esc, mdMini = K.mdMini;
      {
          if(!window._imSatCapture) return R(false, warn(''));
          if(a.place){ const ll=await geocode(a.place); if(ll){ try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),11),duration:800}); }catch(_){} await new Promise(r=>setTimeout(r,1400)); } }
          const va=String(a.dateA||a.before||a.from||'').slice(0,10), vb=String(a.dateB||a.after||a.to||'').slice(0,10);
          if(!va||!vb) return R(false, warn(L('Give two dates (dateA / dateB, YYYY-MM-DD).','2つの日付（dateA / dateB、YYYY-MM-DD）を指定してください。','Zwei Daten angeben (dateA/dateB).','Укажите две даты (dateA/dateB).','Indica dos fechas (dateA/dateB).')));
          const cap=await window._imSatCapture(va,vb);
          if(cap.err) return R(false, warn(esc(cap.err)));
          let txt2=''; try{ txt2=await window._imSatAnalyze(va,vb,cap.imgA,cap.imgB); }catch(e){ return R(false, warn(esc((e&&e.message)||'AI error'))); }
          let hh='<div style="display:flex;gap:6px;margin:4px 0;"><figure style="margin:0;flex:1;"><img src="'+esc(IntMapSafe.url(cap.imgA,{allowData:true}))+'" style="width:100%;border-radius:8px;" alt=""><figcaption style="font-size:10px;color:var(--text-muted);text-align:center;">'+esc(va)+'</figcaption></figure>'
            +'<figure style="margin:0;flex:1;"><img src="'+esc(IntMapSafe.url(cap.imgB,{allowData:true}))+'" style="width:100%;border-radius:8px;" alt=""><figcaption style="font-size:10px;color:var(--text-muted);text-align:center;">'+esc(vb)+'</figcaption></figure></div>'
            +'<div style="font-size:12px;line-height:1.6;">'+mdMini(txt2||'')+'</div>';
          return R(true, hh); }
    },
  },
  {
    row: ['data.layerValues',           'layerData',      'layerValue,layerQuery',                                       'data',    'none',    '',                       'explanation',         'read',    'none',   'point',    ''],
    doc: [
      { in: 'data.layerValues', text: 'LAYER DATA (read the REAL values of the layers currently displayed): {"type":"layerData","place"?:str,"lng"?:num,"lat"?:num,"layer"?:str} = live value of each active data layer at that point (air temp, SST, wind, precipitation, snow depth, aerosol/NO2/CO, Köppen class, elevation, every NASA GIBS science raster — LST, sea ice, SST anomaly, NDVI, water vapour, clouds, chlorophyll, soil moisture… read from the actual tile pixel via the colormap — every visible country choropleth\'s value — the core stat fills AND all ~50 World-Bank choropleths, on- or off-screen — and active-fire detection: real FIRMS hot-spot pixel counts within ~15 km when the thermal layer is on) + the actual features in view for point layers (cameras, news, volcanoes, live aircraft, live ships, earthquakes with magnitude, data centers, pharma hubs). No place = the pinned point or map center. Use this whenever the user asks WHAT a displayed layer shows ("ここの気温は？", "what does this layer say here?", "画面内のカメラは？", "今見えている飛行機は？", "この辺で山火事ある？").\n' },
    ],
    schema: () => ({ type: 'object', properties: { place: str(), lng: lng(), lat: lat(), layer: str(), layers: list(str()) }, anyOf: [{ required: ['place'] }, { required: ['lat', 'lng'] }] }), /* `layerData` */
      /* (#R119) LAYER DATA — read the REAL values of displayed layers at a point, or the real features in view.
         This is the query side of the IntMapLayers contract. */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, layerDoor = K.layerDoor, geocode = K.geocode, L = K.L, esc = K.esc, GE = K.GE, note = K.note;
      {
          const LY=window.IntMapLayers; if(!LY) return R(false, warn(''));
          const asked=a.layer?[String(a.layer)]:(Array.isArray(a.layers)?a.layers.map(String):null); const doors=asked?asked.map(s=>({q:s,d:layerDoor(s)})):null; const ids=doors?doors.map(x=>x.d&&x.d.read).filter(Boolean):null;   /* ⚠⚠⚠ (#R802) THE NAME ATLAS HOLDS IS THE PANEL'S NAME, AND THIS DOOR ONLY EVER ACCEPTED THE READING REGISTER'S OWN ids. Measured on production 2026-09-17, 「Compare the population density of Tokyo, Delhi and Lagos on the map.」: `data.layerValues` ran SEVENTEEN times, failed seventeen times and died at `step_budget`, while 「Population density (1 km grid)」 was on and drawn — `REG['Population density (1 km grid)']` is undefined, so `sampleAt` skipped it and this case told a reader who already had the layer on to turn a layer on. `layerDoor` reconciles the two registers; the sentences below say WHICH of five things went wrong. */
          /* point resolution: explicit place → geocode; "here" pin; else map centre */
          let px=null,py=null,pname='';
          if(a.place){ const ll=await geocode(a.place); if(ll){ px=ll.lng; py=ll.lat; pname=ll.name||a.place; } else return R(false, warn(L('IntMap could not place «','IntMap は「','IntMap konnte «','IntMap не смог найти «','IntMap no pudo ubicar «')+esc(String(a.place))+L('», so there is no point to read the layers at. Give coordinates, or name a place IntMap holds.','」を地図上に特定できなかったため、レイヤーを読む地点がありません。座標を指定するか、IntMap が持つ地名で言い直してください。','» verorten — kein Punkt, an dem die Ebenen gelesen werden könnten.','» — нет точки для чтения слоёв.','», así que no hay punto donde leer las capas.'))); }   /* ⚠⚠⚠ (#R802) A NAMED PLACE THAT DID NOT RESOLVE IS NOT 「the map centre」. Measured on this round's local build: `layerData {place:'Korean Peninsula'}` and `{place:'Amazon Basin'}` fell through to the camera centre and answered 「◈ map center — BWh · Hot desert」 — a reading of wherever the reader happened to be looking, handed back as an answer about the place they named. Falling through to the centre is right when NO place was named (#R119's 「here」 reading) and wrong the moment one was: it is the same sentence the layer half of this case says one line down about a named layer that resolved to nothing. */
          if(px==null&&a.lng!=null&&isFinite(+a.lng)){ px=+a.lng; py=+a.lat; }
          if(px==null&&K._herePoint&&isFinite(K._herePoint.lng)){ px=K._herePoint.lng; py=K._herePoint.lat; pname=K._herePoint.name||''; }
          if(px==null){ const c3=GE().camera.getCenter(); px=c3.lng; py=c3.lat; pname=L('map center','地図中心','Kartenmitte','центр карты','centro del mapa'); }
          const rows=(asked&&!ids.length)?[]:(await LY.sampleAt(px,py,(ids&&ids.length)?ids:null)); const vals=rows.filter(v=>v&&v.value!=null); const featLines=[];   /* (#R763) a row that was asked and could not answer carries `failed` and no value — 「訊けなかった」 is not a reading */   /* ⚠ (#R802) a NAMED layer that resolved to nothing is NOT widened back to 「all the active layers」: that answers a question nobody asked. */
          ((ids&&ids.length)?ids:LY.active()).forEach(id=>{ try{ const fs=LY.featuresIn(id,null); if(fs&&fs.length){ const nm2=(LY.state(id)||{}).label||id;
            const names=fs.slice(0,8).map(f=>{ const p2=f.properties||{}; const nm3=String(p2.name||((p2.mag!=null&&p2.place)?p2.place:'')||p2.title||p2.NAME||p2.callsign||p2.ident||p2.place||'').slice(0,40); return (p2.mag!=null&&nm3)?('M'+(+p2.mag).toFixed(1)+' '+nm3).slice(0,46):nm3; }).filter(Boolean);   /* (#R120) aircraft have a callsign, not a name; (#R121) quakes = M{mag} + place (their `title` already repeats the magnitude) */
            featLines.push(nm2+': '+fs.length+(names.length?(' — '+names.join(', ')+(fs.length>names.length?', …':'')):'')); } }catch(_){} });
          if(!vals.length&&!featLines.length){ const miss=(doors||[]).filter(x=>!x.d), mute=(doors||[]).filter(x=>x.d&&!x.d.read), off=(doors||[]).filter(x=>x.d&&x.d.read&&!x.d.on), nore=rows.filter(v=>v&&v.asked&&v.value==null&&!v.failed), blew=rows.filter(v=>v&&v.failed); const _dl=xs=>xs.map(x=>esc(x.d?x.d.label:x.q)).join(', '), _rl=xs=>xs.map(v=>esc(v.label||v.id)).join(', ');   /* ⚠ (#R802) FIVE DIFFERENT FACTS, FIVE DIFFERENT SENTENCES. The one sentence this case used to print told a reader with the layer already on to turn it on — the shape .agents/rules/one-pass-or-a-reason.md §2-1 calls 「the observer lied」, and Atlas rephrased and fired again seventeen times. ⚠ NONE OF THEM MOVES THE CAMERA: this capability is `read` in the CAPS table and must not change the map, so the fourth one STATES the repair and leaves the next step to Atlas. */
            if(miss.length) return R(false, warn(L('There is no layer called '+_dl(miss)+'. Name it as it appears in the layer panel, or ask for the layer list first.','「'+_dl(miss)+'」というレイヤーはありません。レイヤーパネルの表記で指定するか、先にレイヤー一覧を尋ねてください。','Es gibt keine Ebene namens '+_dl(miss)+'. Verwende die Bezeichnung aus dem Ebenen-Panel oder frage zuerst die Ebenenliste ab.','Слоя с именем '+_dl(miss)+' нет. Укажите название как в панели слоёв или сначала запросите список слоёв.','No existe ninguna capa llamada '+_dl(miss)+'. Usa el nombre del panel de capas o pide primero la lista de capas.')));   if(mute.length) return R(false, warn(L(_dl(mute)+': IntMap draws this layer but does not sample it at a point, so there is no value to read here. Ask for the features in view instead.',_dl(mute)+'：IntMap はこのレイヤーを描画しますが、地点の値としては提供していないため、ここで読み取れる値はありません。表示範囲内の地物を尋ねてください。',_dl(mute)+': IntMap zeichnet diese Ebene, tastet sie aber nicht punktweise ab — hier gibt es keinen Wert zu lesen.',_dl(mute)+': IntMap рисует этот слой, но не измеряет его в точке — значения здесь нет.',_dl(mute)+': IntMap dibuja esta capa pero no la muestrea en un punto, así que aquí no hay valor que leer.')));   if(off.length) return R(false, warn(L(_dl(off)+' can be read, but it is switched off, so nothing is loaded for it. Turn it on, then ask again.','「'+_dl(off)+'」は読み取り可能ですが、いまオフなのでデータが読み込まれていません。オンにしてからもう一度お尋ねください。',_dl(off)+' ist lesbar, aber ausgeschaltet — schalte sie ein und frage erneut.',_dl(off)+' читается, но слой выключен — включите его и спросите снова.',_dl(off)+' se puede leer, pero está apagada — actívala y vuelve a preguntar.')));
            if(nore.length) return R(false, warn(L(_rl(nore)+' was asked at '+esc(pname||(py.toFixed(3)+', '+px.toFixed(3)))+' and returned no value there. A raster layer only answers where its tiles are loaded, so if that point is off-screen or the map is zoomed out, move the map onto it first and ask again — this reading never moves the camera itself.','「'+_rl(nore)+'」に '+esc(pname||(py.toFixed(3)+', '+px.toFixed(3)))+' を問い合わせましたが、そこに値はありませんでした。ラスターのレイヤーはタイルが読み込まれている場所しか答えません。その地点が画面外、または縮尺が小さい場合は、先に地図をそこへ移動してからもう一度お尋ねください（この読み取り自体はカメラを動かしません）。',_rl(nore)+' wurde hier abgefragt und lieferte keinen Wert. Eine Rasterebene antwortet nur dort, wo ihre Kacheln geladen sind — bewege die Karte auf den Punkt und frage erneut.',_rl(nore)+' был опрошен здесь и не дал значения. Растровый слой отвечает только там, где загружены его тайлы — переместите карту на эту точку и спросите снова.',_rl(nore)+' fue consultada aquí y no devolvió valor. Una capa ráster solo responde donde sus teselas están cargadas — mueve el mapa sobre ese punto y vuelve a preguntar.')));   if(blew.length) return R(false, warn(L('Reading '+_rl(blew)+' failed at this point — the layer\'s own sampler threw. Try again in a moment.','「'+_rl(blew)+'」の読み取りに失敗しました（レイヤー側のサンプラが例外を返しました）。少し時間を置いてお試しください。','Das Lesen von '+_rl(blew)+' ist hier fehlgeschlagen — bitte gleich noch einmal versuchen.','Не удалось считать '+_rl(blew)+' в этой точке — повторите попытку.','La lectura de '+_rl(blew)+' falló en este punto — inténtalo de nuevo en un momento.')));
            return R(false, warn((LY.active().length?L('The layers that are on publish no readable value at this point.','現在オンのレイヤーは、この地点で読み取れる値を持っていません。','Die eingeschalteten Ebenen liefern an diesem Punkt keinen lesbaren Wert.','Включённые слои не дают читаемого значения в этой точке.','Las capas activas no dan ningún valor legible en este punto.'):L('No readable data on the active layers here. Turn a data layer on first.','ここで読み取れる表示中レイヤーのデータがありません。先にデータレイヤーをオンにしてください。','Keine lesbaren Layer-Daten hier.','Нет читаемых данных слоёв здесь.','Sin datos de capas legibles aquí.')   /* ⚠ (#R802) #R119's ORIGINAL SENTENCE, KEPT WORD FOR WORD — and now printed only on the ONE branch where it is true: no data layer is on at all, so 「turn a data layer on first」 asks for something the reader has not already done. Nine languages already carry this key (CONSTITUTION.md §0-3: narrowing what IntMap writes next is not licence to delete what a reader has); the four branches above are what used to be said in its place. */))); }
          let hh=note('◈ '+esc(pname||(py.toFixed(3)+', '+px.toFixed(3))));
          if(vals.length) hh+=note(vals.map(v=>'<b>'+esc(v.label)+'</b>: '+esc(String(v.value))).join('<br>'));   if(featLines.length) hh+=note(featLines.map(esc).join('<br>'));
          return R(true, hh); }
    },
  },
  {
    row: ['data.runways',               'runway',         'airports',                                                    'data',    'panel',   'panel.runway',           'panel',               'read',    'none',   'place',    ''],
    doc: [
      { in: 'tools-panels', at: 100, text: '{"type":"runway","place":str} (airport/runway search); ' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    chips: 'map.poi',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', properties: { place: str() }, required: ['place'] }), /* `runway` */
    async run(a, dctx, K) { const geocode = K.geocode, GE = K.GE, R = K.R, note = K.note, esc = K.esc, warn = K.warn;
      { const ll=await geocode(a.place); if(ll){ try{ GE().camera.flyTo({center:[ll.lng,ll.lat],zoom:Math.max(GE().camera.getZoom(),7)}); }catch(_){} let ok=false; try{ if(window.RunwaySearch&&window.RunwaySearch.open){ window.RunwaySearch.open({lng:ll.lng,lat:ll.lat}); ok=true; } }catch(_){} return R(ok, ok?note(icon('plane')+' '+esc(ll.name||a.place||'')):warn('')); } return R(false, warn(esc(a.place||''))); }
    },
  },
  {
    row: ['data.wxModel',               'wxModel',        'weatherModel,forecastModel',                                  'data',    'wxModel', 'map.layer,map.layerOption',              'map,explanation',     'session', 'none',   '',         ''],
    /* the layer id is resolved by `layerFor`, which also accepts the un-prefixed spelling */
    doc: [
      { in: 'layers', at: 70, text: '{"type":"wxModel","layer":"ec-temp"|"ec-precip"|"ec-wind"|"ec-gust"|"ec-cloud"|"ec-dew"|"ec-slp"|"ec-cape","model":"ecmwf_ifs"|"ncep_gfs013"|"dwd_icon"} = change WHICH FORECAST MODEL one weather layer reads. Each layer keeps its own model, so "compare GFS precipitation against the ECMWF pressure" is two calls on two layers. ECMWF IFS HRES is 9 km and 6 days; NOAA GFS is 13 km and 16 days; DWD ICON is 13 km and 5 days — say the horizon when it is why you chose one. NOT EVERY MODEL HAS EVERY FIELD: GFS 0.13 publishes no sea-level pressure, no CAPE and no dew point, and the call is REFUSED with a reason rather than emptying the map — do not promise a field a model does not carry. The map keeps showing the old model until the new one has actually painted, and the reply names the model and valid time that ARE on screen. Use for "気温をGFSで表示して", "switch the precipitation layer to ICON", "この降水量をヨーロッパモデルに". THIS CHOOSES WHICH FORECAST MODEL A LAYER READS — it does not say what the weather IS anywhere. For the observed and forecast weather AT ONE POINT (「その地点の天気」, "the forecast for a place") emit {"type":"weather","place":str}. ' },
    ],
    schema: () => ({ type: 'object', properties: { layer: str(), name: str(), model: one('ecmwf_ifs', 'ncep_gfs013', 'dwd_icon') }, anyOf: [{ required: ['layer', 'model'] }, { required: ['name', 'model'] }] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, note = K.note;
      { const W=window.IntMapWeatherEC; if(!W||!W.setModel) return R(false,warn('')); const want=String(a.layer||a.name||'').trim(), mid=String(a.model||'').trim(); const cfg=W.layerFor(want)||W.layerFor('ec-'+want.replace(/^(dl-)?(ec-)?/,'')); if(!cfg) return R(false,warn(L('no such weather layer','その気象レイヤーはありません','keine solche Wetterebene','нет такого слоя погоды','no existe esa capa meteorológica'))); return W.setModel(cfg.id,mid).then(r=>R(!!(r&&r.ok), (r&&r.ok)?note(icon('cloud-rain')+' '+(r.modelName||mid)+' · '+cfg.id+(r.validTime?(' · '+r.validTime):'')):warn(((r&&r.code)||'')))); }
    },
  },
  {
    row: ['data.value',                 'value',          'stat,lookup',                                                 'data',    'none',    '',                       'explanation',         'read',    'none',   'country',  ''],
    doc: [
      { in: 'country-statistics', at: 50, text: '{"type":"value","metric":KEY|"capital"|"currency"|"languages","country":str} = answer ONE country\'s ACTUAL stored figure/fact (use for "what is the population of X" / "capital of X"; omit "metric" for a full stat card of that country); ' },
      { in: 'metric-keys', at: undefined },   /* documented by the chunk's own text, not a fragment */
    ],
    schema: () => ({ type: 'object', properties: { country: str(), place: str(), name: str(), metric: str(), what: str() }, anyOf: [{ required: ['country'] }, { required: ['place'] }, { required: ['name'] }] }),
    async run(a, dctx, K) { const ensureData = K.ensureData, resolveCountry = K.resolveCountry, countryStats = K.countryStats, R = K.R, warn = K.warn, L = K.L, esc = K.esc, highlight = K.highlight, fitTo = K.fitTo, LA = K.LA, lx = K.lx, metSpec = K.metSpec, _fillMetric = K._fillMetric, fmtVal = K.fmtVal, METRICS = K.METRICS;
      { await ensureData(); const c=await resolveCountry(a.country||a.place||a.name);
          if(!c||!c.code||!countryStats[c.code]) return R(false, warn(L('Country not found','国が見つかりません','Land nicht gefunden','Страна не найдена','País no encontrado')+': '+esc(a.country||a.place||a.name||'')));
          const s=countryStats[c.code]; const mk=String(a.metric||a.what||'').trim();
          try{ highlight([c.code]); fitTo([c.code]); }catch(_){}
          const TXTF={capital:LA('Capital','首都','Hauptstadt','Столица','Capital'),currency:LA('Currency','通貨','Währung','Валюта','Moneda'),languages:LA('Languages','言語','Sprachen','Языки','Idiomas'),flag:LA('Flag','国旗','Flagge','Флаг','Bandera')};
          if(TXTF[mk]){ const v=s[mk]; return R(v!=null&&v!=='', '<div style="font-size:12.5px;line-height:1.6;"><b>'+esc(c.name)+'</b> — '+esc(lx(TXTF[mk]))+': <b>'+esc(v||'—')+'</b></div>'); }
          const _vs=metSpec(mk);   /* (#R740) XMET too — 「日本の平均寿命は？」 fell through to the stat card, which does not carry it */
          if(_vs){ try{ await _fillMetric(_vs.key); }catch(_){} const v=_vs.m.get(s); if(v==null||isNaN(v)) return R(false, warn(esc(c.name)+': '+L('no data for this metric','この指標のデータがありません','keine Daten für diese Kennzahl','нет данных по показателю','sin datos para esta métrica')));
            return R(true,'<div style="font-size:12.5px;line-height:1.6;"><b>'+esc(c.name)+'</b> — '+esc(lx(_vs.m.label))+': <b>'+esc(fmtVal(_vs.key,v))+'</b></div>'); }
          /* no / unknown metric → full compact stat card from everything we hold */
          let rowsH=''; for(const k in METRICS){ const v=METRICS[k].get(s); if(v==null||isNaN(v)) continue; rowsH+='<div style="display:flex;justify-content:space-between;gap:10px;"><span style="color:var(--text-muted);">'+esc(lx(METRICS[k].label))+'</span><b>'+esc(fmtVal(k,v))+'</b></div>'; }
          for(const k of ['capital','currency','languages']){ if(s[k]) rowsH+='<div style="display:flex;justify-content:space-between;gap:10px;"><span style="color:var(--text-muted);">'+esc(lx(TXTF[k]))+'</span><b>'+esc(s[k])+'</b></div>'; }
          return R(true,'<div style="font-weight:600;margin:2px 0 5px;">'+(s.flag?window.IntMapSafe.flag(s.flag)+' ':'')+esc(c.name)+'</div><div style="font-size:12px;line-height:1.7;">'+rowsH+'</div>'); }
    },
  },
  {
    row: ['data.compareStats',          'compareStats',   'compareCountries,statsCompare',                               'data',    'panel',   'panel.compare',          'panel',               'session', 'none',   'country',  ''],
    doc: [
      { in: 'country', at: 60, text: '{"type":"compareStats","countries":[str,… up to 10],"metrics"?:[str,…],"source"?:"wb"|"imf","view"?:"bar"|"timeseries"|"table"} = side-by-side statistical comparison panel (~28 indicators; bar chart by default, switchable to overlaid time-series or a free rearrangeable table; use for "compare Japan and Korea", "日本とドイツを比較", "表で比較して"). When the user names SPECIFIC indicators (e.g. "compare the USA and China — GDP, defense and population"), pass them in "metrics" using these keys: gdp, gdppc, gdpppp, gdppcppp, growth, infl (inflation), unemp (unemployment), debt, cab (current account), pop (population), life (life expectancy), tfr (fertility), mil (military % GDP), milb (military spending $ — use for "defense"/"military"), co2, net (internet), urban, exp (exports), fdi, health, edu, rnd, renew, forest, hom (homicide), area, hdi, demi (democracy index). Omit "metrics" when no indicators are named (the defaults open).\n' },
    ],
    chips: 'panel.compare',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) */
    schema: () => ({ type: 'object', properties: { countries: loose(), country: str(), metrics: list(str()), source: one('wb', 'imf'), view: one('bar', 'bars', 'timeseries', 'ts', 'time-series', 'table', 'pivot'), mode: one('bar', 'bars', 'timeseries', 'ts', 'time-series', 'table', 'pivot') }, anyOf: [{ required: ['countries'] }, { required: ['country'] }] }),
    async run(a, dctx, K) { const ensureData = K.ensureData, resolveCountry = K.resolveCountry, R = K.R, warn = K.warn, L = K.L, _cmpMetricKeys = K._cmpMetricKeys, note = K.note, esc = K.esc;
      { await ensureData(); await window.IntMapLazy.need('statsCompare');   /* (#R311) BEFORE _cmpMetricKeys — that resolver asks the panel for its real IND keys */
          const rawC=Array.isArray(a.countries)?a.countries:String(a.countries||a.country||'').split(/,|、|;| and | und | y | и |と| vs\.? |対/i).map(x=>x.trim()).filter(Boolean);
          const cds=[],missC=[]; for(const nm2 of rawC){ const c=await resolveCountry(nm2); if(c&&c.code){ if(cds.indexOf(c.code)<0) cds.push(c.code); } else missC.push(nm2); }
          if(!cds.length) return R(false, warn(L('Which countries should I compare?','どの国を比較しますか？','Welche Länder vergleichen?','Какие страны сравнить?','¿Qué países comparo?')));
          const viewM=({bar:'bar',bars:'bar',timeseries:'ts',ts:'ts','time-series':'ts',table:'table',pivot:'table'})[String(a.view||a.mode||'').toLowerCase()]||null;   /* (#R70) open straight into a view */
          /* (#R115) honour the REQUESTED indicators ("Compare … — GDP, defense and population" ignored them):
             resolve names/keys tolerantly (5 languages + synonyms) onto the panel's real IND keys. */
          const rawM=Array.isArray(a.metrics)?a.metrics.map(x=>String(x)):(a.metrics?[String(a.metrics)]:[]);
          const mkeys=[],missM=[];
          rawM.forEach(mm=>{ const mr=_cmpMetricKeys(mm); mr.keys.forEach(k=>{ if(mkeys.indexOf(k)<0) mkeys.push(k); }); mr.miss.forEach(x=>missM.push(x)); });
          let okC=false; try{ if(window.IntMapStatsCompare&&window.IntMapStatsCompare.open){ window.IntMapStatsCompare.open(cds.slice(0,10),mkeys.length?mkeys:null,(a.source==='imf'||a.source==='wb')?a.source:null,viewM); okC=true; } }catch(_){}
          /* (#R108/#R115) plain text, NO emoji in Atlas replies; name the indicators actually selected. */
          let mlbl=''; try{ if(okC&&mkeys.length&&window.IntMapStatsCompare.indLabel) mlbl=' — '+mkeys.map(k=>window.IntMapStatsCompare.indLabel(k)).join(', '); }catch(_){}
          let h2=okC?note(L('Country comparison opened','国の比較を開きました','Ländervergleich geöffnet','Сравнение стран открыто','Comparación abierta')+' ('+Math.min(10,cds.length)+')'+esc(mlbl)):warn('');
          if(cds.length>10) h2+=warn(L('Only the first 10 countries are compared','比較は最大10か国です','Nur die ersten 10 Länder','Только первые 10 стран','Solo los primeros 10 países'));
          if(missC.length) h2+=warn(L('Not found','見つからず','Nicht gefunden','Не найдено','No encontrado')+': '+esc(missC.join(', ')));
          if(missM.length) h2+=warn(L('Not an available indicator','比較指標にない項目','Kein verfügbarer Indikator','Нет такого показателя','Indicador no disponible')+': '+esc(missM.join(', ')));
          return R(okC,h2); }
    },
  },
  {
    row: ['data.exploreRelated',        'explore',        'findRelated,relatedMetrics',                                  'data',    'none',    '',                       'explanation',         'read',    'none',   'metric',   ''],
    doc: [
      { in: 'data.exploreRelated', text: 'RELATED-INDICATOR DISCOVERY: {"type":"explore","metric":KEY,"n"?:int} — computes which other indicators statistically move with the given one across all countries (Spearman + Pearson on the real data, sample sizes, biggest exception country) and presents them WITHOUT causal claims (use for "少子化と関連する指標を探して", "what correlates with democracy?"). Combine with mapMetric/scoreMap freely.\n' },
      { in: 'metric-keys', at: undefined },   /* documented by the chunk's own text, not a fragment */
    ],
    schema: () => ({ type: 'object', properties: { metric: str(), target: str(), key: str(), name: str(), n: int(1, 40) }, anyOf: [{ required: ['metric'] }, { required: ['target'] }, { required: ['key'] }, { required: ['name'] }] }), /* `explore` */
    async run(a, dctx, K) { const ensureData = K.ensureData, metSpec = K.metSpec, unknownMetric = K.unknownMetric, _fillMetric = K._fillMetric, countryStats = K.countryStats, isRankableCountry = K.isRankableCountry, R = K.R, warn = K.warn, L = K.L, METRICS = K.METRICS, XMET = K.XMET, _pearson = K._pearson, _ranks = K._ranks, lx = K.lx, nm = K.nm, esc = K.esc, note = K.note;
      { /* (#R75) vision §10 — which indicators MOVE WITH a
          target metric, computed on the real country data (Pearson + Spearman), reported without causal claims. */
          await ensureData();
          const sp=metSpec(a.metric||a.target||a.key||a.name);
          if(!sp) return unknownMetric(a.metric||a.target);   /* (#R740) the list was typed here by hand and had already drifted from `METRICS`+`XMET` — it is counted now */
          await _fillMetric(sp.key); await _fillMetric('lifeExp'); await _fillMetric('internet'); await _fillMetric('tfr');   /* lazy fields → WB bulk (sequential — WB throttles bursts) */
          const tv={}; for(const cd in countryStats){ const s=countryStats[cd]; if(!isRankableCountry(s)) continue; let v=sp.m.get(s); if(v==null||isNaN(v)) continue; if(sp.m.log&&v<=0) continue; tv[cd]=sp.m.log?Math.log(v):v; }
          if(Object.keys(tv).length<25) return R(false, warn(L('Not enough data for this metric','この指標はデータ不足です','Zu wenig Daten','Недостаточно данных','Datos insuficientes')));
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
          if(!out.length) return R(false, warn(L('No overlapping data to correlate','相関を計算できる重複データがありません','Keine überlappenden Daten','Нет пересекающихся данных','Sin datos superpuestos')));
          out.sort((x,y)=>Math.abs(y.rho)-Math.abs(x.rho));
          const top=out.slice(0,Math.max(3,Math.min(8,(+a.n||5))));
          let html='<div style="font-weight:600;margin:2px 0 5px;">'+icon('link')+' '+esc(lx(sp.m.label))+' — '+L('related indicators (all countries)','関連する指標（全カ国データ）','verwandte Indikatoren','связанные показатели','indicadores relacionados')+'</div>';
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
    doc: [
      { in: 'volcanoes', at: 10, text: '{"type":"volcano","name":EXACT_OR_PARTIAL_VOLCANO_NAME} = open that volcano’s intelligence card AND answer from its record — current level with the agency that published it, last eruption, largest recorded VEI, number of eruptions on record, type, country, elevation. Use for 「桜島の警戒レベルは？」「富士山について」, "tell me about Kilauea", "what is Etna doing". NAME ONE VOLCANO; this is not a search over all of them. ' },
    ],
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
    doc: [
      { in: 'world-heritage', at: 10, text: '{"type":"heritage","name":EXACT_OR_PARTIAL_NAME} = fly to that property, open its card and answer from the List — category, states parties, year inscribed, criteria, danger status, and how many component parts it is drawn as. Use for 「アンコール・ワットは世界遺産？」「白川郷を見せて」, "show me Angkor", "tell me about the Bamiyan valley". NAME ONE PROPERTY; this is not a search over all of them. ' },
    ],
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
    doc: [
      { in: 'measured-radiation', at: 20, text: '{"type":"radiationNear","lat":num,"lon":num,"km"?:num} = the monitoring stations around a point and what each of them is reading right now, nearest first — this is the join that makes 「原発 → 実測線量 → 風 → 拡散シミュレーション」 one chain: ask it for the readings around a plant before or after modelling a plume from it. It needs a REAL coordinate; resolve the place name first (highlight/compose already do that) rather than guessing one. THIS IS NOT THE PLUME SIMULATION. {"type":"sim","kind":"radiation",…} MODELS where material would travel under the wind; these two report what was MEASURED. Never answer a question about a real reading with the model, and never present the model’s output as a measurement. 50–200 nSv/h IS ORDINARY NATURAL BACKGROUND almost everywhere on earth — soil composition alone moves it by a factor of two — so do not describe a station in that band as elevated. The steps above it are the levels at which the networks THEMSELVES raise an alert. MOST NETWORKS PUBLISH NON-VALIDATED DATA, AND WEATHER MOVES THESE NUMBERS: BfS states that rain washing radon daughters out of the air and onto the ground raises a station by up to a FACTOR OF THREE for a few hours, and a failing instrument or ongoing calibration does the same. So a single elevated station — or even several nearby, since they share the weather — is not by itself evidence of a release. Say that when you report one, and check whether it is raining there before you call it anything else. VALUES ARE NOT COMPARABLE ACROSS A CALIBRATION CHANGE: BfS recomputed its whole network on 2025-07-01 and its readings rose 14–25% with no change in the radiation, so a German series that straddles that date has a step in it that is an artefact. A COUNTRY WITH NO DOTS IS A GAP IN OPEN-LICENSED COVERAGE, NOT A COUNTRY WITH NO RADIATION AND NOT A COUNTRY WITH NO MONITORING — the layer legend lists which networks answered, and 「no station within N km」 is a fact about the roster, never about safety. Europe in particular is thin here: the EU’s own EURDEP aggregate cannot be carried, because its data stays under each provider’s copyright and its only value-returning public endpoint is down.\n' },
    ],
    schema: () => ({ type: 'object', properties: { lat: num(-90, 90), lon: num(-180, 180), km: num(1, 1000) }, required: ['lat', 'lon'] }),
    /* the same case as `radiationNear` — shared with a spelling that fell through to it */
    run: radiationNearRun,
  },
  {
    row: ['data.companySites',          'companySites',   'companyFootprint,whoIsHere,companiesHere,industryMap',       'data',    'companySites', 'map.companySites',  'map,panel,explanation','session', 'none',   '',         'companyFootprint'],
    /* (ux-next) the company atlas read from the land: every published site of every company IntMap carries
       (data/companies/footprint.json, js/company-footprint.js). `query` counts without drawing; `show` (the default)
       also draws them and opens the card; `hide` takes them down. Never moves the camera. */
    doc: [
      { in: 'tools-panels', at: 345, text: 'COMPANY SITES (企業の拠点・企業の地図): {"type":"companySites","action"?:"show"|"query"|"hide","country"?:str,"groups"?:["hq"|"office"|"factory"|"rnd"|"logistics"|"other"],"sectors"?:[str],"inView"?:bool,"limit"?:int} = which of the companies in IntMap’s company atlas have published sites in a country (or in the part of the world on screen, inView:true), counted by company, by kind of site and by type (factory, refinery, power plant, data centre, mine…). action "show" (default) also draws every company’s sites on the map with a card listing the companies in view; "query" only counts; "hide" removes them. Use for 「日本に工場を持つ企業は？」「この地域にどの企業の拠点がある？」「半導体企業の拠点を地図に」, "which companies have factories in Mexico", "who operates here", "map every company’s refineries". Sectors are the company atlas keys (tech, semi, auto, energy, pharma…). Only the companies IntMap carries and only the sites their sources publish — say so; absence here is not absence on the ground. For ONE company’s profile and sites, open it by its name instead.\n' },
    ],
    schema: () => ({ type: 'object', properties: { action: one('show', 'query', 'hide'), country: str(), groups: list(one('hq', 'office', 'factory', 'rnd', 'logistics', 'other')), sectors: list(str()), inView: { type: 'boolean' }, limit: int(1, 50) } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, note = K.note, L = K.L, esc = K.esc, GE = K.GE, ensureData = K.ensureData, resolveCountry = K.resolveCountry;
      const act = a.action || 'show', lim = a.limit || 12;
      const ok = await window.IntMapLazy.need('companyFootprint'); const F = ok && window.IntMapCompanyFootprint;
      if (!F) return R(false, warn(L('The company atlas is not available', '企業アトラスを利用できません')), { meta: { code: 'MODULE_UNAVAILABLE', category: 'capability', retryable: false, produced: [], userGoalSatisfied: false } });
      if (act === 'hide') { F.close(); return R(true, note('✓ ' + esc(L('Company sites removed from the map', '企業の拠点を地図から外しました')))); }
      let cc = null, cname = '';
      if (a.country) { try { await ensureData(); } catch (_) { } const c = await resolveCountry(a.country);
        if (!c || !c.code) return R(false, warn(L('Country not found', '国が見つかりません') + ': ' + esc(a.country)), { meta: { code: 'NOT_FOUND', category: 'input', retryable: false, semanticTarget: a.country, produced: [], userGoalSatisfied: false } });
        cc = String(c.code).toUpperCase(); cname = c.name || cc; }
      let box = null; if (a.inView) { try { const b = GE().camera.getBounds(); box = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]; } catch (_) { } }
      const groups = Array.isArray(a.groups) && a.groups.length ? a.groups : null, sectors = Array.isArray(a.sectors) && a.sectors.length ? a.sectors : null;
      let q = null; try { q = await F.query({ cc, groups, sectors, box, limit: lim }); } catch (_) { q = null; }
      if (!q) return R(false, warn(L('The company sites could not be loaded', '企業の拠点を読み込めませんでした')), { meta: { code: 'UPSTREAM_UNAVAILABLE', category: 'evidence', retryable: true, produced: [], userGoalSatisfied: false } });
      if (act === 'show') { try { await F.open({ groups, sectors }); } catch (_) { } }
      const where = cname || (box ? L('the current view', '現在の表示範囲') : L('the world', '世界'));
      const nCo = q.totalCompanies, more = q.companies.length < nCo;
      let html = '<div style="font-weight:600;margin:2px 0 4px;">' + esc(where) + ' — ' + esc(L(q.sites + ' published sites of ' + nCo + ' companies', nCo + ' 社・公表された拠点 ' + q.sites + ' か所')) + '</div>';
      if (q.companies.length) html += '<ol style="margin:4px 0 6px 18px;padding:0;font-size:12px;line-height:1.5;">' + q.companies.map((c) => '<li>' + esc(c.name) + ' <span style="color:var(--text-muted)">' + esc(String(c.sites)) + '</span></li>').join('') + '</ol>' + (more ? '<div style="font-size:11px;color:var(--text-muted);">' + esc(L('…the ' + lim + ' with the most sites', '…拠点の多い上位 ' + lim + ' 社')) + '</div>' : '');
      html += '<div style="font-size:11px;color:var(--text-muted);">' + esc(L('Only the ' + q.of.companies + ' companies in IntMap’s company atlas, and only the sites their sources publish (profiles of ' + q.generatedAt + ').', 'IntMap の企業アトラスにある ' + q.of.companies + ' 社について、出典が公表している拠点だけです（プロフィール ' + q.generatedAt + ' 時点）。')) + '</div>';
      return R(true, html, { meta: { code: q.sites ? 'OK' : 'NO_RESULTS', category: q.sites ? 'ok' : 'evidence', retryable: false, semanticTarget: cc || (box ? 'view' : 'world'), produced: act === 'show' ? ['map', 'panel', 'explanation'] : ['explanation'], userGoalSatisfied: true,
        companySites: { country: cc, sites: q.sites, totalCompanies: nCo, groups: q.groups, types: q.types, countries: q.countries, companies: q.companies, of: q.of, asOf: q.generatedAt } } }); },
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
