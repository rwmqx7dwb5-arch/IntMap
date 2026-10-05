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
import { str, bool, num, int } from './atlas-caps.js';
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
    schema: () => ({ type: 'object', properties: { year: int(), date: str(), daysAgo: int(), value: num(), now: bool(), reset: bool(), live: bool() }, anyOf: [{ required: ['year'] }, { required: ['date'] }, { required: ['daysAgo'] }, { required: ['value'] }, { required: ['now'] }, { required: ['reset'] }, { required: ['live'] }] }), /* `timeTravel` */
      /* (#R94) time-travel now drives the WHOLE spacetime OS (IntMapTime): news, the Countries statistics,
         borders, the climate era, NATO/EU accession & the day/night terminator all move together. Accepts a
         year (deep time back to `IntMapTime.min` — AD 1 since #R604), an exact date, or daysAgo; "now/reset" returns everything to live. */
    async run(a, dctx, K) { const res = await travel(a, dctx, K); return withCoverage(res, K); },
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
];

/* ══ (time-compare-lapse) THE TWO NEW DOORS ═════════════════════════════════════════════════════════════════
   Each result carries `meta.want` — the state the call set out to reach, in the shape the observer reads
   (js/atlas-capabilities.js `timeView`): the verdict compares it with what the app reports AFTER, so a window
   that did not move or a lapse that did not start is not called done. */
async function compareAt(a, K) {
  const R = K.R, L = K.L, warn = K.warn, note = K.note, esc = K.esc;
  /* ⚠ READ OFF THE WINDOW'S PUBLISHED CONTROLLER, NOT IMPORTED FROM js/compare.js: this module is in Atlas's lazy chunk,
     and a lazy chunk importing js/compare.js (eager, and itself importing modules other lazy chunks share) split three
     shared modules out of the boot chunk — eager.requests 9 → 12, measured with scripts/perf-budget.mjs. */
  const C = window.IntMapCompare;
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
  const s = M.recordLapse({ from, to, unit: a.unit, step: a.step, fps: a.fps, size: a.size, format: a.format });
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
