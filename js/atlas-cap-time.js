/* ============================================================================
 *  IntMap · Atlas capabilities — the `time.*` namespace   (js/atlas-cap-time.js)
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
import { str, bool, num, int, lng, lat, list, loose, one } from './atlas-caps.js';
import { IntMapTime } from './chronos.js';
import { changesPeriod, diffPolities, diffEconomy, diffLayers, rankChanges, boxesMeet, bboxOfGeometry } from './atlas-reasoning.js';   /* (atlas-reasoning) time.changes: what is decided is in that module, as values */

export default [
  {
    row: ['time.travel',                'timeTravel',     'setTime,timeSet',                                             'time',    'time',    'time',                   'map,time',            'session', 'none',   '',         ''],
    /* Chronos: a year, a date, a number of days — or the return to live. With none of them the
       case says «give a year or date», which is what this branch list makes it stop needing to. */
    doc: [
      { in: 'tools-panels', at: 220, text: '{"type":"timeTravel","year":int} (year uses astronomical numbering: 0 is 1 BC; supported range comes from the master clock) or {"type":"timeTravel","date":"YYYY-MM-DD"} or {"type":"timeTravel","daysAgo":int}, and {"type":"timeTravel","now":true} to return to live = CHRONOS, the MASTER SPACETIME CLOCK (window.IntMapTime; the panel bottom-right is called Chronos and 「time machine」 is its old name): it moves the WHOLE map together — the news feed, the Countries statistics (real World Bank figures for that year: GDP, population, life-expectancy…), the country choropleths, historical borders (and a country highlight drawn while a past year is shown uses that year\'s polity shapes), historical city names and Pleiades settlement-name records (approximate source periods and representative points, not exact founding dates or surveyed sites), the Köppen climate era, NATO/EU accession, the day/night terminator, the live-satellite positions and — while the chosen instant is inside the forecast window — the ECMWF weather layers. Use a YEAR for history ("1990年の世界", "show the world in 1949", "rewind to 1980"); use daysAgo/date for the recent decade of news. THE HISTORICAL BORDERS ARE DAY-EXACT, NOT YEARLY (CShapes validity dates, 1886-2019: 369 distinct border-change days). A full "date" really does draw the world as it stood on THAT DAY, so when the user asks about a treaty, a partition, an independence or a dissolution, emit the date it took effect — {"type":"timeTravel","date":"1920-10-28"} — instead of rounding to the year. A bare year lands on mid-June and shows only the world in force then, which for a dense year is a small part of the story: 1920 alone contains fourteen border-change days and five genuinely different worlds. Prefer this over Earth Replay for setting the time; ' },
    ],
    /* (where-when-search) THE READER'S OWN WORDS FOR «THAT DAY» — the request that asks WHEN something happened is
       answered by moving the clock to the day it took effect (the entry's own text says so). Without them time.travel
       had no evidence of its own in such a request and was found only through the `time` category hint — which the
       search withdraws the moment any other time capability is named (js/atlas-capabilities.js `search`), so naming a
       place beside the date (time.whereWhen) took time.travel out of the list. Measured on the answer key: 「On what
       date was the Berlin Wall opened? Show Berlin on the map.」 lost time.travel. */
    phrases: () => ['何年何月何日', '何月何日', 'の日付'].concat(['on what date', 'what date', 'which day', 'rewind to', 'go back to']),
    schema: () => ({ type: 'object', properties: { year: int(), date: str(), daysAgo: int(), value: num(), now: bool(), reset: bool(), live: bool() }, anyOf: [{ required: ['year'] }, { required: ['date'] }, { required: ['daysAgo'] }, { required: ['value'] }, { required: ['now'] }, { required: ['reset'] }, { required: ['live'] }] }), /* `timeTravel` */
      /* (#R94) time-travel now drives the WHOLE spacetime OS (IntMapTime): news, the Countries statistics,
         borders, the climate era, NATO/EU accession & the day/night terminator all move together. Accepts a
         year (deep time back to `IntMapTime.min` — AD 1 since #R604), an exact date, or daysAgo; "now/reset" returns everything to live. */
    async run(a, dctx, K) { const res = await travel(a, dctx, K); return withCoverage(res, K); },
  },
  {
    row: ['time.whereWhen',             'whereWhen',      'placeAtTime,goWhereWhen',                                     'time',    'time',    'time,camera',            'map,time',            'session', 'none',   'text',     ''],
    /* (where-when-search) «WHERE + WHEN» AS ONE LINE — the reading the search field and the palette use (js/where-when.js
       `interpret`), so 「京都 1600」 typed to Atlas is read exactly as it is in the search field: the place by any name it had
       (the device's gazetteer, the historical city names, Pleiades) and the instant by syntax (CLDR era words and month
       names, ICU's Japanese eras). One candidate that IS the name, or an instant with no place, is applied; several are
       returned for the planner to `pick` — nothing is guessed. */
    doc: [
      { in: 'tools-panels', at: 221, text: '{"type":"whereWhen","query":str,"pick"?:int} = WHERE + WHEN IN ONE LINE / 場所と時刻を一度に — the reading the search field uses: "query" is the reader\'s own line naming a place and an instant ("Kyoto 1600", "Berlin May 1945", "ローマ 紀元前44年", "Constantinople 1453", "1900年の上海", "江戸 1868-01", "慶長5年 京都"); the place is found by its name THEN or today (the gazetteer, the historical city names — Constantinople finds Istanbul — and Pleiades\' ancient places), the instant is read as written (years, BC/AD and 紀元前, month names, ISO dates, 年月日, Japanese era years via the platform calendar; a Japanese month before 1873 is lunisolar and only its year is used; other calendars\' reign years are refused with the reason). It flies there AND sets the master clock, which draws the historical map of that instant. An instant with no place moves only the clock. When several places answer it returns them numbered and moves nothing — call again with "pick":n. Prefer it over view.flyTo + timeTravel whenever the user names a place together with a year or date. ' },
    ],
    phrases: () => ['の年の', '年の地図', '時代の', 'に行って'].concat(['in the year', 'at the time of', 'as it was in']),   /* the reader's own words for «that place, then» */
    schema: () => ({ type: 'object', properties: { query: str(), pick: int() }, required: ['query'] }),
    /* the run lives in js/atlas-where-when.js, fetched on first use, so the Atlas chunk does not carry it */
    async run(a, dctx, K) { const { whereWhen } = await import('./atlas-where-when.js'); const res = await whereWhen(a, K); return withCoverage(res, K); },
  },
  {
    row: ['time.coverage',              'timeCoverage',   'layerTime,whatCanBeDrawn',                                    'time',    'none',    '',                       'explanation',         'read',    'none',   '',         ''],
    /* (world-at-time) WHAT A MAP AT ONE INSTANT CAN DRAW — for every layer, from what its source states
       (js/layer-time-decl.js through js/layer-time-kernel.js), without switching anything on or moving
       the clock. `on` limits it to the ticked layers. No instant → the clock's. */
    doc: [
      { in: 'time.coverage', text: 'WHAT A MAP AT ONE INSTANT CAN DRAW: {"type":"timeCoverage","year"?:int (astronomical: 0 is 1 BC),"date"?:"YYYY-MM-DD","on"?:bool} = for EVERY layer (or only the ticked ones with on:true), whether its source states that instant — DRAWN (the source states it), DRAWN FROM ANOTHER DATE (a series past its last year, a dated snapshot on a later day — the layer names the date it shows), or NOT DRAWN (nothing states it: a live feed in the past, a modern snapshot before its date, a record outside its years) — with the reason in words. Nothing is switched on and the clock does not move. No year/date = the instant on the clock. Use for 「1914年の地図に何が描ける？」 / 「which layers work in 1600」 / before turning layers on for a past date. When the clock is in the past, a layer that states nothing about it is NOT drawn even with its box ticked, and its row says why — {"type":"timeTravel"} reports those ticked layers in its own result. For the instant ON THE CLOCK it also reports how much of the land inside a polity carries a recorded first-level subdivision (the rest is hatched on the map as «no record», not drawn as if it had none) and the ground two subdivisions claim at once, by kind: seam (a year-precision handover), duplicate (one unit held twice upstream), contested (two different units claim it; not judged).' },
    ],
    schema: () => ({ type: 'object', properties: { year: int(), date: str(), on: bool() } }),
    async run(a, dctx, K) { return coverage(a, K); },
  },
  {
    row: ['time.cityPopulation',        'cityPopulation', 'historicalPopulation,largestCities,urbanPopulation',          'time',    'none',    '',                       'explanation',         'read',    'none',   '',         ''],
    /* (hist-urban-population) THE HISTORICAL URBAN-POPULATION RECORD, ASKED BY YEAR OR BY CITY. The rule — which figure a
       city shows at a year, how long a stated figure is carried, which cities are listed — is js/hist-urban.js (the ONE place;
       the map layer reads the same functions), over data/hist-urban.json (Reba, Reitsma & Seto 2016, Chandler + Modelski,
       CC BY 4.0). Nothing is interpolated or chosen: where both books state the same year, both figures come back. */
    doc: [
      { in: 'time.coverage', at: 22, text: '{"type":"cityPopulation","year"?:int (the calendar year as written, positive),"era"?:"BC"|"AD" (default AD),"city"?:str,"limit"?:int (default 10)} = HISTORICAL CITY POPULATIONS / 歴史上の都市人口 — what the historical urban-population record states (Reba, Reitsma & Seto 2016: the geocoded tables of Chandler 1987 and Modelski 2003, 3700 BC – AD 2000, CC BY 4.0). With a YEAR: the largest cities the record lists at that year, each with its country, the figure(s) AS THE BOOK STATES THEM for the year it stated them (statedYear — nothing is interpolated, a figure is carried only inside the record’s own restatement window) and the book; where Chandler and Modelski both state the same year BOTH figures are returned and neither is chosen. With a CITY (and optionally a year): every city the record holds under that name — homonyms (Springfield, Portland) stay separate, each with its country and coordinates — with its whole population history, its state at the year, or the explicit statement that the record lists none (with the nearest years it does state). Absence is «not listed», never «did not exist»: each table lists cities only above its size threshold (the result carries them). Quote the figures with the book and the stated year, say which are Chandler and which Modelski, and quote the source and licence. No year and no city = the span and tables of the record. If the layer row dl-histurban exists, it draws the same record on the map. Use for 「1000年に人口が一番多かった都市は？」「紀元前500年のバビロンの人口」「ローマの人口の推移」「何年の人口」「largest cities in 1500」「population of Baghdad in 1000」「urban population history」. ' },
    ],
    phrases: () => ['都市人口', '人口の多い都市', '何年の人口', '人口の推移', '最大の都市'].concat(['largest cities', 'city population', 'urban population', 'population history']),   /* the Japanese phrases, then the English words — two lists, not translations of each other */
    schema: () => ({ type: 'object', properties: { year: int(), era: str(), city: str(), limit: int() } }),
    /* the answer lives in js/atlas-hist-urban.js, fetched on first use, so the Atlas chunk does not carry it */
    async run(a, dctx, K) { const { cityPopulation } = await import('./atlas-hist-urban.js'); return cityPopulation(a, K); },
  },
  {
    row: ['time.borderSource',          'borderSource',   'borderProvenance,lineSource,whyThisBorder,boundarySource',       'time',    'none',    '',                       'explanation',         'read',    'none',   'place?',   ''],
    /* (border-provenance) WHERE A DRAWN BORDER COMES FROM — the same facts the card on a pressed line shows
       (js/border-provenance-card.js): for every record drawing a shape at the point (or on either side within
       radiusKm), which record and row, its identifiers, who stated each date, how its outline was made, the
       reviews and the licence. With no place it answers for the line the reader last pressed. It never takes
       the map centre (CONSTITUTION.md §5). */
    doc: [
      { in: 'time.coverage', at: 26, text: '{"type":"borderSource","place"?:str,"lng"?:num,"lat"?:num,"radiusKm"?:num,"open"?:bool} = WHERE A BORDER ON THE MAP COMES FROM / この国境・区分線の根拠 — for the current map date, every record that draws a country or subdivision shape at the place (radiusKm > 0: the shapes on either side of the lines within that distance): the record (CShapes, OpenHistoricalMap relation, Cliopatria, historical-basemaps sheet, IntMap reconstruction), its identifiers (OHM relation id, Wikidata, Seshat ID, CShapes gwcode), WHO STATED EACH DATE (upstream verbatim, year-only, derived and how, or not stated), the precision and simplification of the outline, reviewed courses and notes, the licence, and for a reconstruction the dossier it was built from; also opens the same card on the map (open:false to only answer). With no place or coordinates it answers for the line the reader last pressed. Use for 「この国境の出典は？」「この線は誰が引いた？」「この県境の根拠」「この年代の国境はどこから来ている？」, "where does this border come from?", "what is the source of this line?"; quote only what it returns — a field it says is not stated is not stated; ' },
    ],
    phrases: () => ['国境の出典', '国境の根拠', 'この線の根拠', '境界線の出典', '区分の根拠', '誰が引いた'].concat(['border source', 'boundary source', 'where does this border come from', 'line provenance']),   /* the Japanese phrases, then the English words — two lists, not translations of each other */
    schema: () => ({ type: 'object', properties: { place: str(), lng: lng(), lat: lat(), radiusKm: num(0, 500), open: bool() } }),
    /* the card module answers it, fetched on first use, so the Atlas chunk does not carry it */
    async run(a, dctx, K) { const { BorderProvenanceCard } = await import('./border-provenance-card.js'); return BorderProvenanceCard.atlas(a, K); },
  },
  {
    row: ['time.yearbook',              'yearbook',       'readYear,worldInYear,yearBook',                               'time',    'none',    'time',                   'explanation',         'session', 'none',   '',         ''],
    /* (map-layer-system) THE YEAR BOOK — the instant read off the records the map draws (js/year-book.js): the polities
       the border record draws (largest by the area of the drawn shape), the days inside the year on which it changes and
       who appears / is gone / gets new borders on each, the wars data/wars.json documents with their dated events, the
       Maddison Project's population and GDP per head where it states the year, and how many layers state the instant.
       Read-only unless `show:true`, which moves the clock there and opens the page in the Chronos panel. */
    doc: [
      { in: 'time.coverage', at: 20, text: '{"type":"yearbook","year"?:int (astronomical: 0 is 1 BC),"date"?:"YYYY-MM-DD","show"?:bool} = READ ONE INSTANT off the records the map itself draws, as a page: how many polities the border record draws and the largest by drawn area (with the record’s own citation — CShapes 2.0 from 1886, OpenHistoricalMap from 1689, before that the historical-basemaps period maps), EVERY DAY INSIDE THAT YEAR ON WHICH THE BORDER RECORD CHANGES with who appears, who is gone and whose borders change, the wars IntMap’s war record documents in force and their dated events, the Maddison Project population and GDP per head where it states the year (by country code, not by polity), and how many layers can draw the instant. No year/date = the clock’s instant. show:true moves the clock there and opens the YEAR BOOK / 年鑑・その年の世界 page in the Chronos panel. Answer from the facts it returns; it states only what a record states. Use for 「1920年の世界はどうだった？」「1914年に国境が変わった日は？」「what did the map look like in 1500」「1945年の主な出来事」. ' },
    ],
    schema: () => ({ type: 'object', properties: { year: int(), date: str(), show: bool() } }),
    async run(a, dctx, K) { return yearbook(a, K); },
  },
  {
    row: ['time.polityArc',             'polityArc',      'riseAndFall,polityLife,greatestExtent,polityExtent',          'time',    'time',    'camera,time',            'map,time,explanation', 'session', 'none',   '',         ''],
    /* (hist-product) RISE AND FALL — one polity read across the whole of time (js/polity-arc.js over data/polity-arcs.json,
       written by the map's own js/time-borders.js): the first and last year the map draws it and whether each edge is the
       polity's or a record's, the year and size of its largest DRAWN extent and the record that drew it, how many drawn
       states it has, and the other names the records give it. Read-only unless `go` (the clock to that year and the map
       fitted), `play` (the time-lapse through exactly the years its shape changes) or `show` (the sheet). */
    doc: [
      { in: 'time.coverage', at: 21, text: '{"type":"polityArc","name"?:str (the polity as the map names it, in English or Japanese: "Mongol Empire", "モンゴル帝国", "Roman Empire"),"qid"?:str (its Wikidata item),"year"?:int (when several names share the item, the one drawn that year),"pick"?:int,"go"?:"peak"|"first"|"last","play"?:bool,"show"?:bool} = RISE AND FALL / 政体の盛衰 — ONE POLITY ACROSS THE WHOLE OF TIME, read off the border records the map draws (Cliopatria to 1689, OpenHistoricalMap 1689–1885, CShapes 1886–2019, and the historical-basemaps sheets at their own years): the first and last year the map draws it (an edge that is only where a record begins or hands over is said to be so — it is not a founding or a fall), the year and area of its LARGEST DRAWN EXTENT and which record drew it, how many drawn states it has, the years its drawn shape changes, and the other names the records give it (same Wikidata item, or the same name the map writes). With no name it returns the polities with the largest drawn extents. go:"peak" moves the clock to the year of the largest extent and fits the map to it; go:"first"/"last" likewise; play:true plays the time-lapse through exactly the years its shape changes; show:true opens the sheet with its chart. Several matches return numbered candidates and move nothing — call again with "pick":n. AREAS ARE OF THE DRAWN SHAPE, NOT OF REAL CONTROL — say so, and say which record drew it. Use for 「モンゴル帝国の最大版図を見せて」「ローマ帝国はいつ一番大きかった？」「オスマン帝国の盛衰」「show the rise and fall of the Ottoman Empire」「when was the Roman Empire at its greatest extent」「the largest empires in history on the map」. ' },
    ],
    phrases: () => ['最大版図', '盛衰', '興亡', '一番大きかった', '最も広かった', '領土の推移'].concat(['greatest extent', 'rise and fall', 'at its height', 'at its peak', 'largest empire', 'largest empires']),
    schema: () => ({ type: 'object', properties: { name: str(), qid: str(), year: int(), pick: int(1, 99), go: one('peak', 'first', 'last'), play: bool(), show: bool() } }),
    /* the run lives beside the sheet (js/polity-arc.js), fetched on first use, so the Atlas chunk does not carry it */
    async run(a, dctx, K) { const P = await import('./polity-arc.js'); return P.atlas(a, K); },
  },
  {
    row: ['time.onThisDay',             'onThisDay',      'thisDayInHistory,todayInHistory,onThisDate',                  'time',    'time',    'camera,map.layer,time',  'map,time,explanation', 'session', 'none',   '',         ''],
    /* (marketing-next) ON THIS DAY — the dated events of one CALENDAR day in every year the records cover (js/on-this-day.js over
       data/on-this-day.json): the days the border record (CShapes 2.0) begins drawing, stops drawing or redraws a polity, under
       the names the map writes, and the war record's dated events. Read-only, unless `open` (the n-th event: the map on its
       date, its place and, for a war, its layer — the share link's restore, read back) or `show` (the sheet, for the reader). */
    doc: [
      { in: 'time.coverage', at: 25, text: '{"type":"onThisDay","date"?:"MM-DD"|"YYYY-MM-DD" (only the month and day are used; default: the reader\'s today),"open"?:int (1-based, an event of the list),"show"?:bool} = ON THIS DAY / この日の歴史 — every event IntMap\'s records date to that calendar day, in every year they cover: the days the border record (CShapes 2.0, 1886–2019) begins drawing, stops drawing or redraws a polity (under the names the map writes on that day) and the dated events of IntMap\'s war record; a 1 January border day is marked as possibly year-only. The OpenHistoricalMap record (1689–1885) is not included — its dates carry no day precision. open:n opens the n-th event on the map (its date, its place and, for a war, its war layer) and reports it open only once the clock and the layer say so; show:true puts the list in front of the reader as a sheet they can step day by day. Answer from the events it returns, as the record states them ("the map begins drawing …"), not as a history you add. Use for 「今日は何の日？」「10月3日に何があった」「この日の歴史地図」「on this day in history」「what happened on 15 August」. ' },
    ],
    schema: () => ({ type: 'object', properties: { date: str(), open: int(1, 99), show: bool() } }),
    async run(a, dctx, K) { return onThisDay(a, K); },
  },
  {
    row: ['time.weeklyEarth',           'weeklyEarth',    'thisWeekOnEarth,weeklyDigest,worldThisWeek,earthThisWeek',    'time',    'time',    'camera,map.myMap,time',  'map,time,explanation', 'session', 'none',   '',         ''],
    /* (weekly-earth) THIS WEEK ON EARTH — one ISO week of the archive scripts/build-weekly-earth.mjs keeps (js/weekly-earth.js
       over data/weekly-earth.json): the earthquakes of M 5.5+ the USGS catalogue lists and the natural events NASA's EONET
       tracks, the week's headline (its largest earthquake — a count), and the address of the week's public page. Read-only,
       unless `open` (the n-th item: the map on its place and day with the item as a received pin — the share link's restore,
       read back) or `show` (the whole week on the map, every placed item a pin). */
    doc: [
      { in: 'time.coverage', at: 27, text: '{"type":"weeklyEarth","week"?:"YYYY-Www"|"YYYY-MM-DD" (an ISO week, or any day inside it; default: the newest week the archive holds),"open"?:int (1-based, an item of the list),"show"?:bool} = THIS WEEK ON EARTH / 今週の地球 — one ISO week (Monday 00:00 UTC to Monday) of IntMap\'s weekly archive of the planet\'s large natural events: every earthquake of magnitude 5.5 and above the USGS catalogue lists (magnitude, time, depth and USGS\'s own place string) and every natural event NASA\'s EONET tracks with an observation in that week (severe storms with their stated wind, volcanoes, floods, sea and lake ice, and wildfires whose stated burned area is 10,000 ha or more — the smaller ones are only counted), each with its originating source, plus the week\'s largest earthquake and the address of the week\'s public page (weekly/<YYYY>-W<ww>/, with an Atom feed). Weeks are added once they end; the archive starts 2025-W40. open:n opens the n-th item on the map (its place, its day, and the item as a pin) and reports it open only once the clock says so; show:true opens the whole week on the map, every placed item a pin. Answer from what it returns, as the upstreams state it (no damage or consequences no source states), and give the page address. Use for 「今週世界で何が起きた？」「先週の大きな地震は？」「今週の地球」「what happened on Earth this week」「last week\'s earthquakes」. For a live feed of today\'s quakes use the earthquake layer instead. ' },
    ],
    schema: () => ({ type: 'object', properties: { week: str(), open: int(1, 999), show: bool() } }),
    async run(a, dctx, K) { return weeklyEarth(a, K); },
  },
  {
    row: ['time.compare',               'timeCompare',    'compareTime,compareYear',                                     'time',    'timeView', 'panel.compare,time.compare', 'panel,time',         'session', 'none',   '',         ''],
    /* (time-compare-lapse) THE COMPARISON WINDOW AT AN INSTANT OF ITS OWN — 「1914 年 | 今日」. Opens the window if it is
       closed, and sets ITS clock (js/compare.js `setTime`) without moving the main map's: a year, a date, «now», or
       `follow:true` to move with the main map again. The picked layer is judged at that instant by the main map's
       rule, so the result says what the window draws there and why not. */
    doc: [
      { in: 'time-compare', at: 10, text: '{"type":"timeCompare","year"?:int (astronomical: 0 is 1 BC),"date"?:"YYYY-MM-DD","now"?:bool,"follow"?:bool,"layer"?:str} = open the COMPARISON WINDOW (if closed) and set ITS OWN clock, leaving the main map\'s where it is — e.g. the main map at today and the window at 1914 («1914 | 今日»). follow:true makes the window move with the main map again. "layer" picks the window\'s layer (its key, e.g. "histb" for historical borders, or its name). The window draws its layer only where the layer\'s source states the window\'s instant (the same rule as the main map), and its historical borders are the borders OF THAT INSTANT; the result says what it draws and, when it does not, why. ' },
    ],
    schema: () => ({ type: 'object', properties: { year: int(), date: str(), now: bool(), follow: bool(), layer: str() }, anyOf: [{ required: ['year'] }, { required: ['date'] }, { required: ['now'] }, { required: ['follow'] }] }),
    async run(a, dctx, K) { return compareAt(a, K); },
  },
  {
    row: ['time.thenNow',               'thenNow',        'thenAndNow,swipeCompare,compareThenNow',                      'time',    'timeView', 'panel.compare,time.compare,time', 'panel,time',         'session', 'none',   '',         ''],
    /* (then-now-card) 「あの頃といま」 — ONE PLACE AT TWO INSTANTS, A DIVIDER BETWEEN THEM (js/compare.js `thenNow`): the
       comparison window's map is laid over the whole map at the main camera and cut at a divider the reader drags; THEN is
       the window's clock (left), NOW the main map's (right). With no `then`, a main map in the past is the THEN and goes to
       the present. While the swipe is on, the map postcard (panel.postcard) is the two-instant card. */
    doc: [
      { in: 'time-compare', at: 15, text: '{"type":"thenNow","then"?:YEAR|"YYYY-MM-DD"|"now","now"?:YEAR|"YYYY-MM-DD"|"now","split"?:0..1,"layer"?:str} = THEN AND NOW / あの頃といま — the SAME PLACE at two instants, compared with a SWIPE: the comparison window\'s map is laid over the whole map at exactly the main camera and cut at a vertical divider the reader drags (by finger on a phone); LEFT of the divider is "then" (the window\'s own clock), RIGHT is "now" (the main map\'s clock). "then"/"now" are a year (astronomical: 0 is 1 BC), a date or "now"; "now" defaults to leaving the main map where it is — give "now":"now" for today. With no "then" and the main map in the past, that instant becomes "then" and the main map goes to today. "split" is where the divider stands (0 = left edge, 1 = right edge; default the middle). "layer" picks what the then side draws (as in timeCompare); when none is picked and "then" is an instant a border record answers, it draws the borders of that instant. Frame the place first (move the camera), then call this. The state travels in the share link (it opens on the swipe), and while the swipe is on {"type":"postcard"} makes the THEN-AND-NOW CARD (both instants side by side, the place\'s name, every credit of both maps, the IntMap name and the link; "size":"card" 1200×630 for link previews, "square" 1080×1080). Use for 「1914年と今を比べて」 = {"type":"thenNow","then":"1914","now":"now"}, 「1600年と1900年の日本を比べて」 = the camera on Japan, then {"type":"thenNow","then":"1600","now":"1900"}, 「昔と今をスワイプで比べたい」, "compare 1914 with today", "then and now", "swipe between 1945 and today"; and 「比較画像をSNS用に作って」 after it = {"type":"postcard"}. ' },
    ],
    phrases: () => ['あの頃といま', '昔と今', 'と今を比べ', 'スワイプで比べ'].concat(['then and now', 'compare with today', 'swipe compare']),   /* the Japanese phrases, then the English words — two lists, not translations of each other */
    schema: () => ({ type: 'object', properties: { then: str(), now: str(), split: num(), layer: str() } }),
    async run(a, dctx, K) { return thenNowAt(a, K); },
  },
  {
    row: ['time.lapse',                 'timeLapse',      'playTime,playYears',                                          'time',    'timeView', 'time,time.lapse',        'time',                'session', 'none',   '',         ''],
    /* (time-compare-lapse) THE CLOCK PLAYED FORWARD — js/time-lapse.js: from a start to an end (default: the present) by
       a step in years, days or hours, one DRAWN frame at a time (a frame waits for the map to draw it). `play:false`
       stops it where it is. Layers begin and stop being drawn as their sources begin and stop stating the instants.
       (timelapse-video-export) `record:true` writes the same run to a video (js/map-recorder.js) — one video frame per drawn
       instant, the year, the data credits and the IntMap link burned into every frame — in a `size` (square · landscape ·
       portrait) and a `format` (mp4 · webm, the first the browser can record when none is asked); the Chronos panel shows
       the progress and offers Save when it ends. */
    doc: [
      { in: 'time-compare', at: 20, text: '{"type":"timeLapse","from":YEAR|"YYYY-MM-DD","to"?:YEAR|"YYYY-MM-DD" (default: the present),"unit"?:"year"|"day"|"hour","step"?:int,"fps"?:0.5|1|2|4,"loop"?:bool} = PLAY the main map\'s clock from "from" to "to" by "step" units, one frame per instant, each frame held until the map has drawn it (tiles in, layers judged, borders of that instant on screen) — layers begin and stop being drawn as their sources begin and stop stating the instants; {"type":"timeLapse","play":false} stops it where it is. Add "record":true (with "size"?:"square"|"landscape"|"portrait" — 1080×1080, 1920×1080, 1080×1920 — and "format"?:"mp4"|"webm") to WRITE THE SAME RUN TO A VIDEO the reader can save and post: one video frame per drawn instant (never a half-drawn or blank one), held for 1/fps; the instant, the data credits and the IntMap link are burned into every frame; the Chronos panel opens, shows the progress and offers Save (and Share where the device can) when the run ends — a stop before the end keeps nothing. Frame the region first (move the camera), then record: 「1900〜1950年のヨーロッパのタイムラプスを動画にして」 = the camera on Europe, then {"type":"timeLapse","from":"1900","to":"1950","record":true} (from/to are strings, a year or a date); 「縦長の動画で」 = size:"portrait". Use for 「1900年から1950年まで国境の変化を再生して」 / 「比較ウィンドウを1914年にして」. The current window instant and the lapse state are in the map state.' },
    ],
    schema: () => ({ type: 'object', properties: { play: bool(), from: str(), to: str(), year: int(), toYear: int(), unit: str(), step: int(), fps: num(), loop: bool(), record: bool(), size: str(), format: str() } }),
    async run(a, dctx, K) { return lapse(a, K); },
  },
  {
    row: ['time.changes',               'changes',        'periodChanges,whatChanged,timeDiff',                          'time',    'none',    '',                       'explanation',         'session', 'none',   'place?',   '', 'external'],
    /* (atlas-reasoning) PRODUCT.md §4 items 8 and 9 — WHAT CHANGED BETWEEN t0 AND t1, over a region. The same records the map
       draws, asked the same question at two ends: the border record (who appears, who ends, whose area changes), the layers whose
       source states each end, the Maddison statistics where BOTH ends state them, and what happened INSIDE the period — the
       border-change days and the war record's dated events — in order of how many records each affects. A day or a value no
       record states is never filled in (.agents/rules/historical-verification.md §2 ③). */
    doc: [
      { in: 'time.coverage', at: 30, text: '{"type":"changes","from":YEAR|"YYYY-MM-DD","to":YEAR|"YYYY-MM-DD","place"?:str,"n"?:int,"maxDays"?:int,"news"?:bool} = WHAT CHANGED BETWEEN TWO INSTANTS (期間の変化), optionally inside one region: the polities that appear / end / change area between the two (the border record the map draws), the layers a source states at one end and not the other, the population and GDP-per-head changes where the record states BOTH ends (a value stated at one end only is counted, never treated as a change from zero), and the EVENTS inside the period ranked by importance — border-change days (polities appearing or ending that day count 1, changing borders ½) and wars (their dated events in the period) — each with the date only where a record states it (a 1 January border day is flagged as possibly year-only). Within the last 7 days it adds the grouped live news events (research.events); older periods say that the news feed does not reach them. The examined border days are capped at "maxDays" (default 40) and the answer says how many were not examined. Nothing is drawn and the clock does not move. Use for 「1910年から1930年でヨーロッパはどう変わった？」「what changed in the Balkans 1990–2001」「この10年で何が変わった」. ' },
    ],
    schema: () => ({ type: 'object', properties: { from: str(), to: str(), t0: str(), t1: str(), place: str(), n: int(1, 40), maxDays: int(1, 366), news: bool() }, anyOf: [{ required: ['from', 'to'] }, { required: ['t0', 't1'] }] }),
    async run(a, dctx, K) { return changes(a, K); },
  },
  {
    row: ['time.placeHistory',          'placeHistory',   'placeThroughTime,whoRuledHere,sovereigntyTimeline,formerPolities', 'time',    'none',    '',                       'explanation',         'read',    'none',   'point',    ''],
    /* (place-through-time) WHO HELD ONE POINT, AND WHEN — the SAME record the place card's «This place through time» section
       draws (js/place-history.js): every polity the historical border records the era layer draws (CShapes 2.0, OpenHistoricalMap,
       Cliopatria, the historical-basemaps sheets) put over the point, oldest first, each with its span, what each edge IS (a date
       the record states, the edge of a record's reach, a handover to a more precise record, a sheet's display years) and the
       record's own ID; and the first-level units of the subdivision record over the same point. `year` narrows the answer to the
       entries in force that year. Read-only: the clock does not move (time.travel does). */
    doc: [
      { in: 'time.coverage', at: 24, text: '{"type":"placeHistory","place"?:str,"lng"?:num,"lat"?:num,"year"?:int (astronomical: 0 is 1 BC)} = THIS PLACE THROUGH TIME / この場所の歴史 — who held one point, and when: every polity IntMap\'s historical border records draw over that exact point (an exact point-in-polygon test, not a nearby guess), oldest first, from the deepest era sheet to the last day of CShapes 2.0 (2019): Cliopatria (Seshat, to the year, 3400 BC–), OpenHistoricalMap (day-exact, 1689–1885 and colonial ground from 1886), CShapes 2.0 (day-exact, 1886–2019) and the historical-basemaps sheets where nothing finer states the ground — each entry with its span, what each edge IS (`stated` by the record; `reach` = the edge of the record, NOT the polity\'s beginning or end; `handover` = a more precise record takes over the ground there; `rename` = the map\'s era-name table; `sheet` = the years a period map is shown), the records and their IDs (gwcode, Wikidata QID, Cliopatria\'s article), Cliopatria\'s own lifespan of the polity, names the map withholds and why, and the gaps no record covers — plus the FIRST-LEVEL DIVISIONS (令制国・府県・州・eyalet…) over the point with the dates their record states, derived, or does not state. With year, `atYear` lists the entries in force that year. Answer only from what it returns: quote spans with their edge kind (never call a `reach` or `handover` edge the end of a polity), name the record for each claim, and say «no record draws a polity here» for a gap. "place":"here" is the point Atlas last touched. Use for 「このあたりは昔どこの国だった？」「1600年にここを治めていたのは」「京都を支配した政権の変遷」「イスタンブールはいつからオスマン領」「who ruled this place」「what country was this in 1900」. ' },
    ],
    phrases: () => ['昔どこの国', 'ここを治めていた', '支配の変遷', 'この場所の歴史', '何という国だった'].concat(['who ruled here', 'place through time', 'what country was this', 'sovereignty history']),   /* the Japanese phrases, then the English words — two lists, not translations of each other */
    schema: () => ({ type: 'object', properties: { place: str(), lng: num(), lat: num(), year: int() }, anyOf: [{ required: ['place'] }, { required: ['lat', 'lng'] }] }),
    async run(a, dctx, K) { const R = K.R, esc = K.esc, L = K.L, HOST = K.HOST;
      const got = await pointOf(a, K); if (got.fail) return got.fail;
      const pt = got.pt;
      /* the record and its drawing live in js/place-history.js, fetched on first use (the card fetches the same module) */
      const PH = await import('./place-history.js');
      try { if (!document.getElementById('im-place-history-css')) { const st = document.createElement('style'); st.id = 'im-place-history-css'; st.textContent = PH.PLACE_HISTORY_CSS; document.head.appendChild(st); } } catch (_) { /* no document */ }
      let lang = 'en'; try { lang = HOST.lang || 'en'; } catch (_) { lang = 'en'; }
      const rec = await PH.placeHistory(pt);
      const exec = { placeHistory: PH.forAtlas(rec) };
      if (a.year != null && isFinite(+a.year)) { const at = PH.entriesAt(rec, +a.year); exec.placeHistory.atYear = { year: +a.year, nation: at.nation.map(PH.entryBrief), admin: at.admin.map(PH.adminBrief) }; }
      const ttl = pt.name || (pt.lat.toFixed(4) + ', ' + pt.lng.toFixed(4));
      return R(true, '<div><b>' + esc(L('This place through time', 'この場所の歴史') + ' — ' + ttl) + '</b>' + PH.historyHtml(rec, lang, { inert: true }) + '</div>', { exec });
    },
  },
  {
    row: ['time.journey',               'journey',        'journeyThroughTime,bordersThen,crossingsThroughTime,routeThroughTime,historicalCrossings', 'time', 'paint', 'map.line', 'map,explanation', 'session', 'none', 'points', ''],
    /* (atlas-product) ONE JOURNEY, ASKED AT SEVERAL INSTANTS — the polities a line runs through at each instant Atlas names, in
       order, how far in each, where it crosses, and which polities it meets at some instants and not at others; one instant
       drawn on the map, coloured by polity. The line is great circles between the places (or a route's coordinates as
       given); the polities are the ones the border record the map draws at that instant (js/time-borders.js collectionAt),
       measured with the route panel's own sampler (js/routing-ops.js, at module scope). The run lives in js/journey-through-time.js, fetched on
       first use. Atlas picks the instants: nothing here picks them for it. */
    doc: [
      { in: 'time.coverage', at: 28, text: '{"type":"journey","places"?:[str,…] (2 or more, in travel order) | "points"?:[[lng,lat],…] | "from"?:str,"to"?:str,"via"?:[str],"years"?:[int] (astronomical: 0 is 1 BC),"dates"?:["YYYY-MM-DD"],"now"?:bool,"draw"?:int (1-based, which instant to draw; default the first),"asRoute"?:bool} = A JOURNEY THROUGH TIME / 時をまたぐ道のり — for EACH instant you list (years, dates, and now:true for today’s borders; none = the instant on the clock), the polities the line between the places runs through IN ORDER, the km in each stretch, the crossings with where they fall, and the stretches that are sea or land the record does not cover; then which polities the line meets at some instants and not at others. The polities are the ones IntMap’s historical border record draws at that instant (CShapes 2.0 by the day from 1886; OpenHistoricalMap, Cliopatria and the era sheets before it — the record names itself in the result), under that record’s names, compared across instants by those names; two shapes the record draws at one place are both named (overlap), never one chosen. The line is the great circle between consecutive places (asRoute:true = the points ARE a route, joined straight) — it is not the road a traveller of that year took; say so. It also DRAWS one instant’s line on the map coloured by polity (sea and unrecorded land grey); the clock does not move — add timeTravel to the same instant if the borders under the line should match. Give a DATE when the question is about a treaty or a war (a bare year is mid-June). Use for 「1913年と今日で、ウィーンからイスタンブールまでにいくつの国を通る？」「パリからモスクワへの道は1925年と1990年でどう違う」「シルクロードを700年と1400年で」「which countries would the Orient Express have crossed in 1900」「how many borders between Berlin and Warsaw in 1925 vs today」. Quote the record, the km and the crossings as returned. ' },
    ],
    phrases: () => ['国境越え', '国境をいくつ', 'いくつの国を通', '道のり', '経由する国'].concat(['countries would', 'borders between', 'cross through', 'journey from', 'pass through in']),   /* the Japanese phrases, then the English words — two lists, not translations of each other */
    chips: 'lines',   /* the map's on/off chip a completed run switches (js/atlas-console.js _ovlOf) — the same line layer drawLine paints */
    schema: () => ({ type: 'object', properties: { places: list(str(), 2), points: list(list(), 2), from: str(), to: str(), via: list(str()), years: list(int()), dates: list(str()), year: int(), date: str(), now: bool(), draw: int(1), asRoute: bool(), extra: loose() },
      anyOf: [{ required: ['places'] }, { required: ['points'] }, { required: ['from', 'to'] }] }),
    async run(a, dctx, K) { const { atlasRun } = await import('./journey-through-time.js'); return atlasRun(a, K); },
  },
  {
    row: ['time.stepHere',              'stepHere',       'nextChangeHere,previousChangeHere,stepPlaceHistory',          'time',    'time',    'time',                   'map,time',            'session', 'none',   'point',    ''],
    /* (mobile-product) STEP THE CLOCK TO THE NEXT (OR PREVIOUS) INSTANT THE MAP CHANGES OVER ONE POINT — the instants the
       thumb on the phone's clock stops at (js/time-thumb.js) and its arrow keys step between, read off the same record as
       time.placeHistory (js/place-history.js `changesOf` / `stepFrom`): where an entry begins, ends, is drawn under a new
       name, or a first-level unit begins or ends. The clock moves to that day; the answer says what changed there with
       the edge as the record states it (a record's reach is a record's), what the map states over the point after it, and
       every change instant at the point — so a further hop is a time.travel to a listed date, not a second search. */
    doc: [
      { in: 'time.coverage', at: 24.5, text: '{"type":"stepHere","dir"?:"next"|"prev" (default next),"place"?:str,"lng"?:num,"lat"?:num,"from"?:"YYYY-MM-DD"|int (astronomical year; default the clock)} = STEP THROUGH THIS PLACE\'S HISTORY / この場所の歴史を一歩ずつ — moves the MASTER CLOCK to the next (or previous) instant at which what IntMap\'s historical records draw over that exact point changes: a polity begins or ends there, is drawn under a new name, or a first-level division (令制国・府県・州…) begins or ends — the same record as placeHistory. "place":"here" is the point Atlas last touched; "place":"center" is the map centre (only when the user means the map centre — the phone\'s clock thumb steps there). Returns the instant it moved to, what changed there with each edge kind (stated / reach = the edge of a record, NOT a polity\'s beginning or end / handover / sheet), what the map states over the point after the step, and ALL change instants at the point (changes[]) — to jump further, call timeTravel with one of those dates rather than stepping again. Nothing further recorded → the clock does not move and the answer says so. Use for 「次にここの支配者が変わったのはいつ？そこへ」「この場所の一つ前の時代へ」「step to the next change here」「go back to when this border last changed」. ' },
    ],
    phrases: () => ['次に変わった', '一つ前の時代', '次の時代へ', '支配者が変わった'].concat(['next change here', 'previous change here', 'when did this change', 'step through history']),   /* the Japanese phrases, then the English words — two lists, not translations of each other */
    schema: () => ({ type: 'object', properties: { dir: str(), place: str(), lng: num(), lat: num(), from: str() }, anyOf: [{ required: ['place'] }, { required: ['lat', 'lng'] }] }),
    async run(a, dctx, K) { return stepHere(a, K); },
  },
  {
    row: ['time.quakeHistory',          'quakeHistory',   'earthquakeHistory,seismicHistory,quakeRecord,earthquakeRecord,pastEarthquakes', 'time', 'panel',  'panel.quakeHistory,camera', 'panel,explanation', 'session', 'none',   'place?',   'quakeHistory'],
    /* (live-news-product) THE EARTHQUAKE RECORD OF A PLACE — js/quake-history.js (the card and the map) over
       js/quake-history-core.js (the facts): every earthquake the USGS ANSS ComCat holds within a radius at or above a
       floor, from the oldest entry to the latest; when opened from a quake, that quake's rank and the last one at least as
       large; the decades with the smallest magnitude each recorded; and the record UP TO THE MASTER CLOCK'S INSTANT on the
       map. `select` + `moment` put the clock on one quake's instant (the map becomes that day's world). The floor rises to
       the next step when the record is larger than one read, and the answer says so. Nothing is estimated. */
    doc: [
      { in: 'time.coverage', at: 28, text: '{"type":"quakeHistory","place"?:str,"lng"?:num,"lat"?:num,"eventId"?:str (a USGS ComCat id, e.g. from the earthquakes layer or table),"radiusKm"?:100|300|500,"minMagnitude"?:4.5|5|5.5|6|7,"select"?:"largest"|eventId,"moment"?:bool} = EARTHQUAKE RECORD OF A PLACE / この場所の地震の記録 — answers «is this earthquake unusual here?», «what is the largest quake ever recorded near X?», «when did Tokyo last have one this big?»: every earthquake the USGS ANSS Comprehensive Catalog (ComCat) holds within the radius (default 300 km) at or above the floor (default M5), from the oldest entry it holds (instrumental ISC-GEM relocations from 1904; a few historical entries earlier) to minutes ago — opened as a card (count, first record, the ten largest, a year × magnitude chart, the decades with the smallest magnitude each recorded) and drawn on the map as the record UP TO THE MASTER CLOCK\'S INSTANT, coloured by how long before it. Given "eventId", that quake is ranked: its rank on the record, how many larger, the last one at least as large and how many years before, the next one after. "select" rings one quake ("largest" or an id) and "moment":true puts the master clock on its instant so the whole map is that day\'s world (borders, names) — combine with timeLapse to replay the record. When the floor holds more records than one read brings (3000) the floor is raised to the next step and the result says so (floorRaised). It states only what the catalogue holds: older decades miss smaller quakes (decades[].smallestRecorded) and NO rate, probability or return period is computed — never present one. The point sent to USGS is rounded to whole degrees. ' },
    ],
    phrases: () => ['地震の記録', '過去の地震', '過去最大', '観測史上', '以来の規模', 'ぶりの規模', 'この地震は珍しい'].concat(['earthquake history', 'past earthquakes', 'largest earthquake ever', 'earthquake record', 'since records began', 'biggest quake since']),   /* the Japanese phrases, then the English words — two lists, not translations of each other */
    schema: () => ({ type: 'object', properties: { place: str(), lng: num(), lat: num(), eventId: str(), radiusKm: num(50, 1000), minMagnitude: num(0, 10), select: str(), moment: bool() } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, esc = K.esc, L = K.L, geocode = K.geocode;
      let pt = null, name = '';
      if (a.lng != null && a.lat != null && isFinite(+a.lng) && isFinite(+a.lat)) { pt = { lng: +a.lng, lat: +a.lat }; name = String(a.place || ''); }
      else if (a.place && /^(here|there)$/i.test(String(a.place).trim()) && K._herePoint) { pt = { lng: +K._herePoint.lng, lat: +K._herePoint.lat }; name = K._herePoint.name || ''; }
      else if (a.place) { const ll = await geocode(a.place); if (!ll) return R(false, warn(L('IntMap could not place «' + esc(String(a.place)) + '». Give coordinates, or name a place IntMap holds.', '「' + esc(String(a.place)) + '」を地図上に特定できませんでした。座標を指定するか、IntMap が持つ地名で言い直してください。'))); pt = { lng: +ll.lng, lat: +ll.lat }; name = ll.name || String(a.place); }
      const eventId = a.eventId ? String(a.eventId).trim() : '';
      /* ⚠ (#R302) the target is required; a call with neither a place nor a quake is answered, not guessed */
      if (!pt && !eventId) return R(false, warn(L('Which place or which earthquake? Name a place, give coordinates or a USGS event id.', 'どの場所、またはどの地震ですか？地名・座標・USGS の地震 ID のどれかを指定してください。')), { meta: { code: 'NEEDS_INPUT', category: 'input', retryable: true, produced: [], userGoalSatisfied: false } });
      try { await window.IntMapLazy.need('quakeHistory'); } catch (_) { /* answered below */ }
      const Q = window.IntMapQuakeHistory;
      if (!Q || typeof Q.open !== 'function') return R(false, warn(L('The earthquake record is not available', '地震の記録を利用できません')), { meta: { code: 'MODULE_UNAVAILABLE', category: 'capability', retryable: false, produced: [], userGoalSatisfied: false } });
      let r = await Q.open({ lng: pt ? pt.lng : undefined, lat: pt ? pt.lat : undefined, name, radiusKm: a.radiusKm, minMag: a.minMagnitude, eventId: eventId || undefined });
      if (!r || r.ok === false) return R(false, warn(L('The USGS catalogue could not be read', 'USGS のカタログを読めませんでした') + (r && r.errorKind ? ' (' + esc(r.errorKind) + ')' : '') + L(' — this does not mean there were no earthquakes', '（地震が無かったという意味ではありません）')), { meta: { code: r && r.errorKind === 'not-found' ? 'NOT_FOUND' : 'UPSTREAM_UNAVAILABLE', category: 'evidence', retryable: !(r && r.errorKind === 'not-found'), produced: [], userGoalSatisfied: false } });
      if (a.select) Q.select(String(a.select) === 'largest' ? 'largest' : String(a.select));
      if (a.moment) Q.toMoment();
      r = Q.summary();
      const day = (b) => (b ? String(b.time).slice(0, 10) : '');
      const M = (b) => (b && b.mag != null ? 'M' + Number(b.mag).toFixed(1) : 'M?');
      let html = '<div style="font-weight:600;margin:2px 0 4px;">' + esc(L('Earthquake record here', 'この場所の地震の記録') + ' — ' + (r.place || '')) + '</div>';
      html += '<div style="font-size:12px;line-height:1.55;">' + esc(L('{n} earthquakes of M{m}+ within {r} km since {y} (USGS ComCat).', '{y} 年以降、{r} km 以内の M{m} 以上は {n} 件（USGS ComCat）。').replace('{n}', String(r.events)).replace('{m}', String(r.minMagnitude)).replace('{r}', String(r.radiusKm)).replace('{y}', String(r.recordStarts || '').slice(0, 4))) + '</div>';
      if (r.floorRaised) html += '<div style="font-size:11.5px;color:var(--text-muted);">' + esc(L('The floor was raised from M{a}: the record there is larger than one read.', 'M{a} 以上は一度に読める件数を超えるため、下限を上げました。').replace('{a}', String(r.floorRaised.asked))) + '</div>';
      if (r.largest && r.largest[0]) html += '<div style="font-size:12px;">' + esc(L('Largest: ', '最大: ') + M(r.largest[0]) + ' · ' + day(r.largest[0]) + ' · ' + (r.largest[0].place || '')) + '</div>';
      const A = r.anchor;
      if (A && A.rank != null) html += '<div style="font-size:12px;">' + esc(L('This one ({m}) is number {k} on the record; the last at least as large: {p}.', 'この地震（{m}）は記録上 {k} 番目の大きさ。同じかそれ以上の前回: {p}。').replace('{m}', M(A.event)).replace('{k}', String(A.rank)).replace('{p}', A.previousAtLeastAsLarge ? day(A.previousAtLeastAsLarge) + ' ' + M(A.previousAtLeastAsLarge) : L('none on record', '記録になし'))) + '</div>';
      html += '<div style="font-size:11px;color:var(--text-muted);line-height:1.5;">' + esc(L('Older decades miss smaller quakes; no rate or probability is implied.', '古い年代ほど小さい地震は記録されていません。頻度や確率を示すものではありません。')) + '</div>';
      return R(true, html, { meta: { code: r.events ? 'OK' : 'NO_RESULTS', category: r.events ? 'ok' : 'evidence', retryable: false, produced: ['panel', 'explanation'], userGoalSatisfied: true }, exec: { quakeHistory: r } });
    },
  },
];

/* ══ (mobile-product) THE POINT A PLACE QUESTION IS ASKED ABOUT — one reading for time.placeHistory and time.stepHere ══
   coordinates; "here" (the point Atlas last touched); a name, geocoded; and, where the caller allows it, "center" — the
   map centre, said by the reader (⚠ #R302: a call naming no point is answered with a question, never given the centre). */
async function pointOf(a, K, opts) {
  const R = K.R, warn = K.warn, esc = K.esc, L = K.L, geocode = K.geocode;
  const place = a.place != null ? String(a.place) : '';
  if (a.lng != null && a.lat != null && isFinite(+a.lng) && isFinite(+a.lat)) return { pt: { lng: +a.lng, lat: +a.lat, name: place } };
  if (place && place.toLowerCase() === 'here' && K._herePoint) return { pt: { lng: +K._herePoint.lng, lat: +K._herePoint.lat, name: K._herePoint.name || '' } };
  if (opts && opts.center && /^(center|centre|map center|map centre|地図の中心|中心)$/i.test(place.trim())) {
    let c = null; try { c = K.GE().camera.getCenter(); } catch (_) { c = null; }
    if (c && isFinite(c.lng) && isFinite(c.lat)) return { pt: { lng: +c.lng, lat: +c.lat, name: L('map centre', '地図の中心') } };
    return { fail: R(false, warn(L('The map is not drawn yet, so it has no centre to ask about.', '地図がまだ描かれていないため、中心を特定できません。'))) };
  }
  if (place) {
    const ll = await geocode(place);
    if (!ll) return { fail: R(false, warn(L('IntMap could not place «' + esc(place) + '». Give coordinates, or name a place IntMap holds.', '「' + esc(place) + '」を地図上に特定できませんでした。座標を指定するか、IntMap が持つ地名で言い直してください。'))) };
    return { pt: { lng: +ll.lng, lat: +ll.lat, name: ll.name || place } };
  }
  /* ⚠ (#R302) the target is required; a call with neither is answered, not guessed */
  return { fail: R(false, warn(L('Which point? Name a place or give its coordinates.', 'どの地点ですか？地名か座標を指定してください。'))) };
}

/* (mobile-product) time.stepHere — the record of the point, its change instants, one step from the clock (or `from`) */
async function stepHere(a, K) {
  const R = K.R, warn = K.warn, note = K.note, esc = K.esc, L = K.L, HOST = K.HOST;
  const got = await pointOf(a, K, { center: true }); if (got.fail) return got.fail;
  const pt = got.pt;
  const dir = /^(prev|previous|back|before|earlier|-1)$/i.test(String(a.dir || '').trim()) ? -1 : 1;
  const PH = await import('./place-history.js');
  let lang = 'en'; try { lang = HOST.lang || 'en'; } catch (_) { lang = 'en'; }
  let k0 = PH.kOf(IntMapTime.when());
  if (a.from != null && String(a.from).trim() !== '') {
    const m = /^([+-]?\d{1,6})(?:-(\d{2})-(\d{2}))?$/.exec(String(a.from).trim());
    if (!m) return R(false, warn(L('"from" is a date (YYYY-MM-DD) or a year.', '「from」は日付（YYYY-MM-DD）か年で指定してください。')));
    /* a bare year is the clock's own reading of a year — its mid-June (js/chronos.js setYear) */
    k0 = (+m[1]) * 10000 + (m[2] ? +m[2] : 6) * 100 + (m[3] ? +m[3] : 15);
  }
  const rec = await PH.placeHistory(pt);
  const N = rec.nation || {};
  if (N.status === 'unavailable') return R(false, warn(L('The historical border records could not be read (' + esc(String(N.reason || 'failed')) + ').', '歴史国境の記録を読み込めませんでした（' + esc(String(N.reason || 'failed')) + '）。')));
  const changes = PH.changesOf(rec);
  const c = PH.stepFrom(changes, k0, dir);
  const ttl = pt.name || (pt.lat.toFixed(4) + ', ' + pt.lng.toFixed(4));
  const all = changes.map((x) => PH.isoOfK(x.k));
  if (!c) {
    const said = dir < 0 ? L('No earlier change is recorded at ' + ttl + '.', ttl + ' でこれより前の変化は記録されていません。') : L('No later change is recorded at ' + ttl + '.', ttl + ' でこれより後の変化は記録されていません。');
    return R(true, note(esc(said)), { exec: { stepHere: { at: pt, dir: dir < 0 ? 'prev' : 'next', from: PH.isoOfK(k0), moved: false, changes: all } } });
  }
  if (!PH.goToInstant(c.k, 'atlas')) return R(false, warn(L('Chronos could not reach ' + PH.isoOfK(c.k) + '.', 'Chronos は ' + PH.isoOfK(c.k) + ' に移動できませんでした。')));
  const after = PH.nowAt(rec, c.k, lang);
  const brief = {
    at: pt, dir: dir < 0 ? 'prev' : 'next', from: PH.isoOfK(k0), to: PH.isoOfK(c.k), moved: true, datesAre: 'astronomical YYYY-MM-DD',
    begins: c.begins.map(PH.entryBrief), ends: c.ends.map(PH.entryBrief), renamed: c.renames.map((r) => ({ label: r.label, of: r.E.name || null })),
    subdivisions: c.admin.map((x) => Object.assign({ side: x.side === 'from' ? 'begins' : 'ends' }, PH.adminBrief(x.E))),
    after: { polities: after.polities.map((p) => p.text), subdivisions: after.units, noRecord: after.gap },
    changes: all,
  };
  return R(true, '<div><b>' + esc(L('This place through time', 'この場所の歴史') + ' — ' + ttl) + '</b><div>' + esc(PH.changeText(c, lang, N.records)) + '</div></div>', { exec: { stepHere: brief } });
}

/* ══ (time-compare-lapse) THE TWO NEW DOORS ═════════════════════════════════════════════════════════════════
   Each result carries `meta.want` — the state the call set out to reach, in the shape the observer reads
   (js/atlas-capabilities.js `timeView`): the verdict compares it with what the app reports AFTER, so a window
   that did not move or a lapse that did not start is not called done. */
/* the window's published controller — one reading for both doors (the note in compareAt says why it is not imported) */
const cmpController = () => /** @type {any} */ (window).IntMapCompare;
/* (then-now-card) 「あの頃といま」 — the swipe at one place (js/compare.js thenNow). The result says both instants, what the
   then side draws, and when no THEN could be taken (no instant given, the main map on the present, the window following
   it) that the window's year field is waiting — no year is chosen for the reader. */
async function thenNowAt(a, K) {
  const R = K.R, L = K.L, warn = K.warn, note = K.note, esc = K.esc;
  const C = cmpController();
  if (!C || typeof C.thenNow !== 'function') return R(false, warn('' + L('The comparison window is not available', '比較ウィンドウが使えません')));
  const val = (v) => (v == null || v === '' ? undefined : String(v).trim());
  const then = val(a.then), now = val(a.now);
  for (const v of [then, now]) if (v != null && /^[+-]?\d{1,6}$/.test(v) && +v < IntMapTime.min) return R(false, warn('' + L('Chronos reaches back to ' + IntMapTime.min, 'Chronos は ' + IntMapTime.min + ' 年まで遡れます')));
  const r = C.thenNow({ then, now, split: a.split != null && isFinite(+a.split) ? +a.split : undefined, layer: val(a.layer) });
  const st = await C.judged();
  const want = { compare: { open: true, mode: 'swipe', follow: !!st.follow, live: st.live, iso: st.iso } };
  let h = '<div>' + esc(L('Then and now (swipe)', 'あの頃といま（スワイプ）')) + ': <b>' + esc(st.label) + '</b> | ' + esc(st.main.label) + '</div>';
  if (r && r.needsThen) h += '<div>' + esc(L('No earlier time was given: the comparison window’s year field is waiting for one.', '過去の時刻が指定されていません——比較ウィンドウの年の欄に入力を待っています。')) + '</div>';
  if (st.layer && st.verdict) h += '<div>' + esc(st.layerName || st.layer) + ' — ' + esc(st.held ? L('not drawn at this time', 'この時刻では描いていません') : L('drawn at this time', 'この時刻で描いています')) + (st.note || st.verdict.why ? ': ' + esc(st.note || st.verdict.why) : '') + '</div>';
  return R(true, note('✓ ') + h, { want, compare: st, needsThen: !!(r && r.needsThen) });
}
async function compareAt(a, K) {
  const R = K.R, L = K.L, warn = K.warn, note = K.note, esc = K.esc;
  /* ⚠ READ OFF THE WINDOW'S PUBLISHED CONTROLLER, NOT IMPORTED FROM js/compare.js: this module is in Atlas's lazy chunk,
     and a lazy chunk importing js/compare.js (eager, and itself importing modules other lazy chunks share) split three
     shared modules out of the boot chunk — eager.requests 9 → 12, measured with scripts/perf-budget.mjs. */
  const C = cmpController();
  if (!C || typeof C.setTime !== 'function') return R(false, warn('' + L('The comparison window is not available', '比較ウィンドウが使えません')));
  C.open();
  if (a.layer) {
    /* a layer named for the window: the picker's own option, by its key or its visible name */
    const sel = document.getElementById('cmp-layers-sel');
    const want = String(a.layer).trim().toLowerCase();
    const opt = sel ? Array.from(sel.options).find((o) => o.value && (o.value.toLowerCase() === want || o.textContent.trim().toLowerCase() === want)) : null;
    if (opt && sel.value !== opt.value) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  }
  let spec;
  if (a.follow === true) spec = { follow: true };
  else if (a.now) spec = { now: true };
  else if (a.year != null) spec = { year: Math.round(+a.year) };
  else if (a.date) spec = { date: String(a.date) };
  else return R(false, warn('' + L('Give the window a year, a date, now, or follow:true', '年・日付・now・follow:true のいずれかを指定してください')));
  if (spec.year != null && spec.year < IntMapTime.min) return R(false, warn('' + L('Chronos reaches back to ' + IntMapTime.min, 'Chronos は ' + IntMapTime.min + ' 年まで遡れます')));
  const s = C.setTime(spec);
  /* the picked layer is judged asynchronously (js/compare.js applyTime) — the answer waits for that verdict */
  const st = await C.judged();
  const want = { compare: { open: true, follow: !!s.follow, live: s.live, iso: s.iso } };
  let h = '<div>' + esc(L('Compare window', '比較ウィンドウ')) + ': <b>' + esc(st.label) + '</b> | ' + esc(L('main map', 'メイン地図')) + ': ' + esc(st.main.label) + '</div>';
  if (st.layer && st.verdict) h += '<div>' + esc(st.held ? L('Not drawn here', 'ここでは描いていません') : L('Drawn', '描いています')) + (st.note || st.verdict.why ? ' — ' + esc(st.note || st.verdict.why) : '') + '</div>';
  return R(true, note('✓ ') + h, { want, compare: st });
}
async function lapse(a, K) {
  const R = K.R, L = K.L, warn = K.warn, note = K.note, esc = K.esc;
  const TL = await import('./time-lapse.js');
  if (a.play === false) { const s = TL.stopLapse('stopped'); return R(true, note('✓ ' + L('Time-lapse stopped at ', 'タイムラプスを停止: ') + esc(s.at || L('now', '現在'))), { want: { lapse: { playing: false } }, lapse: s }); }
  const from = a.from != null && a.from !== '' ? a.from : (a.year != null ? Math.round(+a.year) : null);
  const to = a.to != null && a.to !== '' ? a.to : (a.toYear != null ? Math.round(+a.toYear) : undefined);
  if (a.record) return record(a, from, to, TL, K);
  const s = TL.startLapse({ from, to, unit: a.unit, step: a.step, fps: a.fps, loop: a.loop });
  if (s.error === 'no-start') return R(false, warn('' + L('Give the lapse a start (a year or a date)', 'タイムラプスの開始（年か日付）を指定してください')));
  if (s.error === 'empty-range') return R(false, warn('' + L('The end is before the start', '終了が開始より前です')));
  const unitW = s.unit === 'year' ? L('year(s)', '年') : s.unit === 'day' ? L('day(s)', '日') : L('hour(s)', '時間');
  return R(true, note('✓ ' + L('Time-lapse playing', 'タイムラプスを再生中') + ': ' + esc(s.from) + ' → ' + esc(s.to || L('now', '現在')) + ' · ' + s.step + ' ' + unitW + ' · ' + s.rate + '×' + (s.loop ? ' · ' + L('loop', 'ループ') : '') + (s.reducedMotion ? ' · ' + L('reduced motion: slowest speed', '視差効果を減らす: 最も遅い速度') : '')), { want: { lapse: { playing: true } }, lapse: s });
}

/* (timelapse-video-export) THE LAPSE WRITTEN TO A VIDEO — the recorder sits in the Chronos panel's export row (js/time-lapse.js
   `openRecorder`), which is where the reader watches the progress and saves the file, so the panel is opened first. */
async function record(a, from, to, TL, K) {
  const R = K.R, L = K.L, warn = K.warn, note = K.note, esc = K.esc;
  if (from == null) return R(false, warn('' + L('Give the lapse a start (a year or a date)', 'タイムラプスの開始（年か日付）を指定してください')));
  try { const tl = document.getElementById('news-timeline'), tg = document.getElementById('ntl-toggle'); if (tl && tg && tl.classList.contains('collapsed')) tg.click(); } catch (_) { /* no panel: openRecorder says so */ }
  const M = await TL.openRecorder();
  if (!M) return R(false, warn('' + L('The export row of the Chronos panel is not available', 'Chronos パネルの書き出し欄が使えません')));
  const s = await M.recordLapse({ from, to, unit: a.unit, step: a.step, fps: a.fps, size: a.size, format: a.format });
  if (s.error) {
    const why = s.error === 'unsupported' ? L('this browser cannot record video', 'このブラウザは動画を録画できません')
      : s.error === 'busy' ? L('a recording is already running', '別の録画が進行中です')
        : s.error === 'empty-range' ? L('the end is before the start', '終了が開始より前です')
          : L('the lapse has no start', 'タイムラプスの開始がありません');
    return R(false, warn('' + L('Could not record: ', '録画できません: ') + esc(why)), { recording: s });
  }
  const l = TL.lapseState();
  const unitW = l.unit === 'year' ? L('year(s)', '年') : l.unit === 'day' ? L('day(s)', '日') : L('hour(s)', '時間');
  return R(true, note('✓ ' + L('Recording the time-lapse to a video', 'タイムラプスを動画に録画中') + ': ' + esc(l.from) + ' → ' + esc(l.to || L('now', '現在')) + ' · ' + l.step + ' ' + unitW
    + ' · ' + (l.total != null ? l.total + ' ' + L('frames', 'コマ') + ' · ' : '') + s.w + '×' + s.h + ' ' + esc(String(s.ext).toUpperCase()) + ' · ' + l.fps + ' ' + L('frames/s', 'コマ/秒')
    + ' — ' + L('each frame is written once the map has drawn it; the Chronos panel shows the progress and offers Save when it ends. The year, the data credits and the IntMap link are in every frame.', '地図が描き終えたコマだけを書き込みます。進み具合は Chronos パネルに出て、終わると保存できます。年・データの出典・IntMap のリンクはすべてのコマに入ります。')),
  { want: { lapse: { playing: true } }, lapse: l, recording: s });
}

async function travel(a, dctx, K) { const L = K.L, R = K.R, note = K.note, warn = K.warn, ymdISO = K.ymdISO;
      { try{ const T=IntMapTime;
          const synced=L('the whole map (news, countries, borders, climate era) moves with it','地図全体（ニュース・国データ・国境・気候区分）が同期します','die ganze Karte bewegt sich mit','вся карта движется вместе','todo el mapa se mueve con él');
          const nowMsg=()=>R(true, note('✓ '+L('Back to now','現在に戻しました','Zurück zu jetzt','Вернулись в настоящее','Volvimos al presente')));
          if(!T){ const sl=document.getElementById('ntl-slider'); if(sl){ let v=3650,da=(a.daysAgo!=null)?Math.round(+a.daysAgo):null; if(da==null&&a.date){ const t0=Date.parse(String(a.date)); if(!isNaN(t0)) da=Math.round((Date.now()-t0)/86400000); } if(da!=null) v=Math.max(0,Math.min(3650,3650-da)); else if(a.value!=null) v=+a.value; sl.value=v; sl.dispatchEvent(new Event('input',{bubbles:true})); } return R(true, note(L('Time set','時刻を設定しました','Zeit gesetzt','Время задано','Hora establecida'))); }   /* (#R108) explained, not a bare ✓ */
          if(a.reset||a.now||a.live){ T.setNow({source:'atlas'}); return nowMsg(); }
          const curY=new Date().getFullYear();
          let y=(a.year!=null)?Math.round(+a.year):null;
          if(y==null&&typeof a.date==='string'){ const m=a.date.match(/^\s*(\d{3,4})\s*$/); if(m) y=+m[1]; }
          /* ⚠⚠ (#R380) THE GUARD READ THE KERNEL AND THE SENTENCE BESIDE IT DID NOT. `y<T.min` has always
             been the real test, but the words were the literal 1900 in all nine languages — so when #R349
             moved the floor to 1850 (and #R604 to AD 1) this refusal went on telling every reader that 1875, a year the
             next statement accepts, is out of reach. The number now comes from the same place the test does. */
          if(y!=null){ if(y>=curY){ T.setNow({source:'atlas'}); return nowMsg(); } if(y<T.min) return R(false, warn(L('Chronos reaches back to {y}','Chronosは{y}年まで遡れます','Bis {y} zurück','До {y} года','Hasta {y}').replace(/\{y\}/g,String(T.min)))); T.setYear(y,{source:'atlas'}); return R(true, note(y+' — '+synced)); }
          if(a.date){ const t0=Date.parse(String(a.date)); if(!isNaN(t0)){ if(t0>Date.now()){ T.setNow({source:'atlas'}); return nowMsg(); } T.set(new Date(t0),{source:'atlas'}); return R(true, note(ymdISO(new Date(t0))+' — '+synced)); } }
          if(a.daysAgo!=null){ const da=Math.round(+a.daysAgo); if(da<=0){ T.setNow({source:'atlas'}); return nowMsg(); } T.setDaysAgo(da,{source:'atlas'}); return R(true, note(ymdISO(T.when())+' — '+synced)); }
          if(a.value!=null){ T.setDaysAgo(3650-(+a.value),{source:'atlas'}); return R(true, note(ymdISO(T.when()))); }
          return R(false, warn(L('Give a year or date','年か日付を指定してください','Jahr/Datum angeben','Укажите год/дату','Indica un año o fecha')));
        }catch(_){ return R(false, warn(L('Time machine unavailable','タイムマシンが使えません','Zeitmaschine nicht verfügbar','Машина времени недоступна','Máquina del tiempo no disponible'))); } }
}

/* ══ (world-at-time) THE TWO ANSWERS ABOUT WHAT THE MAP AT AN INSTANT CAN DRAW ══════════════════════
   One reader (window.IntMapLayerTime, js/layer-time-kernel.js), two doors: `time.coverage` asks about any
   instant and any layer; `time.travel` appends, for the instant it just moved to, the TICKED layers that
   are not drawn and the ones showing another date — so Atlas learns it in the same result that moved the
   clock, not by asking again (.agents/rules/one-pass-or-a-reason.md §2 ②). */
/* (hist-coverage) the subdivision record's own answer for the instant the map is on: how much of the land
   inside a polity it covers, how many polities it is silent or partial about (the hatched ground), and the
   double claims by kind — js/time-admin1.js `coverage().known`, the same numbers the map is drawn from.
   Only for the instant on the clock: the measure runs on the collection the map is showing. */
function subdivisionsAt(c) {
  try {
    const A = window.IntMapTimeAdmin1, s = A && A.coverage ? A.coverage() : null;
    if (!s || !s.active || !s.known || !s.when || !c || !c.at || c.at.live) return null;
    /* the same instant, compared as instants: `at.date` is an ISO string (expanded before year 0), `when` a Date */
    const t = Date.parse(String(c.at.date));
    if (!isFinite(t) || Math.abs(t - s.when.getTime()) >= 864e5) return null;
    const k = s.known;
    return { pct: Math.round(k.pct * 10) / 10, pctArea: Math.round(k.pctArea * 10) / 10, unrecorded: k.none, partial: k.partial, whole: k.full, claims: k.claims || {} };
  } catch (_) { return null; }
}
function subdivisionsHtml(sd, K) {
  if (!sd) return '';
  const L = K.L, esc = K.esc, C = sd.claims;
  return '<div>' + esc(L('Subdivisions recorded for ' + sd.pct + '% of the land inside a polity (' + sd.unrecorded + ' polities with no record and ' + sd.partial + ' with a partial one — hatched on the map); ground claimed twice: ' + (C.seam || 0) + ' seam, ' + (C.duplicate || 0) + ' duplicate, ' + (C.contested || 0) + ' contested',
    '地方区分の記録があるのは政体の内側の陸地の ' + sd.pct + '%（記録の無い政体 ' + sd.unrecorded + '・一部だけ ' + sd.partial + '——地図では斜線）。同じ土地の二重主張: 継ぎ目 ' + (C.seam || 0) + '・重複 ' + (C.duplicate || 0) + '・係争 ' + (C.contested || 0))) + '</div>';
}
function coverageHtml(c, K, all) {
  const L = K.L, esc = K.esc;   /* the kernel's escaper, as every capability uses it */
  const line = (r) => '<li><b>' + esc(r.name) + '</b>' + (r.why ? ' — ' + esc(r.why) : '') + '</li>';
  const names = (rows) => rows.map((r) => esc(r.name)).join(L(', ', '、'));
  let h = '';
  if (c.unstated.length) h += '<div>' + esc(L('Not drawn — no source states this date', '描けない——この日時を述べる典拠がない')) + ' (' + c.unstated.length + ')</div><ul>' + c.unstated.map(line).join('') + '</ul>';
  if (c.carried.length) h += '<div>' + esc(L('Drawn from another date', '別の時点の記録で描く')) + ' (' + c.carried.length + ')</div><ul>' + c.carried.map(line).join('') + '</ul>';
  if (all && c.stated.length) h += '<div>' + esc(L('Drawn — the source states this date', '描ける——典拠がこの日時を述べている')) + ' (' + c.stated.length + '): ' + names(c.stated) + '</div>';
  if (c.unknown.length) h += '<div>' + esc(L('Range read when the layer loads', '範囲は読み込み時に分かる')) + ' (' + c.unknown.length + '): ' + names(c.unknown) + '</div>';
  return h;
}
async function coverage(a, K) {
  const R = K.R, L = K.L, warn = K.warn, esc = K.esc;
  const LT = window.IntMapLayerTime;
  if (!LT) return R(false, warn('' + L('The layer time table is not available', 'レイヤーの時間表が使えません')));
  let when = null;
  if (a.year != null) when = Math.round(+a.year);
  else if (a.date) when = String(a.date);
  const c = await LT.coverage(when, { on: !!a.on });
  if (!c) return R(false, warn('' + L('Give a year or an ISO date', '年か ISO 形式の日付を指定してください')));
  const day = c.at.live ? L('now', '現在') : c.at.date.slice(0, 10);
  const sd = subdivisionsAt(c);
  return R(true, '<div>' + esc(L('What the map at ' + day + ' can draw', day + ' の地図に描けるもの')) + '</div>' + coverageHtml(c, K, true) + subdivisionsHtml(sd, K), sd ? { coverage: c, subdivisions: sd } : { coverage: c });
}
async function withCoverage(res, K) {
  try {
    const LT = window.IntMapLayerTime, T = IntMapTime;
    if (!res || !res.ok || !LT || !T || T.isLive()) return res;
    const c = await LT.coverage(null, { on: true });
    if (!c || (!c.unstated.length && !c.carried.length)) return res;
    return Object.assign({}, res, { html: (res.html || '') + coverageHtml(c, K, false), coverage: c });
  } catch (_) { return res; }
}

/* ══ (map-layer-system) THE YEAR BOOK, FOR ATLAS ═════════════════════════════════════════════════════════════
   The same reader the page uses (js/year-book.js `readYear` over `pageDeps`), so what Atlas says about 1920 is what the
   reader would read on the page — and the answer names the record each fact comes from. */
async function yearbook(a, K) {
  const R = K.R, L = K.L, warn = K.warn, esc = K.esc, note = K.note, HOST = K.HOST;
  const T = IntMapTime;
  let when = null;
  if (a.date) { const d = new Date(String(a.date)); if (!isNaN(d.getTime())) when = d; }
  else if (a.year != null) { const y = Math.round(+a.year); if (y < T.min) return R(false, warn(L('Chronos reaches back to ' + T.min, 'Chronos は ' + T.min + ' 年まで遡れます'))); const d = new Date(0); d.setFullYear(y, 5, 15); d.setHours(12, 0, 0, 0); when = d; }
  if (!when) when = T.when();
  const YB = await import('./year-book.js');
  const h = { lang: () => (HOST && HOST.lang) || 'en', countryStats: () => (HOST && HOST.countryStats) || {}, escape: esc };
  if (a.show) { if (when.getFullYear() >= new Date().getFullYear()) T.setNow({ source: 'atlas' }); else T.set(when, { source: 'atlas' }); YB.openFromPage(h); }
  const r = await YB.readYear(when, YB.pageDeps(h));
  return R(true, YB.atlasHtml(r, when, !!a.show, h.lang(), note), { yearbook: r });
}


/* ══ (marketing-next) ON THIS DAY, FOR ATLAS ═════════════════════════════════════════════════════════════════
   The same reader the search card and the sheet use (js/on-this-day.js), so what Atlas says about 3 October is what the
   reader would read in the sheet, worded the same way, and an event Atlas opens is opened by the card's own opener. */
async function onThisDay(a, K) {
  const R = K.R, L = K.L, warn = K.warn, esc = K.esc, note = K.note, HOST = K.HOST;
  const OTD = await import('./on-this-day.js');
  const lang = (HOST && HOST.lang) || 'en';
  const md = a.date != null && String(a.date).trim() !== '' ? OTD.mdOf(a.date) : OTD.mdOf(new Date());
  if (!md) return R(false, warn(esc(L('Give a calendar day: MM-DD or YYYY-MM-DD', '日付を MM-DD か YYYY-MM-DD で指定してください')) + ': ' + esc(a.date)), { meta: { code: 'BAD_DATE', category: 'input', retryable: false, produced: [], userGoalSatisfied: false } });
  let idx;
  try { idx = await OTD.loadIndex(); } catch (e) { return R(false, warn(esc(L('The on-this-day index could not be read', 'この日の歴史の索引を読めませんでした'))), { meta: { code: 'UNAVAILABLE', category: 'transient', retryable: true, produced: [], userGoalSatisfied: false } }); }
  const list = OTD.eventsOn(idx, md);
  const day = OTD.dayWords(md, lang);
  const facts = list.map((ev, i) => { const D = OTD.describe(ev, idx, lang); return { n: i + 1, date: ev.d, text: D.text, record: D.record, war: D.war || null, maybeYearOnly: !!ev.maybeYearOnly }; });
  const rows = facts.map((f) => '<li>' + esc(f.date) + ' — ' + esc(f.text) + ' <span style="color:var(--text-muted);font-size:12px;">(' + esc(f.war ? f.war + ' · ' + f.record : f.record) + (f.maybeYearOnly ? esc(L(' · dated 1 January: may be the year only', ' · 1月1日付け: 年だけの可能性')) : '') + ')</span></li>').join('');
  const listHtml = list.length ? '<ol style="margin:4px 0 4px 18px;padding:0;">' + rows + '</ol>' : '<div>' + esc(L('The records the map draws state no event on this day.', '地図が描く記録には、この日の出来事がありません。')) + '</div>';
  const src = '<div style="font-size:12px;color:var(--text-muted);">' + esc(L('Sources: ', '出典: ')) + esc(idx.src.cshapes) + ' · ' + esc(idx.src.wars) + '</div>';
  const meta = { onThisDay: { md, day, events: facts } };
  if (a.show) { try { await OTD.openOnThisDay({ md }); } catch (_) { /* the list is still the answer */ } }
  if (a.open != null) {
    const ev = list[(+a.open) - 1];
    if (!ev) return R(false, warn(esc(L('There is no event ' + a.open + ' on ' + day, day + ' に ' + a.open + ' 番目の出来事はありません'))) + listHtml, { meta: Object.assign({ code: 'NO_SUCH_EVENT', category: 'input', retryable: false, produced: ['explanation'], userGoalSatisfied: false }, meta) });
    const m = await OTD.openEvent(ev, idx, lang);
    const D = OTD.describe(ev, idx, lang);
    if (m.timeOk && !m.off.length) return R(true, note('✓ ' + esc(L('Opened on the map: ', '地図で開きました: ')) + esc(ev.d)) + '<div>' + esc(D.text) + '</div>' + src, { meta });
    const miss = []; if (!m.timeOk) miss.push(L('the date', '日付')); if (m.off.length) miss.push(L('layers not on', 'オンにならないレイヤー') + ' ' + m.off.join(', '));
    return R(false, warn(esc(L('The event did not fully open', '出来事が一部しか開いていません')) + ' — ' + esc(m.reason || miss.join(' / '))) + '<div>' + esc(D.text) + '</div>', { meta });
  }
  return R(true, note('✓ ' + esc(L('On this day — ', 'この日の歴史 — ')) + esc(day)) + (a.show ? ' — ' + esc(L('opened as a sheet', 'シートで表示しました')) : '') + listHtml + src, { meta });
}

/* ══ (weekly-earth) THIS WEEK ON EARTH, FOR ATLAS ═════════════════════════════════════════════════════════════
   The same reader the generated pages use (js/weekly-earth.js), so what Atlas says about a week is what its page says,
   worded the same way, and an item Atlas opens is opened by the same link the page writes. */
async function weeklyEarth(a, K) {
  const R = K.R, L = K.L, warn = K.warn, esc = K.esc, note = K.note, HOST = K.HOST;
  const WE = await import('./weekly-earth.js');
  const lang = (HOST && HOST.lang) || 'en';
  let idx;
  try { idx = await WE.loadIndex(); } catch (e) { return R(false, warn(esc(L('The weekly archive could not be read', '週ごとの記録を読めませんでした'))), { meta: { code: 'UNAVAILABLE', category: 'transient', retryable: true, produced: [], userGoalSatisfied: false } }); }
  const week = WE.weekIn(idx, a.week);
  if (!week) {
    const span = idx.weeks.length ? idx.weeks[idx.weeks.length - 1].w + ' – ' + idx.weeks[0].w : '';
    return R(false, warn(esc(L('The archive holds no such week (it holds ' + span + ')', 'その週は記録にありません（記録は ' + span + '）'))), { meta: { code: 'NO_SUCH_WEEK', category: 'input', retryable: false, produced: [], userGoalSatisfied: false, weeks: span } });
  }
  const items = WE.itemsOf(week);
  let page = WE.pagePath(week, lang === 'jp' ? 'ja/' : '');
  try { page = new URL(page, document.baseURI).href; } catch (_) { /* headless: the path relative to the site */ }
  const facts = items.map((it, i) => { const D = WE.describe(it, idx, lang); return { n: i + 1, kind: D.kind, title: D.title, detail: D.sub, at: D.at || null, source: D.url }; });
  const H = WE.headline(week);
  const words = WE.weekWords(week, lang), summary = WE.summary(week, idx, lang);
  const meta = { weeklyEarth: { week: week.w, from: week.from, to: week.to, summary, headline: H ? WE.describe(H, idx, lang).title : null, provisional: !!week.provisional,
    fewerWildfires: (week.fewer && week.fewer.wildfires) || 0, page, items: facts } };
  const li = (f) => '<li>' + esc(f.title) + ' <span style="color:var(--text-muted);font-size:12px;">(' + esc(f.detail) + ')</span></li>';
  const listHtml = facts.length ? '<ol style="margin:4px 0 4px 18px;padding:0;">' + facts.map(li).join('') + '</ol>' : '<div>' + esc(L('Nothing is recorded in this week.', 'この週には記録がありません。')) + '</div>';
  const pageHtml = '<div><a href="' + esc(IntMapSafe.url(page)) + '" target="_blank" rel="noopener">' + esc(L('This week on Earth — the page for ', '今週の地球 — ') + words) + '</a></div>';
  const src = '<div style="font-size:12px;color:var(--text-muted);">' + esc(L('Sources: ', '出典: ')) + esc(idx.sources.usgs.name) + ' · ' + esc(idx.sources.eonet.name) + '</div>';
  const head = note('✓ ' + esc(L('This week on Earth — ', '今週の地球 — ')) + esc(words) + ' (' + esc(week.w) + ')') + '<div>' + esc(summary) + '</div>';
  /* the page's own link, opened by the gallery's opener (the share link's restore, read back) */
  const openHref = async (href, at) => (await import('./showcase-gallery.js')).openLink(href, { at, layers: [] });
  if (a.open != null) {
    const it = items[(+a.open) - 1];
    if (!it) return R(false, warn(esc(L('There is no item ' + a.open + ' in ' + week.w, week.w + ' に ' + a.open + ' 番目の項目はありません'))) + listHtml, { meta: Object.assign({ code: 'NO_SUCH_ITEM', category: 'input', retryable: false, produced: ['explanation'], userGoalSatisfied: false }, meta) });
    const m = await openHref(WE.linkFor(it, week, idx, lang), WE.stateFor(it, week, idx, lang).time.at);
    const D = WE.describe(it, idx, lang);
    if (m.timeOk) return R(true, note('✓ ' + esc(L('Opened on the map: ', '地図で開きました: ')) + esc(D.title)) + '<div>' + esc(D.sub) + '</div>' + (it.at ? '' : '<div>' + esc(L('It is not placed: its source gives no point for it.', '位置は示していません: 出典が点を与えていません。')) + '</div>') + pageHtml + src, { meta });
    return R(false, warn(esc(L('The item did not fully open', '項目が一部しか開いていません')) + ' — ' + esc(m.reason || L('the date', '日付'))) + '<div>' + esc(D.title) + '</div>', { meta });
  }
  if (a.show) {
    const m = await openHref(WE.weekLink(week, idx, lang), WE.weekState(week, idx, lang).time.at);
    if (!m.timeOk) return R(false, warn(esc(L('The week did not fully open on the map', '週を地図で開ききれませんでした')) + ' — ' + esc(m.reason || L('the date', '日付'))) + head + listHtml, { meta });
    return R(true, head + '<div>' + esc(L('Opened on the map: every placed item as a pin.', '地図で開きました: 位置のある項目をすべてピンで示しています。')) + '</div>' + listHtml + pageHtml + src, { meta });
  }
  return R(true, head + listHtml + pageHtml + src, { meta });
}

/* ══ (atlas-reasoning) WHAT CHANGED BETWEEN TWO INSTANTS ═════════════════════════════════════════════════════
   The same reader the year book and the map use (js/year-book.js `readYear` over `pageDeps`), asked at BOTH ends, plus the
   days inside the period. What is decided — the period, the diff of the polities, the statistics and the layers, the order
   of the events — is in js/atlas-reasoning.js as pure functions of values; this gathers them and writes the answer. */
async function changes(a, K) {
  const R = K.R, L = K.L, warn = K.warn, esc = K.esc, note = K.note, HOST = K.HOST;
  const T = IntMapTime;
  const P = changesPeriod(a, T.min, Date.now());
  if (!P.ok) {
    const why = P.code === 'needs-period' ? L('Give both ends of the period: from and to (a year or an ISO date)', '期間の両端 from と to（年か ISO の日付）を指定してください')
      : P.code === 'before-clock' ? L('Chronos reaches back to ' + P.min, 'Chronos は ' + P.min + ' 年まで遡れます')
        : P.code === 'in-future' ? L('The period ends after ' + P.year + ' — nothing has been recorded there', '期間が ' + P.year + ' 年より先にあります — まだ記録がありません')
          : L('The period ends before it starts', '期間の終わりが始まりより前です');
    return R(false, warn(esc(why)), { meta: { code: P.code, category: 'input', retryable: false, produced: [], userGoalSatisfied: false } });
  }
  const whenOf = (p) => { if (p.iso) return new Date(p.ms); const d = new Date(0); d.setFullYear(p.year, 5, 15); d.setHours(12, 0, 0, 0); return d; };
  const w0 = whenOf(P.t0), w1 = whenOf(P.t1);
  const label = (p) => (p.iso ? p.iso : (p.year <= 0 ? (1 - p.year) + ' BC' : String(p.year)));
  /* the region: an extent when the place has one, else the point itself (a degenerate box — a polity is in when its box holds it) */
  let region = null, regionName = '';
  const place = String(a.place == null ? '' : a.place).trim();
  if (place && !K.WORLD_RE.test(place)) {
    let g = null;
    try { g = await K.placeExtent(place); } catch (_) { g = null; }
    if (!g) { try { g = await K.geocode(place); } catch (_) { g = null; } }
    if (!g) return R(false, warn(L('Place not found', '地名が見つかりません') + ': ' + esc(place)), { meta: { code: 'PLACE_NOT_FOUND', category: 'input', retryable: false, semanticTarget: place, produced: [], userGoalSatisfied: false } });
    if (g.box && K._bboxOK(g.box)) region = [g.box[0][0], g.box[0][1], g.box[1][0], g.box[1][1]];
    else if (isFinite(+g.lng)) region = [+g.lng, +g.lat, +g.lng, +g.lat];
    regionName = g.name || place;
  }
  const YB = await import('./year-book.js');
  const h = { lang: () => (HOST && HOST.lang) || 'en', countryStats: () => (HOST && HOST.countryStats) || {}, escape: esc };
  const deps = YB.pageDeps(h);
  /* the two ends — whole border list (`top` unbounded), one change day each (readYear's own per-year section is not used here) */
  const [r0, r1] = await Promise.all([YB.readYear(w0, deps, { top: Infinity, maxDays: 1 }), YB.readYear(w1, deps, { top: Infinity, maxDays: 1 })]);
  const polities = (r0.borders && r0.borders.largest && r1.borders && r1.borders.largest && !r0.borders.modern && !r1.borders.modern) ? diffPolities(r0.borders.largest, r1.borders.largest, region) : null;
  /* the layers a source states at each end */
  let layers = null;
  try { const LT = window.IntMapLayerTime; if (LT && LT.coverage) layers = diffLayers(await LT.coverage(isoOf(w0)), await LT.coverage(isoOf(w1))); } catch (_) { layers = null; }
  /* the days inside the period on which the border record changes (the record states each day; before 1689 it states none) */
  const TB = deps.borders;   /* year-book.js pageDeps — the reader the page already holds, not a new read of the global */
  const maxDays = Math.max(1, Math.min(366, Math.round(+a.maxDays) || 40));
  const days = []; let dayTotal = 0, dayCap = 0, daysUnstated = false;
  if (TB && TB.changeDates && TB.collectionAt) {
    const sheets = (r0.borders && r0.borders.tier === 'snapshot') || (r1.borders && r1.borders.tier === 'snapshot');
    if (sheets) daysUnstated = true;
    else {
      try {
        const all = (await TB.changeDates()).filter((d) => d instanceof Date && d.getTime() > w0.getTime() && d.getTime() <= w1.getTime()).sort((x, y) => x - y);
        dayTotal = all.length;
        const nameOf = (p) => String((p && ((p._i18n && (p._i18n[h.lang()] || p._i18n.en)) || p.NAME || p.name)) || '').trim();
        const setOf = (fc) => { const m = new Map(); for (const f of (fc && fc.features) || []) { const n = nameOf(f.properties); if (n && !m.has(n)) m.set(n, f.geometry); } return m; };
        const hit = (g) => !region || boxesMeet(bboxOfGeometry(g), region);
        for (const d of all.slice(0, maxDays)) {
          const before = await TB.collectionAt(new Date(d.getTime() - 86400000)), after = await TB.collectionAt(d);
          if (!before || !after || !before.fc || !after.fc) continue;
          const A = setOf(before.fc), B = setOf(after.fc);
          const appeared = [...B.keys()].filter((k) => !A.has(k) && hit(B.get(k)));
          const ended = [...A.keys()].filter((k) => !B.has(k) && hit(A.get(k)));
          const reshaped = [...B.keys()].filter((k) => A.has(k) && A.get(k) !== B.get(k) && (hit(B.get(k)) || hit(A.get(k))));
          days.push({ date: isoOf(d), prec: TB.changePrecision ? TB.changePrecision(d) : 'day', appeared, ended, reshaped });
        }
        dayCap = Math.max(0, dayTotal - maxDays);
      } catch (_) { daysUnstated = true; }
    }
  }
  /* the war record's dated events inside the period (null when the record does not span any year of it) */
  let wars = null;
  try {
    let W = null;
    for (let y = P.t0.year; y <= P.t1.year && !W; y++) W = await deps.wars(y);
    if (W && Array.isArray(W.wars)) {
      const lo = isoOf(w0), hi = isoOf(w1), pickName = (n) => (n && (n[h.lang()] || n.en)) || '';
      const inBox = (p) => !region || !Array.isArray(p) || (p[0] >= region[0] && p[0] <= region[2] && p[1] >= region[1] && p[1] <= region[3]);
      wars = [];
      for (const w of W.wars) {
        const evs = (w.events || []).filter((e) => e.d > lo && e.d <= hi && (!region || (Array.isArray(e.at) && inBox(e.at)))).map((e) => ({ date: e.d, name: pickName(e.name), kind: e.kind || '' }));
        if (evs.length) wars.push({ name: pickName(w.name) || w.id, from: w.from, to: w.to, events: evs });
      }
    }
  } catch (_) { wars = null; }
  const items = rankChanges(days, wars || [], region);
  /* the statistics: Maddison at both ends, compared only where both state them */
  let econ = null;
  try { const M = deps.maddison; if (M && M.load) { const data = await M.load(); const rows = (y) => Object.keys(data || {}).map((c) => ({ code: c, name: deps.countryName ? deps.countryName(c) : c, pop: M.popN(c, y), gdppc: M.gdppc(c, y) })).filter((r) => r.pop != null || r.gdppc != null); econ = diffEconomy(rows(w0.getFullYear()), rows(w1.getFullYear())); } } catch (_) { econ = null; }
  /* the live news, only where the period reaches the feed (research.events holds the last 168 h) */
  let news = null;
  const hoursBack = (Date.now() - w0.getTime()) / 3600000;
  if (a.news !== false && Date.now() - w1.getTime() < 168 * 3600000 && hoursBack > 0) {
    try { const er = await K.dispatch({ type: 'events', place: place || undefined, hours: Math.min(168, Math.max(6, Math.ceil(hoursBack))), n: Math.max(3, Math.min(12, Math.round(+a.n) || 8)) }); news = { ok: !!(er && er.ok), html: er && er.html }; } catch (_) { news = { ok: false, html: '' }; }
  }
  /* write it */
  const N = Math.max(1, Math.min(40, Math.round(+a.n) || 10));
  const sec = (t) => '<div style="font-weight:600;margin-top:8px;">' + esc(t) + '</div>';
  const pick = (t) => L(t[0], t[1]);
  const nameList = (rows, f) => rows.slice(0, 8).map(f).join(L(', ', '、')) + (rows.length > 8 ? L(' … +' + (rows.length - 8), ' … 他 ' + (rows.length - 8)) : '');
  const km = (v) => Math.round(v).toLocaleString('en-US') + ' km²';
  const pct = (v) => (v > 0 ? '+' : '') + (v * 100).toFixed(0) + '%';
  let out = note('✓ ' + L('What changed: ' + label(P.t0) + ' → ' + label(P.t1) + (regionName ? ' · ' + regionName : ''), '変化: ' + label(P.t0) + ' → ' + label(P.t1) + (regionName ? ' · ' + regionName : '')));
  out += '<div style="font-size:11px;color:var(--text-muted);">' + esc(L('A bare year is read as the middle of that year (the same instant the year book reads); the map and the clock are not moved.', '年だけの指定はその年の半ばとして読みます（年鑑と同じ時点）。地図も時計も動かしません。')) + '</div>';
  if (polities) {
    out += sec(L('Polities on the map', '地図に描かれる政体')) + '<div>' + esc(L(polities.countA + ' at the start, ' + polities.countB + ' at the end' + (regionName ? ' (those touching ' + regionName + ')' : ''), '開始時 ' + polities.countA + '・終了時 ' + polities.countB + (regionName ? '（' + regionName + ' にかかるもの）' : ''))) + '</div>';
    if (polities.appeared.length) out += '<div>' + esc(L('Appear', '出現')) + ' (' + polities.appeared.length + '): ' + esc(nameList(polities.appeared, (p) => p.name + ' ' + km(p.km2))) + '</div>';
    if (polities.gone.length) out += '<div>' + esc(L('No longer drawn', '描かれなくなる')) + ' (' + polities.gone.length + '): ' + esc(nameList(polities.gone, (p) => p.name + ' ' + km(p.km2))) + '</div>';
    if (polities.reshaped.length) out += '<div>' + esc(L('Drawn area changes', '描かれる面積が変わる')) + ' (' + polities.reshaped.length + '): ' + esc(nameList(polities.reshaped, (p) => p.name + ' ' + pct(p.rel))) + '</div>';
    if (!polities.appeared.length && !polities.gone.length && !polities.reshaped.length) out += '<div>' + esc(L('The border record draws the same polities with the same areas at both ends.', '国境の記録は両端で同じ政体を同じ面積で描いています。')) + '</div>';
  } else out += sec(L('Polities on the map', '地図に描かれる政体')) + '<div>' + esc(L('Not compared: at least one end is drawn with today\'s borders or the record could not be read.', '比較していません: 少なくとも片方の端が現在の国境で描かれる、または記録を読めませんでした。')) + '</div>';
  if (econ && (econ.population.length || econ.gdppc.length)) {
    out += sec(L('Statistics that moved (Maddison Project, by country code)', '動いた統計（Maddison Project・国コード別）'));
    if (econ.population.length) out += '<div>' + esc(L('Population', '人口')) + ' (' + econ.comparedPop + ' ' + L('countries state both ends', 'か国が両端を述べている') + '): ' + esc(econ.population.slice(0, 6).map((r) => r.name + ' ' + pct(r.rel)).join(L(', ', '、'))) + '</div>';
    if (econ.gdppc.length) out += '<div>' + esc(L('GDP per head', '一人当たり GDP')) + ' (' + econ.comparedGdppc + '): ' + esc(econ.gdppc.slice(0, 6).map((r) => r.name + ' ' + pct(r.rel)).join(L(', ', '、'))) + '</div>';
    if (econ.onlyOne) out += '<div style="font-size:11px;color:var(--text-muted);">' + esc(L(econ.onlyOne + ' values are stated at one end only and are not compared (not read as growth from zero).', econ.onlyOne + ' 件は片方の端だけが述べる値で、比較していません（ゼロからの増加とは読みません）。')) + '</div>';
  } else out += sec(L('Statistics that moved', '動いた統計')) + '<div>' + esc(L('No country has a Maddison value stated at both ends.', '両端で Maddison の値を述べる国がありません。')) + '</div>';
  if (layers && (layers.gained.length || layers.lost.length)) {
    out += sec(L('Layers a source can draw', '典拠が述べるレイヤー'));
    if (layers.gained.length) out += '<div>' + esc(L('Stated at the end only', '終了時にだけ述べられる')) + ' (' + layers.gained.length + '): ' + esc(nameList(layers.gained, (x) => x)) + '</div>';
    if (layers.lost.length) out += '<div>' + esc(L('Stated at the start only', '開始時にだけ述べられる')) + ' (' + layers.lost.length + '): ' + esc(nameList(layers.lost, (x) => x)) + '</div>';
  }
  out += sec(L('Inside the period, by how many records each affects', '期間内の出来事（影響する記録の数の順）'));
  if (items.length) {
    out += '<ol style="margin:2px 0 4px 18px;padding:0;">' + items.slice(0, N).map((it) => {
      if (it.kind === 'border') return '<li><b>' + esc((it.yearOnly && it.date) ? String(it.date).replace(/-01-01$/, '') : (it.date || L('undated', '日付なし'))) + '</b>' + (it.yearOnly ? ' <i>(' + esc(L('the record states the year only', '記録は年だけを述べている')) + ')</i>' : it.maybeYearOnly ? ' <i>(' + esc(L('1 January: the record may state only the year', '1 月 1 日: 記録は年だけを述べている可能性')) + ')</i>' : '') + ' — ' + esc(L('border record changes', '国境の記録の変化')) + ': '
        + esc([it.appeared.length ? '+' + it.appeared.join(', ') : '', it.ended.length ? '−' + it.ended.join(', ') : '', it.reshaped.length ? '~' + it.reshaped.slice(0, 4).join(', ') : ''].filter(Boolean).join(' · ')) + ' <span style="color:var(--text-muted);font-size:11px;">(' + esc(pick(it.basis)) + ')</span></li>';
      return '<li><b>' + esc(it.name) + '</b> (' + esc(it.date || '') + ' – ' + esc(it.to || '') + ') — ' + it.events.map((e) => esc(e.date + ' ' + e.name)).join(' · ') + ' <span style="color:var(--text-muted);font-size:11px;">(' + esc(pick(it.basis)) + ')</span></li>';
    }).join('') + '</ol>';
    if (items.length > N) out += '<div style="font-size:11px;color:var(--text-muted);">' + esc(L((items.length - N) + ' more not shown (raise n)', '他 ' + (items.length - N) + ' 件は表示していません（n を増やす）')) + '</div>';
  } else out += '<div>' + esc(L('No dated event is stated inside this period' + (regionName ? ' for ' + regionName : '') + ' by the border record or the war record.', '国境の記録にも戦争の記録にも、この期間' + (regionName ? '・' + regionName : '') + 'の日付つきの出来事はありません。')) + '</div>';
  const notes = [];
  if (daysUnstated) notes.push(L('Before 1689 the border record is one sheet per period and states no change days, so no border day is listed.', '1689 年より前の国境の記録は時期ごとの 1 枚で変化の日を述べないため、国境の変化日は載せていません。'));
  if (dayCap) notes.push(L(dayCap + ' of ' + dayTotal + ' border-change days were not examined (the earliest ' + maxDays + ' were; raise maxDays).', '国境の変化日 ' + dayTotal + ' 日のうち ' + dayCap + ' 日は調べていません（最初の ' + maxDays + ' 日を調べた。maxDays を増やす）。'));
  if (wars === null) notes.push(L('The war record does not span this period.', '戦争の記録はこの期間に及んでいません。'));
  else notes.push(L('Wars: only the ' + (wars.length) + ' in IntMap\'s war record with a dated event here — other conflicts are not in it.', '戦争: IntMap の戦争記録にある、この期間に日付つきの出来事を持つ ' + wars.length + ' 件のみ。他の紛争は記録にありません。'));
  if (news) out += sec(L('News events (the live feed, last 7 days)', 'ニュースの出来事（ライブのフィード・直近 7 日）')) + (news.ok ? news.html : '<div>' + esc(L('The news events could not be read.', 'ニュースの出来事を読めませんでした。')) + '</div>');
  else if (a.news !== false) notes.push(L('The news feed holds the last 7 days only, so it says nothing about this period.', 'ニュースのフィードは直近 7 日のみで、この期間については何も述べません。'));
  out += '<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px;line-height:1.5;">' + notes.map(esc).join(' ') + '</div>';
  return R(true, out, { meta: { code: 'OK', category: 'ok', retryable: false, produced: ['explanation'], userGoalSatisfied: true, changes: { from: label(P.t0), to: label(P.t1), region: regionName || null, polities, economy: econ, layers, items: items.slice(0, N), borderDaysExamined: days.length, borderDaysNotExamined: dayCap, warsSpanned: wars !== null, news: !!news } } });
}
const isoOf = (d) => { const y = d.getFullYear(); return (y < 0 ? '-' + String(-y).padStart(6, '0') : String(y).padStart(4, '0')) + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
