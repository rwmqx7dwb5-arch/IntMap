/* ============================================================================
 *  IntMap · ATLAS — WHAT EACH CAPABILITY'S ARGUMENTS ACTUALLY ARE  (#R406)
 *  window.IntMapAtlasSchemas
 * ----------------------------------------------------------------------------
 *  All 126 capabilities shared ONE schema, written once in js/atlas-capabilities.js:
 *
 *      inputSchema: { type: 'object' }
 *
 *  `{type:'object'}` accepts every object, so it accepted every action. `analyze` with no question
 *  and `highlight` with no target were VALID plans: they passed availability, passed argument
 *  validation, reached the dispatch — and only there did the case answer 「何を分析しますか？」,
 *  after the plan had been accepted, the step counted and the turn spent. A schema that cannot fail
 *  is not a gate; it is a comment. This file is the missing half: one REAL schema per capability,
 *  with REAL required arguments.
 *
 *  WHERE EVERY NAME BELOW COMES FROM, in that order of authority:
 *    · the dispatch in js/atlas-console.js (`switch(a.type)`) — the code that READS the argument.
 *      If the case reads `a.name`, the property is `name`.
 *    · js/atlas-catalog-text.js — the shapes the planner is shown (`{"type":"highlight","targets":…}`).
 *    · js/atlas-capabilities.js `targetPolicyOf` / `hasTarget` — which spellings satisfy a target,
 *      and which 45 capabilities may not run without one.
 *
 *  THREE RULES THE TABLE FOLLOWS, because breaking any of them fails a call that works today:
 *   (1) NO INVENTED NAMES. Where one thing has several spellings (`place` / `from` / `origin` /
 *       `center`), every spelling is a property and `anyOf` says that one of them is needed. A
 *       single "canonical" name the dispatch never reads would reject the plans it does read.
 *   (2) `enum` ONLY WHERE THE DISPATCH COMPARES AGAINST A CLOSED, ASCII SET. Many value tests in
 *       the dispatch are regexes carrying Japanese, German and Russian spellings — an `enum` on
 *       `pan.dir` or `fly.mode` would reject the very spellings the case was written to accept.
 *       Those stay plain strings. Where the set IS closed it was read out of the code, not out of
 *       the prose: `map.object.kind` has ten values here and eight in the catalogue, because
 *       js/map-tools.js really does create `nogo` and `pt` objects.
 *   (3) REQUIRED MEANS THE CASE CANNOT WORK WITHOUT IT. Every on/off toggle, every panel opener,
 *       `map.object` (whose default op is `list`) and `routing.drone` (whose empty form opens the
 *       planner) do something correct on an empty argument set, so they carry neither `required`
 *       nor `anyOf`. Making them "stricter" would delete working features.
 *
 *  ⚠ THE DIALECT IS SMALL ON PURPOSE: type / properties / required / anyOf / enum / minimum /
 *  maximum / minLength / minItems / items. No $ref, no oneOf, no format. `anyOf` here carries only
 *  `required` lists — it is «at least one of these argument sets is present», nothing more.
 *
 *  ⚠ WHY ITS OWN FILE. js/atlas-capabilities.js is 903 lines and is EAGER — it rides in the boot
 *  bundle so that a capability is discoverable before Atlas loads (#R311 measured what mounting
 *  more of the kernel there costs). This is DATA, not logic: one literal per capability, no DOM and
 *  no globals beyond the single publication at the bottom. It sits beside its subject the way
 *  js/atlas-catalog-text.js holds the planner's prose and js/atlas-policy.js holds the planning
 *  rules, for the same reason each of those left the file it was born in.
 * ==========================================================================*/

export function makeAtlasSchemas() {
  return (function () {

    /* ══ THE SHAPES ══════════════════════════════════════════════════════════════════════════════
       Small builders, so 126 rows read as a table instead of as 900 lines of punctuation. Each one
       returns a FRESH object — a shared literal would let one consumer's annotation reach every
       capability that happens to take a latitude. */
    function str() { return { type: 'string' }; }
    function bool() { return { type: 'boolean' }; }
    function num(min, max) { var o = { type: 'number' }; if (min != null) o.minimum = min; if (max != null) o.maximum = max; return o; }
    function int(min, max) { var o = { type: 'integer' }; if (min != null) o.minimum = min; if (max != null) o.maximum = max; return o; }
    function one() { return { type: 'string', enum: [].slice.call(arguments) }; }
    function list(item, min) { var o = { type: 'array' }; if (item) o.items = item; if (min != null) o.minItems = min; return o; }
    function obj() { return { type: 'object' }; }
    function lat() { return { type: 'number', minimum: -90, maximum: 90 }; }
    function lng() { return { type: 'number', minimum: -180, maximum: 180 }; }
    /* A field the case accepts in TWO shapes — an array OR a comma-separated string (`places`,
       `countries`, `avoid`), a number OR "5M" (`minPop`). The dialect has no union, and naming one
       of the two would reject the other, which is a shape the dispatch was written to accept. */
    function loose() { return {}; }
    /* A capability whose case reads NOTHING — `clickId('btn-share')` and no more. `properties` is
       still not empty, and inventing an argument these cases do not read would be the very thing
       this file exists to end. What they DO carry is `type`, the dispatch's own switch key (an
       action without one returns immediately).
       ⚠ AND IT IS PINNED TO THE ONE SPELLING THE EXECUTOR ITSELF SETS. js/atlas-toolsurface.js
       builds the action as `Object.assign({type: cap.legacy}, args)` — the arguments win — so a
       `type` the caller may choose freely is a way to send one capability's arguments into another
       capability's case. With the enum, an accepted `type` can only be the value that was going to
       be there anyway, and anything else is refused before the dispatch is reached. */
    function noArgs(legacy) { return { type: 'object', properties: { type: { type: 'string', enum: [legacy] } } }; }

    /* ══ THE TABLE ═══════════════════════════════════════════════════════════════════════════════
       Keyed by CAPABILITY ID and in the order of the table in js/atlas-capabilities.js, so the two
       can be read side by side. The legacy name (the `case` label the arguments were read from) is
       named in a comment wherever it differs from the id's last segment. */
    var S = {

      /* ── map, layers, view, panels, country data — the first run of the registry table ──────── */
      'map.clearHighlights': noArgs('reset'),
      'layers.toggle': { type: 'object', properties: { name: str(), on: bool() }, required: ['name'] },
      /* the case needs the layer AND a value: name alone answers «no opacity control» */
      'layers.opacity': { type: 'object', properties: { name: str(), value: num(0, 100), percent: num(0, 100), delta: num(-100, 100) }, anyOf: [{ required: ['name', 'value'] }, { required: ['name', 'percent'] }, { required: ['name', 'delta'] }] },
      'view.projection': { type: 'object', properties: { mode: one('globe', 'flat') }, required: ['mode'] },
      'view.basemap': { type: 'object', properties: { mode: one('map', 'satellite', 'sat') }, required: ['mode'] },
      'panel.compare': { type: 'object', properties: { on: bool() } },
      'view.flyTo': { type: 'object', properties: { place: str(), lng: lng(), lat: lat(), zoom: num(0, 24), scale: str() }, anyOf: [{ required: ['place'] }, { required: ['lat', 'lng'] }] },
      'data.weather': { type: 'object', properties: { place: str() }, required: ['place'] },
      'research.brief': { type: 'object', properties: { place: str(), lng: lng(), lat: lat() } },
      'research.askHere': { type: 'object', properties: { place: str(), lng: lng(), lat: lat(), question: str(), query: str() }, anyOf: [{ required: ['place'] }, { required: ['lat', 'lng'] }] },
      'reader.gloss': { type: 'object', properties: { term: str(), text: str(), query: str() }, anyOf: [{ required: ['term'] }, { required: ['text'] }, { required: ['query'] }] },   /* (#R491) a gloss with no phrase is not a question */
      'data.rank': { type: 'object', properties: { metric: str(), order: one('top', 'bottom'), n: int(1, 40) }, required: ['metric'] },
      'data.ratio': { type: 'object', properties: { metricA: str(), metricB: str(), order: one('top', 'bottom'), n: int(1, 40) }, required: ['metricA', 'metricB'] },
      'data.relate': { type: 'object', properties: { metricY: str(), metricX: str(), find: one('low', 'high'), n: int(1, 40) }, required: ['metricY', 'metricX'] },
      'map.choropleth': { type: 'object', properties: { metric: str(), order: one('top', 'bottom'), color: str() }, required: ['metric'] },   /* `mapMetric` */
      'settings.theme': { type: 'object', properties: { mode: one('light', 'dark', 'auto', 'system') }, required: ['mode'] },
      'settings.accent': { type: 'object', properties: { color: str(), value: str(), mode: str(), name: str() }, anyOf: [{ required: ['color'] }, { required: ['value'] }, { required: ['mode'] }, { required: ['name'] }] },
      /* any code, endonym, English name or alias js/lang-registry.js knows — not a closed set */
      'settings.language': { type: 'object', properties: { lang: str() }, required: ['lang'] },
      'view.terrain3d': { type: 'object', properties: { on: bool() } },
      'view.grid': { type: 'object', properties: { on: bool() } },
      'view.resetNorth': noArgs('resetNorth'),
      'view.zoom': { type: 'object', properties: { to: num(0, 24), delta: num(), dir: one('in', 'out') } },
      /* `deg` is unbounded on purpose: a bearing may be negative, and pitch reaches 180 once
         settings.tiltLimit is on (the standard ceiling is 78) */
      'view.bearing': { type: 'object', properties: { deg: num(), delta: num(), dir: str(), toward: str(), pitch: num(0, 180) } },
      'view.pitch': { type: 'object', properties: { deg: num(0, 180), delta: num(), on: bool() } },
      /* `dir` carries compass words in five languages, so it stays a string — but a pan with no
         direction is a no-op the case reports as success */
      'view.pan': { type: 'object', properties: { dir: str(), direction: str(), fraction: num(0, 1) }, anyOf: [{ required: ['dir'] }, { required: ['direction'] }] },
      'panel.tab': { type: 'object', properties: { name: str() }, required: ['name'] },
      'layers.countryInfo': { type: 'object', properties: { on: bool() } },
      'data.countryCard': { type: 'object', properties: { country: str(), name: str(), place: str() }, anyOf: [{ required: ['country'] }, { required: ['name'] }, { required: ['place'] }] },   /* `selectCountry` */
      'data.timeSeries': { type: 'object', properties: { country: str(), name: str(), place: str() }, anyOf: [{ required: ['country'] }, { required: ['name'] }, { required: ['place'] }] },
      /* `on:false` (or country "off"/"exit"/"clear") leaves isolation — a complete call with no country */
      'map.isolateCountry': { type: 'object', properties: { country: str(), place: str(), on: bool() }, anyOf: [{ required: ['country'] }, { required: ['place'] }, { required: ['on'] }] },   /* `isolate` */
      'sim.lineOfSight': { type: 'object', properties: { place: str(), from: str() }, anyOf: [{ required: ['place'] }, { required: ['from'] }] },   /* `los` */
      'data.populationIn': { type: 'object', properties: { target: one('drawn', 'area', 'polygon', 'radius', 'circle'), area: str(), place: str(), radiusKm: num(0), km: num(0) }, anyOf: [{ required: ['target'] }, { required: ['area'] }, { required: ['place'] }, { required: ['radiusKm'] }, { required: ['km'] }] },   /* `population` */
      /* two dates or nothing — `from`/`to` are DATES here, not endpoints */
      'data.satelliteCompare': { type: 'object', properties: { dateA: str(), dateB: str(), before: str(), after: str(), from: str(), to: str(), place: str() }, anyOf: [{ required: ['dateA', 'dateB'] }, { required: ['before', 'after'] }, { required: ['from', 'to'] }] },
      'data.layerValues': { type: 'object', properties: { place: str(), lng: lng(), lat: lat(), layer: str(), layers: list(str()) }, anyOf: [{ required: ['place'] }, { required: ['lat', 'lng'] }] },   /* `layerData` */
      /* op defaults to `list`, which needs nothing; the kinds are js/map-tools.js's own */
      'map.object': { type: 'object', properties: { op: one('list', 'remove', 'delete', 'focus', 'zoom', 'rename'), action: one('list', 'remove', 'delete', 'focus', 'zoom', 'rename'), id: str(), kind: one('pin', 'radius', 'annot', 'poly', 'outline', 'upload', 'route', 'iso', 'nogo', 'pt'), index: int(1), name: str(), to: str() } },

      /* ── routing ────────────────────────────────────────────────────────────────────────────── */
      'routing.isochrone': { type: 'object', properties: { place: str(), from: str(), origin: str(), center: str(), lng: lng(), lat: lat(), minutes: loose(), time: num(1, 120), mins: num(1, 120), mode: str(), profile: str(), by: str() }, anyOf: [{ required: ['place'] }, { required: ['from'] }, { required: ['origin'] }, { required: ['center'] }, { required: ['lat', 'lng'] }] },
      'routing.setEndpoints': { type: 'object', properties: { from: str(), to: str() }, required: ['from', 'to'] },   /* `route` = the MARITIME route */
      'routing.optimizeStops': { type: 'object', properties: { places: loose(), points: loose(), stops: loose(), mode: str(), profile: str() }, anyOf: [{ required: ['places'] }, { required: ['points'] }, { required: ['stops'] }] },   /* `optimizeRoute` */
      /* `directions` — both endpoints, in any of the spellings the case reads for the destination */
      'routing.route': { type: 'object', properties: { from: str(), to: str(), place: str(), destination: str(), via: list(str()), mode: str(), profile: str(), time: str(), datetime: str(), depart: str(), arrive: str(), arriveBy: bool(), avoid: loose(), avoids: loose(), exclude: loose(), avoidArea: list(), avoidAreas: list(), transitModes: list(str()), maxWalkM: num(0) }, anyOf: [{ required: ['from', 'to'] }, { required: ['from', 'place'] }, { required: ['from', 'destination'] }] },
      /* coverage mode paints the streets with no point at all, so it is its own branch */
      'panel.streetView': { type: 'object', properties: { place: str(), lng: lng(), lat: lat(), mode: str(), coverage: bool(), on: bool() }, anyOf: [{ required: ['place'] }, { required: ['lat', 'lng'] }, { required: ['mode'] }, { required: ['coverage'] }, { required: ['on'] }] },   /* `streetview` */
      /* `source` is BOTH a preset key and a place name (the preset carries its own coordinates), so
         it can stand alone as the release point and cannot be an enum */
      'sim.radiation': { type: 'object', properties: { place: str(), from: str(), at: str(), source: str(), lng: lng(), lat: lat(), isotope: one('cs137', 'i131', 'cs134', 'sr90'), bq: num(0), pbq: num(0), tbq: num(0), becquerel: num(0), emitHours: num(0), halfLife: num(0), halfLifeHours: num(0), hours: num(0), seconds: num(0), date: str(), datetime: str(), when: str() }, anyOf: [{ required: ['place'] }, { required: ['from'] }, { required: ['at'] }, { required: ['source'] }, { required: ['lat', 'lng'] }] },
      'sim.flightSim': { type: 'object', properties: { place: str(), over: str(), from: str(), lng: lng(), lat: lat(), alt: num(), aircraft: str(), plane: str(), craft: str(), mode: str(), action: str(), on: bool() } },
      'data.runways': { type: 'object', properties: { place: str() }, required: ['place'] },   /* `runway` */

      /* ── panels, layers, settings, the clock ────────────────────────────────────────────────── */
      'panel.education': noArgs('edu'),
      'panel.ecmwf': noArgs('ecmwf'),
      /* the layer id is resolved by `layerFor`, which also accepts the un-prefixed spelling */
      'data.wxModel': { type: 'object', properties: { layer: str(), name: str(), model: one('ecmwf_ifs', 'ncep_gfs013', 'dwd_icon') }, anyOf: [{ required: ['layer', 'model'] }, { required: ['name', 'model'] }] },
      'layers.railAxis': { type: 'object', properties: { axis: str(), name: str(), by: str() }, anyOf: [{ required: ['axis'] }, { required: ['name'] }, { required: ['by'] }] },
      'panel.widgets': noArgs('widgets'),
      'panel.screenshot': noArgs('screenshot'),
      'panel.share': noArgs('share'),
      'panel.search': { type: 'object', properties: { query: str(), place: str() }, anyOf: [{ required: ['query'] }, { required: ['place'] }] },
      'settings.tempUnit': { type: 'object', properties: { unit: one('c', 'celsius', 'f', 'fahrenheit', 'both') }, required: ['unit'] },
      'settings.units': { type: 'object', properties: { mode: one('metric', 'imperial', 'both') }, required: ['mode'] },
      /* Chronos: a year, a date, a number of days — or the return to live. With none of them the
         case says «give a year or date», which is what this branch list makes it stop needing to. */
      'time.travel': { type: 'object', properties: { year: int(), date: str(), daysAgo: int(), value: num(), now: bool(), reset: bool(), live: bool() }, anyOf: [{ required: ['year'] }, { required: ['date'] }, { required: ['daysAgo'] }, { required: ['value'] }, { required: ['now'] }, { required: ['reset'] }, { required: ['live'] }] },   /* `timeTravel` */
      'map.pin': { type: 'object', properties: { place: str(), country: str(), title: str(), description: str(), source: str(), url: str(), date: str(), confidence: str(), kind: str(), countryCode: str() }, required: ['place'] },   /* (#R489) a pin may carry what it IS — the marker's popup shows title/description/date/source/link. Before this the action took a bare place, so a turn that wanted described incident markers had to improvise with a second research pass (js/atlas-console.js case 'pin'). `country` is not decoration: 「オクチャブリスキー」 alone is a query that cannot succeed. */
      'map.tool': { type: 'object', properties: { name: str() }, required: ['name'] },
      'map.radius': { type: 'object', properties: { place: str(), km: num(0), color: str() }, required: ['place'] },
      /* base and top are ALTITUDES; without both the case refuses, whatever the footprint */
      'map.volume3d': { type: 'object', properties: { place: str(), km: num(0), base: num(), top: num(), unit: one('m', 'km', 'ft', 'mi'), shape: str(), color: str(), opacity: num(0, 1) }, required: ['place', 'base', 'top'] },
      /* `drone` with nothing opens the planner; `action` is compared lower-cased, so the catalogue's
         own `followTerrain` would fail an enum — it stays a string */
      'routing.drone': { type: 'object', properties: { action: str(), from: str(), to: str(), via: list(str()), alt: num(), ref: one('agl', 'amsl'), aircraft: one('micro', 'prosumer', 'heavylift', 'fixedwing'), name: str() } },

      /* ══ (#R347) ACTIVE NAVIGATION — the live half of routing ══════════════════════════════════
         None of the four takes a target: they act on the route and the guidance that already exist,
         and `navigation.start` refuses with «plan a route first» rather than inventing one. */
      'navigation.start': { type: 'object', properties: { simulate: bool(), sim: bool(), speed: num(0) } },
      'navigation.stop': noArgs('stopNavigation'),
      'navigation.status': noArgs('navStatus'),
      'navigation.camera': { type: 'object', properties: { mode: one('follow', 'north', 'overview', 'free'), camera: one('follow', 'north', 'overview', 'free') } },
      'navigation.voice': { type: 'object', properties: { mode: one('off', 'alerts', 'guidance'), voice: one('off', 'alerts', 'guidance') } },

      /* ── tools, workspace, the terrain simulations ──────────────────────────────────────────── */
      'map.measure': { type: 'object', properties: { from: str(), to: str() }, required: ['from', 'to'] },
      'panel.correlate': noArgs('correlate'),
      'panel.settings': noArgs('settings'),
      'panel.workspace': { type: 'object', properties: { on: bool(), mode: str(), action: str(), state: str() } },
      'panel.shortcuts': noArgs('shortcuts'),
      'map.objectList': noArgs('objects'),
      'sim.rfCoverage': { type: 'object', properties: { place: str(), at: str(), location: str(), lng: lng(), lat: lat(), height: num(0), antennaHeight: num(0), frequency: num(0), freq: num(0) }, anyOf: [{ required: ['place'] }, { required: ['at'] }, { required: ['location'] }, { required: ['lat', 'lng'] }] },
      'sim.sunPosition': { type: 'object', properties: { place: str(), at: str(), location: str(), lng: lng(), lat: lat(), date: str(), datetime: str(), time: str() }, anyOf: [{ required: ['place'] }, { required: ['at'] }, { required: ['location'] }, { required: ['lat', 'lng'] }] },   /* `sun` */
      'sim.terrainWater': { type: 'object', properties: { place: str(), at: str(), location: str(), lng: lng(), lat: lat(), rainMm: num(0), waterM3: num(0), flowM3s: num(0), raiseM: num(), lowerM: num(), radiusM: num(0), mode: str(), pour: one('once', 'cont', 'continuous', 'stop'), pourRateM3s: num(0), timeSpeed: num(0), resetTerrain: bool() }, anyOf: [{ required: ['place'] }, { required: ['at'] }, { required: ['location'] }, { required: ['lat', 'lng'] }] },
      'sim.earthquake': { type: 'object', properties: { place: str(), at: str(), location: str(), epicentre: str(), epicenter: str(), lng: lng(), lat: lat(), depth: num(0), magnitude: num(), mw: num(), t: num(), site: one('hard', 'rock', 'stiff', 'soft'), scale: one('mmi', 'jma'), speed: num(0), slip: num(0), opacity: num(0, 1), tsunami: bool(), hours: num(1, 30), maximum: bool(), play: bool(), amplitude: num(0), contours: bool(), real: bool(), seconds: num(0) }, anyOf: [{ required: ['place'] }, { required: ['at'] }, { required: ['location'] }, { required: ['epicentre'] }, { required: ['epicenter'] }, { required: ['lat', 'lng'] }] },
      'sim.sunHours': { type: 'object', properties: { place: str(), at: str(), location: str(), lng: lng(), lat: lat(), solstice: bool(), terrainOnly: bool() }, anyOf: [{ required: ['place'] }, { required: ['at'] }, { required: ['location'] }, { required: ['lat', 'lng'] }] },
      /* `alt` here is how far UP to look, not an altitude; the point is place/at/location or lng+lat */
      'sim.nightSky': { type: 'object', properties: { place: str(), at: str(), location: str(), lng: lng(), lat: lat(), when: str(), time: str(), date: str(), play: bool(), rate: num(), mode: str(), view: str(), stand: bool(), az: num(0, 360), alt: num(-85, 85), fov: num(15, 110), bearing: num() }, anyOf: [{ required: ['place'] }, { required: ['at'] }, { required: ['location'] }, { required: ['lat', 'lng'] }] },
      /* leaving the Earth needs nothing: the default is the solar system, live, at model scale */
      'sim.space': { type: 'object', properties: { body: str(), planet: str(), target: str(), mode: one('system', 'body'), scale: one('real', 'model'), date: str(), datetime: str(), when: str(), rate: num() } },
      'sim.tsunami': { type: 'object', properties: { place: str(), at: str(), location: str(), lng: lng(), lat: lat(), magnitude: num(), mw: num(), depth: num(0), scope: one('global', 'near'), near: bool(), resolution: str(), hours: num(1, 30), amplitude: num(0), maximum: bool(), contours: bool(), play: bool() }, anyOf: [{ required: ['place'] }, { required: ['at'] }, { required: ['location'] }, { required: ['lat', 'lng'] }] },

      /* ── clearing, outlining, the first-class panels ────────────────────────────────────────── */
      'system.diagnose': noArgs('diagnose'),
      'map.clearAll': noArgs('clearAll'),
      'map.outline': { type: 'object', properties: { place: str(), country: str(), name: str(), color: str(), on: bool() }, anyOf: [{ required: ['place'] }, { required: ['country'] }, { required: ['name'] }, { required: ['on'] }] },
      'panel.playground': { type: 'object', properties: { mode: str(), name: str() } },
      'panel.news': { type: 'object', properties: { mode: str(), name: str() } },
      'panel.account': noArgs('account'),
      'panel.donate': noArgs('donate'),
      'panel.feedback': noArgs('feedback'),
      'panel.bugReport': noArgs('bugReport'),
      /* ⚠ THE ONE THIS ROUND IS NAMED AFTER. Four complete forms, and `{}` is none of them:
         a GPT-resolved country set (`targets`/`groups`/`iso3`/`codes`/`countries`), one concrete
         named feature (`query` — a subdivision, a river, a basin), a computed top/bottom N
         (`metric` and its spellings), and the two that operate on the CURRENT highlights —
         `on:false` clears, `color` alone recolours. `minPop`/`maxPop` accept "5M" as well as a
         number, and `filter` is the object form of the same two. */
      'map.highlight': { type: 'object', properties: { targets: list(), groups: list(), iso3: list(), codes: list(), countries: loose(), country: str(), name: str(), place: str(), region: str(), query: str(), interpretation: str(), metric: str(), rankBy: str(), rankMetric: str(), by: str(), order: str(), rankOrder: str(), n: int(1, 40), top: int(1, 40), count: int(1, 40), minPop: loose(), maxPop: loose(), excludeBelowPop: loose(), filter: obj(), color: str(), on: bool() }, anyOf: [{ required: ['targets'] }, { required: ['groups'] }, { required: ['iso3'] }, { required: ['codes'] }, { required: ['countries'] }, { required: ['country'] }, { required: ['name'] }, { required: ['place'] }, { required: ['region'] }, { required: ['query'] }, { required: ['metric'] }, { required: ['rankBy'] }, { required: ['rankMetric'] }, { required: ['by'] }, { required: ['color'] }, { required: ['on'] }] },
      'data.value': { type: 'object', properties: { country: str(), place: str(), name: str(), metric: str(), what: str() }, anyOf: [{ required: ['country'] }, { required: ['place'] }, { required: ['name'] }] },
      'layers.allOff': { type: 'object', properties: { all: bool() } },             /* `layersOff`; all:true drops the base layers too */
      'map.clear': { type: 'object', properties: { what: str(), target: str() } },  /* no `what` = everything, which is the case's own default */
      'view.fullscreen': { type: 'object', properties: { on: bool(), mode: str() } },
      'view.locate': noArgs('locate'),
      /* (#R493) `include` is a CLOSED, ASCII set the dispatch really compares against (rule 2 above),
         and neither argument is required: an inspect with no arguments takes the whole screen, which
         is the right default for 「今見えているもの」. `reason` is free text — what Atlas is looking
         FOR — carried into the frame's caption so the reader can see why their view was captured. */
      'view.inspect': { type: 'object', properties: { include: { type: 'string', enum: ['screen', 'map'] }, reason: str() } },
      /* the place is optional (no place = the current view) but the KIND is not: without it the
         case asks «what kind of facilities?» */
      'map.poi': { type: 'object', properties: { kind: str(), query: str(), what: str(), name: str(), place: str(), color: str() }, anyOf: [{ required: ['kind'] }, { required: ['query'] }, { required: ['what'] }, { required: ['name'] }] },
      'research.mapReport': { type: 'object', properties: { topic: str(), question: str(), query: str(), place: str(), count: int(1) }, anyOf: [{ required: ['topic'] }, { required: ['question'] }, { required: ['query'] }] },
      'research.situationMap': { type: 'object', properties: { topic: str(), question: str(), query: str(), place: str(), region: str(), location: str(), temporalMode: one('historical', 'current', 'mixed'), temporal: one('historical', 'current', 'mixed'), year: int(), evidenceMode: one('historical', 'live', 'mixed') }, anyOf: [{ required: ['topic'] }, { required: ['question'] }, { required: ['query'] }, { required: ['place'] }, { required: ['region'] }, { required: ['location'] }] },   /* `researchMap` */
      'sim.ballistic': { type: 'object', properties: { from: str(), to: str(), place: str(), target: str(), missile: str(), weapon: str(), name: str(), loft: str(), trajectory: str(), traj: str(), mode: str(), marv: bool(), maneuver: bool(), maneuvering: bool(), coriolis: bool(), nuclear: bool(), warhead: str(), yield: num(0), blast: bool(), seconds: num(1) }, anyOf: [{ required: ['from', 'to'] }, { required: ['from', 'place'] }, { required: ['from', 'target'] }] },   /* `missile` */
      'map.elevationHighlight': { type: 'object', properties: { place: str(), region: str(), around: str(), country: str(), threshold: num(), meters: num(), above: bool(), km: num(0), dir: str(), mode: str() }, anyOf: [{ required: ['place'] }, { required: ['region'] }, { required: ['around'] }, { required: ['country'] }] },   /* `elevationBelow` */
      'research.historicalMap': { type: 'object', properties: { era: str(), date: str(), title: str(), topic: str(), question: str(), place: str() }, anyOf: [{ required: ['era'] }, { required: ['date'] }, { required: ['title'] }, { required: ['topic'] }, { required: ['question'] }, { required: ['place'] }] },
      'sim.flyAnimate': { type: 'object', properties: { from: str(), to: str(), mode: str(), seconds: num(1), missile: str(), yield: num(0), blast: bool() }, required: ['from', 'to'] },   /* `fly` */
      'map.drawLine': { type: 'object', properties: { points: list(list(), 2), places: list(str(), 2), color: str(), width: num(0), label: str() }, anyOf: [{ required: ['points'] }, { required: ['places'] }] },
      'map.drawPolygon': { type: 'object', properties: { points: list(list(), 3), places: list(str(), 3), color: str(), label: str() }, anyOf: [{ required: ['points'] }, { required: ['places'] }] },
      'ui.inlineControls': { type: 'object', properties: { items: list(obj(), 1) }, required: ['items'] },   /* `controls` */
      /* a clarification with no question is the defect it exists to prevent */
      'dialog.ask': { type: 'object', properties: { question: str(), options: list(), allowText: bool(), freeText: bool(), text: str(), say: str(), prompt: str() }, required: ['question'] },
      /* ⚠ AND THE OTHER ONE THIS ROUND IS NAMED AFTER: 「何を分析しますか？」 was reached by a plan
         that had already been accepted. Every caller in this repo spells it `question`. */
      /* ⚠ `temporalMode` IS ATLAS'S, AND IT IS WHY IT IS DECLARED HERE. The analyze case used to
         derive it by running _requestProfile(q) — a regular expression over the reader's sentence,
         which #R406 removed. The dispatch now reads it off the call, so whether a question is about
         now or about the past is a judgement Atlas states rather than one a pattern guesses. */
      'research.analyze': { type: 'object', properties: { question: str(), query: str(), text: str(), place: str(), countries: list(str()), country: str(), use: list(str()), scope: str(), temporalMode: one('current', 'historical', 'mixed', 'unspecified'), requestedOutputs: list(str()) }, required: ['question'] },

      /* ── settings and the layer switches that carry their own state ─────────────────────────── */
      'settings.engine': { type: 'object', properties: { name: str(), engine: str(), mode: str() } },   /* no name = REPORT which engine is running */
      'settings.tiltLimit': { type: 'object', properties: { on: bool(), mode: str() } },
      'settings.eyeAltitude': { type: 'object', properties: { on: bool(), mode: str() } },
      'layers.windParticles': { type: 'object', properties: { on: bool(), mode: str(), over: str(), layer: str(), on_layer: str() } },
      /* (#R439) 等圧線 — the contours over the sea-level-pressure field */
      'layers.isobars': { type: 'object', properties: { on: bool(), mode: str() } },
      'layers.nightSide': { type: 'object', properties: { on: bool(), mode: str() } },
      'layers.planeAltitude': { type: 'object', properties: { on: bool(), mode: str() } },
      'layers.aircraftTrack': { type: 'object', properties: { aircraft: str(), callsign: str(), flight: str(), reg: str(), icao24: str(), on: bool(), mode: str() } },   /* no aircraft = the one already selected */
      'layers.satellites': { type: 'object', properties: { on: bool(), mode: str(), group: str(), catalogue: str(), kind: str(), name: str(), satellite: str(), object: str(), norad: loose() } },
      'panel.ticker': { type: 'object', properties: { on: bool(), mode: str() } },
      'data.compareStats': { type: 'object', properties: { countries: loose(), country: str(), metrics: list(str()), source: one('wb', 'imf'), view: one('bar', 'bars', 'timeseries', 'ts', 'time-series', 'table', 'pivot'), mode: one('bar', 'bars', 'timeseries', 'ts', 'time-series', 'table', 'pivot') }, anyOf: [{ required: ['countries'] }, { required: ['country'] }] },
      /* a composed score is its components; fewer than two is refused by the case */
      'map.scoreMap': { type: 'object', properties: { components: list(obj(), 2), name: str(), color: str(), n: int(1, 40) }, required: ['components'] },
      'data.exploreRelated': { type: 'object', properties: { metric: str(), target: str(), key: str(), name: str(), n: int(1, 40) }, anyOf: [{ required: ['metric'] }, { required: ['target'] }, { required: ['key'] }, { required: ['name'] }] },   /* `explore` */
      'research.impact': { type: 'object', properties: { place: str(), lng: lng(), lat: lat(), km: num(0), event: str(), focus: list(str()) } },
      'research.events': { type: 'object', properties: { place: str(), hours: num(1), n: int(1) } },
      'news.category': { type: 'object', properties: { text: str(), category: str(), q: str() }, anyOf: [{ required: ['text'] }, { required: ['category'] }, { required: ['q'] }] },   /* `newsCategory`; "all" clears the filter */
      'system.module': { type: 'object', properties: { name: str(), method: one('open', 'toggle', 'close', 'clear', 'exit', 'refresh', 'render') }, required: ['name'] },
      'system.monitor': noArgs('monitor'),                                                  /* withdrawn (#R231) — the case answers FEATURE_WITHDRAWN */
      'system.control': { type: 'object', properties: { target: str(), value: loose(), on: bool(), submit: bool() }, required: ['target'] },

      /* ══ (#R395) THE VOLCANO PAIR ══════════════════════════════════════════════════════════════
         One opens the record for a NAMED volcano — the case refuses with «name a volcano» when it
         has none. The other changes WHICH volcanoes are drawn, and refuses when told nothing to
         change: a colour mode, a filter flag, or the map's year. */
      'data.volcano': { type: 'object', properties: { name: str(), text: str(), query: str(), place: str() }, anyOf: [{ required: ['name'] }, { required: ['text'] }, { required: ['query'] }, { required: ['place'] }] },
      'map.volcanoFilter': { type: 'object', properties: { mode: one('recency', 'vei', 'status', 'people'), time: bool(), year: int(), spoken: bool(), elevated: bool(), big: bool(), recent: bool(), clear: bool() }, anyOf: [{ required: ['mode'] }, { required: ['time'] }, { required: ['year'] }, { required: ['spoken'] }, { required: ['elevated'] }, { required: ['big'] }, { required: ['recent'] }, { required: ['clear'] }] },
      'dialog.answer': { type: 'object', properties: { text: str(), contentClass: str(), checks: list(obj()), places: list(obj()) }, required: ['text'] }
    };

    function schemaFor(id) { return S[id] || null; }
    function ids() { return Object.keys(S); }

    var API = { ALL: S, schemaFor: schemaFor, ids: ids };
    try { window.IntMapAtlasSchemas = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}
