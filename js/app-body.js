/* ============================================================================
 *  IntMap · THE APPLICATION BODY  (#R175)
 * ----------------------------------------------------------------------------
 *  The 496 KB `window.addEventListener('DOMContentLoaded', …)` block that had been the last thing
 *  living inside index.html, moved out VERBATIM — not one statement reordered, renamed or reindented.
 *
 *  Two reasons, and the second is the one that made it urgent:
 *    ① Standing rule 13: index.html must stop being the program. It was 556 KB before this move and
 *       is ~60 KB after it — markup, styles and one module tag.
 *    ② A bundler cannot touch an inline <script>. Vite minifies what it can see, and this block was
 *       invisible to it, so half a megabyte of comments and whitespace shipped to every visitor on
 *       every uncached load. As a module it is minified and hashed with everything else.
 *
 *  SAFE FOR THE SAME MECHANICAL REASON AS THE js/ FILES: the block is a SINGLE expression statement
 *  with no top-level declaration of its own — every `let`/`function` in it is already inside the
 *  arrow function — so nothing it defines was ever a global, and module scope takes nothing away.
 *  (An AST sweep asserts this in tests/r175-checks.test.mjs.) It is imported LAST by src/main.js, and
 *  a type="module" script runs before DOMContentLoaded fires, so the listener below is still
 *  registered in time — the same guarantee the inline tag had.
 * ==========================================================================*/
/* (#R180) THE BOOT BARRIER — two lines, and the body below is untouched.
   A second engine cannot be installed after the app has built its view: every
   source, layer, marker and camera hook is created through whichever adapter was
   in place at `GE().ui.createView(…)`. js/engine-select.js starts loading Cesium
   before DOMContentLoaded but `import('cesium')` is asynchronous, so the choice is
   published as a PROMISE and this waits for it. With no pending engine — the
   default, and every MapLibre session — `_p` is undefined, `_imAppBoot()` runs
   synchronously on the DOMContentLoaded tick exactly as before, and there is no
   promise anywhere in the path. Wrapping rather than re-indenting is deliberate:
   the 5,000-line body below is byte-identical to #R179's, so nothing in it can
   have changed meaning. */
/* (#R199) A real ES import, not window.IntMapModules: the theme/sky subsystem is a named binding the
   bundler resolves, so it cannot be missing at runtime and cannot depend on load order. */
import { makeThemeSky } from './theme-sky.js';
/* (#R203) the opening view: a lit Earth rather than a black one — see the file for the measurement. */
import { OpeningView } from './opening-view.js';
import { makeI18nLate } from './i18n-late.js';
import { makeKeyboardShortcuts } from './keyboard-shortcuts.js';
import { makeLazyModules } from './lazy-modules.js';
import { gridLayerSpecs } from './grid-style.js';
import { BORDER_COLOR, ADMIN1_COLOR, BORDER_WIDTH, BORDER_CASING, ADMIN1_WIDTH } from './border-style.js';
import { fetchViaProxy } from './proxy-fetch.js';
import { makeLabelOcclusion } from './label-occlusion.js';
import { makeWheelZoom } from './wheel-zoom.js';
import { makeLayerDropdown } from './layer-dropdown.js';
import { makeLayerFavs } from './layer-favs.js';
import { makePremiumPlan } from './premium-plan.js';
import { makeScreenshot } from './screenshot.js';
import { makeSessionTabs } from './session-tabs.js';
import { makeTimeCountries } from './time-countries.js';

window.addEventListener('DOMContentLoaded', () => { const _imAppBoot = () => {
  /* (#R178) THE renderer handle for this file — the same `const GE=()=>window.IntMapGeoEngine` every
     split module already uses. A getter, not the object: the engine is built inside map.on('load'),
     i.e. long after this line runs (#R170 learned that the hard way). */
  const GE=()=>window.IntMapGeoEngine;
  /* ===== State ===== */
  /* (#R207) 「初回時にはmapではなくsatelliteに。3Dはオフ。」 The base type has never been persisted —
     nothing writes it to `intmap_settings` and nothing reads it back — so this literal IS the state
     every load starts in, and it said 'map'. ⚠ Deliberately NO new persistence: recording a pressed
     button as "the user's choice" is the mistake #R188 made. 3-D is already off (`terrain3D=false`,
     and nothing turns it on at boot) — verified, then left alone. */
  let userTheme='auto', userTZ='auto', currentMapType='sat', currentProj='globe', currentLang='en';
  /* (#R7-i18n) Read the SAVED language up-front, before any legend / option / popup is built. Many
     surfaces bake their text with a `currentLang==='jp'?…:…` ternary at construction time (they predate
     data-i18n), and loadSettings() only ran AFTER they were built — so a Japanese user saw English in
     those spots. Seeding currentLang here makes everything build in the right language from the start. */
  try{ const _s0=JSON.parse(localStorage.getItem('intmap_settings')||'{}'); if(_s0&&['en','jp','de','ru','es'].includes(_s0.lang)) currentLang=_s0.lang; }catch(_){}   /* (#R38) seed ALL FOUR UI languages up-front. RU was missing here, so a saved Russian setting fell back to English in every construction-time-baked surface until loadSettings re-ran — a real DE/RU "別の言語が混じる" source. */
  /* (#R79e) Country flag emoji ("スマホでは国旗が出るがパソコンでは出ない"): Windows ships NO flag glyphs in its
     emoji font — regional-indicator pairs render as letter boxes ("US"), never a flag. Ship the Twemoji Country
     Flags webfont (self-hosted, ~78 KB) scoped by unicode-range to ONLY the flag codepoints, so it touches flag
     glyphs and nothing else. Applied only where the platform can't render flags natively → phones/Macs keep
     their own flags. */
  (function(){ try{
    var ff=document.createElement('style');
    ff.textContent='@font-face{font-family:"Twemoji Country Flags";unicode-range:U+1F1E6-1F1FF,U+1F3F4,U+E0062-E0063,U+E0065,U+E0067,U+E006C,U+E006E,U+E0073-E0074,U+E0077,U+E007F;src:url("TwemojiCountryFlags.woff2") format("woff2");font-display:swap;}';
    document.head.appendChild(ff);
    function nativeFlags(){ try{ var c=document.createElement('canvas'); c.width=c.height=16; var x=c.getContext('2d'); if(!x) return true; x.textBaseline='top'; x.font='16px sans-serif'; x.fillStyle='#000'; x.fillText('🇨🇦',0,0); /* 🇨🇦 (red+white) — a real flag paints colour, letter-box fallback stays monochrome */
      var d=x.getImageData(0,0,16,16).data; for(var i=0;i<d.length;i+=4){ if(d[i+3]>0 && (Math.abs(d[i]-d[i+1])>28||Math.abs(d[i+1]-d[i+2])>28||Math.abs(d[i]-d[i+2])>28)) return true; } return false; }catch(_){ return true; } }
    var ok=nativeFlags(); window.__flagFont={native:ok,applied:false};
    var apply=function(){ try{ var b=document.body; if(!b) return false; var cur=getComputedStyle(b).fontFamily||'sans-serif'; if(cur.indexOf('Twemoji Country Flags')<0) b.style.fontFamily='"Twemoji Country Flags", '+cur; window.__flagFont.applied=true; return true; }catch(_){ return false; } };
    window.__applyFlagFont=apply;   /* exposed so it can be forced if the canvas probe is unreliable */
    if(!ok){ if(!apply()) document.addEventListener('DOMContentLoaded',apply); }
  }catch(_){} })();
  let isGridOn=false, toolMode=null, measurePoints=[];
  let namesOn=true, countryInfoOn=false, geoLabelsOn=true, poiOn=true;   /* (#R211) 「既定でオン」 — shop/facility/company names are on from the start. Not persisted anywhere, so this literal IS the default (like currentMapType, #R207). It costs nothing below z12: the gate admits only tier 1 there. */  /* (#R41) water/terrain labels now toggle SEPARATELY from place names */   /* (#R186) …and the shop/facility names are a third, independent set (cb-poi) */
  let map=null, markersArray=[], forceHoverLayers=new Set();
  /* ===== (#R170) canDraw() — the ONE predicate the whole app uses before touching the style =====
     "Is it safe to addSource / addLayer RIGHT NOW?" This is NOT the same question as
     `map.isStyleLoaded()`, and conflating the two was the root cause of the reported
     「レイヤーをオンオフしても、時間差で表示されたり表示されなかったりする」.

     MapLibre's isStyleLoaded() means *the style is parsed AND every source cache is fully loaded*.
     Tiles stream continuously while a user pans/zooms, so it is FALSE most of the time during
     ordinary browsing — measured on this app: FALSE for 12 of 14 samples (86%) across a 12 s pan,
     with contiguous false runs of ~2 s. Every `ensureX(){ if(!map.isStyleLoaded()) return false; … }`
     guard and whenStyleReady() therefore refused to build the layer and fell back to waiting for the
     map to go idle (or whenStyleReady's 6 s hard-resolve). Measured toggle-ON → layer painted:
     **4497 ms / 3171 ms when the map was busy vs 189 ms when it happened to be idle** — i.e. the same
     click either paints instantly or seconds later, purely by luck. Toggle-OFF has no such gate, so
     off is instant while on lags: exactly the reported asymmetry.

     addSource/addLayer only need the STYLE OBJECT to be parsed; in-flight tiles are irrelevant
     (verified: adding a source+layer while isStyleLoaded()===false succeeds and the layer is live).
     During a real setStyle() swap (Map ⇄ Satellite) the parsed flag genuinely goes false and back,
     so the guard still protects that window — it just stops firing on ordinary tile traffic. */
  /* (#R178) …and the test itself now lives in the engine (adapter.styleParsed): the fast path was
     reading `map.style._loaded`, a private field of a MapLibre class. This stays as the app's named
     predicate — every call site and window.IntMapCanDraw keep working — but it no longer knows what
     a style object looks like. */
  function canDraw(){ try{ const E=GE(); return !!(E&&E.hasRenderer()&&E.canDraw()); }catch(_){ return false; } }
  window.IntMapCanDraw=canDraw;   /* also reachable from js/ modules that hold no HOST (see IM_HOST.canDraw) */
  let globalData=[], currentMode=null, activeSearchQuery='', statsSort='gdp', statsSortDir='desc';   /* (#R11) no tab auto-selected; (#R102) Countries sort direction (desc/asc) */
  let newsFiltered=[], renderedCount=0, NEWS_BATCH=30;
  let activeDashCategories=new Set(['mil','tech','maritime','geo']);
  let bookmarks=JSON.parse(localStorage.getItem('intmap_bookmarks'))||[];
  let radiusItems=[]; /* multiple radius circles */
  let radiusKm=1000, radiusColor='#007aff', radiusOpacity=0.18;
  let unitMode='both', panelDrag=null, searchMarker=null, liveCursor=null;
  let newsPinMode='location'; /* 'location' or 'publisher' */
  let aiLocateMode=localStorage.getItem('intmap_ai_locate')||'manual'; /* 'manual' | 'auto' */
  let newsLangMode=localStorage.getItem('intmap_news_lang')||'ui';     /* 'ui' | 'multi' */
  /* Individually-selectable news languages (used when newsLangMode==='multi'). */
  const NEWS_LANG_NAMES={ en:{en:'English',jp:'英語'}, ja:{en:'Japanese',jp:'日本語'}, fr:{en:'French',jp:'フランス語'}, de:{en:'German',jp:'ドイツ語'}, es:{en:'Spanish',jp:'スペイン語'}, pt:{en:'Portuguese',jp:'ポルトガル語'}, it:{en:'Italian',jp:'イタリア語'}, ar:{en:'Arabic',jp:'アラビア語'}, ru:{en:'Russian',jp:'ロシア語'}, zh:{en:'Chinese',jp:'中国語'}, ko:{en:'Korean',jp:'韓国語'} };
  let newsLangs; try{ newsLangs=JSON.parse(localStorage.getItem('intmap_news_langs')||'null'); }catch(_){ newsLangs=null; }
  if(!Array.isArray(newsLangs)||!newsLangs.length) newsLangs=Object.keys(NEWS_LANG_NAMES);   /* default: all */
  const KM2MI=0.621371;
  /* (#R22) Fall back to English when a key is missing in the active language (so newly-added DE/RU,
     which only translate the static UI, never render `undefined`). */
  const t=(k)=>{ const o=i18n[currentLang]||i18n.en; const v=o[k]; return (v!==undefined?v:i18n.en[k]); };
  const hasTurf=()=>typeof turf!=='undefined';
  const searchVal=()=>document.getElementById('search-input').value.toLowerCase();
  /* Industry-standard responsive breakpoint (#10): the JS "mobile" test tracks the SAME media
     query the stylesheet uses (Bootstrap/Tailwind-style 768px boundary) via matchMedia, so the
     script and CSS can never disagree by a scrollbar width or a rounding pixel. */
  const MOBILE_MQ=window.matchMedia('(max-width:768px)');
  const isMobile=()=>MOBILE_MQ.matches;
  /* (#R25) Touch-vs-mouse for WORDING (e.g. Köppen "tap/long-press" vs "click/right-click"). isMobile()
     is width-only, so a desktop with a narrow window wrongly got the touch wording. A machine that has a
     fine pointer (a mouse/trackpad) — even a touchscreen laptop — should read as a "click" device. */
  const _imTouchPrimary=()=>{ try{ return window.matchMedia('(pointer:coarse)').matches && !window.matchMedia('(any-pointer:fine)').matches; }catch(_){ return isMobile(); } };
  window._imTouchPrimary=_imTouchPrimary;
  /* ══ (#R200) HOISTED SHIMS FOR THE THREE NAMES THE LAYERS MENU HANDS BACK ═══════════════════════
     ⚠ MEASURED, AND IT KILLED THE BOOT. The layers menu and the layer favourites left this file for
     js/layer-dropdown.js and js/layer-favs.js this round, and the first version took their three
     names back as `const {…} = makeX(…)` AT THE POSITION THE BLOCKS HAD OCCUPIED — line ~1,928 and
     line ~3,720. But `layerCbInfo` / `renderLayerFavs` are ALSO read off IM_HOST by js/map-ui.js,
     which is instantiated at line 1,944: a `const` is in the temporal dead zone until its own line
     runs, so that read threw `ReferenceError: Cannot access … before initialization`, the boot
     aborted there, and IntMapOS / the session persistence / the year-aware Countries tab / the
     premium section were never created at all. A function DECLARATION is hoisted — which is exactly
     what these three were before they moved — so the NAME is available from the first line of the
     closure again and only the IMPLEMENTATION arrives later, at the position the block always had.
     Same shim shape, and same reason, as the six modules at #R168's mount point below. */
  let _IM_LDROP=null, _IM_LFAVS=null, _IM_LABELOCCLUSION=null;
  function _collapseGroup(){ return _IM_LDROP._collapseGroup.apply(this,arguments); }
  function layerCbInfo(){ return _IM_LFAVS.layerCbInfo.apply(this,arguments); }
  function renderLayerFavs(){ return _IM_LFAVS.renderLayerFavs.apply(this,arguments); }
  /* …and the marker occluder, for the same reason: IM_HOST publishes it, the map event wiring calls
     it on every `move`, and both would be reaching for a const that its own line had not run yet. */
  function updateOcclusion(){ return _IM_LABELOCCLUSION.updateOcclusion.apply(this,arguments); }
  /* ===== (#R163) IM_HOST — the HOST INTERFACE every split-out module receives =====
     All of this app's code lives inside ONE DOMContentLoaded closure, so the names declared at its
     top level are closure variables, NOT globals. A block moved into js/ simply loses them — and
     because soft dependencies here are written as `typeof X!=='undefined'` inside try/catch, that
     loss is SILENT: no error, the branch is just skipped and the feature quietly disappears (#R162
     lost the Area-Monitors radius capture exactly that way). So a split-out module is a FACTORY,
     called at the spot the original block occupied:
         window.IntMapX = window.IntMapModules.x(map, IM_HOST);
     and it reads everything it needs from this one object. #R162 gave js/monitors.js a private host
     object; #R163 promotes it to the project-wide convention so the next module costs nothing.

     EVERY member is a getter, deliberately, for two independent reasons:
       · LIVE — currentLang/currentUser/currentProj/currentMapType/terrain3D/radiusItems/countryGeo are
         all REASSIGNED at runtime (language switch, login, projection change, 3D toggle,
         clearAllRadius(), the boundary file finishing its load). A captured copy freezes at factory
         time and the module then reads a dead value for the rest of the session — silently.
       · LAZY — a getter body does not run until it is read, so this object can sit here near the top
         of the closure while naming `const`s and `let`s that are declared much further down
         (currentUser is ~13k lines below). No temporal-dead-zone hazard, whatever the order.
     `map` stays a separate first argument: it is assigned exactly once at boot and every module body
     refers to it by the bare name. See Architecture.md §3.1.

     (#R165) READ-WRITE members — the ONLY exception to getter-only, introduced for the Atlas kernel
     (js/atlas-console.js): Atlas actions WRITE five closure variables (theme/units/radius/measure
     state). The variable itself stays here in index.html as the single source of truth; the module
     writes THROUGH the host (`HOST.radiusKm=v` runs the setter, which assigns the closure variable),
     so index.html code and module code keep reading the same live value. Every RW member is a
     `get x(){…}, set x(v){ x=v; }` pair on ONE line; everything else stays getter-only.
     tests/r165-checks.test.mjs pins the RW list to exactly these five. */
  const IM_HOST={
    /* mutable UI / session state */
    get lang(){ return currentLang; },              get user(){ return currentUser; },
    get mode(){ return currentMode; },              get proj(){ return currentProj; },
    get mapType(){ return currentMapType; },        get terrain3D(){ return terrain3D; },
    get radiusItems(){ return radiusItems; },
    /* datasets — countryGeo is REPLACED when the boundary file lands; countryStats is filled in place */
    get countryGeo(){ return countryGeo; },         get countryStats(){ return countryStats; },
    /* (#R200) the news/dashboard markers, for js/label-occlusion.js. A getter and not a captured copy
     * for the usual reason and a real one: clearMarkers() REPLACES the array, so a module holding the
     * old one would go on hiding markers that are no longer on the map. */
    get markersArray(){ return markersArray; },
    /* stable helpers (function declarations / consts — never rebound, but still getters for the reasons above) */
    /* (#R170) canDraw = "is it safe to addSource/addLayer right now?" — see the declaration above for why
     * that is NOT the same question as map.isStyleLoaded(). */
    get canDraw(){ return canDraw; },
    /* ⚠ (#R195) the one value js/sat-proto.js cannot inherit — see that file's header for why
     * letting it arrive undefined would stop @2x for everybody with nothing in the console. */
    get hiDPITiles(){ return _hiDPITiles; },
    get isMobile(){ return isMobile; },             get t(){ return t; },
    get cName(){ return cName; },                   get searchVal(){ return searchVal; },
    get loadCountryData(){ return loadCountryData; }, get resolveCountryId(){ return resolveCountryId; },
    get showCountryDetail(){ return showCountryDetail; }, get renderStats(){ return renderStats; },
    get renderCompareFixed(){ return renderCompareFixed; }, get applyTheme(){ return applyTheme; },
    get makeDraggable(){ return makeDraggable; },   get bringToFront(){ return bringToFront; },
    get distHTML(){ return distHTML; },             get imToast(){ return imToast; },
    get aiToast(){ return aiToast; },               get satToast(){ return satToast; },
    get requireLogin(){ return requireLogin; },     get openAuthModal(){ return openAuthModal; },
    /* ── (#R164) members added for the third split (data-layers / workspace / widgets / wb-layers,
     *    beta-overlays / cameras). Same rule as above: EVERY member is a getter. ── */
    /* mutable — reassigned at runtime, so a captured copy would go silently stale */
    get userTZ(){ return userTZ; },
    get mapTooltipEl(){ return mapTooltipEl; },     get globalData(){ return globalData; },
    get newsFeatures(){ return newsFeatures; },     get renderUI(){ return renderUI; },
    /* stable helpers and tables (never rebound — getters anyway, see LAZY above) */
    get i18n(){ return i18n; },                     get escapeHtml(){ return escapeHtml; },
    get fmtPc(){ return fmtPc; },                   get fmtMoney(){ return fmtMoney; },
    get fmtTemp(){ return fmtTemp; },               get convTempText(){ return convTempText; },
    get addCountryLayers(){ return addCountryLayers; }, get ensureMapTooltip(){ return ensureMapTooltip; },
    get ensureTerrainSource(){ return ensureTerrainSource; }, get positionTooltip(){ return positionTooltip; },
    get renderCoordReadout(){ return renderCoordReadout; }, get _collapseGroup(){ return _collapseGroup; },
    get _imTouchPrimary(){ return _imTouchPrimary; }, get fetchData(){ return fetchData; },
    get loadCommunity(){ return loadCommunity; },   get registerWindow(){ return registerWindow; },
    get renderCompanies(){ return renderCompanies; }, get renderDashboard(){ return renderDashboard; },
    get setMode(){ return setMode; },               get startNews(){ return startNews; },
    get computeFilteredNews(){ return computeFilteredNews; },
    /* ── (#R165) members added for the Atlas-kernel split (js/atlas-console.js). ── */
    /* READ-WRITE — the console's Atlas actions assign these five (theme/units/radius/measure state).
     * The closure variable stays the single source of truth; `HOST.x=v` writes it through the
     * setter. Get+set pairs on ONE line each; the RW list is pinned by tests/r165-checks.test.mjs. */
    get measurePoints(){ return measurePoints; },   set measurePoints(v){ measurePoints=v; },
    get radiusColor(){ return radiusColor; },       set radiusColor(v){ radiusColor=v; },
    get radiusKm(){ return radiusKm; },             set radiusKm(v){ radiusKm=v; },
    get unitMode(){ return unitMode; },             set unitMode(v){ unitMode=v; },
    get userTheme(){ return userTheme; },           set userTheme(v){ userTheme=v; },
    /* mutable — reassigned at runtime, read-only for modules (getter as ever) */
    get newsDate(){ return newsDate; },             get toolMode(){ return toolMode; },
    get userPins(){ return userPins; },
    /* stable helpers (never rebound — getters anyway, see LAZY above) */
    get _aiLangName(){ return _aiLangName; },       get addEdgeResize(){ return addEdgeResize; },
    get addPin(){ return addPin; },                 get aiGate(){ return aiGate; },
    get aiLimitMsg(){ return aiLimitMsg; },         get aiLoginMsg(){ return aiLoginMsg; },
    get aiParseJSON(){ return aiParseJSON; },       get aiToday(){ return aiToday; },
    get aiUsage(){ return aiUsage; },               get aiUsesLeft(){ return aiUsesLeft; },
    get applyAccent(){ return applyAccent; },       get askAI(){ return askAI; },
    get askAIJSON(){ return askAIJSON; },           get askAIJSONEnvelope(){ return askAIJSONEnvelope; },
    get clearAllPins(){ return clearAllPins; },     get compressImage(){ return compressImage; },
    get diskFillPolys(){ return diskFillPolys; },   get exitTool(){ return exitTool; },
    get localFuzzyPlaces(){ return localFuzzyPlaces; }, get parseDate(){ return parseDate; },
    get refreshTool(){ return refreshTool; },       get saveSettings(){ return saveSettings; },
    get setGrid(){ return setGrid; },               get setLang(){ return setLang; },
    get setTool(){ return setTool; },               get updateToolPanel(){ return updateToolPanel; },
    get ymdISO(){ return ymdISO; },
    /* ── (#R166) members added for the fifth split (map-tools / sims / weather / layer-packs /
     *    analysis-panels / map-ui / playground — 41 factories across 7 files). ── */
    /* READ-WRITE — the Playground hub (js/playground.js) takes the whole screen over: entering World
     * Explorer clears the active sidebar tab and hides the satellite controller, so it assigns both.
     * `mode` already has its live getter above with the rest of the mutable state; this is its write
     * half. The RW list (now seven) is pinned by tests/r165-checks.test.mjs. */
    set mode(v){ currentMode=v; },
    get satPanelDismissed(){ return satPanelDismissed; }, set satPanelDismissed(v){ satPanelDismissed=v; },
    /* mutable — reassigned at runtime (layer toggles rebind namesOn/bordersOn; rebuildGeoIndex
     * REPLACES geoDB whenever the gazetteer is rebuilt), so a captured copy would go stale */
    get namesOn(){ return namesOn; },               get bordersOn(){ return bordersOn; },
    get geoDB(){ return geoDB; },
    /* stable helpers (never rebound — getters anyway, see LAZY above) */
    get areaHTML(){ return areaHTML; },             get ringArea(){ return ringArea; },
    get fmtLL(){ return fmtLL; },                   get hasTurf(){ return hasTurf; },
    get demElevAt(){ return demElevAt; },           get demElevBilinear(){ return demElevBilinear; },
    get _demZoomForSpan(){ return _demZoomForSpan; }, get warmDEMTiles(){ return warmDEMTiles; }, get demSnapshot(){ return demSnapshot; },
    get layerCbInfo(){ return layerCbInfo; },       get renderLayerFavs(){ return renderLayerFavs; },
    get removePin(){ return removePin; },           get setupIntelLayers(){ return setupIntelLayers; },
    /* ── (#R167) members added for the sixth split (legal / feedback / onboarding / mobile-ui /
     *    news-timeline / dash-extended / map-extras — 15 factories across 7 files). ── */
    /* READ-WRITE — two new owners. js/news-timeline.js REPLACES the news arrays when the clock moves
     * (a different day is a different set of articles), and js/dash-extended.js assigns the
     * IndexedDB-cached card list back into extendedDashDB on a cold start. Both variables stay
     * declared in index.html as the single source of truth; the RW list (now ten) is pinned by
     * tests/r165-checks.test.mjs. globalData and newsFeatures already have their live getters above
     * with the rest of the mutable state, so these two lines are only their write halves. */
    set globalData(v){ globalData=v; },             set newsFeatures(v){ newsFeatures=v; },
    get extendedDashDB(){ return extendedDashDB; }, set extendedDashDB(v){ extendedDashDB=v; },
    /* mutable — reassigned at runtime (setGrid() flips isGridOn, the countries checkbox flips
     * countryInfoOn), so a captured copy would go stale */
    get isGridOn(){ return isGridOn; },             get countryInfoOn(){ return countryInfoOn; },
    /* stable helpers (never rebound — getters anyway, see LAZY above). DB is `const DB=window.sb`
     * declared ~1,300 lines below js/feedback.js's call site, so that module reads HOST.DB at USE
     * time and never binds it at factory time — binding it would land in that const's dead zone. */
    get DB(){ return DB; },                         get ensurePlaceLabels(){ return ensurePlaceLabels; },
    get applyLabelLang(){ return applyLabelLang; }, get applySidebarStyle(){ return applySidebarStyle; },
    get loadDashFromSupabase(){ return loadDashFromSupabase; }, get diskOutlineLines(){ return diskOutlineLines; },
    /* ── (#R168) members added for the seventh split (countries-ui / news-ui / companies-ui /
     *    tool-panel / auth-ui / community — six SUBJECT modules carved out of the core). ── */
    /* READ-WRITE — each of these is state that the subject owning it is the one to change: the
     *  country loader latches its promise, the tool panel writes the live tool/radius state, auth
     *  replaces currentUser on every session change, the community feed owns its filters. The
     *  variables stay declared here as the single source of truth; the owner of each member is
     *  pinned by tests/r165-checks.test.mjs — widened in #R168 to an owner SET, because bookmarks
     *  and the radius/measure state genuinely have two writers each. */
    get _coTimeDeb(){ return _coTimeDeb; }, set _coTimeDeb(v){ _coTimeDeb=v; },
    get _coTimeWired(){ return _coTimeWired; }, set _coTimeWired(v){ _coTimeWired=v; },
    get bookmarks(){ return bookmarks; }, set bookmarks(v){ bookmarks=v; },
    get commCatFilter(){ return commCatFilter; }, set commCatFilter(v){ commCatFilter=v; },
    get commInView(){ return commInView; }, set commInView(v){ commInView=v; },
    get commSearch(){ return commSearch; }, set commSearch(v){ commSearch=v; },
    get communityAddArmed(){ return communityAddArmed; }, set communityAddArmed(v){ communityAddArmed=v; },
    get communitySort(){ return communitySort; }, set communitySort(v){ communitySort=v; },
    get countryDataLoaded(){ return countryDataLoaded; }, set countryDataLoaded(v){ countryDataLoaded=v; },
    get countryDataPromise(){ return countryDataPromise; }, set countryDataPromise(v){ countryDataPromise=v; },
    get dashFeatures(){ return dashFeatures; }, set dashFeatures(v){ dashFeatures=v; },
    get geoRaw(){ return geoRaw; }, set geoRaw(v){ geoRaw=v; },
    get pendingPostLoc(){ return pendingPostLoc; }, set pendingPostLoc(v){ pendingPostLoc=v; },
    get radiusOpacity(){ return radiusOpacity; }, set radiusOpacity(v){ radiusOpacity=v; },
    get renderedCount(){ return renderedCount; }, set renderedCount(v){ renderedCount=v; },
    get replyingTo(){ return replyingTo; }, set replyingTo(v){ replyingTo=v; },
    /* write halves only — these three already have their live getters above with the rest of the
     *  mutable state (same shape as `mode` in #R166 and globalData/newsFeatures in #R167). */
    set countryGeo(v){ countryGeo=v; }, set user(v){ currentUser=v; }, set toolMode(v){ toolMode=v; },
    /* mutable — reassigned at runtime, read-only for these modules (live getters as ever) */
    get activeSearchQuery(){ return activeSearchQuery; }, get coFilterOpen(){ return coFilterOpen; },
    get coFilters(){ return coFilters; }, get coSort(){ return coSort; }, get coSortDir(){ return coSortDir; },
    get commCaps(){ return commCaps; }, get communityPosts(){ return communityPosts; },
    get liveCursor(){ return liveCursor; }, get measureSnapClose(){ return measureSnapClose; },
    get newsFiltered(){ return newsFiltered; }, get newsLangMode(){ return newsLangMode; },
    get newsPinMode(){ return newsPinMode; }, get statsFilterOpen(){ return statsFilterOpen; },
    get statsFilters(){ return statsFilters; }, get statsSort(){ return statsSort; },
    get statsSortDir(){ return statsSortDir; },
    /* stable helpers and tables (never rebound — getters anyway, see LAZY above) */
    get COMM_CATEGORIES(){ return COMM_CATEGORIES; }, get NEWS_BATCH(){ return NEWS_BATCH; },
    get _aiAreaSummarize(){ return _aiAreaSummarize; }, get _coL(){ return _coL; }, get _coName(){ return _coName; },
    get _companiesSearchVal(){ return _companiesSearchVal; }, get _gcRingUnwrapped(){ return _gcRingUnwrapped; },
    get _newsHasForeignLang(){ return _newsHasForeignLang; }, get _respreadNews(){ return _respreadNews; },
    get _sfL(){ return _sfL; }, get _splitLineToWindows(){ return _splitLineToWindows; },
    get _splitPolyToWindows(){ return _splitPolyToWindows; }, get _syncToolBtns(){ return _syncToolBtns; },
    get activeDashCategories(){ return activeDashCategories; }, get aiEsc(){ return aiEsc; },
    get aiFetchUsage(){ return aiFetchUsage; }, get aiReady(){ return aiReady; },
    get aiSetBtnBusy(){ return aiSetBtnBusy; }, get aiSyncFeatureButtons(){ return aiSyncFeatureButtons; },
    get applyCountryVisibility(){ return applyCountryVisibility; }, get applyPinMode(){ return applyPinMode; },
    get bearingDeg(){ return bearingDeg; }, get clearMarkers(){ return clearMarkers; },
    get closeArticleReader(){ return closeArticleReader; }, get coCompareSet(){ return coCompareSet; },
    get commCatLabel(){ return commCatLabel; }, get commCollapsed(){ return commCollapsed; },
    get compareSet(){ return compareSet; }, get compassDir(){ return compassDir; },
    get ensureBordersLayer(){ return ensureBordersLayer; }, get ensureLabelPill(){ return ensureLabelPill; },
    get escForReader(){ return escForReader; }, get hideCountryInfo(){ return hideCountryInfo; },
    get hideMeasureTip(){ return hideMeasureTip; }, get loadGdpPPP(){ return loadGdpPPP; },
    get loadNewsFromSupabase(){ return loadNewsFromSupabase; }, get newsTitleHTML(){ return newsTitleHTML; },
    get openComposeModal(){ return openComposeModal; }, get openPinPopup(){ return openPinPopup; },
    get pushCommunityFeatures(){ return pushCommunityFeatures; }, get rebuildGeoIndex(){ return rebuildGeoIndex; },
    get recordLogin(){ return recordLogin; }, get refreshNewsPill(){ return refreshNewsPill; },
    get renderCoCompareFixed(){ return renderCoCompareFixed; }, get renderCommList(){ return renderCommList; },
    get satHasKey(){ return satHasKey; }, get satProviderById(){ return satProviderById; },
    /* (#R196) js/tile-warm.js builds the prefetch URLs from it */
    get satBuildTiles(){ return satBuildTiles; },
    get satRenderController(){ return satRenderController; }, get satRevertToFallback(){ return satRevertToFallback; },
    get satState(){ return satState; }, get scheduleNewsDeclutter(){ return scheduleNewsDeclutter; },
    get setupCommunityLayer(){ return setupCommunityLayer; }, get showCoCompare(){ return showCoCompare; },
    get totalDistance(){ return totalDistance; }, get updateAccountButton(){ return updateAccountButton; },
    get updateOcclusion(){ return updateOcclusion; },
    /* ── (#R169) members added for the eighth split — eleven SUBJECT modules (satellite, ai-core,
     *    place-labels, window-manager, search-geocode, news-context, news-feed, article-reader,
     *    community-board, map-readout, elevation-profile). Same rule as ever: getter-only unless the
     *    module is the OWNER of the state, in which case it gets the write half too. ── */
    /* READ-WRITE — each name below is written by exactly the module that owns the subject: the
     * satellite controller owns its provider/error state, the search box owns its result marker,
     * the gazetteer builder replaces geoDB, the news feed replaces the article arrays, the reader
     * owns its open/current article, the community board owns its post cache and compose draft, and
     * the readout/graticule owns the cursor + grid + measure state. The variable itself stays
     * declared in index.html as the single source of truth; `HOST.x=v` runs the setter, so
     * index.html and the module always read the same live value. Pinned by tests/r165-checks.test.mjs. */
    get _crLat(){ return _crLat; }, set _crLat(v){ _crLat=v; },
    get _crLng(){ return _crLng; }, set _crLng(v){ _crLng=v; },
    get _elevSeq(){ return _elevSeq; }, set _elevSeq(v){ _elevSeq=v; },
    get composeCat(){ return composeCat; }, set composeCat(v){ composeCat=v; },
    get composeEditId(){ return composeEditId; }, set composeEditId(v){ composeEditId=v; },
    get elevTimer(){ return elevTimer; }, set elevTimer(v){ elevTimer=v; },
    get lastElev(){ return lastElev; }, set lastElev(v){ lastElev=v; },
    get lastLayerVal(){ return lastLayerVal; }, set lastLayerVal(v){ lastLayerVal=v; },
    get panelDrag(){ return panelDrag; }, set panelDrag(v){ panelDrag=v; },
    get pendingImg(){ return pendingImg; }, set pendingImg(v){ pendingImg=v; },
    get readerCurrent(){ return readerCurrent; }, set readerCurrent(v){ readerCurrent=v; },
    get readerOpen(){ return readerOpen; }, set readerOpen(v){ readerOpen=v; },
    get satActive(){ return satActive; }, set satActive(v){ satActive=v; },
    get satAutoBackoff(){ return satAutoBackoff; }, set satAutoBackoff(v){ satAutoBackoff=v; },
    get satErrCount(){ return satErrCount; }, set satErrCount(v){ satErrCount=v; },
    get satLastGood(){ return satLastGood; }, set satLastGood(v){ satLastGood=v; },
    get searchMarker(){ return searchMarker; }, set searchMarker(v){ searchMarker=v; },
    /* write halves only — these already have their live getters above with the rest of the mutable state */
    set commCaps(v){ commCaps=v; },
    set communityPosts(v){ communityPosts=v; },
    set geoDB(v){ geoDB=v; },
    set isGridOn(v){ isGridOn=v; },
    set measureSnapClose(v){ measureSnapClose=v; },
    set newsFiltered(v){ newsFiltered=v; },
    /* read-only for these modules (live getters as ever) */
    /* (#R198) BUILTIN_GAZETTEER asks js/gazetteer.js on every read rather than closing over one
     * snapshot: the world rows (data/gazetteer-world.json) arrive after boot, and a captured object
     * would be the pre-#R198 table forever. */
    get AI_FREE_DAILY(){ return AI_FREE_DAILY; }, get BUILTIN_GAZETTEER(){ return window.IntMapGazetteer.index(); },
    get GEO_LABEL_JP(){ return GEO_LABEL_JP; }, get SAT_PROVIDERS(){ return SAT_PROVIDERS; },
    get SNAP_PX(){ return SNAP_PX; }, get USE_SERVER_NEWS(){ return USE_SERVER_NEWS; },
    get _DEMONYM_GZ(){ return _DEMONYM_GZ; }, get _DEM_CACHE_MAX(){ return _DEM_CACHE_MAX; },
    get _ORG_GZ(){ return _ORG_GZ; }, get _pubMatchers(){ return _pubMatchers; },
    get _spreadDupNewsPins(){ return _spreadDupNewsPins; }, get _stabIdx(){ return _stabIdx; },
    get _wsNewsHidden(){ return _wsNewsHidden; }, get aiButtonSyncers(){ return aiButtonSyncers; },
    get aiConfig(){ return aiConfig; }, get aiReport(){ return aiReport; },
    get aiVisionReady(){ return aiVisionReady; }, get aiWaitMapIdle(){ return aiWaitMapIdle; },
    get analyzeContext(){ return analyzeContext; }, get appendNewsBatch(){ return appendNewsBatch; },
    get elevText(){ return elevText; }, get fetchBathymetry(){ return fetchBathymetry; },
    get fetchViaProxy(){ return fetchViaProxy; }, get fmtElevVal(){ return fmtElevVal; },
    get forceHoverLayers(){ return forceHoverLayers; }, get geoLabelsOn(){ return geoLabelsOn; }, get poiOn(){ return poiOn; },
    get geoLayersDB(){ return geoLayersDB; }, get imIsPro(){ return imIsPro; },
    get mapLabelsViaVector(){ return mapLabelsViaVector; }, get newsLangs(){ return newsLangs; },
    get renderCommunity(){ return renderCommunity; }, get renderReaderMode(){ return renderReaderMode; },
    get satKeys(){ return satKeys; }, get showComposeImgPreview(){ return showComposeImgPreview; },
    get wireCommList(){ return wireCommList; }
  };

  /* ===== i18n ===== */
  /* (#R162) moved to js/i18n.js — see Architecture.md "File layout". */
  const i18n=window.IntMapI18N;
  try{ window.i18n=i18n; }catch(_){}   /* (#R84) expose for language-coverage tooling */
  /* (#R84) COMPLETE Russian & Spanish coverage — DE was already 100%, but RU/ES were each missing these 64 keys
     (layer names, legend titles, theme options, feedback/playground/pro/sources labels), so they fell back to
     English ("英語の箇所がまだ大量にある"). Now all five languages cover every UI key. */
  try{ Object.assign(i18n.ru,{
    lblNavInertia:"Инерция", lyrEU:"Страны ЕС", lyrClimate:"Климат Кёппена", lyrTemp:"Температура воздуха (2 м)", lyrPrecip:"Осадки (IMERG)", lyrPop:"Плотность населения", lyrHDI:"ИЧР (2022)", lyrDem:"Индекс демократии (2023)", lyrNATO:"Страны НАТО", lyrNight:"День / ночь", lgdTitle:"Кёппен–Гейгер", climAt:"Климат", lyrSection:"Слои данных", lyrGrpWeather:"Погода и среда",
    optPsychedelic:"Психоделический", optMilitary:"Военный", optMedical:"Медицинский", optBaroque:"Барокко (европейский)", optTaisho:"Япония Тайсё", lyrRadar:"Радар осадков (в реальном времени)", lyrClouds:"Облака · инфракрасный (live)", lyrSST:"Температура поверхности моря", lyrSnow:"Снег и лёд", lyrAOD:"Аэрозоль / дымка", lyrNightSat:"Ночные огни (спутник)", lyrWind:"Ветер (анимация)",
    lgdRadarTitle:"Интенсивность дождя", lgdSSTTitle:"Температура моря", lgdWindTitle:"Скорость ветра", lblFeedback:"Отзыв и сообщение об ошибке", sendFeedbackBtn:"⭐ Оставить отзыв", reportBugBtn:"🐞 Сообщить об ошибке", lblPlayground:"Площадка (бета)", playgroundBtn:"🎮 Открыть площадку", worldExplorerBtn:"🌍 Satellite Drop",
    lyrHillshade:"Рельеф (отмывка)", lyrContours:"Изолинии высот", lyrPopGrid:"Плотность населения (сетка 1 км)", lgdTempTitle:"Темп. воздуха (2 м)", lyrTimeMonth:"Месяц", lyrRelief:"Высота (цветной рельеф)", lyrSubcables:"Подводные кабели", lgdReliefTitle:"Высота", lgdSubcablesTitle:"Подводные кабели",
    lyrMilSpend:"Военные расходы ($ млрд)", lyrMilSpendGDP:"Военные расходы (% ВВП)", lyrGDPpc:"ВВП на душу населения", lyrTFR:"Суммарный коэффициент рождаемости", lyrSeaLevel:"Изменение уровня моря", lgdSeaLevelTitle:"Изменение уровня моря",
    proSection:"Премиум-функции", proArchive:"🔒 Архив путешествий во времени (10 лет)", proIntel:"🔒 Местные первоисточники RU·CN", proModalTitle:"Разблокировать IntMap Pro", proModalSub:"Больше, чем живая карта — глубокие исторические архивы и разведданные из первоисточников.", srcModalTitle:"Источники данных и атрибуция", srcModalSub:"IntMap использует следующие сторонние данные, изображения и API. Все товарные знаки принадлежат их владельцам.",
    screenshotSaved:"Снимок сохранён ✓", screenshotBusy:"Съёмка…", measureClickClose:"Нажмите на первую точку, чтобы замкнуть",
    blueberryTitle:"Поддержать IntMap", blueberryBody:"Моя цель — создать карту, где географию, климат, историю, экологию, демографию и мировые события можно исследовать в одном месте.\nIntMap разрабатывается независимо и постоянно расширяется новыми слоями, наборами данных и функциями.\nЕсли вам нравится IntMap и вы хотите поддержать его дальнейшее развитие, вы можете внести вклад ниже.", blueberryGo:"Выбрать сумму ↗", blueberryNote:"Откроется внешняя страница (Stripe)." });
    Object.assign(i18n.es,{
    lblNavInertia:"Inercia", lyrEU:"Miembros de la UE", lyrClimate:"Clima de Köppen", lyrTemp:"Temperatura del aire (2 m)", lyrPrecip:"Precipitación (IMERG)", lyrPop:"Densidad de población", lyrHDI:"IDH (2022)", lyrDem:"Índice de democracia (2023)", lyrNATO:"Miembros de la OTAN", lyrNight:"Día / noche", lgdTitle:"Köppen–Geiger", climAt:"Clima", lyrSection:"Capas de datos", lyrGrpWeather:"Clima y medio ambiente",
    optPsychedelic:"Psicodélico", optMilitary:"Militar", optMedical:"Médico", optBaroque:"Barroco (europeo)", optTaisho:"Japón Taishō", lyrRadar:"Radar de precipitación (en vivo)", lyrClouds:"Nubes · infrarrojo (en vivo)", lyrSST:"Temperatura de la superficie del mar", lyrSnow:"Nieve y hielo", lyrAOD:"Aerosol / calima", lyrNightSat:"Luces nocturnas (satélite)", lyrWind:"Viento (animado)",
    lgdRadarTitle:"Intensidad de lluvia", lgdSSTTitle:"Temp. del mar", lgdWindTitle:"Velocidad del viento", lblFeedback:"Comentarios y errores", sendFeedbackBtn:"⭐ Enviar comentarios", reportBugBtn:"🐞 Informar de un error", lblPlayground:"Zona de juego (beta)", playgroundBtn:"🎮 Abrir la zona de juego", worldExplorerBtn:"🌍 Satellite Drop",
    lyrHillshade:"Relieve (sombreado)", lyrContours:"Curvas de nivel", lyrPopGrid:"Densidad de población (malla 1 km)", lgdTempTitle:"Temp. aire (2 m)", lyrTimeMonth:"Mes", lyrRelief:"Elevación (relieve en color)", lyrSubcables:"Cables submarinos", lgdReliefTitle:"Elevación", lgdSubcablesTitle:"Cables submarinos",
    lyrMilSpend:"Gasto militar ($ mil M)", lyrMilSpendGDP:"Gasto militar (% PIB)", lyrGDPpc:"PIB per cápita", lyrTFR:"Tasa de fecundidad total", lyrSeaLevel:"Cambio del nivel del mar", lgdSeaLevelTitle:"Cambio del nivel del mar",
    proSection:"Funciones premium", proArchive:"🔒 Archivo de viaje en el tiempo (10 años)", proIntel:"🔒 Fuentes primarias locales RU·CN", proModalTitle:"Desbloquear IntMap Pro", proModalSub:"Más allá del mapa en vivo: archivos históricos profundos e inteligencia de fuentes primarias.", srcModalTitle:"Fuentes de datos y atribución", srcModalSub:"IntMap agrega los siguientes datos, imágenes y API de terceros. Todas las marcas pertenecen a sus propietarios.",
    screenshotSaved:"Captura guardada ✓", screenshotBusy:"Capturando…", measureClickClose:"Haz clic en el primer punto para cerrar",
    blueberryTitle:"Apoya IntMap", blueberryBody:"Mi objetivo es crear un mapa donde la geografía, el clima, la historia, la ecología, la demografía y los acontecimientos mundiales puedan explorarse en un solo lugar.\nIntMap se desarrolla de forma independiente y se amplía continuamente con nuevas capas, conjuntos de datos y funciones.\nSi te gusta usar IntMap y quieres apoyar su desarrollo futuro, puedes contribuir a continuación.", blueberryGo:"Elige un importe ↗", blueberryNote:"Abre una página externa (Stripe)." });
  }catch(_){}

  function updateI18n(){
    /* (#R22) Merge English under the active language so DE/RU (static-UI only) fall back cleanly. */
    const base=i18n.en, lang=i18n[currentLang]||base, d=(currentLang==='en')?base:Object.assign({},base,lang);
    document.querySelectorAll('[data-i18n]').forEach(el=>{ if(d[el.getAttribute('data-i18n')]!==undefined) el.innerText=d[el.getAttribute('data-i18n')]; });
    document.querySelectorAll('[data-i18n-ph]').forEach(el=>{ if(d[el.getAttribute('data-i18n-ph')]!==undefined) el.placeholder=d[el.getAttribute('data-i18n-ph')]; });
    document.querySelectorAll('[data-i18n-title]').forEach(el=>{ if(d[el.getAttribute('data-i18n-title')]!==undefined) el.title=d[el.getAttribute('data-i18n-title')]; });
    document.getElementById('text-settings').innerText=d.settings; document.getElementById('modal-title').innerText=d.modalTitle;
    document.getElementById('lbl-theme').innerText=d.lblTheme; document.getElementById('lbl-tz').innerText=d.lblTz;
    { const tzs=document.getElementById('setting-tz-search'); if(tzs) tzs.placeholder=d.tzSearch||'Search timezone…'; }
    document.getElementById('btn-close-settings').innerText=d.btnApply; document.getElementById('opt-theme-auto').innerText=d.optAuto;
    const a=document.getElementById('opt-tz-auto'); if(a) a.innerText=d.optLocal;
    if(toolMode) updateToolPanel();
    try{ if(currentMapType==='sat'){ satRenderController(); satRefreshReadout(); } }catch(_){}
    try{ localizeGeoLabels(); }catch(_){}
    try{ refreshGeoLabels(); }catch(_){}   /* on-map geo-theory labels follow the language too (#1) */
    try{ if(window._imSyncMobile) window._imSyncMobile(); }catch(_){}   /* (#R8) mobile proxy buttons follow every language change */
    try{ window.dispatchEvent(new Event('intmap-lang')); }catch(_){}     /* (#R8c) lets modules (wind time pill, etc.) re-localize */
    /* re-evaluate place-label language + basemap on EN/JP switch (retry on idle if style busy) */
    try{ applyTheme(); if(!GE().ready()) GE().events.once('idle',()=>{ try{ applyTheme(); }catch(_){} }); }catch(_){}
    try{ if(typeof updateAccountButton==='function') updateAccountButton(); }catch(_){}
    try{ if(typeof renderNewsLangChecks==='function') renderNewsLangChecks(); }catch(_){}
    renderUI();
  }
  /* (#R169) moved verbatim to js/place-labels.js — see Architecture.md §3.1. */

  /* ===== Theme ===== */
  let bordersOn=true;   /* (#R40) Country borders DEFAULT ON per request. The lazy-create + retry path (R39) now draws them reliably on first load, so the default is honoured (see the startup dispatch after _wireRef). */
  /* (#R94g) ONE source of truth for the "Country borders" display so the SAME toggle governs BOTH the modern
     boundary line AND the clock-driven historical borders (imtb-*) — one feature, one switch. While travelling
     the modern line + modern country labels hide and the era's borders + names show; at Now the modern set
     returns. This replaced the two layers fighting each other (which fast-blinked when the toggle was flipped). */
  let _imbOfmWas=null;
  window._applyBorders=function(){ try{ if(!GE().hasRenderer()||!GE().hasRenderer()) return;
    const traveling=!!(window.IntMapTimeBorders&&window.IntMapTimeBorders.active&&window.IntMapTimeBorders.active());
    const bon=!!bordersOn;
    /* modern boundary line: only when NOT travelling (and the toggle is on). */
    ['borders-only-line','borders-only-casing'].forEach(id=>{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility',(bon&&!traveling)?'visible':'none'); });   /* (#R210) casing follows the border */
    /* (#R94l) era borders + names show WHENEVER travelling — the whole point of moving the clock is to see them
       (not gated by the modern-border toggle, which previously left the map border-less). */
    ['imtb-fill','imtb-line','imtb-lbl','imtb-lbl2'].forEach(id=>{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility',traveling?'visible':'none'); });
    /* modern country labels off while travelling — the era names come from imtb-lbl. */
    if(GE().layers.has('ofm-country')){ if(traveling){ if(_imbOfmWas===null){ try{ _imbOfmWas=GE().layers.getLayout('ofm-country','visibility')||'visible'; }catch(_){ _imbOfmWas='visible'; } } GE().layers.setLayout('ofm-country','visibility','none'); }
      else if(_imbOfmWas!==null){ GE().layers.setLayout('ofm-country','visibility',_imbOfmWas); _imbOfmWas=null; } }
    /* (#R94l) the CARTO *_all raster base BAKES modern borders + labels into the tiles — hiding vector layers
       can't remove them. Force the label-free variant DIRECTLY while travelling (don't rely on applyTheme's
       timing, which was why the era borders never appeared), and RAISE the era layers above the raster. */
    try{ const sat=(typeof currentMapType!=='undefined'&&currentMapType==='sat');
      const mc=(window.imMapColor||'auto'); const mapLight=(mc==='light')?true:(mc==='dark')?false:(document.documentElement.getAttribute('data-theme')==='light');
      if(traveling&&!sat){
        if(GE().layers.has('layer-dark'))     GE().layers.setLayout('layer-dark','visibility','none');
        if(GE().layers.has('layer-light'))    GE().layers.setLayout('layer-light','visibility','none');
        if(GE().layers.has('layer-dark-nl'))  GE().layers.setLayout('layer-dark-nl','visibility',mapLight?'none':'visible');
        if(GE().layers.has('layer-light-nl')) GE().layers.setLayout('layer-light-nl','visibility',mapLight?'visible':'none');
      }
    }catch(_){}
  }catch(_){} };
  /* (#R199) ↳ js/theme-sky.js — the UI theme, the basemap pair and the real sky/atmosphere.
     Moved whole; the three names below are what the rest of this file still calls. */
  const { applyTheme, _applySkyAtmosphere, _skyFollowCamera } = makeThemeSky(IM_HOST, { GE, applyLabelLang, canDraw, ensurePlaceLabels, mapLabelsViaVector, satRefreshReadout, satRenderController });
  /* ===== Language-aware vector place labels (OpenFreeMap, free, no key) ===== */
  /* (#R21) Map mode now ALWAYS uses the same crisp OFM vector labels as satellite mode ("mapを選択した
     際も、同じ地名ラベルにして。（mapの旧来の地名ラベルは廃止）") — the labeled carto base is retired, the
     basemap is always the _nolabels variant, and because the labels are vector layers the
     label-raise self-heal keeps them above EVERY data layer. */
  function mapLabelsViaVector(){ return true; }
  /* (#R169) moved verbatim to js/place-labels.js — see Architecture.md §3.1. */
  /* (#R64/#R67) runtime label-anchor pinning — WATER ONLY: lake/sea label geometry genuinely differs per tile
     zoom (LineString label lines), so each water name is pinned to its FIRST-SEEN coordinate in a stable
     geojson source (worldwide, dynamic, nothing hardcoded) and NEVER moves again. Peaks are exact point nodes
     and render straight from the tiles (see #R67 note above) — no pinning, no refinement, nothing to hop. */
  const _stabIdx={water:new Map()};
  /* (#R169) moved verbatim to js/place-labels.js — see Architecture.md §3.1. */
  window._imLabelStats=(dump)=>{ const o={water:_stabIdx.water.size};
    if(dump==='peaks'){ try{ o.z=+GE().camera.getZoom().toFixed(2); o.c=[+GE().camera.getCenter().lng.toFixed(6),+GE().camera.getCenter().lat.toFixed(6)];
      o.rp=GE().coords.queryRenderedFeatures({layers:['ofm-peak']}).slice(0,12).map(f=>{ const c=f.geometry&&f.geometry.coordinates; let s=null; try{ s=c?GE().coords.project(c):null; }catch(_){}
        return {n:(f.properties||{}).name, c:c?c.map(x=>+x.toFixed(6)):null, px:s?[Math.round(s.x),Math.round(s.y)]:null}; }); }catch(e){ o.rpErr=String(e&&e.message||e); } }
    else if(dump){ o.samples=Array.from(_stabIdx.water.values()).slice(0,10).map(f=>({n:(f.properties||{}).name,mz:(f.properties||{}).mz,cls:(f.properties||{}).class,c:f.geometry.coordinates.map(x=>+x.toFixed(5))})); }
    return o; };   /* diagnostics (read-only) */
  /* (#R169) moved verbatim to js/place-labels.js — see Architecture.md §3.1. */
  window.applyLabelLang=applyLabelLang;
  /* (#R167) moved verbatim to js/tables.js — see Architecture.md §3.1. */
  const {SAT_PROVIDERS}=window.IntMapTables;
  /* Default to YESTERDAY — the freshest near-real-time imagery that is essentially always
     processed. If a chosen day isn't ready yet, satOnError steps back automatically (below). */
  const satDefaultDay=new Date(Date.now()-1*864e5).toISOString().slice(0,10);
  let satState={ providerId:'esri', day:satDefaultDay, year:2024, opacity:1 };
  let satActive=-1, satErrCount=0, satLastGood='esri', satAutoBackoff=0;
  /* (#R101) default CLOSED on desktop — switching to Satellite must NOT auto-pop the provider/date panel
     ("衛星画像ポップアップが出るのは不要"). Re-clicking the active Satellite button opens it on demand.
     On mobile the panel lives inside the tools sheet, so it stays available there regardless. */
  let satPanelDismissed=true;   /* desktop floating panel: open only when the user asks for it */
  let satKeys={}; try{ satKeys=JSON.parse(localStorage.getItem('intmap_sat_keys')||'{}')||{}; }catch(_){ satKeys={}; }
  /* (#R169) moved verbatim to js/satellite.js — see Architecture.md §3.1. */
  /* Pro entitlement: admins always count; otherwise a profiles.is_pro flag (read in refreshCurrentUser). */
  /* (#R10) All features are free now — no Pro paywall. imIsPro() always returns true so every
     previously-gated capability (e.g. satellite BYOK providers) is unlocked. */
  function imIsPro(){ return true; }
  window.imIsPro=imIsPro;
  /* (#R169) moved verbatim to js/satellite.js — see Architecture.md §3.1. */
  /* Debug aid (same spirit as window.__imap / window.refreshDatedLayer): inspect the sat engine. */
  try{ window.__sat={ providers:SAT_PROVIDERS, state:satState, keys:()=>satKeys, build:satBuildTiles, hasKey:satHasKey,
    render:satRenderController, apply:satApply, select:satSelectProvider, setOpacity:satSetOpacity, step:satStepDay,
    chip:satChipHTML, capture:satCaptureLabel, renderKeys:satRenderKeyInputs, saveKeys:satSaveKeyInputs,
    mapReady:()=>{ try{ return !!(GE().ready()); }catch(e){ return 'err:'+e.message; } } }; }catch(_){}

  /* =====================================================================
   *  AI ENGINE — account-based, first-party (#R27; BYOK retired, its dead client
   *  call/model-picker code removed in #R115). Single entry point:
   *  askAI(prompt, systemPrompt, imageDatas, opts) -> Promise<string> — every AI
   *  feature routes through the ai-proxy Edge Function with the user's session JWT;
   *  provider keys live ONLY on the server.
   * ===================================================================== */
  let aiConfig={ provider:'openai', models:{}, keys:{} };
  try{ const s=JSON.parse(localStorage.getItem('intmap_ai_config')||'null'); if(s&&typeof s==='object'){
    if(s.provider) aiConfig.provider=s.provider;
    aiConfig.keys=Object.assign({},s.keys||{});
    aiConfig.models=Object.assign({},s.models||{});
    if(typeof s.model==='string' && s.model && !aiConfig.models[aiConfig.provider]) aiConfig.models[aiConfig.provider]=s.model; /* migrate legacy single-model field */
  } }catch(_){}
  /* (#R169) moved verbatim to js/ai-core.js — see Architecture.md §3.1. */


  /* ---- (#R27) FIRST-PARTY, ACCOUNT-BASED AI -----------------------------------------------------
     BYOK is retired. Every AI call now routes through a Supabase Edge Function (ai-proxy) that holds
     the provider key SERVER-SIDE, identifies the user from their Supabase session JWT, and enforces a
     per-day free-use quota (default 10/day, reset daily, stored in the `ai_usage` table). The model is
     fixed on the server — users never see a key or a model picker. Login is REQUIRED: an un-logged-in
     click opens the auth modal; an over-quota click shows the "本日の無料AI使用回数に達しました" message.
     See supabase/functions/ai-proxy/index.ts + supabase_ai_usage.sql for the server half. */
  const AI_FREE_DAILY = 10;                                  /* free plan daily quota (display + pre-check). #R40: 5→10; #R101: 10→30; #R147: 30→10 per request */
  window.INTMAP_AI_PROXY = window.INTMAP_AI_PROXY || {};
  if(!window.INTMAP_AI_PROXY.url){
    try{ window.INTMAP_AI_PROXY.url = (window.SUPABASE_URL||'').replace(/\/$/,'') + '/functions/v1/ai-proxy'; }catch(_){ window.INTMAP_AI_PROXY.url=''; }
  }
  /* (#R169) moved verbatim to js/ai-core.js — see Architecture.md §3.1. */
   /* UTC date — matches the server */
  /* Quota state, kept in sync from each server response + an on-login fetch. limit is plan-driven
     (the server is the source of truth); aiDailyLimit() centralizes the number for easy plan tiers. */
  let aiUsage = { date:'', used:0, limit:AI_FREE_DAILY };
  /* (#R169) moved verbatim to js/ai-core.js — see Architecture.md §3.1. */
  window.aiDev=aiDev;
  /* (#R169) moved verbatim to js/ai-core.js — see Architecture.md §3.1. */
  window.aiFetchUsage=aiFetchUsage;
  /* (#R169) moved verbatim to js/ai-core.js — see Architecture.md §3.1. */
  window.aiGate=aiGate;
  /* (#R169) moved verbatim to js/ai-core.js — see Architecture.md §3.1. */
  /* (#R39) Force the AI OUTPUT language to follow the app language. The inline brief/summary prompts only had
     EN/JP branches, so German/Russian users got English answers ("AI Briefがドイツ語・ロシア語では英語になる").
     Appended to the SYSTEM prompt of the free-TEXT generators ONLY — never the JSON geocoders (place names
     must stay canonical) nor the connectivity test. Harmless/​reinforcing for EN/JP. */
  function _aiLangName(){ return ({en:'English',jp:'Japanese',de:'German',ru:'Russian',es:'Spanish'})[currentLang]||'English'; }
  window._aiLangLine=function(){ const L=_aiLangName(); return ' IMPORTANT: Write your ENTIRE response in '+L+' only — every sentence, heading and bullet must be in '+L+', regardless of the language of the input or these instructions. Do not reply in English unless '+L+' is English.'+(L==='Japanese'?' When writing in Japanese, use polite form (です・ます／敬語) by default unless the user is clearly casual or explicitly asks for plain/casual speech.':''); };   /* (#R147) Japanese default = keigo */
  /* (#R169) moved verbatim to js/ai-core.js — see Architecture.md §3.1. */
  window.aiRenderSettings=aiRenderSettings;
  /* (#R169) moved verbatim to js/ai-core.js — see Architecture.md §3.1. */
   /* (#R115) BYOK inputs are gone — nothing to read back */
  /* Each AI feature registers a syncer here; called after the AI config changes so
     feature buttons can refresh their enabled/disabled state. */
  const aiButtonSyncers=[];
  /* (#R169) moved verbatim to js/ai-core.js — see Architecture.md §3.1. */
  /* Debug hook (same spirit as window.__sat / window.__imap). */
  try{ window.__ai={ config:()=>aiConfig, ready:aiReady, visionReady:aiVisionReady,
    ask:askAI, askJSON:askAIJSON, parse:aiParseJSON, report:aiReport, toast:aiToast, render:aiRenderSettings }; }catch(_){}

  /* (#R169) moved verbatim to js/satellite.js — see Architecture.md §3.1. */
  /* (#R169) moved verbatim to js/ai-core.js — see Architecture.md §3.1. */
  /* (#R169) moved verbatim to js/satellite.js — see Architecture.md §3.1. */
  /* (#R119) SPLIT into reusable stages so the Atlas `satelliteCompare` action shares the exact same pipeline
     (capture two dated frames → vision analysis) — the button UI below is unchanged. */
  window._imSatCapture=async function(va,vb){
    if(currentMapType!=='sat') return {err:t('aiVisNeedsDated')};
    const p=satProviderById(satState.providerId);
    if(!p||!p.dated) return {err:t('aiVisNeedsDated')};
    if(!va||!vb) return {err:t('aiVisPickDates')};
    const save={ day:satState.day, year:satState.year, opacity:satState.opacity };
    /* hide map overlays so the captured frame is imagery, not pins/grid */
    const overlays=['news-dots','news-labels','news-pin-shadow','dash-dots','dash-labels','user-pin-dot','user-pin-shadow','grid-lines','grid-lines-casing','grid-tropic','grid-tropic-label','grid-major'].filter(id=>{ try{ return !!GE().layers.has(id); }catch(_){ return false; } });
    const vis=overlays.map(id=>{ try{ return GE().layers.getLayout(id,'visibility')||'visible'; }catch(_){ return 'visible'; } });
    overlays.forEach(id=>{ try{ GE().layers.setLayout(id,'visibility','none'); }catch(_){} });
    satState.opacity=1;
    let imgA=null,imgB=null,err=null;
    try{ imgA=await aiCaptureSatAt(p,va); imgB=await aiCaptureSatAt(p,vb); }catch(e){ err=e; }
    satState.day=save.day; satState.year=save.year; satState.opacity=save.opacity;
    overlays.forEach((id,k)=>{ try{ GE().layers.setLayout(id,'visibility',vis[k]); }catch(_){} });
    try{ satApply(false); satRefreshReadout(); }catch(_){}
    if(err||!imgA||!imgB) return {err:(err&&err.message)||t('aiVisCapFail')};
    return {imgA,imgB}; };
  window._imSatAnalyze=async function(va,vb,imgA,imgB){
    const sys=(currentLang==='jp'
      ? "あなたは衛星画像アナリストです。同一地域の2枚の衛星画像を比較します（1枚目=過去、2枚目=新しい日付）。軍事施設の建設・拡張、艦船・航空機・車両など装備の移動、土地造成や伐採、自然災害（洪水・火災・地滑り等）、都市・インフラの変化を日本語で報告してください。各項目は箇条書きにし、確度（高/中/低）を付けてください。変化が無ければその旨を述べ、雲量や画質・季節差による誤検出に注意してください。"
      : "You are a satellite-imagery analyst comparing two images of the same area (first = earlier, second = later). Report: military construction/expansion, movement of ships/aircraft/vehicles, land clearing, natural disasters (floods, fires, landslides), and urban/infrastructure change. Use bullet points, each with a confidence level (high/medium/low). If nothing changed, say so, and beware false positives from clouds, image quality, or seasonal differences.")+window._aiLangLine();
    const prompt=currentLang==='jp'?`1枚目の日付: ${va}\n2枚目の日付: ${vb}\nこの2枚を比較し、変化を報告してください。`:`First image date: ${va}\nSecond image date: ${vb}\nCompare the two images and report the changes.`;
    return askAI(prompt,sys,[imgA,imgB]); };
  /* (#R169) moved verbatim to js/satellite.js — see Architecture.md §3.1. */
  aiButtonSyncers.push(function(){ const b=document.getElementById('ai-satchange-btn'); if(!b) return; b.classList.toggle('ai-needs-key',!aiVisionReady()); b.title=aiVisionReady()?'':(aiReady()?t('aiNoVision'):t('aiNoKey')); });

  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change',()=>{ if(userTheme==='auto') applyTheme(); });

  /* ===== Sidebar toggle ===== */
  const sidebar = document.getElementById('sidebar');
  /* ══ (#R195) THE SIDEBARS COME BACK THE WAY THEY WERE LEFT ════════════════════════════════════
     「再読み込み時に、サイドバーの開閉状態を保持するように。」 The session snapshot below (#R122) has
     restored the active layers, the open tab, the base map and the year since #R122 — but not
     whether either sidebar was open, so every reload re-opened a panel the user had just closed.

     ⚠ READ SYNCHRONOUSLY, HERE. _restore() runs ~600 ms after the map loads, and applying the state
     then would show the sidebar in the wrong position first and correct it in front of the user. At
     this point in the boot the element exists and nothing has been painted, so setting the class is
     invisible. The right-hand layer panel builds later still (js/map-ui.js, on a 1.5 s timer), so
     the answer is published on `window` for it to read rather than pushed at it — the panel decides,
     as it already does for mobile.
     ⚠ The key is `intmap_session2`. Exactly one place WRITES it — the persistence block further down
     this file — and this is the second of two early readers (#R122 already reads the layer list the
     same way). tests/r195-checks.test.mjs pins all three literals together: a typo here would fail
     as "the sidebar state was never saved", with nothing in the console to say otherwise. */
  const _sessUI=(()=>{ try{ const s=JSON.parse(localStorage.getItem('intmap_session2')||'null');
      return { left:(s&&typeof s.sbOpen==='boolean')?s.sbOpen:null,
               right:(s&&typeof s.lsrOpen==='boolean')?s.lsrOpen:null }; }
    catch(_){ return { left:null, right:null }; } })();
  window._imSessionUI=_sessUI;
  if(_sessUI.left===null){ if(isMobile()) sidebar.classList.add('collapsed'); }   /* first visit: collapsed on phone */
  else sidebar.classList.toggle('collapsed',!_sessUI.left);
  document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
    /* (#R160) DELIBERATELY minimal. The LEFT sidebar keeps its ORIGINAL mechanism (solid = flex sibling with the map
       beside it; frosted = overlay). The toggle touches the map camera NOTHING at all — it only flips `collapsed` and
       syncs the material classes. The existing ResizeObserver re-fits the canvas on its own. Every "compensation" tried
       here made things worse: setPadding/easeTo drove the camera, and panBy — on the default GLOBE projection — ROTATES
       the planet ("地球が回る"). So there is no pin, no padding, no anchor, no per-frame loop, and no map.resize() call
       from here. The toggle must not move the camera. */
    sidebar.classList.toggle('collapsed');
    try{ applySidebarStyle(false); }catch(_){}   /* material classes only (blur/translucency) — never the camera */
    try{ window.dispatchEvent(new Event('intmap-sidebar-resize')); }catch(_){}   /* recompute the search-pill layout only */
    try{ window._imSaveSession&&window._imSaveSession(); }catch(_){}   /* (#R195) remember it for the next load */
  });
  /* (#R15) Keyboard shortcut: Esc collapses the sidebar. Ignored while typing in a field, while a modal
     or popup is open (Esc should close those first), or on mobile (it uses the bottom sheet, not a sidebar). */
  document.addEventListener('keydown',(e)=>{
    if(e.key!=='Escape') return;
    if(isMobile()) return;
    const ae=document.activeElement, tag=ae&&ae.tagName;
    if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(ae&&ae.isContentEditable)) return;
    const modalOpen=[...document.querySelectorAll('.modal,.lightbox,#compose-modal,#settings-modal')].some(m=>{ const s=getComputedStyle(m); return s.display!=='none'&&s.visibility!=='hidden'; });
    if(modalOpen) return;
    /* (#R62) ESC now TOGGLES the sidebar (open AND close), not close-only. */
    document.getElementById('btn-toggle-sidebar').click();
  });
  /* (#R200) moved to js/keyboard-shortcuts.js — a real ES module (see the import at the top of this file), not a
     window.IntMapModules entry and not a line in src/main.js's ordered list. */
  makeKeyboardShortcuts(IM_HOST, { GE, applyTheme, imToast, isMobile });
  /* ===== Map init ===== */
  const isInitiallyDark=document.documentElement.getAttribute('data-theme')==='dark';
  /* ══ (#R179) WHETHER THIS SCREEN WANTS DOUBLE-DENSITY TILES — ONE rule, ONE owner ═════════════
     #R178 established the defect and the trade for the satellite layer: MapLibre picks a raster's
     tile zoom from `zoom + log2(512/tileSize)` and `pixelRatio` is not in that expression, while the
     canvas is drawn at devicePixelRatio — so a 256-pixel tile is stretched across 512 device pixels
     and every raster has been at half the resolution the screen can show. It then wrote the decision
     («desktop, DPR ≥ 1.5, not Data Saver, not 2G») inline inside the satellite protocol.
     It is hoisted here because it now has TWO callers, and #R178's own lesson ⑥ is that the moment a
     value has two owners one of them silently wins. */
  const _hiDPITiles=(function(){
    try{
      if(isMobile()) return false;                       /* RAM + radio: #R20's tab-kills */
      if(!((window.devicePixelRatio||1)>=1.5)) return false;   /* nothing to gain on a 1× screen */
      const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
      if(c&&(c.saveData===true||/(^|-)2g$/.test(c.effectiveType||''))) return false;
      return true;
    }catch(_){ return false; }
  })();
  try{ window.__imHiDPITiles=_hiDPITiles; }catch(_){}
  /* Use all FOUR CARTO subdomains (a–d), not just a/b (#7): on HTTP/1.1 the browser caps concurrent
     connections per host at ~6, so spreading tiles over 4 hosts ~doubles basemap throughput while
     tilted in 3D; on HTTP/2 it's harmless. */
  /* (#R179) …and at @2x on a HiDPI screen. THE BASE MAP HAD THE SAME HALF-RESOLUTION DEFECT #R178
     FOUND IN THE SATELLITE LAYER, and it is the more important of the two because it is what the app
     opens on — every label, coastline and road on the default view has been drawn from a 256-pixel
     tile stretched over 512 device pixels. Unlike Esri, Carto publishes the double-density tile
     itself (`{z}/{x}/{y}@2x.png`), so this needs no stitching, no extra requests and no fallback
     path: it is the SAME tile count, each tile carrying the pixels the display was always going to
     use. Off on phones and 1× screens for the reasons in _hiDPITiles above. */
  const carto=(s)=>{ const r=_hiDPITiles?'@2x':'';
    return ['a','b','c','d'].map(h=>'https://'+h+'.basemaps.cartocdn.com/'+s+'/{z}/{x}/{y}'+r+'.png'); };
  /* Saturate HTTP/2 / HTTP/3 multiplexing: one tile host can serve dozens of concurrent
     requests over a single connection, so lift MapLibre's default 16-request cap. This is
     the single biggest win for satellite-tile throughput (no quality change — same tiles). */
  /* (#R20) Mobile gets HALF the in-flight tile decodes (each request holds a decode buffer; 128
     simultaneous decodes is real OOM pressure on a phone — part of "重い動作をするとブラウザが落ちる").
     Desktop keeps the full firehose. */
  try{ GE().scene.setImageConcurrency(/Mobi|Android|iPhone|iPad/.test(navigator.userAgent)?48:256); }catch(_){}   /* (#R22) desktop 192→256: the user still measures spare bandwidth + idle GPU in 3D — fill the pipe harder */
  /* ══ (#R195) THE SATELLITE TILE PROTOCOL LIVES IN js/sat-proto.js ═══════════════════════════
     259 lines of Esri fetching, placeholder detection, ancestor cropping, the imagery-depth memo
     and the @2x stitch, moved out whole. Called from exactly here because the style object below
     reads the `window.__imSatProto` flag this sets — see the file header. `_hiDPITiles` is the one
     value it needs from this scope and is handed over explicitly (scripts/check-split-scope.mjs). */
  try{ window.IntMapModules.satProto(IM_HOST); }catch(_){}
  /* (#R209) …and the loader for the modules that are NOT downloaded at boot. Built here, this early,
     because every entry point below reaches it through window.IntMapLazy rather than through a
     parameter, and an entry point that fires before the loader exists is the silent no-op #R205. */
  makeLazyModules(IM_HOST);
  /* (#R203) …and the centre is COMPUTED ONCE AND PUBLISHED. A test cannot re-derive it — it moves
     0.25° a minute, so "boot, then compute what the centre should be" is off by however long the
     boot took — and tests/r180-cesium pinned the literal 10 and went red the moment this stopped
     being a literal. What a test can do is read what the app decided, which is a fact rather than a
     re-derivation (the rule #R202 wrote down after r185's altitude floor). */
  const _openingCentre=OpeningView.openingCentre(OpeningView.openingClockMs(),[10,20]);
  try{ window.__imOpeningCentre=_openingCentre.slice(); }catch(_){}
  try{
    /* (#R178) even the primary view is built through the contract. It could not be while the engine
       was created inside this map's own 'load' handler; js/geo-engine.js is imported before anything
       else now, so `maplibregl` is named in exactly one file in the project. */
    map=GE().ui.createView({ container:'map', renderWorldCopies:false, attributionControl:false,
      /* (#R18) MSAA antialiasing — DESKTOP ONLY. The 3D globe/terrain silhouette and the satellite
         horizon read jagged without it; MSAA smooths every polygon + terrain edge for a clear quality
         jump WITHOUT dropping tile resolution (so quality up, nothing sacrificed — the user: "表示速度、
         画質を高めて。どちらか一方犠牲はNG"). It's left OFF on phones, where the extra sample buffers are a
         real GPU/VRAM cost that risks the tab ("ブラウザが落ちることがないように"). */
      antialias:!isMobile(),
      /* preserveDrawingBuffer is intentionally OFF (it can cause a visible flash/flicker on resize
         and costs perf). The Screenshot feature reads the canvas inside a render tick instead, which
         works without it. fadeDuration:0 makes raster tiles appear instantly; a large in-memory tile
         cache keeps recently-seen tiles hot when panning back. */
      /* (#R8) Retain far more recently-seen tiles in RAM so panning/tilting back is instant and never
         refetches — the user measured spare bandwidth (<20 Mbps) and headroom, so trade memory for speed.
         Phones keep a tighter cap to stay within the mobile GPU/RAM budget. */
      /* (#R179) …and the desktop cap is stated in BYTES, not tiles, when the tiles are double-density.
         #R21 chose 8192 while every raster tile was 256², i.e. ~0.26 MB of texture. #R178's satellite
         stitch and this round's @2x base map both make them 512² — four times the memory for the same
         count — so keeping the number would have quietly quadrupled a budget that was picked against
         「ブラウザが落ちることがないように」. 2048 double-density tiles hold the same bytes 8192 single-
         density ones did, which is the cap #R21 actually decided on. Phones do not take @2x at all
         (see _hiDPITiles), so their numbers are untouched. */
      fadeDuration:0, maxTileCacheSize:(isMobile()?((navigator.deviceMemory&&navigator.deviceMemory<=4)?640:1024):(_hiDPITiles?2048:8192)), refreshExpiredTiles:false,   /* (#R21) genuinely low-RAM phones get a smaller resident-tile budget */   /* (#R20) mobile 1536→1024 (~1/3 less resident tile memory vs the OOM tab-kills); (#R21) desktop 6144→8192 — desktop RAM is cheap, 3D pan/tilt-back stays fully cache-hot */
      /* Cap the render resolution on phones (#3): a DPR-3 screen otherwise shades 9× the fragments of
         DPR-1, which is the main cause of pan/zoom stutter on mobile GPUs. 2× stays crisp (retina) while
         roughly halving fragment work, so gestures stay smooth. Desktop keeps full device resolution. */
      pixelRatio:(isMobile()?Math.min(2,window.devicePixelRatio||1):(window.devicePixelRatio||1)),
      /* ══ (#R180) TWO CEILINGS INSIDE THE RENDERER THAT WERE THROWING PIXELS AWAY ═══════════
         #R178 and #R179 found the satellite layer and then the base map running at half the
         resolution the display can show. Both were OUR arithmetic. These two are MapLibre's
         own defaults, and they cost resolution in exactly the situations this app is built
         for — a tilted 3-D view, and a large high-density monitor.

         ① ANISOTROPIC FILTERING, which MapLibre applies to a raster tile only when
            `transform.pitch > options.anisotropicFilterPitch`, default 20°. Read it in the
            renderer: `P.texture.useMipmap && d.extTextureFilterAnisotropic &&
            e.transform.pitch > e.options.anisotropicFilterPitch`. A surface receding from the
            camera is minified far harder along one axis than the other, and an isotropic
            sampler has to pick one mip level for both — which is why ground near the horizon
            goes to mush. Below 20° of pitch that correction was simply off, and on the GLOBE
            (the app's default projection) the surface curves away towards the limb at EVERY
            pitch, including zero. 0 turns it on wherever the GPU offers it; where there is no
            anisotropy to correct the sampler costs the same as the trilinear one it replaces.

         ② maxCanvasSize, default [4096, 4096]. MapLibre clamps the drawing buffer to it, so
            on any display whose CSS size × devicePixelRatio exceeds 4096 the canvas is
            silently scaled DOWN and the `pixelRatio` set above stops being honoured — a
            1440p screen at DPR 2 is already 5120 px wide, i.e. the common case, not an exotic
            one. Raised to the GPU's own limit (capped at 8192, and never above what it
            reports), so full device resolution survives on a large monitor. Phones keep
            4096: there the cap is a RAM guard, and 「ブラウザが落ちることがないように」 has
            outranked sharpness on mobile since #R20. */
      anisotropicFilterPitch:0,
      maxCanvasSize:(function(){
        if(isMobile()) return [4096,4096];
        let lim=4096;
        try{ const c=document.createElement('canvas'), gl=c.getContext('webgl2')||c.getContext('webgl');
          if(gl){ const t=gl.getParameter(gl.MAX_TEXTURE_SIZE)||0, r=gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)||0;
            lim=Math.max(4096,Math.min(8192,Math.min(t||8192,r||8192))); }
        }catch(_){}
        return [lim,lim];
      })(),
      glyphs:'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      /* (#R19) Desktop maxZoom 18→19: Esri World Imagery serves real z19 tiles over most urban areas,
         so 3D/satellite close-ups gain a full extra level of native detail (no upscaling). Phones stay
         at 18 — the extra tile set is pure GPU/RAM cost there ("ブラウザが落ちることがないように"). */
      /* ⚠ (#R203) THE DEFAULT CENTRE IS A LONGITUDE, AND THE LONGITUDE DECIDES WHETHER THE APP
         OPENS ON A BLACK PLANET. 「起動したときに地図が真っ暗になっている場合がある」— measured at
         [29,30,36] over the whole canvas with 52 % of pixels under luminance 15, because at 22:49 UTC
         10°E is half past midnight and #R201's night side is (as it was asked to be) the Black Marble
         product at full alpha. js/opening-view.js keeps this centre whenever the Sun is at least 12°
         above it and rotates to the sub-solar longitude when it is not. Same latitude, same zoom, and
         a hash, a search or one drag overrides it immediately. */
      center:_openingCentre, zoom:1.7, minZoom:0, maxZoom:(isMobile()?18:19),
      style:{ version:8, glyphs:'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
        sources:{ 'bl':{type:'raster',tiles:carto('light_all'),tileSize:256},'bln':{type:'raster',tiles:carto('light_nolabels'),tileSize:256},'bd':{type:'raster',tiles:carto('dark_all'),tileSize:256},'bdn':{type:'raster',tiles:carto('dark_nolabels'),tileSize:256},'sat-labels':{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}','https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],tileSize:256},'satellite':{type:'raster',tiles:(window.__imSatProto?['imapsat://{z}/{y}/{x}']:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}','https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}']),tileSize:256,maxzoom:19,attribution:'Imagery © Esri, Maxar, Earthstar Geographics'},'tool-source':{type:'geojson',data:{type:'FeatureCollection',features:[]}},'grid-source':{type:'geojson',data:{type:'FeatureCollection',features:[]}} },
        /* ══ (#R191) A TILE SHOULD ARRIVE, NOT APPEAR ═══════════════════════════════════════════════
           「衛星画像の読み込み時の動作を、極限までシームレスにして。（高速・違和感低減・点滅軽減）」
           #R147 set this to 0 against MapLibre's 300 ms default, and it was right about the default:
           300 ms of half-drawn imagery under a moving finger reads as lag. But 0 is the other extreme
           — it is a HARD SWAP, per tile. Zooming in, each child replaces its parent the instant it
           lands, so a screenful becomes a checkerboard of sharp and blurry squares flipping one at a
           time, and that flipping is the reported 点滅. `raster-fade-duration` is also what holds the
           parent while the child loads; at 0 there is nothing holding it.
           180 ms is under the ~200 ms at which a transition stops reading as a delay and still long
           enough for the eye to see one image become another instead of being replaced by it. The
           whole-Earth floor beneath (js/world-base.js) gets the same number, so the very first paint
           of a view fades from the floor rather than snapping off it — and #R190 already made the two
           the same colour, which is what makes a cross-fade between them read as one picture
           sharpening. Every OTHER raster overlay keeps 0: they are data layers, not photographs, and
           a half-faded thermal-anomaly value is a wrong value. */
        layers:[
          /* (#R207) 「南極付近が衛星画像零の暗黒領域」 — the ±85.05°…±90° caps, which no Mercator source
             can address. Declared FIRST because a background layer must be at the very bottom, and a
             declaration is the only place that is guaranteed rather than arranged. Owned by
             js/world-base.js (`applyCap`/`polarColour`); the long note is there. */
          {id:'layer-polar-cap',type:'background',layout:{visibility:'none'},paint:{'background-color':'#e9edf2'}},
          {id:'layer-sat',type:'raster',source:'satellite',layout:{visibility:'none'},paint:{'raster-fade-duration':180}},
          {id:'layer-sat-labels',type:'raster',source:'sat-labels',layout:{visibility:'none'},paint:{'raster-opacity':0.95,'raster-fade-duration':180}},
          /* (#R24) START on the NO-LABEL carto base (we ALWAYS use crisp vector labels now) so the old
             baked-in carto labels never flash at startup before applyTheme swaps them ("スタート時は旧来のまま"). */
          /* (#R34) DARK-MAP CONTRAST — done by genuinely INCREASING the base raster's contrast (the only
             thing asked for), NOT by painting anything over it. Measured the real Carto dark_nolabels pixels:
             ocean≈luminance 9, land≈38 — both far below the 0.5 contrast pivot, which is why the old bare
             `raster-contrast:0.45` crushed BOTH to pure black. The fix is contrast for the steeper land/sea
             slope PLUS a brightness floor applied AFTER contrast (MapLibre order: saturation→contrast→
             brightness) that rescues land from the crush while the ocean stays dark. Simulated on the real
             tile: ocean→~11 (dark), land→~44-50 (clearly visible grey), separation 29→~38. Never black. */
          {id:'layer-dark',type:'raster',source:'bd',layout:{visibility:'none'},paint:{'raster-contrast':0.5,'raster-brightness-min':0.33,'raster-saturation':0.1}},
          {id:'layer-dark-nl',type:'raster',source:'bdn',layout:{visibility:isInitiallyDark?'visible':'none'},paint:{'raster-contrast':0.5,'raster-brightness-min':0.33,'raster-saturation':0.1}},
          {id:'layer-light',type:'raster',source:'bl',layout:{visibility:'none'}},
          {id:'layer-light-nl',type:'raster',source:'bln',layout:{visibility:isInitiallyDark?'none':'visible'}},
          ...gridLayerSpecs(),   /* (#R210) js/grid-style.js — white graticule + 山吹色 tropics; see the note there on why this is an import and not IM_READOUT */
          {id:'tool-poly',type:'fill',source:'tool-source',filter:['all',['==','$type','Polygon'],['!=','preview',true]],paint:{'fill-color':['coalesce',['get','color'],'#007aff'],'fill-opacity':['coalesce',['get','opacity'],0.18]}},
          {id:'tool-poly-line',type:'line',source:'tool-source',filter:['all',['==','$type','Polygon'],['!=','preview',true],['!=','noStroke',true]],paint:{'line-color':['coalesce',['get','color'],'#007aff'],'line-width':2,'line-opacity':0.8}},
          {id:'tool-ring-line',type:'line',source:'tool-source',filter:['==','ringline',true],paint:{'line-color':['coalesce',['get','color'],'#007aff'],'line-width':2,'line-opacity':0.85}},
          {id:'tool-line',type:'line',source:'tool-source',filter:['all',['==','$type','LineString'],['!=','preview',true],['!=','ringline',true]],paint:{'line-color':'#ff3b30','line-width':3}},
          {id:'tool-line-preview',type:'line',source:'tool-source',filter:['all',['==','$type','LineString'],['==','preview',true]],paint:{'line-color':'#ff3b30','line-width':2,'line-opacity':0.85,'line-dasharray':[2,2]}},
          {id:'tool-poly-preview',type:'line',source:'tool-source',filter:['all',['==','$type','Polygon'],['==','preview',true]],paint:{'line-color':'#007aff','line-width':2,'line-opacity':0.7,'line-dasharray':[2,2]}},
          {id:'tool-snap',type:'circle',source:'tool-source',filter:['==',['get','snap'],true],paint:{'circle-radius':16,'circle-color':'rgba(0,122,255,0.18)','circle-stroke-width':2.5,'circle-stroke-color':'#0a84ff'}},
          {id:'tool-point',type:'circle',source:'tool-source',filter:['==','$type','Point'],paint:{'circle-radius':['case',['==',['get','snap'],true],8,6],'circle-color':['case',['==',['get','snap'],true],'#0a84ff',['coalesce',['get','color'],'#ff3b30']],'circle-stroke-width':2,'circle-stroke-color':'#fff'}} ] } });
  }catch(e){ console.warn('MapLibre init failed:',e); }
  /* (#R178) HAND THE RENDERER TO THE ENGINE THE MOMENT IT EXISTS. This used to happen inside
     map.on('load'), which was fine while the engine was built there too — but every module below is
     now written against IntMapGeoEngine, and their factories run immediately. The engine reads the
     map through window.__imap, so publishing it here (rather than one event later) is what makes
     `GE()` answer for real from the first factory onward instead of quietly no-op'ing until 'load'. */
  try{ window.__imap=map; }catch(_){}
  /* (#R186) LAUNCH-SCREEN MILESTONE 3 of 5: the renderer object exists. The remaining two — the
     style is parsed, and the first idle after the default layers have been switched on — are
     reported from the map's own 'load' handler below. If there is no renderer at all (no WebGL,
     a blocked chunk) the launch screen must not sit there forever waiting for events that will
     never fire, so say ready now and let the app show whatever it can. */
  try{ if(window.__imBoot){ if(GE().hasRenderer()) window.__imBoot.set(58,'renderer');
    else { console.warn('[boot] no renderer — revealing the app without waiting for the map'); window.__imBoot.done('no-renderer'); } } }catch(_){}

  /* ── (#R168) SEVENTH SPLIT — six SUBJECT modules carved out of the core (Architecture.md §3.1 #R168).
   *  #R167 emptied the file of self-contained BLOCKS; what remained was one dense core in which no
   *  single statement is independent. The unit that IS independent is a SUBJECT: a set of statements
   *  whose private helpers nothing else reads. Each module below is such a set, moved verbatim.
   *
   *  These six are the first modules index.html still CALLS BY NAME, so each exported function keeps a
   *  hoisted `function` shim here. A shim is a function DECLARATION for a reason: the originals were
   *  hoisted too, so every call site — including ones textually above this line — behaves exactly as
   *  before, and `.apply(this,arguments)` preserves the receiver and the argument list byte for byte.
   *
   *  Instantiated HERE, immediately after `map` exists (it is assigned once, in the try above) and
   *  before the first statement that evaluates any of these names eagerly. The factories only DECLARE:
   *  none of them touches closure state while running, so there is no dead zone to fall into. */
  const IM_COUNTRIES_UI=window.IntMapModules.countriesUi(IM_HOST);
  function renderStats(){ return IM_COUNTRIES_UI.renderStats.apply(this,arguments); }
  function showCountryDetail(){ return IM_COUNTRIES_UI.showCountryDetail.apply(this,arguments); }
  function renderCountryDetailBody(){ return IM_COUNTRIES_UI.renderCountryDetailBody.apply(this,arguments); }
  function loadCountryData(){ return IM_COUNTRIES_UI.loadCountryData.apply(this,arguments); }
  function addCountryLayers(){ return IM_COUNTRIES_UI.addCountryLayers.apply(this,arguments); }
  const IM_NEWS_UI=window.IntMapModules.newsUi(IM_HOST);
  function renderUI(){ return IM_NEWS_UI.renderUI.apply(this,arguments); }
  function setupIntelLayers(){ return IM_NEWS_UI.setupIntelLayers.apply(this,arguments); }
  function appendNewsBatch(){ return IM_NEWS_UI.appendNewsBatch.apply(this,arguments); }
  function renderReaderMode(){ return IM_NEWS_UI.renderReaderMode.apply(this,arguments); }
  function aiGeocodeNews(){ return IM_NEWS_UI.aiGeocodeNews.apply(this,arguments); }
  function _spreadDupNewsPins(){ return IM_NEWS_UI._spreadDupNewsPins.apply(this,arguments); }
  const IM_COMPANIES_UI=window.IntMapModules.companiesUi(IM_HOST);
  function renderCompanies(){ return IM_COMPANIES_UI.renderCompanies.apply(this,arguments); }
  function showCompanyDetail(){ return IM_COMPANIES_UI.showCompanyDetail.apply(this,arguments); }
  function renderDashboard(){ return IM_COMPANIES_UI.renderDashboard.apply(this,arguments); }
  function _coCmpEnsureCss(){ return IM_COMPANIES_UI._coCmpEnsureCss.apply(this,arguments); }
  function _coCmpRender(){ return IM_COMPANIES_UI._coCmpRender.apply(this,arguments); }
  const IM_TOOL_PANEL=window.IntMapModules.toolPanel(IM_HOST);
  /* (#R170) Measure ▸ 3-D volume. Built AFTER IntMapGeoEngine exists (it talks to nothing else), and exposed
     globally because the tool panel, exitTool and the Atlas volume3d action all drive the same single box. */
  window.IntMapVolume3D=window.IntMapModules.volume3d(IM_HOST);
  /* (#R171) The tilt-limit setting + the eye-altitude readout chip (window.IntMapTilt / window.IntMapEyeAlt).
     Engine-only like volume3d; both wait for IntMapGeoEngine themselves before touching the camera. */
  window.IntMapModules.viewControls(IM_HOST);
  /* (#R174) DRONE NAVIGATION (window.IntMapDrone). Reads the terrain through HOST's DEM sampler and draws
     through IntMapGeoEngine only; it owns no camera and installs exactly one map click handler, which
     does nothing unless its own "add waypoint" mode is armed. See js/drone-nav.js. */
  window.IntMapModules.droneNav(IM_HOST);
  /* (#R184) …and the operational layer on top of it (window.IntMapDroneOps): the wind field and the
     hazard sources that #R174 left as declared-but-unfilled seams, plus route comparison,
     return-to-home and the multi-aircraft conflict check. It registers itself INTO the planner, so
     the planner keeps working unchanged if this file is absent. */
  window.IntMapModules.droneOps(IM_HOST);
  /* (#R175) the live-aircraft DETAIL CARD (window.IntMapAircraftPanel). js/data-layers.js reaches for it by
     name when an aircraft is clicked and falls back to the pinned tooltip if it is not there, so this is a
     pure addition to the traffic layer rather than a change to it. See js/aircraft-detail.js. */
  window.IntMapAircraftPanel=window.IntMapModules.aircraftDetail(IM_HOST);
  /* (#R184) LIVE SATELLITES (window.IntMapSatellites) and their detail card (window.IntMapSatPanel).
     The layer owns its own feed, propagation, hover, click and timer — js/data-layers.js only turns it
     on and off and gives it a legend, exactly as it does for the two traffic layers. The panel is built
     first so the layer's click handler can always find it. See js/satellites-live.js. */
  window.IntMapModules.satelliteDetail(IM_HOST);
  window.IntMapModules.satellitesLive(IM_HOST);
  function updateToolPanel(){ return IM_TOOL_PANEL.updateToolPanel.apply(this,arguments); }
  function buildToolFeatures(){ return IM_TOOL_PANEL.buildToolFeatures.apply(this,arguments); }
  function showContextMenu(){ return IM_TOOL_PANEL.showContextMenu.apply(this,arguments); }
  const IM_AUTH_UI=window.IntMapModules.authUi(IM_HOST);
  function bootSupabase(){ return IM_AUTH_UI.bootSupabase.apply(this,arguments); }
  function _openSetPassword(){ return IM_AUTH_UI._openSetPassword.apply(this,arguments); }
  function openAuthModal(){ return IM_AUTH_UI.openAuthModal.apply(this,arguments); }
  const IM_COMMUNITY=window.IntMapModules.community(IM_HOST);
  function renderCommunity(){ return IM_COMMUNITY.renderCommunity.apply(this,arguments); }
  function wireCommList(){ return IM_COMMUNITY.wireCommList.apply(this,arguments); }
  /* ── (#R169) EIGHTH SPLIT — eleven more SUBJECT modules (Architecture.md §3.1 #R169).
   *  Same shape as the #R168 block above: each factory only DECLARES (verified statement-by-statement
   *  with a parser — see tests/r169-checks.test.mjs), so instantiating them all here, once `map`
   *  exists, cannot run app code early. Every name index.html still calls keeps a hoisted `function`
   *  shim, so call sites textually above this line behave exactly as before. */
  const IM_SAT=window.IntMapModules.satellite(IM_HOST);
  function aiCaptureSatAt(){ return IM_SAT.aiCaptureSatAt.apply(this,arguments); }
  function satApply(){ return IM_SAT.satApply.apply(this,arguments); }
  function satBuildTiles(){ return IM_SAT.satBuildTiles.apply(this,arguments); }
  function satCaptureLabel(){ return IM_SAT.satCaptureLabel.apply(this,arguments); }
  function satChipHTML(){ return IM_SAT.satChipHTML.apply(this,arguments); }
  function satHasKey(){ return IM_SAT.satHasKey.apply(this,arguments); }
  function satProviderById(){ return IM_SAT.satProviderById.apply(this,arguments); }
  function satReady(){ return IM_SAT.satReady.apply(this,arguments); }
  function satRefreshReadout(){ return IM_SAT.satRefreshReadout.apply(this,arguments); }
  function satRenderController(){ return IM_SAT.satRenderController.apply(this,arguments); }
  function satRenderKeyInputs(){ return IM_SAT.satRenderKeyInputs.apply(this,arguments); }
  function satRevertToFallback(){ return IM_SAT.satRevertToFallback.apply(this,arguments); }
  function satSaveKeyInputs(){ return IM_SAT.satSaveKeyInputs.apply(this,arguments); }
  function satSelectProvider(){ return IM_SAT.satSelectProvider.apply(this,arguments); }
  function satSetOpacity(){ return IM_SAT.satSetOpacity.apply(this,arguments); }
  function satSetup(){ return IM_SAT.satSetup.apply(this,arguments); }
  function satStepDay(){ return IM_SAT.satStepDay.apply(this,arguments); }
  function satToast(){ return IM_SAT.satToast.apply(this,arguments); }
  const IM_AI=window.IntMapModules.aiCore(IM_HOST);
  function aiDev(){ return IM_AI.aiDev.apply(this,arguments); }
  function aiEsc(){ return IM_AI.aiEsc.apply(this,arguments); }
  function aiFetchUsage(){ return IM_AI.aiFetchUsage.apply(this,arguments); }
  function aiGate(){ return IM_AI.aiGate.apply(this,arguments); }
  function aiLimitMsg(){ return IM_AI.aiLimitMsg.apply(this,arguments); }
  function aiLoginMsg(){ return IM_AI.aiLoginMsg.apply(this,arguments); }
  function aiParseJSON(){ return IM_AI.aiParseJSON.apply(this,arguments); }
  function aiReady(){ return IM_AI.aiReady.apply(this,arguments); }
  function aiRenderSettings(){ return IM_AI.aiRenderSettings.apply(this,arguments); }
  function aiReport(){ return IM_AI.aiReport.apply(this,arguments); }
  function aiSaveSettings(){ return IM_AI.aiSaveSettings.apply(this,arguments); }
  function aiSetBtnBusy(){ return IM_AI.aiSetBtnBusy.apply(this,arguments); }
  function aiSyncFeatureButtons(){ return IM_AI.aiSyncFeatureButtons.apply(this,arguments); }
  function aiToast(){ return IM_AI.aiToast.apply(this,arguments); }
  function aiToday(){ return IM_AI.aiToday.apply(this,arguments); }
  function aiUsesLeft(){ return IM_AI.aiUsesLeft.apply(this,arguments); }
  function aiVisionReady(){ return IM_AI.aiVisionReady.apply(this,arguments); }
  function aiWaitMapIdle(){ return IM_AI.aiWaitMapIdle.apply(this,arguments); }
  function askAI(){ return IM_AI.askAI.apply(this,arguments); }
  function askAIJSON(){ return IM_AI.askAIJSON.apply(this,arguments); }
  function askAIJSONEnvelope(){ return IM_AI.askAIJSONEnvelope.apply(this,arguments); }
  const IM_LABELS=window.IntMapModules.placeLabels(IM_HOST);
  function applyLabelLang(){ return IM_LABELS.applyLabelLang.apply(this,arguments); }
  function buildGeoFC(){ return IM_LABELS.buildGeoFC.apply(this,arguments); }
  function ensureGeoLayers(){ return IM_LABELS.ensureGeoLayers.apply(this,arguments); }
  function ensurePlaceLabels(){ return IM_LABELS.ensurePlaceLabels.apply(this,arguments); }
  function localizeGeoLabels(){ return IM_LABELS.localizeGeoLabels.apply(this,arguments); }
  function updateGeoLayers(){ return IM_LABELS.updateGeoLayers.apply(this,arguments); }
  const IM_WINMGR=window.IntMapModules.windowManager(IM_HOST);
  function addEdgeResize(){ return IM_WINMGR.addEdgeResize.apply(this,arguments); }
  function bringToFront(){ return IM_WINMGR.bringToFront.apply(this,arguments); }
  function makeDraggable(){ return IM_WINMGR.makeDraggable.apply(this,arguments); }
  function registerWindow(){ return IM_WINMGR.registerWindow.apply(this,arguments); }
  const IM_SEARCH=window.IntMapModules.searchGeocode(IM_HOST);
  function doGeocode(){ return IM_SEARCH.doGeocode.apply(this,arguments); }
  function localFuzzyPlaces(){ return IM_SEARCH.localFuzzyPlaces.apply(this,arguments); }
  const IM_NEWSCTX=window.IntMapModules.newsContext(IM_HOST);
  function analyzeContext(){ return IM_NEWSCTX.analyzeContext.apply(this,arguments); }
  function rebuildGeoIndex(){ return IM_NEWSCTX.rebuildGeoIndex.apply(this,arguments); }
  const IM_NEWSFEED=window.IntMapModules.newsFeed(IM_HOST);
  function aiTranslateTitles(){ return IM_NEWSFEED.aiTranslateTitles.apply(this,arguments); }
  function fetchData(){ return IM_NEWSFEED.fetchData.apply(this,arguments); }
  function loadNewsFromSupabase(){ return IM_NEWSFEED.loadNewsFromSupabase.apply(this,arguments); }
  function startNews(){ return IM_NEWSFEED.startNews.apply(this,arguments); }
  const IM_READER=window.IntMapModules.articleReader(IM_HOST);
  function openArticleInSidebar(){ return IM_READER.openArticleInSidebar.apply(this,arguments); }
  const IM_COMMBOARD=window.IntMapModules.communityBoard(IM_HOST);
  function cmAddPost(){ return IM_COMMBOARD.cmAddPost.apply(this,arguments); }
  function cmEditPost(){ return IM_COMMBOARD.cmEditPost.apply(this,arguments); }
  function commCatLabel(){ return IM_COMMBOARD.commCatLabel.apply(this,arguments); }
  function imViewProfile(){ return IM_COMMBOARD.imViewProfile.apply(this,arguments); }
  function loadCommunity(){ return IM_COMMBOARD.loadCommunity.apply(this,arguments); }
  function openComposeModal(){ return IM_COMMBOARD.openComposeModal.apply(this,arguments); }
  function renderCommList(){ return IM_COMMBOARD.renderCommList.apply(this,arguments); }
  function setupCommunityLayer(){ return IM_COMMBOARD.setupCommunityLayer.apply(this,arguments); }
  function visibleCommunityPosts(){ return IM_COMMBOARD.visibleCommunityPosts.apply(this,arguments); }
  const IM_READOUT=window.IntMapModules.mapReadout(IM_HOST);
  function _demZoomForSpan(){ return IM_READOUT._demZoomForSpan.apply(this,arguments); }
  function demElevAt(){ return IM_READOUT.demElevAt.apply(this,arguments); }
  function demElevBilinear(){ return IM_READOUT.demElevBilinear.apply(this,arguments); }
  function demZoomForMap(){ return IM_READOUT.demZoomForMap.apply(this,arguments); }
  function fetchBathymetry(){ return IM_READOUT.fetchBathymetry.apply(this,arguments); }
  function fmtElevVal(){ return IM_READOUT.fmtElevVal.apply(this,arguments); }
  function fmtLL(){ return IM_READOUT.fmtLL.apply(this,arguments); }
  function handleMapClick(){ return IM_READOUT.handleMapClick.apply(this,arguments); }
  function refreshGrid(){ return IM_READOUT.refreshGrid.apply(this,arguments); }
  function renderCoordReadout(){ return IM_READOUT.renderCoordReadout.apply(this,arguments); }
  function setGrid(){ return IM_READOUT.setGrid.apply(this,arguments); }
  function showMeasureTip(){ return IM_READOUT.showMeasureTip.apply(this,arguments); }
  function updateCompass(){ return IM_READOUT.updateCompass.apply(this,arguments); }
  function updateCoord(){ return IM_READOUT.updateCoord.apply(this,arguments); }
  function updateLayerReadout(){ return IM_READOUT.updateLayerReadout.apply(this,arguments); }
  function warmDEMTiles(){ return IM_READOUT.warmDEMTiles.apply(this,arguments); }
  function demSnapshot(){ return IM_READOUT.demSnapshot.apply(this,arguments); }   /* (#R191) a frozen DEM for a field built over several frames */
  const IM_ELEVPROF=window.IntMapModules.elevationProfile(IM_HOST);
  function _openProfilePanel(){ return IM_ELEVPROF._openProfilePanel.apply(this,arguments); }

  /* Coalesce resizes to one per frame (#32) — the sidebar open/close transition fires the
     ResizeObserver dozens of times; calling map.resize() on each caused a visible flicker. */
  /* (#R158) SIDEBAR-SLIDE FLICKER ("左右のサイドバーを開閉する際の地図のフリッカーを無くして"). Root cause: while a
     sidebar's width animates (left: .sidebar margin-left reflows the flex map-container; right: #map-container margin-right),
     the map-container box changes EVERY frame, so the ResizeObserver → map.resize() reallocates the WebGL back-buffer ~25×
     during the ~0.4 s slide, each realloc a brief blank/stretched frame. Fix (the frosted-mode path already proves it):
     SUPPRESS the per-frame resize while a known sidebar slide is in flight and resize the buffer exactly ONCE at
     transitionend — the canvas CSS-scales its existing buffer for the ~0.4 s (imperceptible) then snaps sharp. Only the
     TIMING of the buffer resize changes; layout, animation curves and camera are untouched. */
  /* (#R160) The sidebars now OVERLAY a fixed full-width map (desktop; mobile uses the bottom sheet) — see the
     layout CSS. The map-container NEVER changes size when a panel opens or closes, so there is nothing to resize
     or re-anchor on toggle: the map physically cannot move. The entire R158/R159 per-frame-resize + edge-anchor
     machinery (`_sbBeginAnim`/`_sbReanchor`/`_sbCaptureAnchor`/`_sbFinishAnim`) is DELETED — it was the "余計な事"
     that fought a problem which no longer exists, and it was itself what jerked the map around. We keep only a
     coalesced resize for GENUINE viewport/container size changes (window resize, devtools, rotation). */
  let _rsRAF=0; const coalescedResize=()=>{ if(_rsRAF) return; _rsRAF=requestAnimationFrame(()=>{ _rsRAF=0; try{ GE().render.resize(); }catch(_){} }); };
  if('ResizeObserver' in window) new ResizeObserver(coalescedResize).observe(document.getElementById('map-container'));
  window.addEventListener('resize',coalescedResize);
  /* (#R160) Back-compat shim: a couple of callers still do `_sbBeginAnim(onEnd)` to "reveal the panel, then
     notify". There is no camera animation to run anymore (the map doesn't move), so just coalesce a resize in
     case the viewport genuinely changed and fire the callback on the next frame. */
  window._sbBeginAnim=function(onEnd){ try{ coalescedResize(); }catch(_){} if(typeof onEnd==='function') requestAnimationFrame(()=>{ try{ onEnd(); }catch(_){} }); };

  /* Google-Earth-style navigation feel: stepless wheel zoom centerd on the cursor, a little
     snappier than the default, plus a low-angle tilt limit so you can lean into the horizon. */
  if(GE().hasRenderer()){ try{
    GE().input.setZoomRate(1/300,true);       /* default 1/450 → a touch more responsive */
    GE().input.setZoomRate(1/90);             /* trackpad pinch */
    /* (#R171) 78° is the STANDARD ceiling, not the only one — Settings ▸ Map behaviour ▸ "Map tilt limit"
       can hand over the renderer's whole 0-180° range.
       (#R178) …and this line no longer WRITES it. It used to set 78 outright and win by accident of
       ordering: window.IntMapTilt polled for IntMapGeoEngine, which did not exist until map.on('load'),
       which is after here. The engine is imported before the map now, so the tilt module applied the
       saved "unlimited" first and this line silently took it back — measured, the ceiling read 78 after
       a reload with the setting on. There is one owner of the ceiling, and it is the tilt module;
       asking it to apply gives 78 for a fresh profile and 180 for a saved choice, from one place. */
    if(window.IntMapTilt&&window.IntMapTilt.apply) window.IntMapTilt.apply();
    else GE().camera.setMaxPitch(78);
    GE().input.set('keyboard',true);
    GE().input.set('dragRotate',true);
  }catch(_){} }
  /* (#R200) moved to js/wheel-zoom.js — a real ES module (see the import at the top of this file), not a
     window.IntMapModules entry and not a line in src/main.js's ordered list. */
  makeWheelZoom(IM_HOST, { GE, i18n });
  /* (#R200) moved to js/label-occlusion.js — a real ES module (see the import at the top of this file), not a
     window.IntMapModules entry and not a line in src/main.js's ordered list. */
  _IM_LABELOCCLUSION = makeLabelOcclusion(IM_HOST, { GE, isMobile });
  /* =============================================================================
   *  EXPANDED GEO DICTIONARY — drives accurate news pin placement.
   *  Longer keywords are checked first to prefer "Tel Aviv" over "Israel".
   *  ============================================================================= */
  /* Grouped by type so every entry can be stamped flashpoint / city / country / region,
     then flattened into `geoDB` below. The scorer uses `type` to reward more local /
     higher-risk places (see scoreGeo). */
  let geoRaw={};
  /* geoDB is the flat, matcher-compiled index, rebuilt from geoRaw whenever the
     Supabase data (re)loads. Starts empty; populated by loadGeoFromSupabase(). */
  let geoDB=[];

  /* (#R162) moved to js/gazetteer.js — see Architecture.md "File layout". */
  const _BUILTIN_GZ=window.IntMapGazetteer.builtin, _EXTRA_GZ=window.IntMapGazetteer.extra;
  /* (#R198) the reduce that used to build this index moved into js/gazetteer.js — see the note there.
     Nothing in THIS file reads it any more; HOST.BUILTIN_GAZETTEER (above) calls index() on every
     access, because the world rows (data/gazetteer-world.json) arrive after boot and a captured
     object would be the pre-#R198 table forever. */
  /* (#R167) moved verbatim to js/tables.js — see Architecture.md §3.1. */
  const {_ORG_GZ,_DEMONYM_GZ,sourceDict}=window.IntMapTables;
  /* Precompiled longest-first matchers. Latin keys use word boundaries so short acronyms
     ("AP","RT") don't match inside unrelated words; CJK keys use substring. */
  const _pubMatchers=(()=>{ const cjk=/[　-ヿ㐀-鿿ｦ-ﾟ]/;
    return Object.entries(sourceDict).map(([k,v])=>{ const isC=cjk.test(k);
      return { loc:v.loc, label:k, cjk:isC, re:isC?null:new RegExp('\\b'+k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i') }; })
      .sort((a,b)=>b.label.length-a.label.length); })();
  /* (#R169) moved verbatim to js/news-context.js — see Architecture.md §3.1. */

  /* (#R167) moved verbatim to js/tables.js — see Architecture.md §3.1. */
  const {geoLayersDB,GEO_LABEL_JP}=window.IntMapTables;
  /* (#R169) moved verbatim to js/place-labels.js — see Architecture.md §3.1. */
  /* (#R8b) Catmull-Rom densifier → polylines render as natural CURVES through their control points
     instead of straight chords (the user: "線が直線的すぎる"). Returns the input unchanged for paths that
     cross the antimeridian (|Δlng|>170), so seam-spanning routes are never smeared across the globe. */
  window.smoothGeoPath=function(pts,segs){
    if(!pts||pts.length<3) return pts;
    for(let i=1;i<pts.length;i++){ if(Math.abs(pts[i][0]-pts[i-1][0])>170) return pts; }
    segs=segs||14; const out=[]; const P=i=>pts[Math.max(0,Math.min(pts.length-1,i))];
    for(let i=0;i<pts.length-1;i++){ const p0=P(i-1),p1=P(i),p2=P(i+1),p3=P(i+2);
      for(let t=0;t<segs;t++){ const s=t/segs,s2=s*s,s3=s2*s;
        out.push([ 0.5*((2*p1[0])+(-p0[0]+p2[0])*s+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*s2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*s3),
                   0.5*((2*p1[1])+(-p0[1]+p2[1])*s+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*s2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*s3) ]); } }
    out.push(pts[pts.length-1]); return out;
  };
  /* (#R169) moved verbatim to js/place-labels.js — see Architecture.md §3.1. */
  /* Re-emit every geo source's data so on-map labels follow the active language (#1). */
  function refreshGeoLabels(){ for(const key of Object.keys(geoLayersDB)){ try{ if(GE().layers.hasSource(key)) GE().layers.setSourceData(key,buildGeoFC(geoLayersDB[key])); }catch(_){} } }
  window.refreshGeoLabels=refreshGeoLabels;
  /* (#R169) moved verbatim to js/place-labels.js — see Architecture.md §3.1. */
  window.triggerLayerHover=function(k,h){ if(!k)return; if(h)forceHoverLayers.add(k); else forceHoverLayers.delete(k); updateGeoLayers(); };

  let countryGeo=null, countryStats={}, countryDataLoaded=false, countryDataPromise=null;
  /* (#R22) GDP (PPP) + GDP-per-capita (PPP), live from the World Bank (NY.GDP.MKTP.PP.CD /
     NY.GDP.PCAP.PP.CD, most-recent value per country), merged into countryStats as gdpPPP (billions)
     and gdppcPPP (current international $). Cached 30 days. Used by Stats, the country popup, compare
     and the GDP-per-capita layer (its readout shows nominal + PPP). */
  let gdpPPPLoaded=false, gdpPPPPromise=null;
  function _mergePPP(pc,tot){ try{
      Object.keys(countryStats).forEach(code=>{ const s=countryStats[code];
        if(pc&&pc[code]!=null) s.gdppcPPP=pc[code];
        if(tot&&tot[code]!=null) s.gdpPPP=tot[code]/1e9; });
      gdpPPPLoaded=true;
      /* refresh anything currently showing GDP */
      try{ const cp=document.getElementById('country-popup'); if(cp&&cp.style.display==='block'&&window._cpCurrent){ const s=countryStats[window._cpCurrent.code]; const body=document.getElementById('cp-body'); if(s&&body) body.innerHTML=topBtns()+renderCountryDetailBody(s); } }catch(_){}
      try{ if(typeof currentMode!=='undefined'&&currentMode==='stats'&&typeof renderStats==='function') renderStats(); }catch(_){}
      try{ if(GE().layers.has('gdppc-fill')) { /* readout fmt already reads the new field */ } }catch(_){}
    }catch(_){} }
  function loadGdpPPP(){
    if(gdpPPPPromise) return gdpPPPPromise;
    gdpPPPPromise=(async()=>{
      try{ const c=JSON.parse(localStorage.getItem('intmap_gdpppp')||'null');
        if(c&&c.ts&&(Date.now()-c.ts<30*864e5)&&c.pc){ _mergePPP(c.pc,c.tot); return; } }catch(_){}
      const fetchInd=async(ind)=>{ try{ const r=await fetch('https://api.worldbank.org/v2/country/all/indicator/'+ind+'?format=json&per_page=400&mrnev=1');
          const j=await r.json(); const out={}; (j&&j[1]||[]).forEach(d=>{ if(d&&d.countryiso3code&&d.value!=null) out[d.countryiso3code]=d.value; }); return out; }catch(_){ return {}; } };
      const [pc,tot]=await Promise.all([fetchInd('NY.GDP.PCAP.PP.CD'),fetchInd('NY.GDP.MKTP.PP.CD')]);
      if(Object.keys(pc).length||Object.keys(tot).length){ try{ localStorage.setItem('intmap_gdpppp',JSON.stringify({ts:Date.now(),pc,tot})); }catch(_){} }
      _mergePPP(pc,tot);
    })();
    return gdpPPPPromise;
  }
  /* (#R195) the held 10 m country geometry (js/countries-ui.js) reaches the renderer HERE — the one
     moment something is about to draw it. Flushed before the layers are shown, so the first frame
     with Countries(info) on already carries the fine outline rather than the 110 m stand-in. ⚠⚠ (#R216) `force` — «about to draw it» was only ever the Countries tab, so every choropleth painted that stand-in under the 10 m border line. setSourceData CLEARS FEATURE STATE: flush BEFORE the paint, and repaint when a later one lands (js/world-packs.js hiResCountries). DEV-NOTES #R216 §4. */
  window._imFlushCountryGeo=function(force){ try{
    const hi=window._imCountryGeoPending; if(!hi) return false;
    if(!(GE().hasRenderer()&&GE().layers.hasSource('countries'))) return false;
    if(!(force===true||countryInfoOn)) return false;
    GE().layers.setSourceData('countries',hi); window._imCountryGeoPending=null; return true;
  }catch(_){ return false; } };
  function applyCountryVisibility(){ if(!GE().hasRenderer()||!GE().layers.has('country-fill'))return; const v=countryInfoOn?'visible':'none';
    if(countryInfoOn){ try{ window._imFlushCountryGeo(); }catch(_){} }
    GE().layers.setLayout('country-fill','visibility',v); GE().layers.setLayout('country-line','visibility',v); }
  const fmtMoney=(b)=>!b?'—':(b>=1000?'$'+(b/1000).toFixed(2)+'T':'$'+b.toFixed(0)+'B');
  const fmtPc=(v)=>v?'$'+Math.round(v).toLocaleString():'—';
  const cName=(s,f)=>(currentLang==='jp'&&s&&s.nameJp)?s.nameJp:(s&&s.nameEn)||f||'—';
  function hideCountryInfo(){ document.getElementById('country-info').style.display='none'; }
  function resolveCountryId(feat){
    const p=(feat&&feat.properties)||{};
    /* Only accept a candidate that actually exists in countryStats. MapLibre may
       auto-assign a NUMERIC feature id (our GeoJSON used non-numeric string ids),
       so the old code returned feat.id like "12" → countryStats miss → all N/A. */
    const cands=[feat&&feat.id, p.ISO_A3_EH, p.ISO_A3, p.ADM0_A3, p.SOV_A3, p.ADM0_A3_US, p.ADM0_ISO];
    for(const c of cands){ if(c!=null && c!=='' && c!=='-99' && countryStats[String(c)]) return String(c); }
    /* Fallback: match by English name */
    const nm=(p.NAME_EN||p.ADMIN||p.NAME||'').toLowerCase();
    if(nm){ const hit=Object.values(countryStats).find(s=>(s.nameEn||'').toLowerCase()===nm); if(hit) return hit.code; }
    return '';
  }
  /* (#R39) Wikipedia-style integrated page: an intro placeholder (filled async with a Wikipedia extract +
     thumbnail) then the data GROUPED into Geography / Economy / Society / Politics & defense sections —
     not a bare flat列挙. ("Wikipediaのような統合情報ページにして") */
  /* Close handler for the country popup */
  function _wireCountryPopupClose(){
    const popup=document.getElementById('country-popup');
    const closeBtn=document.getElementById('cp-close');
    if(closeBtn) closeBtn.onclick=()=>{ popup.style.display='none'; };
  }

  /* (#R169) moved verbatim to js/map-readout.js — see Architecture.md §3.1. */
  function toggleGrid(){ setGrid(!isGridOn); }
  /* (#R169) moved verbatim to js/map-readout.js — see Architecture.md §3.1. */

  /* ===== Units & measurement =====
   * Auto-scale: metric flips km→m below 1 km; imperial flips mi→ft (yd for mid range) below 0.19 mi.
   */
  function fmtMetricDist(km){
    if(km<1){
      const m=km*1000;
      return (m<10?m.toFixed(1):Math.round(m))+' m';
    }
    return (km<10?km.toFixed(2):km<100?km.toFixed(1):Math.round(km).toLocaleString())+' km';
  }
  function fmtImperialDist(km){
    const mi=km*KM2MI;
    if(mi<0.0095){ /* less than 50 ft → show ft */
      const ft=mi*5280;
      return (ft<10?ft.toFixed(1):Math.round(ft))+' ft';
    }
    if(mi<0.19){ /* up to ~1000 ft → show yards */
      const yd=mi*1760;
      return Math.round(yd).toLocaleString()+' yd';
    }
    return (mi<10?mi.toFixed(2):mi<100?mi.toFixed(1):Math.round(mi).toLocaleString())+' mi';
  }
  const uDist=(km)=>({m:fmtMetricDist(km), i:fmtImperialDist(km)});
  function fmtMetricArea(k){
    if(k<0.01){ /* < 10,000 m² → m² */
      const m2=k*1e6;
      return Math.round(m2).toLocaleString()+' m²';
    }
    if(k<1){ /* hectares range */
      return (k*100).toFixed(2)+' ha';
    }
    return Math.round(k).toLocaleString()+' km²';
  }
  function fmtImperialArea(k){
    const mi2=k*0.386102;
    if(mi2<0.0004){ /* < ~10,000 ft² */
      const ft2=k*10763910;
      return Math.round(ft2).toLocaleString()+' ft²';
    }
    if(mi2<1){
      const ac=mi2*640;
      return ac.toFixed(2)+' ac';
    }
    return Math.round(mi2).toLocaleString()+' mi²';
  }
  const uArea=(k)=>({m:fmtMetricArea(k), i:fmtImperialArea(k)});
  function distHTML(km){ const u=uDist(km); return unitMode==='metric'?u.m:unitMode==='imperial'?u.i:`${u.m} <span class="unit-sub">(${u.i})</span>`; }
  function distTXT(km){ const u=uDist(km); return unitMode==='metric'?u.m:unitMode==='imperial'?u.i:`${u.m} (${u.i})`; }
  function areaHTML(k){ const u=uArea(k); return unitMode==='metric'?u.m:unitMode==='imperial'?u.i:`${u.m} <span class="unit-sub">(${u.i})</span>`; }
  function areaTXT(k){ const u=uArea(k); return unitMode==='metric'?u.m:unitMode==='imperial'?u.i:`${u.m} (${u.i})`; }
  /* (#R11) Temperature in °C / °F / both, chosen in Settings (default both). */
  window.imUnitTemp = (function(){ try{ return localStorage.getItem('intmap_temp_unit')||'both'; }catch(_){ return 'both'; } })();
  function fmtTemp(c){ if(c==null||isNaN(c)) return '—'; const C=Math.round(c)+'°C', F=Math.round(c*9/5+32)+'°F'; const m=window.imUnitTemp||'both'; return m==='c'?C:m==='f'?F:C+' ('+F+')'; }
  window.fmtTemp=fmtTemp;
  /* Convert °C literals embedded in prose (Köppen criteria, scale ticks) to the chosen unit so a
     Fahrenheit setting never leaks °C. Handles single values and ranges ("0–18 °C", "0〜18°C") and
     both minus signs (ASCII "-" and U+2212 "−"). Default ('both') keeps °C and appends (°F). (#R13c) */
  function convTempText(s){ if(s==null) return s; const m=window.imUnitTemp||'both'; if(m==='c') return String(s);
    const f=t=>Math.round(parseFloat(String(t).replace('−','-'))*9/5+32);
    return String(s).replace(/([−-]?\d+(?:\.\d+)?)(?:(\s*[–—~〜]\s*)([−-]?\d+(?:\.\d+)?))?\s*°C/g,(mm,a,sep,b)=>{
      if(b!=null){ return m==='f' ? (f(a)+sep+f(b)+' °F') : (mm+' ('+f(a)+sep+f(b)+' °F)'); }
      return m==='f' ? (f(a)+' °F') : (mm+' ('+f(a)+' °F)'); }); }
  window.convTempText=convTempText;
  function bearingDeg(a,b){ return (turf.bearing(turf.point(a),turf.point(b))+360)%360; }
  function compassDir(deg){ const dirs=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']; return dirs[Math.round(deg/22.5)%16]; }

  let measureSnapClose=false;        /* true while the cursor hovers the first measure vertex */
  const SNAP_PX=22;                  /* screen-space radius that counts as "on the first point" */
  /* ══ (#R196) MOVED VERBATIM TO js/geodesy.js ════════════════════════════════════
     111 lines of antimeridian / pole-safe geometry — the seam clipping, the polar caps, the geodesic
     disk and the feature sanitiser. It reads nothing from this scope, so the move needed no handover
     at all, and tests/r196-checks.test.mjs proves the 111 lines are byte-identical to what was here.
     ⚠ Re-bound under the ORIGINAL names below: IM_HOST publishes five of them and js/tool-panel.js,
     js/seismic.js, js/dash-extended.js and js/atlas-console.js read them through it. */
  /* ⚠ HOISTED FUNCTION DECLARATIONS, NOT `const`. Five of these six are bound AT FACTORY TIME by
     js/tool-panel.js, js/seismic.js, js/dash-extended.js and js/atlas-console.js through IM_HOST, and
     a factory can run before a `const` further down this closure is initialised — which is exactly
     #R167's dead-zone rule and #R189's silent total loss. Written as declarations they are defined
     from the first line of the closure, like every other IM_HOST function. (Caught by
     tests/r167-checks.test.mjs #5 on the first attempt, which is what that test is for.) */
  function _gcRingUnwrapped(){ return window.IntMapGeodesy._gcRingUnwrapped.apply(null,arguments); }
  function _splitPolyToWindows(){ return window.IntMapGeodesy._splitPolyToWindows.apply(null,arguments); }
  function _splitLineToWindows(){ return window.IntMapGeodesy._splitLineToWindows.apply(null,arguments); }
  function diskFillPolys(){ return window.IntMapGeodesy.diskFillPolys.apply(null,arguments); }
  function diskOutlineLines(){ return window.IntMapGeodesy.diskOutlineLines.apply(null,arguments); }
  function sanitizeFeatures(){ return window.IntMapGeodesy.sanitizeFeatures.apply(null,arguments); }
  function refreshTool(){ if(GE().layers.hasSource('tool-source')) GE().layers.setSourceData('tool-source',{type:'FeatureCollection',features:sanitizeFeatures(buildToolFeatures())}); }

  /* (#R169) moved verbatim to js/map-readout.js — see Architecture.md §3.1. */
  function hideMeasureTip(){ document.getElementById('measure-tooltip').style.display='none'; }
  function totalDistance(p){ let s=0; for(let i=1;i<p.length;i++)s+=turf.distance(turf.point(p[i-1]),turf.point(p[i]),{units:'kilometers'}); return s; }
  function ringArea(p){
    if(p.length<3)return 0;
    try{
      /* Great-circle ring in CONTINUOUS longitude (#5): turf.area's spherical formula uses lon/lat
         differences, so an unwrapped ring (lon possibly outside ±180) yields the correct geodesic
         area even across the antimeridian — no seam-jump distortion. */
      const ring=_gcRingUnwrapped(p,48);
      const first=ring[0], last=ring[ring.length-1];
      if(first[0]!==last[0]||first[1]!==last[1]) ring.push(first.slice());
      if(ring.length<4) return turf.area(turf.polygon([[...p,p[0]]]))/1e6;
      return turf.area(turf.polygon([ring]))/1e6;
    }catch(e){return 0;}
  }

  /* (#R9) Area is no longer a standalone button — Measure auto-closes into area mode — and Measure/Draw
     live inside one "Measure ▾" dropdown, so the toolbar highlight is computed null-safe here and the
     dropdown trigger lights up for measure/area/draw. */
  function _syncToolBtns(){
    ['measure','radius'].forEach(m=>{ const b=document.getElementById('btn-tool-'+m); if(b) b.classList.toggle('tool-on', toolMode===m); });
    const trig=document.getElementById('btn-measure-menu');
    if(trig) trig.classList.toggle('tool-on', toolMode==='measure'||toolMode==='area'||toolMode==='radius'||toolMode==='volume'||!!(window.DrawTool&&window.DrawTool.active&&window.DrawTool.active()));   /* (#R170) +volume */   /* (#R151) Radius now lives in the Measure menu → its trigger reflects an active radius too */
    try{ window._mAddPointUpdate&&window._mAddPointUpdate(); }catch(_){}   /* show/hide the mobile "+Add point" button with the tool state (#R13) */
  }
  window._syncToolBtns=_syncToolBtns;
  function exitTool(){
    try{ if(toolMode==='volume'&&window.IntMapVolume3D) window.IntMapVolume3D.release(); }catch(_){}   /* (#R170) closing the tool removes its 3-D box; (#R171) release() also hands the drag gesture back */
    toolMode=null; liveCursor=null; measureSnapClose=false;
    _syncToolBtns();
    measurePoints=[]; hideMeasureTip(); refreshTool();
    document.getElementById('map-container').classList.remove('tool-active');   /* (#R25) double-tap zoom is now the custom sensitivity-aware handler (built-in stays off) */
    document.getElementById('tool-panel').style.display='none';
  }
  function setTool(mode){
    if(toolMode===mode){ exitTool(); return; }
    try{ if(toolMode==='volume'&&mode!=='volume'&&window.IntMapVolume3D) window.IntMapVolume3D.release(); }catch(_){}   /* (#R170/#R171) */
    toolMode=mode; _syncToolBtns();
    measurePoints=[]; hideMeasureTip(); refreshTool();
    document.getElementById('map-container').classList.add('tool-active'); if(GE().hasRenderer())GE().input.set('doubleClickZoom',false);
    const p=document.getElementById('tool-panel'); p.style.left=''; p.style.top=''; p.style.right=''; updateToolPanel();
  }
  /* (#R169) moved verbatim to js/window-manager.js — see Architecture.md §3.1. */
  try{ window.bringToFront=bringToFront; window.addEdgeResize=addEdgeResize; window.registerWindow=registerWindow; }catch(_){}

  window.removeRadiusItem=function(id){ radiusItems=radiusItems.filter(c=>c.id!==id); if(window._activeRadiusId===id) window._activeRadiusId=null; refreshTool(); updateToolPanel(); };
  window.clearAllRadius=function(){ radiusItems=[]; window._activeRadiusId=null; refreshTool(); updateToolPanel(); };
  /* Radius from an already-chosen point (right-click menu + map-click popup, #54): drop the circle at
     a fixed center, then let the user tune radius / color in the tool panel. */
  window._radiusFromPoint=function(lng,lat){ if(toolMode!=='radius') setTool('radius'); const id='r_'+Date.now()+'_'+Math.random().toString(36).slice(2,6); radiusItems.push({id,center:[lng,lat],radiusKm,color:radiusColor,opacity:radiusOpacity}); window._activeRadiusId=id; refreshTool(); updateToolPanel(); };
  /* Measure: step back one point (#38). If a closed area drops below 3 points it re-opens as a line. */
  window._measureUndo=function(){ if(!measurePoints.length) return; measurePoints.pop(); if(toolMode==='area' && measurePoints.length<3){ toolMode='measure'; _syncToolBtns(); } liveCursor=null; refreshTool(); updateToolPanel(); };
  /* (#R9/#51) "News in this area": filter the analyzed news to the drawn radius/polygon and show it in
     the News feed, with a dismissable banner. Reuses the same geometry as the AI area-summary. */
  window._searchNewsInArea=function(){
    if(!hasTurf()){ try{ imToast('Turf.js unavailable'); }catch(_){} return; }
    let test=null;
    if(toolMode==='radius'){ if(!radiusItems.length){ try{ imToast(t('aiSumNoArea')); }catch(_){} return; } const items=radiusItems.slice(); test=(lng,lat)=>items.some(c=>{ try{ return turf.distance(turf.point(c.center),turf.point([lng,lat]),{units:'kilometers'})<=c.radiusKm; }catch(_){ return false; } }); }
    else if(toolMode==='area'){ if(measurePoints.length<3){ try{ imToast(t('aiSumNoArea')); }catch(_){} return; } let poly; try{ poly=turf.polygon([[...measurePoints,measurePoints[0]]]); }catch(_){ return; } test=(lng,lat)=>{ try{ return turf.booleanPointInPolygon(turf.point([lng,lat]),poly); }catch(_){ return false; } }; }
    else return;
    window._newsAreaTest=test;
    if(currentMode!=='news'){ try{ const b=document.getElementById('btn-news'); if(b) b.click(); }catch(_){} }
    try{ startNews(); }catch(_){}
    showAreaNewsBanner();
  };
  window._clearNewsArea=function(){ window._newsAreaTest=null; const b=document.getElementById('area-news-banner'); if(b) b.remove(); try{ if(currentMode==='news'||currentMode==='saved') startNews(); }catch(_){} };
  function showAreaNewsBanner(){
    let b=document.getElementById('area-news-banner');
    if(!b){ b=document.createElement('div'); b.id='area-news-banner'; b.style.cssText='display:flex;align-items:center;gap:8px;justify-content:space-between;margin:0 0 8px;padding:7px 11px;border-radius:9px;background:rgba(10,132,255,0.12);border:1px solid var(--primary-color);font-size:12px;color:var(--text-main);';
      const feed=document.getElementById('live-news-feed'); if(feed&&feed.parentNode) feed.parentNode.insertBefore(b,feed); }
    b.innerHTML='<span>📍 '+(currentLang==='jp'?'選択範囲のニュースのみ表示中':currentLang==='de'?'Nur News im gewählten Bereich':currentLang==='ru'?'Показаны новости выбранной области':currentLang==='es'?'Mostrando noticias del área seleccionada':'Showing news in the selected area')+'</span><button onclick="window._clearNewsArea()" style="background:none;border:none;color:var(--primary-color);font-weight:700;cursor:pointer;font-size:12px;white-space:nowrap;">✕ '+(currentLang==='jp'?'解除':currentLang==='de'?'Aufheben':currentLang==='ru'?'Сбросить':currentLang==='es'?'Quitar':'Clear')+'</button>';
  }

  /* ===== AI FEATURE 3: spatial news summarization (radius / area) =====
     Collect the news pins whose coordinates fall inside the drawn circle(s) or polygon,
     then ask the LLM for a ~3-line geopolitical read on the region. */
  /* Shared report+run used by BOTH the drawn-area summary and the live-view summary. */
  function _aiAreaSummarize(uniq, titleKey){
    const rep=aiReport({ title:t(titleKey), sub:t('aiSumSub').replace('{n}',uniq.length) });
    const run=async()=>{
      rep.setLoading(t('aiThinking'));
      try{
        const lines=uniq.map((p,i)=>`${i+1}. [${p.name||'?'}] ${p.title||''}${p.publisher?' ('+p.publisher+')':''}`).join('\n');
        const sys = (currentLang==='jp'
          ? "あなたは地政学アナリストです。以下は、ある地理的範囲内で報じられているニュース見出しの一覧です。この地域で今何が起きているのかを地政学的観点から、日本語で簡潔に3行程度に要約してください。各行は「・」で始めてください。与えられた見出しの範囲内で述べ、過度な推測は避けてください。"
          : "You are a geopolitical analyst. Below are news headlines reported within a single geographic area. In about three concise lines, summarize what is happening in this region from a geopolitical perspective. Begin each line with '- '. Stay grounded in the given headlines and avoid over-speculation.")+window._aiLangLine();
        const out=await askAI('Headlines:\n'+lines, sys);
        rep.setBody(out||'');
      }catch(e){ rep.setError((e&&e.message)||t('aiError'), run); }
    };
    run();
  }
  /* AI FEATURE 3b: summarize the news pins inside the CURRENT camera viewport (always-on button,
     no measure tool needed). Uses the rendered pins, falling back to all analyzed stories. */
  async function aiSummarizeView(){
    if(!aiGate()) return;
    if(!GE().hasRenderer()) return;
    const b=GE().camera.getBounds(); if(!b) return;
    const seen=new Set(), picked=[];
    const src=(newsFeatures&&newsFeatures.length)
      ? newsFeatures.map(f=>({c:f.geometry&&f.geometry.coordinates, p:f.properties||{}}))
      : globalData.filter(it=>it.analysis&&it.analysis.loc).map(it=>({c:it.analysis.loc, p:{name:it.analysis.name,title:it.title,publisher:it.publisher,link:it.link}}));
    src.forEach(o=>{ const c=o.c,p=o.p; if(!c) return; let inb=false; try{ inb=b.contains(c); }catch(_){ } if(!inb) return; const k=p.link||p.title; if(seen.has(k)) return; seen.add(k); picked.push(p); });
    const uniq=picked.slice(0,40);
    if(!uniq.length){ aiToast(t('aiSumNoNews')); return; }
    _aiAreaSummarize(uniq,'aiViewSumTitle');
  }
  { const vb=document.getElementById('ai-view-summary-btn'); if(vb) vb.onclick=aiSummarizeView; }
  aiButtonSyncers.push(function(){ const b=document.getElementById('ai-summarize-btn'); if(!b) return; b.classList.toggle('ai-needs-key',!aiReady()); b.title=aiReady()?'':t('aiNoKey'); });
  /* (#R169) moved verbatim to js/map-readout.js — see Architecture.md §3.1. */

  /* ===== Coord readout (coords + elevation/depth) ===== */
  let elevTimer=null, lastElev='', _elevSeq=0, _crLng=null, _crLat=null, lastLayerVal='';
  /* (#R169) moved verbatim to js/map-readout.js — see Architecture.md §3.1. */
  /* (#R19) Hard cap on retained DEM tiles (LRU): a 400 km Line-of-Sight at z13 touches hundreds of
     tiles; each cached 256² canvas+pixels is ~½ MB, and they previously accumulated FOREVER — a real
     mobile OOM vector ("重い動作をすると頻繁にブラウザが落ちます"). Map preserves insertion order, so
     evicting the first non-loading entries is a cheap LRU. */
  const _DEM_CACHE_MAX=(typeof isMobile==='function'&&isMobile())?140:560;   /* (#R21) follows the raised desktop LOS tile budget */
  /* (#R169) moved verbatim to js/map-readout.js — see Architecture.md §3.1. */
  /* (#R169) moved verbatim to js/elevation-profile.js — see Architecture.md §3.1. */
  /* (#R169) moved verbatim to js/map-readout.js — see Architecture.md §3.1. */
  window.fmtElevVal=fmtElevVal;
  function elevText(e){ return e<0 ? `${t('depth')} ${fmtElevVal(Math.abs(e))}` : `${t('elev')} ${fmtElevVal(e)}`; }
  /* (#R169) moved verbatim to js/map-readout.js — see Architecture.md §3.1. */
  /* Warm the DEM tile cache across the visible area once the camera settles, so the
     elevation/depth readout is instant on hover (kills the first-hover network wait). */
  function prefetchDEMViewport(){
    if(!GE().hasRenderer()||isMobile()) return;
    try{ const z=demZoomForMap(); const b=GE().camera.getBounds(), w=b.getWest(),e=b.getEast(),s=b.getSouth(),n=b.getNorth(), STEP=6;
      for(let i=0;i<=STEP;i++) for(let j=0;j<=STEP;j++) demElevAt(w+(e-w)*i/STEP, s+(n-s)*j/STEP, null, z);
    }catch(_){}
  }
  let _demPrefetchT=null;
  if(GE().hasRenderer()){ GE().events.on('moveend',()=>{ clearTimeout(_demPrefetchT); _demPrefetchT=setTimeout(prefetchDEMViewport,200); });
           GE().events.on('zoomend',()=>{ clearTimeout(_demPrefetchT); _demPrefetchT=setTimeout(prefetchDEMViewport,120); }); }
  /* (#R169) moved verbatim to js/map-readout.js — see Architecture.md §3.1. */

  /* ===== (#R119) IntMapLayers — the COMMON LAYER DATA CONTRACT ("Atlasが表示中レイヤーの実値を読める仕組み").
     Every registered layer exposes the same tiny interface:
       on()        → is it currently displayed
       label()     → localized display name
       sampleAt(lng,lat) → the REAL value at a point (number/string; may be async) — from the same live sources
                     the layer itself represents (Open-Meteo / marine / air-quality / Köppen pixel sample)
       featuresIn(bounds) → the actual FEATURES in view (point layers: webcams, news, volcanoes…)
       time() / source() / legend() / summary()
     Consumers: Atlas state context (per-layer live summary), the `layerData` action, and analyze evidence.
     Register new layers here in the SAME change that adds them (control-plane rule). ===== */
  /* (#R166) moved to js/map-ui.js — see Architecture.md §3.1. */
  window.IntMapModules.layerRegistry(IM_HOST);

  /* ===== Map event wiring ===== */
  if(GE().hasRenderer()){
    GE().events.on('click',(e)=>handleMapClick(e.lngLat.lng,e.lngLat.lat,e.point));
    /* (#R25 / #21) Double-tap / double-click zoom now respects the Zoom-sensitivity setting — this is the
       ONE zoom gesture whose amount we CAN tune on touch (MapLibre exposes no pinch-rate API, so continuous
       pinch stays 1:1 — a documented platform limit). The built-in doubleClickZoom is disabled in
       _applyNavSens so this is the sole double-tap zoom path. */
    GE().events.on('dblclick',(e)=>{ refreshTool(); hideMeasureTip();
      if(typeof toolMode!=='undefined' && toolMode) return;
      try{ const s=Math.max(0.25,Math.min(3,+window.imNavZoomSens||1));
        GE().camera.easeTo({zoom:GE().camera.getZoom()+s, around:(e&&e.lngLat)||GE().camera.getCenter(), duration:Math.round(260/Math.max(0.6,s))}); }catch(_){}
    });
    GE().events.on('mousemove',(e)=>{
      updateCoord(e.lngLat.lng,e.lngLat.lat);
      if(!toolMode||!hasTurf())return;
      const c=[e.lngLat.lng,Math.max(-88,Math.min(88,e.lngLat.lat))];   /* polar-safe (#10) */
      liveCursor=c;
      if(toolMode==='measure'&&measurePoints.length>=1){
        const last=measurePoints[measurePoints.length-1];
        /* Detect hover over the first vertex → snap-to-close (#47) */
        const wasSnap=measureSnapClose; measureSnapClose=false;
        if(measurePoints.length>=3){
          try{ const ps=GE().coords.project(measurePoints[0]); if(Math.hypot(ps.x-e.point.x,ps.y-e.point.y)<SNAP_PX) measureSnapClose=true; }catch(_){}
        }
        const tip=document.getElementById('measure-tooltip');
        if(measureSnapClose){ tip.classList.add('closing'); const ar=ringArea(measurePoints); showMeasureTip(e.point,`✓ ${t('measureClickClose')} · ${ar?areaTXT(ar):''}`); }
        else{ tip.classList.remove('closing'); const seg=turf.distance(turf.point(last),turf.point(c),{units:'kilometers'}); showMeasureTip(e.point,`+${distTXT(seg)} · ${bearingDeg(last,c).toFixed(0)}°${compassDir(bearingDeg(last,c))} | Σ ${distTXT(totalDistance([...measurePoints,c]))}`); }
        refreshTool();
      } else if(toolMode==='area'){
        if(measurePoints.length>=2) showMeasureTip(e.point, areaTXT(ringArea([...measurePoints,c])));
        refreshTool();
      }
    });
    GE().events.on('mouseout',()=>{ _crLng=null; if(currentMapType==='sat'){ renderCoordReadout(); } else { const _cr=document.getElementById('coord-readout'); if(_cr) _cr.style.display='none'; } liveCursor=null; if(toolMode) refreshTool(); });
    /* Coalesce occlusion updates to one per animation frame so dragging/spinning the globe stays smooth. */
    let _occRAF=0; const occOnMove=()=>{ if(_occRAF) return; _occRAF=requestAnimationFrame(()=>{ _occRAF=0; updateOcclusion(); }); };
    /* (#R33) Smoother MOBILE pan/zoom ("カクツク"): skip the per-frame occlusion recompute during a gesture on
       phones (it's the heaviest per-move work) and just settle it on moveend. Desktop keeps per-move. */
    const _occMob=()=>{ try{ return isMobile(); }catch(_){ return false; } };
    GE().events.on('move',()=>{ if(window.__fsCamActive) return; if(!_occMob()) occOnMove(); }); GE().events.on('moveend',()=>{ if(window.__fsCamActive) return; updateOcclusion(); });   /* (#R95) skip per-frame label declutter while the flight sim drives the camera */
    GE().events.on('rotate',updateCompass); GE().events.on('pitch',updateCompass);
    GE().events.on('moveend',refreshGrid); GE().events.on('zoomend',refreshGrid);
    GE().events.on('load',()=>{
      /* (#R178) the contract takes a MODE ('flat' | 'globe' | 'globe-true'), not a MapLibre projection
         spec — the point of the seam is that "a globe" is a request, and each engine decides what
         object expresses it. __imap is published at construction now (see there), not here. */
      try{ if(!/[?&]flat\b/.test(location.search)) GE().camera.setProjection('globe'); }catch(e){}
      ensureGeoLayers(); setupIntelLayers(); setupPinLayers(); applyTheme(); try{ satSetup(); }catch(_){} if(countryGeo)addCountryLayers(); renderUI();
      /* (#R207) the satellite default goes through the SAME kernel command the button does, so the
         provider controller and `_reassertBase` are set up identically. `IntMapOS.has` is real (it is
         defined beside `exec`), and the registration exists by the time this event fires. */
      try{ if(currentMapType==='sat') IntMapOS.exec('view.base.sat',{source:'default'}); }catch(_){}
      /* Belt-and-suspenders: re-ensure geopolitical layers once the map settles (covers slow CDN / projection timing). */
      GE().events.once('idle',()=>{ try{ ensureGeoLayers(); }catch(_){} try{ ensurePlaceLabels(); applyLabelLang(); }catch(_){} });
      /* (#R26) "デフォルト選択なのに地名ラベル/国境が出ない、再チェックで初めて出る": both default ON but
         occasionally weren't DRAWN on first load (OFM vector source + country data settle after the first
         idle). Re-assert the place labels + borders visibility a few times, and the moment the OFM source's
         tiles arrive — so names/borders appear on load without the user toggling them. */
      const _assertNamesBorders=()=>{ try{ ensurePlaceLabels(); applyLabelLang(); window._applyBorders(); }catch(_){} };
      [500,1400,3000].forEach(ms=>setTimeout(_assertNamesBorders,ms));
      GE().events.on('sourcedata',(e)=>{ if(e&&e.sourceId==='ofm'&&e.isSourceLoaded){ try{ ensurePlaceLabels(); applyLabelLang(); }catch(_){} } });
      /* (#R186) the real night sky behind the globe, and the whole-Earth floor under the satellite
         tiles. Both start here because both need a renderer; the sky decides for itself whether the
         conditions (dark theme, globe, an engine with no sky of its own) are met, and the floor is
         installed now — before anyone presses Satellite — precisely so that pressing it does not
         start with a wait. */
      try{ window.IntMapSky&&window.IntMapSky.start(); }catch(_){}
      /* (#R186) The floor's picture is 284 KB and decoding it is a few milliseconds — but neither is
         on the critical path of a map that is still settling. Register the protocol and the layer now
         (so pressing Satellite has nothing to set up), and pre-decode the picture when the browser is
         next idle. If Satellite is already on, apply() warms it immediately anyway. */
      try{ if(window.IntMapWorldBase){ window.IntMapWorldBase.install();
        window.IntMapWorldBase.apply(currentMapType==='sat');
        const _warm=()=>{ try{ window.IntMapWorldBase.warm(); }catch(_){} };
        if(window.requestIdleCallback) requestIdleCallback(_warm,{timeout:8000}); else setTimeout(_warm,3000);
      } }catch(_){}
      try{ _applySkyAtmosphere(currentMapType==='sat'); }catch(_){}
      /* (#R196) the horizon band follows where the camera is looking; the night side and the city
         lights build themselves the first time the camera is wide enough for either to be visible. */
      try{ GE().events.on('moveend',_skyFollowCamera); }catch(_){}
      try{ window.IntMapNightSide&&window.IntMapNightSide.apply(); }catch(_){}
      /* (#R197/#R201) the space explorer's mount() — three passive input listeners that only add up
         while the camera is standing on the zoom floor; nothing exists until the crossing happens */
      try{ window.IntMapModules.space(IM_HOST); window.IntMapSpace.mount(); }catch(_){}
      /* (#R186) LAUNCH-SCREEN MILESTONES 4 and 5. 4 is here: the style is parsed and the map is
         usable. 5 is "the default layers are actually painting" — 「完全に準備完了なるまで」 means
         the first thing the user sees should be the finished map, not a bare basemap that grows
         Köppen and the cables a second later. So the default-layer dispatch is FORCED rather than
         waited for, and the screen lifts on the idle after it.
         Both stages carry their own escape: an idle can be delayed indefinitely by one slow tile
         host, and a launch screen that outlives the app it is covering is the worse failure. */
      /* ══ (#R190) THE LAUNCH SCREEN WAS WAITING IN SERIES, AND LIFTING BEFORE THE END ═══════════════
         「初期画面のローディングが遅い。また、ローディング画面終了後も読み込みが終わっていない。
           これでは初期画面の意味がない。」

         Both halves of that came out of the same shape. #R186's sequence was:
             wait for idle #1  →  fire the default layers  →  wait 380 ms  →  wait for idle #2
         The default layers were not ASKED FOR until the basemap had already gone quiet, so their
         download (a multi-megabyte climate raster and the cable network) started after the basemap's
         instead of alongside it — the two waits ran end to end when they could have overlapped. That
         is the 「遅い」. And the second wait had a 3-second escape, so on exactly the slow load the
         escape exists for, the screen lifted with those layers still arriving — 「終了後も読み込みが
         終わっていない」.

         Now the default layers are fired IMMEDIATELY at style-ready, so everything downloads at once,
         and the screen lifts only when the map is idle AND the layers it was told to wait for are
         actually on the map. The escapes are still there — a launch screen that outlives its app is
         the worse failure (#R186) — but they are now the failure path rather than the normal one:
         20 s total, and the console says which milestone never arrived. */
      try{ if(window.__imBoot&&!window.__imBoot.isDone()){
        window.__imBoot.set(80,'style');
        /* concurrently, not after: this is the whole speed-up */
        try{ window.__imFireDefaultLayers&&window.__imFireDefaultLayers(); }catch(_){}
        window.__imBoot.set(88,'layers-fired');
        /* ⚠ (#R190) THE ENDING NAMES ARE A CONTRACT, NOT A LABEL. tests/r186 asserts that exactly ONE
           of `idle` / `timeout` / `no-renderer` is recorded — "a launch screen that lifts without
           saying why is the failure mode", in its own words. The first draft here invented
           `idle-timeout` and `layers-timeout`, which are outside that vocabulary, so on a runner slow
           enough to take an escape the screen lifted correctly and the test found NO ending at all
           (measured in CI: layers painted at 9,290 ms, escape at 12,134 ms, zero recognised endings).
           It passed elsewhere only because those runners reached `idle` first — a latent flake.
           Which escape fired is still said, in the console, where a diagnosis is read. */
        let ended=false;
        const go=(why)=>{ if(ended) return; ended=true; try{ window.__imBoot.done(why||'idle'); }catch(_){} };
        /* "the default layers are actually painting" — asked of the renderer, never of a checkbox
           (#R170: `isStyleLoaded()` is not "may I add layers", and a ticked box is not a drawn layer). */
        const _pending=()=>{ let n=0; try{
            (window.IntMapDefaultLayers||[]).forEach(id=>{
              const cb=document.getElementById(id);
              if(!cb||!cb.checked) return;                       /* the user's own session may not want it */
              const p=window.__imLayerPainted&&window.__imLayerPainted(id);
              if(p===false) n++;                                 /* null = "no id table" → nothing to wait for */
            });
          }catch(_){}
          return n; };
        let waits=0;
        const settle=()=>{ if(ended) return;
          const left=_pending();
          try{ window.__imBoot.set(left?92:97,'layers'); }catch(_){}
          if(!left){ try{ GE().events.once('idle',()=>go('idle')); }catch(_){ go('idle'); }
            setTimeout(()=>{ if(!ended) console.warn('[boot] the layers are painted but the map did not go idle within 2.5 s — revealing anyway'); go('timeout'); },2500); return; }
          if(++waits>28){ console.warn('[boot] default layers still not on the map after ~14 s — revealing anyway'); go('timeout'); return; }
          setTimeout(settle,500); };
        try{ GE().events.once('idle',settle); }catch(_){ setTimeout(settle,900); }
        setTimeout(settle,4000);
      } }catch(_){}
    });
    /* (#R23) WebGL context-loss recovery — some browsers (notably Edge on flaky GPU drivers) drop the GL
       context and leave a BLACK canvas ("Edgeでは地図が黒くて見えない"). Preventing the default lets the
       browser restore the context, and on restore we force a fresh repaint + re-assert our layers. */
    try{ const _cv=GE().render.canvas&&GE().render.canvas(); if(_cv&&_cv.addEventListener){
      _cv.addEventListener('webglcontextlost',(ev)=>{ try{ ev.preventDefault(); }catch(_){} },false);
      _cv.addEventListener('webglcontextrestored',()=>{ try{ GE().render.resize(); GE().render.triggerRepaint(); ensureGeoLayers(); applyTheme(); }catch(_){} },false);
    } }catch(_){}
    GE().events.on('styledata',()=>{ ensureGeoLayers(); setupIntelLayers(); setupPinLayers(); });
    GE().events.on('contextmenu',(e)=>{ e.preventDefault();
      let pt=e.point, ll=e.lngLat;
      /* (#R16) On mobile the interaction is center-fixed (crosshair). A long-press anywhere acts on the
         CROSSHAIR point and the menu opens there (always on-screen) — the old behavior opened it under the
         finger, often off the edge / behind the sheet ("画面からはみ出して何も見えない"). */
      try{ if(window._mCenterLL && window.matchMedia && window.matchMedia('(max-width:768px)').matches){ const c=window._mCenterLL(); pt={x:c.px.x,y:c.px.y}; ll={lng:c.lng,lat:c.lat}; } }catch(_){}
      showContextMenu(pt, ll); });
    /* Long-press → context menu on touch devices */
    (function(){
      const canvas=GE().render.canvas(); let pressTimer=null, startPt=null, fired=false;
      canvas.addEventListener('touchstart',(e)=>{
        if(e.touches.length!==1) return;
        const tx=e.touches[0].clientX, ty=e.touches[0].clientY;
        const rect=canvas.getBoundingClientRect();
        startPt={x:tx-rect.left,y:ty-rect.top}; fired=false;
        /* (#R13) Long-press → context menu re-enabled. The center "Add point" button now only appears
           while a measurement tool is active (per the user), so long-press is again the way to reach the
           right-click menu on touch when idle. Suppressed while a tool is active (the button handles that). */
        if(typeof toolMode!=='undefined' && toolMode) return;
        pressTimer=setTimeout(()=>{ fired=true; try{ const ll=GE().coords.unproject([startPt.x,startPt.y]); showContextMenu({x:startPt.x,y:startPt.y}, ll); }catch(_){} }, 550);
      },{passive:true});
      const cancel=(e)=>{
        if(pressTimer){ clearTimeout(pressTimer); pressTimer=null; }
        if(fired && e.cancelable){ e.preventDefault(); }
      };
      canvas.addEventListener('touchmove',(e)=>{
        if(!startPt||!e.touches.length){cancel(e); return;}
        const rect=canvas.getBoundingClientRect();
        const dx=e.touches[0].clientX-rect.left-startPt.x, dy=e.touches[0].clientY-rect.top-startPt.y;
        if(Math.hypot(dx,dy)>12) cancel(e);
      },{passive:true});
      canvas.addEventListener('touchend',cancel,{passive:false});
      canvas.addEventListener('touchcancel',cancel,{passive:true});
    })();
    /* Reposition pin popup on every render — keeps it pinned to lng/lat with no drift */
    GE().events.on('render',()=>{ if(activePinId!=null) positionPinPopup(); });
  }
  document.getElementById('btn-tool-grid').onclick=toggleGrid;
  { const _gcb=document.getElementById('cb-grid'); if(_gcb) _gcb.onchange=(e)=>setGrid(e.target.checked); }   /* (#R10/#R38) Grid in Layers — drive state FROM the box (idempotent) so a re-asserted change can't re-enable it */
  document.getElementById('btn-tool-measure').onclick=()=>{ setTool('measure'); if(window._closeMeasureMenu)window._closeMeasureMenu(); };
  document.getElementById('btn-tool-radius').onclick=()=>{ setTool('radius'); if(window._closeMeasureMenu) window._closeMeasureMenu(); };   /* (#R151) Radius is a Measure-menu item → close the menu after picking it */
  /* (#R170) 3-D volume — same Measure menu, same point-collection path as Distance/Area (measurePoints); the
     altitude band and the extrusion live in js/volume3d.js. */
  { const bv=document.getElementById('btn-tool-volume'); if(bv) bv.onclick=()=>{ setTool('volume'); if(window._closeMeasureMenu) window._closeMeasureMenu(); }; }
  /* (#R9) "Measure ▾" groups Measure + Draw under one trigger; click-away closes it. */
  (function(){
    const c=document.querySelector('.measure-menu-container'), trig=document.getElementById('btn-measure-menu');
    window._closeMeasureMenu=()=>{ if(c) c.classList.remove('open'); };
    if(trig){ trig.onclick=(e)=>{ e.stopPropagation(); if(c) c.classList.toggle('open'); }; }
    document.addEventListener('click',(e)=>{ if(c && !c.contains(e.target)) c.classList.remove('open'); });
    const dr=document.getElementById('btn-tool-draw'); if(dr) dr.addEventListener('click',()=>window._closeMeasureMenu&&window._closeMeasureMenu());
  })();
  /* (#R151) "Share ▾" groups Screenshot + link/share under one trigger (mirrors the Measure menu); click-away + item-click close it.
     The item buttons keep their original ids (#btn-screenshot / #btn-share) so their existing handlers are unchanged. */
  (function(){
    const c=document.querySelector('.share-menu-container'), trig=document.getElementById('btn-share-menu');
    window._closeShareMenu=()=>{ if(c) c.classList.remove('open'); };
    if(trig){ trig.onclick=(e)=>{ e.stopPropagation(); if(c) c.classList.toggle('open'); }; }
    document.addEventListener('click',(e)=>{ if(c && !c.contains(e.target)) c.classList.remove('open'); });
    ['btn-screenshot','btn-share'].forEach(id=>{ const b=document.getElementById(id); if(b) b.addEventListener('click',()=>window._closeShareMenu&&window._closeShareMenu()); });
  })();
  /* (#R169) moved verbatim to js/map-readout.js — see Architecture.md §3.1. */
  document.getElementById('btn-compass').onclick=()=>GE().camera.easeTo({bearing:0,pitch:0,duration:500});
  /* (#R152) DESKTOP: right-click the compass → a popup to type an EXACT bearing / pitch (elevation) / zoom, applied to
     the current view ("方位磁針ボタンを右クリックしたら、方角、視点の仰角等を数値で打ち込めるポップアップ"). Left-click still resets north. */
  (function(){ const btn=document.getElementById('btn-compass'); if(!btn) return; let pop=null;
    const CL=(en,jp,de,ru,es)=>currentLang==='jp'?jp:currentLang==='de'?de:currentLang==='ru'?ru:currentLang==='es'?es:en;
    function closePop(){ if(pop){ try{ pop.remove(); }catch(_){} pop=null; document.removeEventListener('mousedown',onDoc,true); document.removeEventListener('keydown',onKey,true); } }
    function onDoc(e){ if(pop && !pop.contains(e.target) && e.target!==btn) closePop(); }
    function onKey(e){ if(e.key==='Escape') closePop(); }
    btn.addEventListener('contextmenu',(e)=>{ e.preventDefault(); if(!GE().hasRenderer()) return;
      try{ if(typeof _imTouchPrimary==='function' && _imTouchPrimary()) return; }catch(_){}   /* desktop only, per the request */
      if(pop){ closePop(); return; }
      const b=Math.round(((GE().camera.getBearing()%360)+360)%360), p=Math.round(GE().camera.getPitch()||0), z=Math.round((GE().camera.getZoom()||0)*10)/10;
      /* (#R171) With the tilt limit set to Unlimited this field takes ANY angle from 0 to 360: past 180° the
         camera comes back down the far side with the bearing reversed (IntMapTilt.fromAngle), which is the
         one place "keep tilting round" is expressible without re-implementing the drag gesture. */
      const _unl=(()=>{ try{ return !!(window.IntMapTilt&&window.IntMapTilt.isUnlimited()); }catch(_){ return false; } })();
      const maxP=_unl?360:Math.round((GE().camera.getMaxPitch&&GE().camera.getMaxPitch())||85);
      pop=document.createElement('div'); pop.className='compass-num-pop';
      pop.innerHTML='<div class="cnp-t">'+CL('Set view','視点を設定','Ansicht einstellen','Задать вид','Definir vista')+'</div>'
        +'<label>'+CL('Bearing','方位','Richtung','Азимут','Rumbo')+' (°)<input type="number" id="cnp-bear" min="0" max="360" step="1" value="'+b+'"></label>'
        +'<label>'+CL('Pitch','仰角','Neigung','Наклон','Inclinación')+' (°)<input type="number" id="cnp-pitch" min="0" max="'+maxP+'" step="1" value="'+p+'"></label>'
        +'<label>'+CL('Zoom','ズーム','Zoom','Масштаб','Zoom')+'<input type="number" id="cnp-zoom" min="0" max="22" step="0.1" value="'+z+'"></label>'
        +'<div class="cnp-btns"><button id="cnp-apply">'+CL('Apply','適用','Übernehmen','Применить','Aplicar')+'</button><button id="cnp-reset" class="cnp-sec">'+CL('North','北','Norden','Север','Norte')+'</button></div>';
      document.body.appendChild(pop);
      const r=btn.getBoundingClientRect(); pop.style.top=Math.round(r.bottom+6)+'px'; pop.style.left=Math.round(Math.max(8,Math.min(r.left, window.innerWidth-pop.offsetWidth-10)))+'px';
      const apply=()=>{ const bb=parseFloat(pop.querySelector('#cnp-bear').value), pp=parseFloat(pop.querySelector('#cnp-pitch').value), zz=parseFloat(pop.querySelector('#cnp-zoom').value);
        const opt={duration:500}; if(isFinite(bb)) opt.bearing=((bb%360)+360)%360; if(isFinite(pp)) opt.pitch=Math.max(0,Math.min(maxP,pp)); if(isFinite(zz)) opt.zoom=Math.max(0,Math.min(22,zz));
        /* (#R171) an angle past the top is the same view aimed the other way — resolve it into a real
           (pitch, bearing) pair rather than clamping it flat against the ceiling. */
        if(_unl&&isFinite(pp)&&pp>180){ try{ const r=window.IntMapTilt.fromAngle(pp, isFinite(bb)?bb:GE().camera.getBearing()); opt.pitch=r.pitch; opt.bearing=r.bearing; }catch(_){} }
        try{ GE().camera.easeTo(opt); }catch(_){} closePop(); };
      pop.querySelector('#cnp-apply').onclick=apply;
      pop.querySelector('#cnp-reset').onclick=()=>{ try{ GE().camera.easeTo({bearing:0,pitch:0,duration:500}); }catch(_){} closePop(); };
      pop.addEventListener('keydown',(ev)=>{ if(ev.key==='Enter'){ ev.preventDefault(); apply(); } });
      setTimeout(()=>{ document.addEventListener('mousedown',onDoc,true); document.addEventListener('keydown',onKey,true); const f=pop.querySelector('#cnp-bear'); if(f){ f.focus(); f.select(); } },0);
    });
  })();

  /* (#R169) moved verbatim to js/search-geocode.js — see Architecture.md §3.1. */
  /* (#R15 / #32) Mobile place search was broken: the search field collapses to a 46px circle on phones
     (input width:0, opacity:0) and nothing ever expanded it, so tapping Search just ran doGeocode() on an
     invisible empty input → no results. Now the button expands the field first, then searches. */
  (function wireMapSearch(){
    const box=document.getElementById('map-search'), btn=document.getElementById('ms-btn'), inp=document.getElementById('ms-input'), res=document.getElementById('ms-results');
    if(!box||!btn||!inp) return;
    const mob=()=>window.matchMedia('(max-width:768px)').matches;
    const collapse=()=>{ box.classList.remove('ms-open'); if(res) res.style.display='none'; };
    btn.onclick=()=>{
      if(mob() && !box.classList.contains('ms-open')){ box.classList.add('ms-open'); setTimeout(()=>{ try{ inp.focus(); }catch(_){}} ,60); return; }
      if(mob() && !inp.value.trim()){ collapse(); return; }
      doGeocode();
    };
    inp.addEventListener('keydown',(e)=>{ if(e.key==='Enter') doGeocode(); });
    /* (#R106) blue only while the field has text — toggle a class the CSS keys off. */
    const _msHas=()=>{ try{ box.classList.toggle('has-text', !!inp.value.trim()); }catch(_){} };
    inp.addEventListener('input',_msHas); _msHas();
    /* (#R16) Warm the bundled country data the moment the user reaches for search, so country/capital
       names match LOCALLY (instant, offline) by the time they finish typing — without slowing startup. */
    inp.addEventListener('focus',()=>{ try{ if(typeof loadCountryData==='function') loadCountryData(); }catch(_){} },{once:true});
    btn.addEventListener('pointerdown',()=>{ try{ if(typeof loadCountryData==='function') loadCountryData(); }catch(_){} },{once:true});
    document.addEventListener('click',(e)=>{ if(mob() && box.classList.contains('ms-open') && !box.contains(e.target) && !inp.value.trim()) collapse(); });
  })();
  document.addEventListener('click',(e)=>{ const ms=document.getElementById('map-search'); if(ms&&!ms.contains(e.target)) document.getElementById('ms-results').style.display='none'; });

  /* (#R200) moved to js/layer-dropdown.js — a real ES module (see the import at the top of this file), not a
     window.IntMapModules entry and not a line in src/main.js's ordered list. */
  _IM_LDROP = makeLayerDropdown(IM_HOST, { GE });
  /* ===== (#R62) RIGHT layer sidebar (opt-in via Settings → Layer panel) — the layer list REPARENTED into a
     full-height right sidebar that mirrors the left one, with a search box and a PREVIEW SQUARE on every row
     (real tile thumbnails where a stable endpoint exists, a deterministic colour swatch + icon otherwise).
     The existing #layer-dropdown node moves as-is, so every checkbox/slider/handler keeps working. ===== */
  /* ===== (#R70) LAYER PREVIEW ENGINE — an example image for EVERY layer ("例画像が全く準備できていない。
     10程度でいいわけがない"). No shipped binaries: each preview is derived from the layer's OWN source —
     a real example tile (GIBS / Esri / OpenRailwayMap / OpenSeaMap / Terrascope / RainViewer / Köppen PNG),
     a real mini-choropleth painted from the layer's own data + its own color ramp (countryStats client data,
     or the SAME cached World-Bank loader the layer itself uses — fetched lazily, only when the tile scrolls
     into view, max 2 in flight), real member sets (NATO/EU/FSU), the real geoLayersDB geometry (chokepoints,
     island chains, pipelines…), live USGS quakes, a real day/night terminator — and a hand-drawn
     REPRESENTATIVE sketch only where the layer's data is a live stream that cannot be sampled cheaply. ===== */
  window.IntMapLayerPreviews=window.IntMapModules.layerPreviews(countryStats,geoLayersDB,loadCountryData);   /* (#R162) moved to js/layer-previews.js — see Architecture.md "File layout". */
  /* (#R166) moved to js/map-ui.js — see Architecture.md §3.1. */
  window.IntMapModules.layerSidebar(IM_HOST);
  /* ===== (#R63) BOTTOM TICKER ("設定から選択すれば、画面下部に最新ニュースや為替、株価やその他指標が取引所の
     ように流れる画面") — a thin exchange-style strip BELOW the map area (the app shell shrinks by 30px; nothing
     overlays the map), scrolling right→left: loaded news headlines (clickable), FX (fxratesapi → er-api fallback),
     stock indices (Stooq via the CORS-proxy ladder), gold/silver (gold-api) and BTC/ETH (CoinGecko). Default OFF
     (Settings → Bottom ticker). Desktop only (mobile uses the bottom sheet). ===== */
  /* ================= (#R78) WORKSPACE MODE ("動画編集ソフトのように、ユーザー自身が自由にIntMapのウィンドウを
     大きさ変更したり組み替えたりできるモード") =================
     Settings → "Window workspace": the LEFT PANEL, the MAP, the LAYERS sidebar and the top-right MAP CONTROLS
     each become a real desktop-style window on an empty workspace — freely placed, dragged by the title bar,
     resized from any edge/corner (the existing R47 window manager), raised on click, collapsible (traffic-light
     buttons: hide / collapse-to-bar / maximize, macOS-style but themed with the app's iOS glass variables),
     with a bottom DOCK to reopen hidden windows, reset the layout, or exit the mode. Layout persists.
     Default OFF; desktop only; disable restores the exact original DOM via placeholders (fully additive). */
  /* (#R164) moved to js/workspace.js — see Architecture.md §3.1. */
  window.IntMapWorkspace=window.IntMapModules.workspace(IM_HOST);
  /* (#R166) moved to js/map-ui.js — see Architecture.md §3.1. */
  window.IntMapModules.ticker(IM_HOST);
  document.querySelectorAll('.geo-layer-cb').forEach(cb=>cb.addEventListener('change',()=>{
    /* Rimland is a country-fill (land only, #17), not a drawn polygon — route it to its own toggle. */
    if(cb.getAttribute('data-layer')==='rimland'){ if(window.imToggleRimland) window.imToggleRimland(cb.checked); return; }
    /* Former Soviet Union is a red country-fill (#15) — route it to its own toggle too. */
    if(cb.getAttribute('data-layer')==='fsu'){ if(window.imToggleFSU) window.imToggleFSU(cb.checked); return; }
    ensureGeoLayers(); updateGeoLayers();
    /* (#R19) Every geo/strategic layer gets a floating legend with an opacity slider on toggle-ON
       ("どのレイヤーも透明度選択ができるように"); hidden again on toggle-OFF. */
    try{
      const key=cb.getAttribute('data-layer'); if(!key) return;
      if(!cb.id) cb.id='geocb-'+key;
      if(cb.checked && window._registerLayerOpacity){
        const lab=cb.closest('label');
        const nameEl=lab&&(lab.querySelector('.geo-label')||lab.querySelector('span:not(.lyr-sw):not(.lfc-sw):not(.lsr-thumb)'));
        const name=((nameEl?nameEl.textContent:(lab?lab.textContent:key))||key).replace(/★/g,'').trim();
        window._registerLayerOpacity('geo-'+key,[name,name],['-fill','-edge','-glow','-casing','-line','-pt','-label'].map(s=>key+s),cb.id);
      } else if(!cb.checked && window._hideGenericLegend){ window._hideGenericLegend('geo-'+key); }
    }catch(_){}
  }));
  document.getElementById('cb-names').addEventListener('change',(e)=>{ namesOn=e.target.checked; applyTheme();
    /* (#R34) "Place namesが反応しない" — the OFM label layers are added inside ensurePlaceLabels and the vector
       source can finish loading a beat AFTER the first applyTheme, so a single call sometimes toggled nothing.
       Re-assert the label layers a few times so the toggle always lands. */
    [120,400,1000].forEach(ms=>setTimeout(()=>{ try{ ensurePlaceLabels(); applyLabelLang(); window._raiseLabelLayers&&window._raiseLabelLayers(); }catch(_){} },ms)); });
  /* (#R41) separate water/terrain label toggle ("水域や地形のラベルは別チェックで") */
  { const _gl=document.getElementById('cb-geolabels'); if(_gl) _gl.addEventListener('change',(e)=>{ geoLabelsOn=e.target.checked;
    const ap=()=>{ try{ ensurePlaceLabels(); applyLabelLang(); window._raiseLabelLayers&&window._raiseLabelLayers(); }catch(_){} };
    ap(); [120,400,1000].forEach(ms=>setTimeout(ap,ms)); }); }
  /* (#R186) shop / facility names — the same shape as the two toggles above it, including the
     re-assert schedule: the OFM vector source can finish loading a beat after the first apply, and
     #R34 already recorded that a single call sometimes toggles nothing. */
  { const _po=document.getElementById('cb-poi'); if(_po) _po.addEventListener('change',(e)=>{ poiOn=e.target.checked;
    const ap=()=>{ try{ ensurePlaceLabels(); applyLabelLang(); window._raiseLabelLayers&&window._raiseLabelLayers(); }catch(_){} };
    ap(); [120,400,1000].forEach(ms=>setTimeout(ap,ms)); }); }
  document.getElementById('cb-borders').addEventListener('change',(e)=>{
    bordersOn=e.target.checked;
    /* (#R40) Now sourced from the OFM `boundary` layer (see ensureBordersLayer). Same retry treatment as
       roads/rail — the `ofm` vector source often settles AFTER the first cold toggle, so re-assert on idle +
       a backoff + when the OFM tiles arrive (the sourcedata listener below), else borders only appeared
       after a reload. */
    const mkBorders=()=>{ try{ if(!GE().hasRenderer()) return;
      if(bordersOn) ensureBordersLayer();
      window._applyBorders();   /* (#R94g) governs modern OR historical borders (whichever the clock wants) — one toggle */
      applyTheme();
    }catch(_){} };
    if(bordersOn){
      if(!canDraw()){ GE().events.once('idle',mkBorders); }
      mkBorders();
      [250,700,1600,3200].forEach(ms=>setTimeout(mkBorders,ms));
    } else { mkBorders(); }
  });
  document.getElementById('cb-countries').addEventListener('change',(e)=>{ countryInfoOn=e.target.checked;
    /* (#R29) ROBUST: a basemap style swap (Map↔Sat) drops the `countries` source + `country-fill` layer,
       but countryDataLoaded stays true — so the old `else applyCountryVisibility()` path was a no-op and
       Countries(info) "使えなくなっていた". Always RE-ENSURE the layers exist before showing them. */
    const ensure=()=>{ try{ if(countryInfoOn && countryGeo && canDraw() && !GE().layers.hasSource('countries')) addCountryLayers(); }catch(_){} applyCountryVisibility(); };
    if(countryInfoOn && !countryDataLoaded){ loadCountryData().then(ensure); } else ensure();
    if(!countryInfoOn) hideCountryInfo(); });

  /* (#R32) State/prefecture borders + road network + railways ("州界、県界や道路網、鉄道なども表示できるように").
     Drawn from the SAME OpenFreeMap/OpenMapTiles vector source already used for labels — `boundary`
     (admin_level 3–4 = states/provinces/prefectures) and `transportation` (road classes + rail). Rendered
     UNDER the place labels so names stay readable. Theme-independent muted colors that read on light & dark. */
  /* (#R40) Country borders drawn from the OSM-based OFM `boundary` source (admin_level 2) rather than the
     generalized Natural Earth geojson, so the lines align exactly with the OSM basemap & coastlines
     ("国境線が実際とずれる" → accurate where possible). Same reliable `ofm` path as state/road/rail (no
     countryGeo dependency → also fixes "borders only after reload"). */
  function ensureBordersLayer(){ try{
    if(!canDraw()) return false;
    ensurePlaceLabels(); if(!GE().layers.hasSource('ofm')) return false;
    if(!GE().layers.has('borders-only-line')){
      const before=['ofm-country','ofm-city','ofm-other'].find(id=>GE().layers.get(id)) || (GE().layers.has('tool-poly')?'tool-poly':undefined);
      GE().layers.add({id:'borders-only-line',type:'line',source:'ofm','source-layer':'boundary',
        filter:['all',['==',['get','admin_level'],2],['!=',['get','maritime'],1]],
        layout:{visibility:bordersOn?'visible':'none','line-join':'round'},
        /* (#R210) WHITE and ~2x thicker (国境線は白・太く). `borders-only-casing` goes UNDER it so white still reads over a pale basemap; both are driven together by _applyBorders/cb-borders.
           (#R212) 「国境線は少しだけ灰色に。…両者とも少しだけ細く。」 — pure white against a pale basemap is
           the same value as the basemap, so it now sits one step down the grey scale, and both widths
           come back ~15 %. The same colour and the same ladder are used by the HISTORICAL border layer
           (js/time-borders.js `imtb-line`), because 「歴史的国境線も同じものに統一」 — one line for
           «this is a national border», whichever year is on the clock. */
        paint:{'line-color':BORDER_COLOR,'line-opacity':0.95,'line-width':BORDER_WIDTH}}, before);
      if(!GE().layers.has('borders-only-casing')) GE().layers.add({id:'borders-only-casing',type:'line',source:'ofm','source-layer':'boundary',filter:['all',['==',['get','admin_level'],2],['!=',['get','maritime'],1]],layout:{visibility:bordersOn?'visible':'none','line-join':'round'},paint:{'line-color':'#000000','line-opacity':0.35,'line-width':BORDER_CASING}}, 'borders-only-line');
    }
    return true; }catch(e){ return false; } }
  window.ensureBordersLayer=ensureBordersLayer;
  function ensureRefLayers(){
    try{
      if(!canDraw()) return false;
      ensurePlaceLabels();                                  /* guarantees the `ofm` vector source exists */
      if(!GE().layers.hasSource('ofm')) return false;
      const before = GE().layers.has('ofm-country') ? 'ofm-country' : undefined;   /* keep lines below labels */
      if(!GE().layers.has('ref-admin1')) GE().layers.add({id:'ref-admin1',type:'line',source:'ofm','source-layer':'boundary',
        filter:['all',['>=',['get','admin_level'],3],['<=',['get','admin_level'],4],['!=',['get','maritime'],1]],
        layout:{visibility:'none','line-join':'round'},
        paint:/* (#R210) thicker too (地方区分). Kept violet on purpose — only the NATIONAL border was asked to go white; two white lines would erase country-vs-province.
                 (#R212) 「地方区分は少しだけ明るい色に。両者とも少しだけ細く。」 — same violet hue, one step
                 brighter so it separates from a dark basemap, and the same ~15 % off the widths. */
              {'line-color':ADMIN1_COLOR,'line-opacity':0.82,'line-dasharray':[3,2],'line-width':ADMIN1_WIDTH}}, before);
      if(!GE().layers.has('ref-roads')) GE().layers.add({id:'ref-roads',type:'line',source:'ofm','source-layer':'transportation',minzoom:4,
        filter:['in',['get','class'],['literal',['motorway','trunk','primary','secondary']]],
        layout:{visibility:'none','line-join':'round','line-cap':'round'},
        paint:{'line-color':['match',['get','class'],'motorway','#f5a623','trunk','#f5a623','primary','#e8a94e','#d9b878'],'line-opacity':0.8,'line-width':['interpolate',['linear'],['zoom'],5,0.4,10,1.6,14,3.4]}}, before);
      /* (#R41) Railways: gray was still hard to see ("灰色は視認性が悪すぎる"). Render the standard two-part rail
         symbol that reads on BOTH light AND dark basemaps: a strong dark SOLID base (visible on light terrain)
         with WHITE cross-tie dashes on top (visible on dark/satellite). */
      if(!GE().layers.has('ref-rail')) GE().layers.add({id:'ref-rail',type:'line',source:'ofm','source-layer':'transportation',minzoom:5,
        filter:['==',['get','class'],'rail'],
        layout:{visibility:'none','line-join':'round','line-cap':'butt'},
        paint:{'line-color':'#2b2f36','line-opacity':0.96,'line-width':['interpolate',['linear'],['zoom'],5,1.1,9,2.2,12,3.6,15,5.2]}}, before);
      if(!GE().layers.has('ref-rail-dash')) GE().layers.add({id:'ref-rail-dash',type:'line',source:'ofm','source-layer':'transportation',minzoom:6,
        filter:['==',['get','class'],'rail'],
        layout:{visibility:'none','line-join':'round','line-cap':'butt'},
        paint:{'line-color':'#f4f6fa','line-opacity':0.95,'line-dasharray':[1.4,3.2],'line-width':['interpolate',['linear'],['zoom'],6,1,9,1.8,12,2.8,15,4]}}, before);
      return true;
    }catch(e){ console.warn('ensureRefLayers',e); return false; }
  }
  window.ensureRefLayers=ensureRefLayers;
  function _wireRef(cbId,layerId){ const cb=document.getElementById(cbId); if(!cb) return;
    /* (#R38) Apply from the LIVE box state, and re-assert several times + when the OFM vector tiles arrive.
       Root of "Roads/Railways/State borders をチェックしても表示されない、再読み込みで治る": the `ofm` source/layer
       often settled AFTER the single 400ms retry, so the visibility set hit nothing and never re-ran. */
    const apply=()=>{ try{ const on=cb.checked; if(on) ensureRefLayers(); if(GE().layers.has(layerId)) GE().layers.setLayout(layerId,'visibility',on?'visible':'none'); if(GE().layers.has(layerId+'-dash')) GE().layers.setLayout(layerId+'-dash','visibility',on?'visible':'none'); }catch(_){} };
    cb.__refApply=apply;
    cb.addEventListener('change',()=>{
      if(cb.checked && !canDraw()){ GE().events.once('idle',apply); }
      apply();
      if(cb.checked){ [250,700,1600,3200].forEach(ms=>setTimeout(apply,ms)); }
    }); }
  _wireRef('cb-admin1','ref-admin1'); _wireRef('cb-roads','ref-roads'); _wireRef('cb-rail2','ref-rail');
  /* (#R38) re-assert any checked state/road/rail ref layer the moment the OFM vector tiles (re)load. */
  try{ GE().events.on('sourcedata',(e)=>{ if(e&&e.sourceId==='ofm'&&e.isSourceLoaded){ ['cb-admin1','cb-roads','cb-rail2'].forEach(id=>{ const c=document.getElementById(id); if(c&&c.checked&&c.__refApply) c.__refApply(); });
    /* (#R40) re-assert OFM-sourced country borders the moment the vector tiles (re)load too */
    try{ if(bordersOn) ensureBordersLayer(); window._applyBorders(); }catch(_){} } }); }catch(_){}
  /* (#R40) Country borders / State-province / Roads / Railways now DEFAULT ON (HTML `checked`). Fire their
     (retry-hardened) change handlers once at startup so the layers are created + shown on first load; they
     self-heal if the style/ofm source isn't ready yet. These 4 utility toggles are NOT persisted in the URL
     hash, so this only sets the initial default — unchecking one still sticks for the session. */
  /* (#R186) …and the same treatment for the two THEMATIC layers that are now on out of the box
     (window.IntMapDefaultLayers = Köppen climate + submarine cables). Their rows are built by
     js/data-layers.js a moment later than this static HTML, so the ids simply join the same retry
     list: `fire` skips a box that does not exist yet and the 1,600 ms pass catches it. The
     `__defFired` latch keeps it to one dispatch each however many times fire() runs. */
  (function(){ const IDS=()=>['cb-borders','cb-admin1','cb-roads','cb-rail2'].concat(window.IntMapDefaultLayers||[]);
    /* Read the saved layer set ONCE, synchronously, so the default-on decision and the session
       restore (which runs ~600 ms later) can never disagree for a few hundred milliseconds — that
       gap would show as Köppen appearing and then vanishing on every reload for a user who had
       switched it off. `null` = no saved session at all, i.e. the defaults apply unopposed. */
    let saved=null; try{ const s=JSON.parse(localStorage.getItem('intmap_session2')||'null'); if(s&&Array.isArray(s.layers)) saved=s.layers; }catch(_){}
    const wanted=id=>!saved || (window.IntMapDefaultLayers||[]).indexOf(id)<0 || saved.indexOf(id)>=0;
    const fire=()=>IDS().forEach(id=>{ const c=document.getElementById(id); if(!c||c.__defFired) return;
      if(!wanted(id)){ c.__defFired=true; if(c.checked){ c.checked=false; const r=c.closest('.lyr-row'); if(r) r.classList.remove('on'); const ex=r&&r.querySelector('.lyr-extras'); if(ex) ex.style.display='none'; } return; }
      if(c.checked){ c.__defFired=true; try{ c.dispatchEvent(new Event('change',{bubbles:true})); }catch(_){} } });
    window.__imFireDefaultLayers=fire;
    try{ if(GE().ready()) setTimeout(fire,300); GE().events.on('load',()=>setTimeout(fire,300)); setTimeout(fire,600); setTimeout(fire,1600); setTimeout(fire,2600); }catch(_){} })();

  /* ===== Date / TZ ===== */
  function parseDate(input){ if(input instanceof Date)return isNaN(input.getTime())?new Date():input; let d=new Date(input); if(isNaN(d.getTime())&&typeof input==='string')d=new Date(input.replace(' ','T')+'Z'); return isNaN(d.getTime())?new Date():d; }

  let mapTooltipEl=null, newsFeatures=[], dashFeatures=[];

  function ensureMapTooltip(){
    if(mapTooltipEl) return mapTooltipEl;
    mapTooltipEl=document.createElement('div'); mapTooltipEl.className='map-tooltip';
    document.getElementById('map-container').appendChild(mapTooltipEl);
    return mapTooltipEl;
  }
  /* (#R175) 「Live air traffic のホバー時に出るポップアップは、画面外に出ないように。」
     The tooltip is drawn ABOVE its anchor — `transform: translate(-50%, calc(-100% - 18px))` — so the
     box the user actually sees runs from point.y − h − 18 down to point.y − 18. Every clamp before this
     round measured a box that STARTS at point.y, so the taller the tooltip the further off the top it
     hung: the live-aircraft card is ~300 px of ADS-B fields, and `Math.max(160, …)` put its top edge at
     160 − 300 − 18 = −158 px, i.e. the callsign, the aircraft type and the altitude were all above the
     window. The bottom clamp had the opposite sign error — `mc.height − h − 12` pushed a tall tooltip
     hundreds of pixels away from an aircraft near the bottom of the map, which is what made it read as
     "floating somewhere else".
     So: clamp the RENDERED box, flip it below the anchor when it cannot fit above (the arrow flips with
     it), and keep the arrow on the anchor after a horizontal clamp via --tip-ax. */
  const TIP_GAP=18, TIP_EDGE=8;
  function positionTooltip(point){
    const el=ensureMapTooltip();
    const mc=document.getElementById('map-container').getBoundingClientRect();
    const w=el.offsetWidth||280, half=w/2, h=el.offsetHeight||80;
    const px=(+point.x||0), py=(+point.y||0);
    const x=Math.max(half+TIP_EDGE, Math.min(Math.max(half+TIP_EDGE, mc.width-half-TIP_EDGE), px));
    /* above is the long-standing look and stays the default; below only when above cannot fit and below can */
    const below=(h+TIP_GAP>py-TIP_EDGE)&&(h+TIP_GAP<=mc.height-py-TIP_EDGE);
    el.classList.toggle('map-tooltip-below',below);
    let top=below?(py+TIP_GAP):(py-h-TIP_GAP);
    top=Math.max(TIP_EDGE,Math.min(mc.height-h-TIP_EDGE,top));   /* a tooltip taller than the map keeps its HEAD on screen */
    const y=below?(top-TIP_GAP):(top+h+TIP_GAP);
    el.style.left=x+'px'; el.style.top=y+'px';
    el.style.setProperty('--tip-ax',Math.max(12,Math.min(w-12,px-(x-half)))+'px');
  }
  window.ensureMapTooltip=ensureMapTooltip; window.positionTooltip=positionTooltip;   /* (#R23) beta choropleths reuse the same hover tooltip as HDI */
  /* (#R32) Is the current UI/map dark? The news band must FLIP color by theme — a dark pill is invisible on
     the dark map ("ダークモードでは視認性が悪い"). */
  function _newsUIDark(){ try{ return document.documentElement.getAttribute('data-theme')==='dark'; }catch(_){ return false; } }   /* (#R115) skin themes retired (R33) — dark = data-theme only */
  /* iOS-style frosted "pill" behind news labels — generated as a stretchable sprite. Theme-aware (#R32):
     LIGHT map → near-black pill + white text; DARK map → near-white pill + dark text, so the band is always
     legible. A subtle 1px border defines it against same-tone backgrounds. */
  function ensureLabelPill(force){
    if(!GE().hasRenderer()) return;
    if(force && GE().scene.hasImage('news-pill')){ try{ GE().scene.removeImage('news-pill'); }catch(_){} }
    if(GE().scene.hasImage('news-pill')) return;
    try{
      const dark=_newsUIDark();
      const dpr=2, w=40, h=30, r=12;
      const cv=document.createElement('canvas'); cv.width=w*dpr; cv.height=h*dpr;
      const ctx=cv.getContext('2d'); ctx.scale(dpr,dpr);
      const rr=(x,y,ww,hh,rad)=>{ ctx.beginPath(); ctx.moveTo(x+rad,y); ctx.arcTo(x+ww,y,x+ww,y+hh,rad); ctx.arcTo(x+ww,y+hh,x,y+hh,rad); ctx.arcTo(x,y+hh,x,y,rad); ctx.arcTo(x,y,x+ww,y,rad); ctx.closePath(); };
      ctx.fillStyle = dark ? 'rgba(244,244,247,0.94)' : 'rgba(18,18,20,0.82)';
      rr(0.5,0.5,w-1,h-1,r); ctx.fill();
      ctx.lineWidth=1; ctx.strokeStyle = dark ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.40)';
      rr(0.5,0.5,w-1,h-1,r); ctx.stroke();
      const data=ctx.getImageData(0,0,w*dpr,h*dpr).data;
      GE().scene.addImage('news-pill',{width:w*dpr,height:h*dpr,data},{
        pixelRatio:dpr, stretchX:[[r*dpr,(w-r)*dpr]], stretchY:[[r*dpr,(h-r)*dpr]], content:[8*dpr,6*dpr,(w-8)*dpr,(h-6)*dpr]
      });
    }catch(_){}
  }
  /* (#R32) Re-skin the news band when the theme flips (called from applyTheme). Regenerates the sprite and
     flips the text + halo colors so the band stays readable in every theme. */
  function refreshNewsPill(){ try{ if(!GE().hasRenderer()) return; ensureLabelPill(true);
      const dark=_newsUIDark();
      /* (#R161) news band theming through the engine (Phase-3 subsystem migration) */
      const _GEp=window.IntMapGeoEngine;
      if(_GEp&&_GEp.layers.has('news-labels')){
        _GEp.layers.setPaint('news-labels','text-color', dark?'#15151a':'#ffffff');
        _GEp.layers.setPaint('news-labels','text-halo-color', dark?'rgba(255,255,255,0.55)':'rgba(0,0,0,0.55)');
      }
    }catch(_){} }
  window.refreshNewsPill=refreshNewsPill;
  /* (#R36) NEWS-BAND DE-CLUTTER — decides which title bands show, considering ONLY other news bands (never the
     base-map labels). A band is granted screen space greedily, highest priority first (subject-located >
     publisher > unlocated), to the RIGHT of its dot; a band that would overlap an already-granted band stays a
     bare dot. Runs on moveend/zoomend + after every data update, so: zoom in → pins spread → more bands appear;
     dense clusters stay dots until there's room; and because it never recomputes mid-gesture, the bands never
     blink. Visibility is applied via the `bnd` feature-state the layer's opacity reads. */
  let _ndcT=null;
  function _declutterNewsBands(){
    try{
      /* (#R161 MapLibre reduction, Phase 3) the whole news-pin overlay now talks to
         IntMapGeoEngine instead of the raw map — projection, surface size and
         feature-state are all renderer-agnostic operations. */
      const GE=window.IntMapGeoEngine; if(!GE) return;
      if(!GE.layers.hasSource('news-points')||!GE.layers.has('news-labels')) return;
      const feats=newsFeatures||[]; if(!feats.length) return;
      const sz=GE.render.size(); const W=sz.width, H=sz.height;
      const M=48;   /* off-screen margin: keep a band as the pin scrolls just past the edge */
      const items=[];
      for(const f of feats){
        const g=f.geometry, p=f.properties||{}; const fid=p.fid; if(!g||g.type!=='Point'||fid==null) continue;
        let pt; try{ pt=GE.coords.project(g.coordinates); }catch(_){ continue; }
        if(!pt) continue;
        if(pt.x<-M||pt.x>W+M||pt.y<-M||pt.y>H+M){ items.push({fid,off:true}); continue; }
        const txt=String(p.short||p.title||''); const w=Math.min(txt.length,16)*6.4+28;   /* ≈ pill width */
        const pr=(p.mapped==='true')?0:(p.mapped==='publisher')?1:2;
        items.push({fid,x:pt.x,y:pt.y,w,h:19,pr});
      }
      const vis=items.filter(i=>!i.off).sort((a,b)=> a.pr-b.pr || a.y-b.y || a.x-b.x);
      const claimed=[]; const win=new Set();
      const hit=(r)=>{ for(const c of claimed){ if(r.x<c.x+c.w && r.x+r.w>c.x && r.y<c.y+c.h && r.y+r.h>c.y) return true; } return false; };
      for(const it of vis){ const r={x:it.x+9,y:it.y-10,w:it.w,h:it.h}; if(!hit(r)){ claimed.push(r); win.add(it.fid); } }
      for(const it of items){ try{ GE.layers.setFeatureState({source:'news-points',id:it.fid},{bnd:win.has(it.fid)}); }catch(_){} }
    }catch(_){}
  }
  window._declutterNewsBands=_declutterNewsBands;
  function scheduleNewsDeclutter(){ if(_ndcT) clearTimeout(_ndcT); _ndcT=setTimeout(()=>{ _ndcT=null; _declutterNewsBands(); },90); }
  window.scheduleNewsDeclutter=scheduleNewsDeclutter;
  window.highlightDashMarker=function(id,on){ if(GE().layers.hasSource('dash-points')){ try{ GE().layers.setFeatureState({source:'dash-points',id},{hover:on}); }catch(e){} } };
  function clearIntelSources(){ if(GE().hasRenderer()){ if(GE().layers.hasSource('news-points')) GE().layers.setSourceData('news-points',{type:'FeatureCollection',features:[]}); if(GE().layers.hasSource('dash-points')) GE().layers.setSourceData('dash-points',{type:'FeatureCollection',features:[]}); newsFeatures=[]; dashFeatures=[]; } }
  /* (#R122/#R123) SPREAD DUPLICATE NEWS PINS — many stories geolocate to the SAME anchor (a country/city point, e.g.
     everything filed under "USA" lands on one dot), so pins stack and only the top one is clickable.
     (#R123) FIX "対象領域に分散的に配置できていない": the R122 version fanned every cluster over a FIXED small spiral,
     so a country cluster stayed a tiny dot in the middle of the country. Now the spread is REGION-AWARE using the
     place type carried on each pin (ptype) and the real country polygon (window.countryGeo):
       • country-typed clusters are DISTRIBUTED ACROSS the country's real boundary (deterministic rejection sampling
         inside the polygon → a US cluster fills the US, a UK cluster fills the UK);
       • city / flashpoint / region clusters fan over a golden-angle disk sized to the type (a city stays tight, a
         region spreads wider), latitude-corrected and clipped to the containing country so they never spill over a
         border.
     Deterministic (seeded from the anchor) so the layout is stable across re-renders. Degrades to the golden-angle
     disk when countryGeo/turf aren't available yet. */
  /* (#R127) re-run the duplicate spread on the CURRENT pins — called once the async country borders finish loading.
     A cold-load race left a country cluster as a tight blob because regionFor() had no polygon yet; the pins kept
     their ORIGINAL anchors in __oc, so re-spreading now fills the real territory. No-op unless news pins are live. */
  function _respreadNews(){ try{ if(!GE().hasRenderer()||!GE().layers.hasSource('news-points')) return; if(!Array.isArray(newsFeatures)||newsFeatures.length<2) return;
    const _m=(typeof currentMode!=='undefined')?currentMode:null; if(_m!=='news'&&_m!=='saved') return;
    _spreadDupNewsPins(newsFeatures);
    try{ GE().layers.setSourceData('news-points',{type:'FeatureCollection',features:(typeof _wsNewsHidden==='function'&&_wsNewsHidden())?[]:newsFeatures}); }catch(_){}
    try{ scheduleNewsDeclutter(); }catch(_){}
  }catch(_){} }
  try{ window._respreadNews=_respreadNews; }catch(_){}

  /* ===== News location analysis =====
   * Now ALWAYS computes BOTH subject location AND publisher location, plus a fallback
   * if neither match. Result fields:
   *   subjectLoc / subjectName  — best subject match from title (highest precision)
   *   pubLoc / pubName          — publisher HQ
   *   loc / name / mapped       — current "active" location based on newsPinMode
   *
   * EVERY news item now gets a pin (no more dropouts):
   *   - subject match → mapped=true, blue dot
   *   - publisher only → mapped=publisher, purple dot
   *   - neither → fallback to title-hash on the equator strip (light purple, dim)
   */
  function hashLocFromString(s){
    let h=0; for(let i=0;i<s.length;i++) h=((h<<5)-h)+s.charCodeAt(i)|0;
    const lng=((Math.abs(h)%36000)/100)-180;
    const lat=(((Math.abs(h>>8))%6000)/100)-30;
    return [lng,lat];
  }
  /* (#R169) moved verbatim to js/news-context.js — see Architecture.md §3.1. */
  /* (#R161) Verification seam — the whole non-AI locator is only trustworthy if it can be checked
     end-to-end from outside, so expose the real function (same pattern as _declutterNewsBands /
     _atlExtractPlaces). Tests call it with a headline and assert the pin it produces. */
  window._imAnalyzeContext=analyzeContext;
  /* Single source of truth for the active pin location under the current newsPinMode.
     Subject mode shows ONLY the subject location; Publisher mode shows ONLY the publisher
     location — they never borrow from each other, so flipping the toggle always moves the pin.
     Unknown locations fall to a deterministic, MODE-SEEDED scatter point (mapped=false → dim
     pin) so even fully-unplaced stories still shift when the toggle flips. */
  function applyPinMode(a){
    if(!a) return;
    const title=a._title||'', pub=a._pub||'';
    if(newsPinMode==='publisher'){
      if(a.pubLoc){ a.loc=a.pubLoc; a.name=a.pubName; a.mapped='publisher'; a.ptype='city'; }   /* (#R123) publisher HQ is a city-scale point */
      /* ⚠⚠ (#R212) THE SUBJECT IS NOT THE ORIGIN, AND THIS BRANCH SAID IT WAS.
         「ニュースの発信地が全然発信地の場所になっていない。ふざけるな。」 — this is that, exactly. #R35
         answered 「位置不明のピンが多い」 by falling back to the SUBJECT location when the outlet's
         headquarters could not be resolved, and still reported `mapped='publisher'`: a wildfire story
         from CBS News was pinned in CANADA and labelled as its origin. It also contradicts the block
         comment three lines above, which promises the two modes never borrow from each other.
         An unresolved origin is now shown as unresolved. The reason it was rare enough to be worth
         faking is fixed where it belongs — js/news-context.js now resolves the outlet by its DOMAIN
         as well as its display name, which is the form Google News gives for a large part of the feed. */
      else { a.loc=hashLocFromString('pub:'+pub+'|'+title); a.name=pub||(currentLang==='jp'?'発信元不明':currentLang==='de'?'Herausgeber unbekannt':currentLang==='ru'?'Издатель неизвестен':currentLang==='es'?'Editor desconocido':'Publisher unknown'); a.mapped=false; a.ptype=''; }
    } else {
      if(a.subjectLoc){ a.loc=a.subjectLoc; a.name=a.subjectName; a.mapped=true; a.ptype=a.subjectType||''; }
      else { a.loc=hashLocFromString('sub:'+title); a.name=(currentLang==='jp'?'場所不明':currentLang==='de'?'Ort unbekannt':currentLang==='ru'?'Место неизвестно':currentLang==='es'?'Ubicación desconocida':'Location unknown'); a.mapped=false; a.ptype=''; }
    }
  }
  function clearMarkers(){ markersArray.forEach(m=>m.remove()); markersArray=[]; clearIntelSources(); }
  window.flyToLoc=function(lng,lat){ if(GE().hasRenderer())GE().camera.flyTo({center:[lng,lat],zoom:4,speed:1.2}); };
  window.toggleDashCat=function(cat){ if(activeDashCategories.has(cat))activeDashCategories.delete(cat); else activeDashCategories.add(cat); renderDashboard(); };
  /* (#R102) selecting an indicator applies its DEFAULT direction (numeric = descending / biggest first; A–Z = ascending;
     a "lower is better" indicator would default to ascending), then re-renders. Lazy WB metrics (life-expectancy,
     fertility) are back-filled on demand so they are REAL, not blank. */
  window.setStatsSort=function(k){ const D={ gdp:'desc', gdppc:'desc', gdpPPP:'desc', gdppcPPP:'desc', pop:'desc', area:'desc', hdi:'desc', milSpend:'desc', lifeExp:'desc', tfr:'desc', name:'asc' }; statsSort=k; statsSortDir=D[k]||'desc';
    try{ if((k==='lifeExp'||k==='tfr')&&window._imFillStat) window._imFillStat(k); }catch(_){}
    /* (#R105) sorting by a PPP indicator → ensure the World-Bank PPP fields are loaded, then re-render with real values. */
    try{ if((k==='gdpPPP'||k==='gdppcPPP')&&typeof loadGdpPPP==='function'){ loadGdpPPP().then(()=>{ try{ if(window._countriesActive&&window._countriesActive()&&statsSort===k) renderStats((typeof _countriesSearchVal==='function')?_countriesSearchVal():searchVal()); }catch(_){} }); } }catch(_){}
    try{ renderStats((typeof _countriesSearchVal==='function')?_countriesSearchVal():searchVal()); }catch(_){ renderStats(searchVal()); } };
  window.toggleStatsSortDir=function(){ statsSortDir=(statsSortDir==='asc')?'desc':'asc';
    try{ renderStats((typeof _countriesSearchVal==='function')?_countriesSearchVal():searchVal()); }catch(_){ renderStats(searchVal()); } };

  /* (#R30) Does the active news-language setting include a language OTHER than the UI language? If not
     (Current-language-only, or Multi with only the UI language ticked) there is nothing to translate, so
     the Translate-titles button is hidden entirely. UI 'jp' maps to news code 'ja'. */
  function _newsHasForeignLang(){
    try{ const ui = currentLang==='jp' ? 'ja' : 'en';
      if(newsLangMode!=='multi') return false;
      const sel = (Array.isArray(newsLangs)&&newsLangs.length) ? newsLangs : [];
      return sel.some(c=>c!==ui);
    }catch(_){ return false; }
  }
  window._newsHasForeignLang=_newsHasForeignLang;
  /* Wire up the in-tab Subject/Publisher segment buttons */
  function setNewsPinMode(mode){
    if(newsPinMode===mode) return;
    newsPinMode=mode;
    document.getElementById('pinmode-loc').classList.toggle('active', mode==='location');
    document.getElementById('pinmode-pub').classList.toggle('active', mode==='publisher');
    /* re-compute the active loc for every cached item under the new mode (no cross-fallback) */
    globalData.forEach(it=>applyPinMode(it.analysis));
    try{ aiSyncFeatureButtons(); }catch(_){}      /* button label reflects Subject/Publisher */
    if(currentMode==='news'||currentMode==='saved') startNews();
  }
  document.getElementById('pinmode-loc').onclick=()=>setNewsPinMode('location');
  document.getElementById('pinmode-pub').onclick=()=>setNewsPinMode('publisher');
  /* Pin-mode dropdown (#28): the ▾ caret on the AI-locate button opens the Subject/Publisher menu;
     picking one closes it. The main button's label already reflects the mode (see aiButtonSyncers). */
  (function(){
    const caret=document.getElementById('ai-locate-caret'), menu=document.getElementById('ai-locate-menu');
    if(caret&&menu){
      caret.onclick=(e)=>{ e.stopPropagation(); menu.classList.toggle('show'); };
      menu.querySelectorAll('.ios-segment-btn').forEach(b=>b.addEventListener('click',()=>menu.classList.remove('show')));
      document.addEventListener('click',(e)=>{ if(menu.classList.contains('show') && !menu.contains(e.target) && e.target!==caret) menu.classList.remove('show'); });
    }
    /* Manual "Translate titles" button (#28) — translates the visible headlines into the UI language. */
    const tb=document.getElementById('ai-translate-btn');
    if(tb) tb.onclick=()=>{ try{ if(!aiGate()) return; aiTranslateTitles(); }catch(_){} };
    aiButtonSyncers.push(function(){ const b=document.getElementById('ai-translate-btn'); if(!b) return; b.classList.toggle('ai-needs-key',!aiReady()); b.title=aiReady()?'':t('aiNoKey'); });
  })();
  function openAISettingsOrToast(){ try{ imToast(t('aiNoKey')); }catch(_){} }

  /* ===== AI FEATURE 1: news geocoding =====
     Items the local gazetteer couldn't place sit at fake hash coords (analysis.mapped===false).
     Ask the LLM for the real {name,lat,lng}, then promote them to mapped subject pins. */
  function aiReaffirmLoc(a){ applyPinMode(a); }
  /* Mode-aware AI locator. In Subject mode it geocodes the event location; in Publisher mode
     it geocodes the outlet's HQ. `force` (the button) re-analyses EVERY filtered story incl.
     already-pinned ones; auto mode passes force=false and only fills the gaps. */
  { const gb=document.getElementById('ai-geocode-btn'); if(gb) gb.onclick=()=>aiGeocodeNews(true); }
  aiButtonSyncers.push(function(){ const b=document.getElementById('ai-geocode-btn'); if(!b) return;
    b.classList.toggle('ai-needs-key',!aiReady()); b.title=aiReady()?'':t('aiNoKey');
    b.textContent = newsPinMode==='publisher' ? t('aiGeoBtnPub') : t('aiGeoBtnSub'); });

  /* (#R29) Hide anything older than 72h from the live feed — the server also deletes >72h rows, this is
     the matching client guard (covers the live-RSS fallback + any stale cache). Saved/bookmarked items
     and explicit time-travel (newsDate) are exempt so the user never loses what they deliberately kept. */
  const NEWS_MAX_AGE_MS=72*3600e3;
  /* (#R207) the outlet filter lives in js/news-sources.js; this asks, and FAILS OPEN. */
  function newsSourceAllows(pub){
    try{ const N=window.IntMapNewsSources; return N?N.allows(pub):true; }catch(_){ return true; }
  }
  function computeFilteredNews(){ const q=searchVal(), at=window._newsAreaTest;
    const ageCut=(currentMode==='saved'||newsDate)?0:(Date.now()-NEWS_MAX_AGE_MS);
    const base=(currentMode==='saved'&&window.IntMapNewsSaved)?window.IntMapNewsSaved.merge(globalData,bookmarks):globalData;   /* (#R210) ★ Saved is no longer only what the LIVE feed still carries — see js/news-ui.js */
    return base.filter(it=>{ if(currentMode==='saved'&&!bookmarks.includes(it.link))return false;
      if(ageCut&&it.pubDate){ const pd=parseDate(it.pubDate).getTime(); if(pd&&pd<ageCut) return false; }
      /* (#R207) …except in Saved: the user kept that item deliberately (as with the age cut). */
      if(currentMode!=='saved'&&!newsSourceAllows(it.publisher)) return false;
      if(q&&!it.title.toLowerCase().includes(q))return false; if(at){ const a=it.analysis, c=a&&a.loc; if(!c||!at(c[0],c[1])) return false; } return true; }); }
  /* Title shown on a news card. When the translation pass (Settings → multi-language) has
     produced a translated title in the current UI language, show it plus a '(原文: …)' note. */
  function newsTitleHTML(item){
    const a=item.analysis||{};
    if(a.titleTranslated && a.titleTranslated!==item.title){
      const lang=a.titleOrigLangLabel||a.titleOrigLang||'';
      const note=lang?(currentLang==='jp'?('（原文: '+lang+'）'):currentLang==='ru'?('(ориг.: '+lang+')'):('(orig: '+lang+')')):'';
      return IntMapSafe.html(a.titleTranslated) + (note?`<div class="news-origlang">${IntMapSafe.html(note)}</div>`:'');   /* (#R138 SEC) titleTranslated/lang are AI output → escape */
    }
    return IntMapSafe.html(item.title);   /* (#R138 SEC) news title comes from external RSS → escape (this string is written to innerHTML by the card + rerenderNewsFeedTitles) */
  }
  /* (#R79b) In workspace mode the News window can be hidden (it is hidden by default now). When it is,
     news pins must NOT sit on the map ("ニュースウィンドウがオンになってないのに勝手にマップ上に現れる").
     This is the single source of truth used by startNews so a later data refresh can't re-push stray pins. */
  function _wsNewsHidden(){ try{ if(!document.body.classList.contains('ws-mode')) return false; const w=document.querySelector('.ws-win.ws-news'); return !!(w && w.style.display==='none'); }catch(_){ return false; } }
  window._wsNewsHidden=_wsNewsHidden;
  /* (#R169) moved verbatim to js/news-feed.js — see Architecture.md §3.1. */
  /* Optional automatic AI passes (debounced so rapid re-renders don't stack runs).
     Gated on Settings (AI location = automatic / News languages = all) AND a saved API key. */
  let _autoEnrichT=null;
  /* (#R169) moved verbatim to js/news-feed.js — see Architecture.md §3.1. */
  document.getElementById('live-news-feed').addEventListener('scroll',(e)=>{
    if(currentMode!=='news'&&currentMode!=='saved') return;
    const f=e.target;
    if(f.scrollTop+f.clientHeight>=f.scrollHeight-120 && renderedCount<newsFiltered.length) appendNewsBatch();
  });

  /* (#R169) moved verbatim to js/news-feed.js — see Architecture.md §3.1. */
  /* ===== In-sidebar article reader (the sidebar becomes the reading zone) ===== */
  let readerOpen=false, readerCurrent=null;
  function escForReader(s){ const d=document.createElement('div'); d.textContent=(s==null?'':String(s)); return d.innerHTML.replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }   /* (#R138 SEC) textContent escapes &<> but NOT quotes; this helper is used in attribute context (href/src) too, so quote-escape as well (prevents attribute breakout / srcdoc injection) */
  /* (#R169) moved verbatim to js/article-reader.js — see Architecture.md §3.1. */
  /* ===== AI FEATURE 2: in-reader translation to Japanese =====
     Translates the extracted reader text (res.blocks); toggles original/translated and
     caches the result on `res` so flipping back and forth is instant. */
  function closeArticleReader(){
    readerOpen=false; readerCurrent=null;
    try{ window._imReader=null; }catch(_){ }   /* (#R80) clear the open-article bridge (vision §2) */
    const pane=document.getElementById('news-reader-pane'); if(pane){ pane.style.display='none'; pane.innerHTML=''; }
    const cp=document.querySelector('.control-panel'); if(cp) cp.style.display='';
    renderUI();
  }

  /* ===== Stats — list with multi-select country comparison ===== */
  /* (#R70) ONE comparison system ("似た機能なのに別の場所にあって分かりづらい"): clicking country rows still
     builds the selection (the dock below), but "view comparison" now opens the UNIFIED IntMapStatsCompare
     (bar chart default ⇄ time-series ⇄ free table) — the old separate static-bar page is merged into it.
     Selection cap raised 3→5 to match. */
  let compareSet=new Set();
  /* (#R102) selecting an indicator applies its DEFAULT direction (numeric = descending / biggest first; A–Z = ascending;
     a "lower is better" indicator would default to ascending), then re-renders. Lazy WB metrics (life-expectancy,
     fertility) are back-filled on demand so they are REAL, not blank. */
  window.setStatsSort=function(k){ const D={ gdp:'desc', gdppc:'desc', gdpPPP:'desc', gdppcPPP:'desc', pop:'desc', area:'desc', hdi:'desc', milSpend:'desc', lifeExp:'desc', tfr:'desc', name:'asc' }; statsSort=k; statsSortDir=D[k]||'desc';
    try{ if((k==='lifeExp'||k==='tfr')&&window._imFillStat) window._imFillStat(k); }catch(_){}
    /* (#R105) sorting by a PPP indicator → ensure the World-Bank PPP fields are loaded, then re-render with real values. */
    try{ if((k==='gdpPPP'||k==='gdppcPPP')&&typeof loadGdpPPP==='function'){ loadGdpPPP().then(()=>{ try{ if(window._countriesActive&&window._countriesActive()&&statsSort===k) renderStats((typeof _countriesSearchVal==='function')?_countriesSearchVal():searchVal()); }catch(_){} }); } }catch(_){}
    try{ renderStats((typeof _countriesSearchVal==='function')?_countriesSearchVal():searchVal()); }catch(_){ renderStats(searchVal()); } };
  window.toggleStatsSortDir=function(){ statsSortDir=(statsSortDir==='asc')?'desc':'asc';
    try{ renderStats((typeof _countriesSearchVal==='function')?_countriesSearchVal():searchVal()); }catch(_){ renderStats(searchVal()); } };
  /* (#R102) back-fill a lazy World-Bank metric (life-expectancy / fertility) so sorting by it shows REAL values, not "—".
     One indicator = one WB request; re-renders when it lands (only if that metric is still selected). */
  window._imFillStat=async function(key){ try{ const codes={lifeExp:'SP.DYN.LE00.IN',tfr:'SP.DYN.TFRT.IN',internet:'IT.NET.USER.ZS'}; const c=codes[key]; if(!c) return;
    let have=0; for(const cd in countryStats){ const s=countryStats[cd]; if(s&&s[key]!=null&&isFinite(s[key])) have++; } if(have>=25) return;
    if(!(window.IntMapWB&&window.IntMapWB.fetch)) return; const m=await window.IntMapWB.fetch(c); if(!m) return;
    for(const cd in m){ const v=m[cd]&&m[cd].v; if(v==null||!isFinite(v)) continue; const s=countryStats[cd]; if(s&&(s[key]==null||!isFinite(s[key]))) s[key]=+v; }
    try{ if(statsSort===key && window._countriesActive && window._countriesActive()) renderStats((typeof _countriesSearchVal==='function')?_countriesSearchVal():searchVal()); }catch(_){}
  }catch(_){} };
  /* Toggle a country in the compare set WITHOUT re-rendering the whole list (keeps scroll
     position) — only the row outline + the fixed bottom panel update (#26). */
  window._toggleCompare=function(code){
    if(compareSet.has(code)) compareSet.delete(code);
    else if(compareSet.size<10) compareSet.add(code);
    else { const first=compareSet.values().next().value; compareSet.delete(first); compareSet.add(code); }
    document.querySelectorAll('#countries-feed .stat-row').forEach(r=>r.classList.toggle('compare-on',compareSet.has(r.getAttribute('data-ccn'))));
    /* (#R122) highlight the current selection on the map AS it is built in the Countries tab (not only once the
       compare view opens) — "Countriesで国を選択した時点でハイライト". */
    try{ const C=window.IntMapStatsCompare; if(C&&C.previewOnMap){ if(compareSet.size) C.previewOnMap([...compareSet]); else C.clearMap&&C.clearMap(); } }catch(_){}
    /* (#R124) if the compare view is already open, mirror this toggle into it so its time-series updates without a
       reload (the Countries tray and an open compare view now stay in sync). */
    try{ const C2=window.IntMapStatsCompare; if(C2&&C2.toggleCountry) C2.toggleCountry(code, compareSet.has(code)); }catch(_){}
    renderCompareFixed();
  };
  window._clearCompare=function(){ compareSet.clear(); document.querySelectorAll('#countries-feed .stat-row.compare-on').forEach(r=>r.classList.remove('compare-on')); renderCompareFixed(); try{ window.IntMapStatsCompare&&window.IntMapStatsCompare.clearMap&&window.IntMapStatsCompare.clearMap(); }catch(_){} };
  window._showCompare=function(){ if(compareSet.size<2) return; try{ window.IntMapStatsCompare&&window.IntMapStatsCompare.open([...compareSet]); }catch(_){} };
  window._hideCompare=function(){ renderStats(searchVal()); };
  window._backToStats=function(){ renderStats(searchVal()); };
  /* (#R79b) Countries has its OWN search box in workspace mode (the shared #search-input lives in the News
     window). Read from it there; fall back to the shared search in the normal tabbed sidebar. */
  function _countriesSearchVal(){ try{ const ci=document.getElementById('countries-search-input'); if(document.body.classList.contains('ws-mode')&&ci) return ci.value.trim().toLowerCase(); }catch(_){} return searchVal(); }
  window._wsRenderCountries=function(){ try{ const q=_countriesSearchVal(); if(typeof loadCountryData==='function'){ loadCountryData().then(()=>{ try{ renderStats(q); }catch(_){} }); } renderStats(q); }catch(_){} };
  /* (#R79d) toggle the map's Country-info layer (cb-countries → country-fill/line) with the Countries window,
     so closing the window clears the "countries selected" state visible on the map. Mirrors _setCountriesInfo. */
  window._wsCountryInfo=function(on){ try{ const cb=document.getElementById('cb-countries'); if(cb&&cb.checked!==!!on){ cb.checked=!!on; cb.dispatchEvent(new Event('change',{bubbles:true})); } }catch(_){} };
  (function(){ const ci=document.getElementById('countries-search-input'); if(ci) ci.addEventListener('input',()=>{ try{ renderStats(ci.value.trim().toLowerCase()); }catch(_){} }); })();
  /* (#R153) Companies filter box (workspace-mode Companies window) — mirrors _countriesSearchVal + its input wiring so
     companies can be filtered by name/ticker/sector in ws-mode (previously renderCompanies got '' and nothing filtered). */
  function _companiesSearchVal(){ try{ const ci=document.getElementById('companies-search-input'); if(document.body.classList.contains('ws-mode')&&ci) return ci.value.trim().toLowerCase(); }catch(_){} return (currentMode==='info')?searchVal():''; }
  window._companiesSearchVal=_companiesSearchVal;
  (function(){ const ci=document.getElementById('companies-search-input'); if(ci) ci.addEventListener('input',()=>{ try{ renderCompanies(ci.value.trim().toLowerCase()); }catch(_){} }); })();
  /* (#R129) COUNTRIES-screen "pick a country on the map" (search-bar crosshair #csearch-pick / #csearch-pick-ws).
     The compare pick control used to live ONLY inside the opened compare window; the INITIAL Countries screen had no
     map-pick, and a plain map click there ran showCountryDetail on the MODERN polygon — so while time-travelling it
     picked the present-day country, not the era one ("昔の年代でも…地図クリック国選択"). This resolver goes ERA-AWARE
     first (Kingdom of Yugoslavia, colonies, empires via resolveHist), else the modern country, then toggles the
     result into the compare set via _toggleCompare (same store the country rows use). */
  (function(){
    let picking=false, bound=null, keyH=null;
    const _pl=(en,jp,de,ru,es)=>currentLang==='jp'?jp:currentLang==='de'?de:currentLang==='ru'?ru:currentLang==='es'?es:en;
    const _btns=()=>[document.getElementById('csearch-pick'),document.getElementById('csearch-pick-ws')].filter(Boolean);
    function resolveAt(lngLat){
      try{ const TB=window.IntMapTimeBorders;
        if(TB&&TB.active&&TB.active()&&GE().hasRenderer()&&GE().hasRenderer()){
          let nm=null;
          /* era polygon under the click — SMALLEST-area containing feature (simplified era polygons overlap at borders) */
          try{ const fc=TB.currentFC&&TB.currentFC(); if(fc&&fc.features&&typeof turf!=='undefined'){ const tp=turf.point([lngLat.lng,lngLat.lat]); let bA=Infinity;
            for(const f of fc.features){ try{ if(f.geometry&&turf.booleanPointInPolygon(tp,f)){ const bb=turf.bbox(f); const a=(bb[2]-bb[0])*(bb[3]-bb[1]); if(a<bA){ bA=a; nm=f.properties&&(f.properties.NAME||f.properties.name); } } }catch(_){} } } }catch(_){}
          /* coastal near-miss rescue (a shoreline click just outside the simplified era coastline) */
          if(!nm){ try{ const fc2=TB.currentFC&&TB.currentFC(); if(fc2&&fc2.features){ let bd=0.7,bn=null;
            const scan=(cs,f)=>{ if(typeof cs[0]==='number'){ const dx=(cs[0]-lngLat.lng)*Math.cos(lngLat.lat*Math.PI/180), dy=cs[1]-lngLat.lat; const d=Math.hypot(dx,dy); if(d<bd){ bd=d; bn=f.properties&&(f.properties.NAME||f.properties.name); } } else cs.forEach(c2=>scan(c2,f)); };
            for(const f of fc2.features){ try{ if(!f.geometry) continue; const bb=turf.bbox(f); if(lngLat.lng<bb[0]-0.8||lngLat.lng>bb[2]+0.8||lngLat.lat<bb[1]-0.8||lngLat.lat>bb[3]+0.8) continue; scan(f.geometry.coordinates,f); }catch(_){} }
            if(bn) nm=bn; } }catch(_){} }
          if(nm&&TB.resolveHist){ const R=TB.resolveHist(nm,lngLat);
            if(R&&R.code&&countryStats[R.code]) return {code:R.code};
            /* a REAL era entity with no comparable data — report honestly, do NOT snap to the modern country */
            if(R&&R.name) return {eraNoData:true, eraName:R.name}; }
          /* (#R132) TRAVELLING but the era polygon under the click couldn't be resolved (FC still loading, or a click in
             a simplified-coastline gap): report honestly — NEVER fall through to the modern countryGeo below (that is the
             reported "国境線と国家は昔なのに、クリック判定は現在の国境になっている"). */
          const _fcReady=(function(){ try{ const fc=TB.currentFC&&TB.currentFC(); return !!(fc&&fc.features&&fc.features.length); }catch(_){ return false; } })();
          return _fcReady?{code:''}:{code:'', eraLoading:true};
        } }catch(_){}
      try{ const cg=window.countryGeo; if(cg&&cg.features&&typeof turf!=='undefined'){ const pt=turf.point([lngLat.lng,lngLat.lat]); let best=null,bA=Infinity; for(const f of cg.features){ try{ if(turf.booleanPointInPolygon(pt,f)){ const bb=turf.bbox(f); const a=(bb[2]-bb[0])*(bb[3]-bb[1]); if(a<bA){ bA=a; best=f; } } }catch(_){} } if(best) return {code:resolveCountryId(best)}; } }catch(_){}
      return {code:''};
    }
    function onClick(e){ if(!picking||!e||!e.lngLat) return;
      const res=resolveAt(e.lngLat)||{};
      if(res.eraNoData){ try{ imToast(_pl('No comparable data for '+res.eraName+' in this era','「'+res.eraName+'」はこの年代の比較データがありません','Keine Vergleichsdaten für '+res.eraName+' in dieser Epoche','Нет данных для «'+res.eraName+'» в эту эпоху','Sin datos comparables para '+res.eraName+' en esta época')); }catch(_){} return; }
      if(res.eraLoading){ try{ imToast(_pl('Era borders are still loading here — click again in a moment','この年代の国境を読み込み中です。少し後にもう一度クリックしてください','Epochengrenzen laden noch — gleich erneut klicken','Границы эпохи ещё загружаются — кликните ещё раз','Los límites de la época aún se cargan — haz clic de nuevo')); }catch(_){} return; }
      const cd=res.code; if(!cd){ try{ imToast(_pl('Click on a country (land)','国（陸地）をクリックしてください','Auf ein Land klicken','Кликните по суше (страна)','Haz clic en un país')); }catch(_){} return; }
      try{ window._toggleCompare(cd); }catch(_){}
      try{ const s=(typeof countryStats!=='undefined')&&countryStats[cd]; const nm=(s&&((currentLang==='jp'&&s.nameJp)?s.nameJp:s.nameEn))||cd; imToast((compareSet.has(cd)?'✓ ':'− ')+nm); }catch(_){}
    }
    window.__countryPickActive=()=>picking;
    window.__countryPick=function(on){ const nv=(on==null)?!picking:!!on;
      _btns().forEach(b=>b.classList.toggle('on',nv));
      if(nv===picking) return; picking=nv; window.__scpPick=picking;
      try{ const cv=GE().render.canvas&&GE().render.canvas(); if(cv) cv.style.cursor=picking?'crosshair':''; }catch(_){}
      if(picking&&!bound){ try{ GE().events.on('click',onClick); bound=onClick; }catch(_){} }
      if(!picking&&bound){ try{ GE().events.off('click',bound); }catch(_){} bound=null; }
      if(picking&&!keyH){ keyH=(ev)=>{ if(ev.key==='Escape') window.__countryPick(false); }; try{ document.addEventListener('keydown',keyH); }catch(_){} }
      else if(!picking&&keyH){ try{ document.removeEventListener('keydown',keyH); }catch(_){} keyH=null; }
      if(picking){ try{ imToast(_pl('Click a country on the map to add it','地図で国をクリックすると比較に追加されます','Land auf der Karte anklicken zum Hinzufügen','Кликните страну на карте, чтобы добавить','Haz clic en un país del mapa para añadirlo')); }catch(_){} }
    };
    /* wire the button(s); guard against a rebuild double-binding */
    _btns().forEach(b=>{ if(b&&!b.__cpWired){ b.__cpWired=1; b.onclick=()=>window.__countryPick(); } });
  })();
  /* (#R122) COUNTRIES NUMERIC FILTER — filter the list by indicator thresholds (≥ / ≤), combinable with the sort.
     e.g. population ≥ 5M then sort by GDP desc. Conditions persist across re-renders. */
  let statsFilters=[], statsFilterOpen=false;
  const _sfL=(en,jp,de,ru,es)=>currentLang==='jp'?jp:currentLang==='de'?de:currentLang==='ru'?ru:currentLang==='es'?(es||en):en;
  function _sfParse(str){ let s=String(str==null?'':str).trim().replace(/[, _]/g,'').replace(/%$/,''); if(!s) return NaN;
    const m=s.match(/^(-?\d*\.?\d+)\s*([kmbtKMBT万億兆])?$/); if(!m) return (isFinite(+s)?+s:NaN);
    let v=+m[1]; const u=(m[2]||'').toLowerCase(); const mul={k:1e3,m:1e6,b:1e9,t:1e12,'万':1e4,'億':1e8,'兆':1e12}[u]||1; return v*mul; }
  function _sfRerender(){ try{ renderStats((typeof _countriesSearchVal==='function')?_countriesSearchVal():searchVal()); }catch(_){ try{ renderStats(searchVal()); }catch(__){} } }
  window._sfToggle=()=>{ statsFilterOpen=!statsFilterOpen; _sfRerender(); };
  window._sfAdd=()=>{ statsFilters.push({key:'pop',op:'gte',raw:'',val:NaN}); statsFilterOpen=true; _sfRerender(); };
  window._sfRemove=(i)=>{ statsFilters.splice(i,1); _sfRerender(); };
  window._sfClear=()=>{ statsFilters=[]; _sfRerender(); };
  window._sfSetKey=(i,k)=>{ if(statsFilters[i]){ statsFilters[i].key=k; _sfRerender(); } };
  window._sfSetOp=(i,op)=>{ if(statsFilters[i]){ statsFilters[i].op=op; _sfRerender(); } };
  window._sfSetVal=(i,raw)=>{ if(statsFilters[i]){ statsFilters[i].raw=raw; statsFilters[i].val=_sfParse(raw); _sfRerender(); } };
  /* (#R163) moved to js/companies.js — see Architecture.md §3.1. */
  window.IntMapCompanies=window.IntMapModules.companies(IM_HOST);
  let coSort='mcap', coSortDir='desc', coFilters=[], coFilterOpen=false;
  const _coL=(en,jp,de,ru,es)=>currentLang==='jp'?jp:currentLang==='de'?de:currentLang==='ru'?ru:currentLang==='es'?(es||en):en;
  /* (#R142) Companies COMPARE + TIME MACHINE. Compare mirrors Countries: single-click a row selects it, double-click opens
     detail; a sticky tray shows the selection and opens a side-by-side bar view. Everything reads mcap()/_coVal, which
     follow the time-machine year, so both the ranking and the comparison reflect past statistics. */
  let coCompareSet=new Set(), _coTimeWired=false, _coTimeDeb=null;
  window._coToggleCompare=function(tk){ if(coCompareSet.has(tk)) coCompareSet.delete(tk); else if(coCompareSet.size<10) coCompareSet.add(tk); else { const f=coCompareSet.values().next().value; coCompareSet.delete(f); coCompareSet.add(tk); }
    document.querySelectorAll('#info-dashboard .co-row').forEach(r=>r.classList.toggle('compare-on',coCompareSet.has(r.getAttribute('data-tk'))));
    try{ const c=IntMapCompanies.DATA.find(x=>x.tk===tk); if(c) imToast((coCompareSet.has(tk)?'✓ ':'− ')+_coName(c)); }catch(_){}
    renderCoCompareFixed(); };
  window._coClearCompare=function(){ coCompareSet.clear(); document.querySelectorAll('#info-dashboard .co-row.compare-on').forEach(r=>r.classList.remove('compare-on')); renderCoCompareFixed(); };
  window._coShowCompare=function(){ if(coCompareSet.size<2) return; try{ showCoCompare([...coCompareSet]); }catch(_){} };
  /* (#R152) Companies-active test — mirrors _countriesActive() (currentMode==='info', or the ws-mode Companies window visible). */
  function _companiesActive(){ try{ if(currentMode==='info') return true; if(document.body.classList.contains('ws-mode')){ const w=document.querySelector('.ws-win.ws-info'); return !!(w&&w.style.display!=='none'); } }catch(_){} return false; }
  window._companiesActive=_companiesActive;
  /* (#R152) TRUE Countries parity — the compare dock is now the static absolute-overlay #co-compare-fixed (sibling of
     #stats-compare-fixed), shown via .show, with the SAME empty-hint / head / chips markup and the SAME visibility
     logic as renderCompareFixed(): show only when Companies is active and the compare VIEW (#co-cmp-view) isn't open. */
  function renderCoCompareFixed(){
    const panel=document.getElementById('co-compare-fixed'); if(!panel) return;
    const cmpOpen=!!document.getElementById('co-cmp-view');   /* the compare VIEW owns the feed → hide the dock */
    const active=_companiesActive();
    panel.classList.toggle('show', active && !cmpOpen);   /* VISIBILITY is gated on the active tab; CONTENT is always kept fresh so the count never goes stale (renderUI clears it on tab-leave) */
    if(cmpOpen){ panel.innerHTML=''; return; }
    if(!coCompareSet.size){ panel.innerHTML=`<div class="scf-empty">${t('coCompareEmpty')}</div>`; return; }
    const items=[...coCompareSet].map(tk=>IntMapCompanies.DATA.find(x=>x.tk===tk)).filter(Boolean);
    const chips=items.map(c=>`<span class="scb-chip">${IntMapSafe.html(_coName(c))}<button data-cx="${IntMapSafe.html(c.tk)}">×</button></span>`).join('');
    panel.innerHTML=`<div class="scf-head"><span class="scf-title">${_coL('Compare','比較','Vergleich','Сравнение','Comparar')} (${coCompareSet.size}/10)</span><div style="display:flex;gap:6px;">`+(coCompareSet.size>=2?`<button class="scf-view" data-cv="1">${t('compareView')}</button>`:'')+`<button data-cc="1">${t('compareClear')}</button></div></div><div class="scf-chips">${chips}</div>`;
    panel.querySelectorAll('[data-cx]').forEach(b=>b.onclick=()=>window._coToggleCompare(b.getAttribute('data-cx')));
    const cv=panel.querySelector('[data-cv]'); if(cv) cv.onclick=()=>window._coShowCompare();
    const cc=panel.querySelector('[data-cc]'); if(cc) cc.onclick=()=>window._coClearCompare(); }
  /* (#R145) Companies compare rebuilt to MIRROR the Countries #scp-view ("CompaniesもCountriesと同様に比較…できるだけ同じUIに"):
     sticky header + Back, a Bar-chart / Time-series / Table mode segment, a metric picker, palette chips with remove,
     an add-a-company search, a signed zero-axis bar view, an Excel-like table with CSV, and a price-history time-series.
     Reuses the .scp-* visual language (scoped to #co-cmp-view via _coCmpEnsureCss) so Countries stays untouched. */
  function showCoCompare(tks){ const feed=document.getElementById('info-dashboard'); if(!feed) return;
    const cos=(tks||[...coCompareSet]).map(tk=>IntMapCompanies.DATA.find(x=>x.tk===tk)).filter(Boolean);
    if(cos.length<2){ try{ renderCompanies(); }catch(_){} return; }
    _coCmpEnsureCss();
    const tray=document.getElementById('co-compare-fixed'); if(tray){ tray.classList.remove('show'); tray.innerHTML=''; }   /* (#R152) dock is now a STATIC overlay — hide it (don't remove the node) while the compare view owns the feed */
    if(!document.getElementById('co-cmp-view')){ feed.innerHTML='<div id="co-cmp-view"></div>'; feed.style.paddingBottom='24px'; }
    _coCmpRender(cos); }
  const _coName=(c)=>(currentLang==='jp'&&c.nJp)?c.nJp:c.n;
  window.setCoSort=function(k){ const D={mcap:'desc',rev:'desc',ni:'desc',pe:'asc',emp:'desc',price:'desc',fnd:'desc',name:'asc'}; coSort=k; coSortDir=D[k]||'desc'; renderCompanies(); };
  window.toggleCoSortDir=function(){ coSortDir=(coSortDir==='asc')?'desc':'asc'; renderCompanies(); };
  window._coSfToggle=()=>{ coFilterOpen=!coFilterOpen; renderCompanies(); };
  window._coSfAdd=()=>{ coFilters.push({key:'mcap',op:'gte',raw:'',val:NaN}); coFilterOpen=true; renderCompanies(); };
  window._coSfRemove=(i)=>{ coFilters.splice(i,1); renderCompanies(); };
  window._coSfClear=()=>{ coFilters=[]; renderCompanies(); };
  window._coSfSetKey=(i,k)=>{ if(coFilters[i]){ coFilters[i].key=k; renderCompanies(); } };
  window._coSfSetOp=(i,op)=>{ if(coFilters[i]){ coFilters[i].op=op; renderCompanies(); } };
  window._coSfSetVal=(i,raw)=>{ if(coFilters[i]){ coFilters[i].raw=raw; coFilters[i].val=_sfParse(raw); renderCompanies(); } };
  /* Countries-style ranking of companies, rendered into the (repurposed) #info-dashboard container. */
  /* (#R147) Company logos flickered ("ロゴがちかちか点滅") because the whole list is rebuilt via innerHTML on
     every progressive price update, and each rebuild re-started the Clearbit→favicon→monogram ladder from
     scratch (blank → 404 → favicon fetch → swap). Cache the RESOLVED logo per domain so a rebuild emits the
     already-working src (or the monogram) directly — no re-ladder, no flash. Plus debounce the price-driven
     re-render so the list repaints a few times, not ~25 times, during the load. */
  window.renderCompanies=renderCompanies;
  window.showCompanyDetail=showCompanyDetail;

  /* (#R79b) Countries is "active" either as the normal Stats tab OR as its own visible workspace window
     (in ws-mode currentMode isn't 'stats', which used to hide the compare dock → "比較機能が消えている"). */
  function _countriesActive(){ try{ if(currentMode==='stats') return true; if(document.body.classList.contains('ws-mode')){ const w=document.querySelector('.ws-win.ws-countries'); return !!(w&&w.style.display!=='none'); } }catch(_){} return false; }
  window._countriesActive=_countriesActive;
  /* Fixed bottom comparison panel (#26) — stays put while the country list scrolls. */
  function renderCompareFixed(){
    const panel=document.getElementById('stats-compare-fixed'); if(!panel) return;
    /* (#R70) the dock is the SELECTION tray only; the comparison itself lives in the unified view (scp-view).
       Hide the dock while that view owns the feed. */
    const scpOpen=!!document.getElementById('scp-view');
    try{ document.body.classList.toggle('scp-open', scpOpen); }catch(_){}   /* (#R102) keep the filter-hide class in sync with the compare view's real presence */
    const active=_countriesActive();
    panel.classList.toggle('show', active && !scpOpen);
    /* (#R105) only BLANK the dock when the compare VIEW owns the feed. A transiently-inactive Countries window
       (a ws re-tile / brief hide) must NOT blank it, or the "you can compare" hint vanishes and doesn't come back
       until the next renderStats ("比較できます案内が消えることがまれにある"). Just hide it; keep the content. */
    if(scpOpen){ panel.innerHTML=''; return; }
    if(!active){ return; }
    if(compareSet.size===0){ panel.innerHTML=`<div class="scf-empty">${t('compareEmpty')}</div>`; return; }
    const items=[...compareSet].map(c=>countryStats[c]).filter(Boolean);
    const chips=items.map((s)=>`<span class="scb-chip">${s.flag||'🏳️'} ${cName(s)}<button onclick="_toggleCompare('${s.code}')">×</button></span>`).join('');
    let head=`<div class="scf-head"><span class="scf-title">${t('compare')} (${compareSet.size}/10)</span><div style="display:flex;gap:6px;">`+
      (compareSet.size>=2?`<button class="scf-view" onclick="_showCompare()">${t('compareView')}</button>`:'')+
      `<button onclick="_clearCompare()">${t('compareClear')}</button></div></div>`;
    panel.innerHTML=head+`<div class="scf-chips">${chips}</div>`;
  }
  /* (#R70) renderCompareView (the separate static-bar comparison page) was MERGED into IntMapStatsCompare —
     its bar view is the unified comparison's default mode, on live per-indicator data, incl. all the bundled
     reference indicators (GDP PPP, area, HDI, democracy, military $, …) it used to show. */

  /* ===== Information Dashboard data
   *  `specs` is the structured "neat" view requested for military bases (runway, garrison, etc.).
   * ===================================================================== */
  let extendedDashDB=[];


  /* (#R212) moved to js/proxy-fetch.js — the deadline, the abort of the losers and the bounded
     fallback all live there, with the measurements that made them necessary. */
  /* Time-travel state: when newsDate is set (not null), feed URLs gain after:/before: qualifiers */
  let newsDate=null;
  function ymdISO(d){ return d.toISOString().slice(0,10); }

  /* ============================================================================
   *  (#R94) INTMAP TIME — the SPACETIME KERNEL. One master clock the whole app runs on.
   *  The time slider, the date/year inputs, Earth Replay and Atlas all WRITE to this
   *  single kernel; every time-aware subsystem (news, the dated NASA rasters, the
   *  Countries statistics, the NATO/EU accession fills, historical borders, the Köppen
   *  climate era and the day/night terminator) SUBSCRIBES to it (IntMapTime.on) and
   *  reconstructs itself for the chosen instant. `newsDate` stays the recent-archive
   *  facet (kept in lock-step) so every existing news/raster reader is untouched; the
   *  kernel adds deep-time reach (back to 1900) for the subsystems that carry a real
   *  historical series. Single source of truth = _when (a Date, or null = LIVE/now).
   *  When LIVE, every subsystem holds its own independent default; the moment you travel
   *  to a past instant they all sync to it, and returning to "Now" releases them. ====== */
  window.IntMapTime=(function(){
    const subs=[]; let _when=null; let _bcast=false; const YMIN=1900;
    const now=()=>new Date();
    function ev(source){ const w=_when, live=(w==null); const d=live?now():new Date(w);
      return { date: live?null:new Date(w), when:d, iso: ymdISO(d), year:d.getFullYear(), isLive:live, source:source||'api' }; }
    function broadcast(source){ if(_bcast) return; _bcast=true;
      const e=ev(source);
      /* keep the recent-archive facet in lock-step: past → the instant, live → null */
      try{ newsDate = e.isLive ? null : new Date(e.when); }catch(_){}
      subs.forEach(f=>{ try{ f(e); }catch(_){} });
      _bcast=false; return e; }
    const OS={};
    OS.get=()=>_when?new Date(_when):null;         /* the raw instant, or null when live */
    OS.when=()=>_when?new Date(_when):now();       /* always a Date (now when live) */
    OS.iso=()=>ymdISO(_when||now());
    OS.year=()=>(_when||now()).getFullYear();
    OS.isLive=()=>_when==null;
    OS.min=YMIN;
    OS.state=()=>ev('query');
    OS.on=function(fn){ if(typeof fn==='function'){ subs.push(fn); return ()=>{ const i=subs.indexOf(fn); if(i>=0) subs.splice(i,1); }; } return ()=>{}; };
    OS.set=function(d,opts){ opts=opts||{};
      let nd=(d instanceof Date)?new Date(d):(d!=null?new Date(d):null);
      if(nd && isNaN(nd.getTime())) return OS;
      if(nd){ const floor=new Date(Date.UTC(YMIN,0,1)); if(nd<floor) nd=floor;
        if(!opts.allowFuture){ const n=now(); if(nd.getTime()>n.getTime()) nd=null; } }   /* future → live */
      _when=nd; return broadcast(opts.source), OS; };
    OS.setYear=function(y,opts){ y=Math.round(+y); if(!(y>=YMIN)) return OS;
      const n=now(); if(y>=n.getFullYear()) return OS.setNow(opts);
      return OS.set(new Date(Date.UTC(y,5,15,12,0,0)), opts); };   /* mid-June noon UTC: neutral season/terminator */
    OS.setDaysAgo=function(days,opts){ days=Math.round(+days||0);
      if(days<=0) return OS.setNow(opts);
      const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-days); return OS.set(d,opts); };
    OS.setNow=function(opts){ _when=null; return broadcast((opts||{}).source), OS; };
    return OS;
  })();
  /* (#R169) moved verbatim to js/news-feed.js — see Architecture.md §3.1. */
  /* (#R40) TEMPORARY per request ("AIで解析済みのニュースをサーバーから取得というシステムは一時的に停止し、
     フロントエンドでの非AI地点解析システムのみを使って。全言語で"): force the client-side, non-AI gazetteer
     locator for EVERY language by skipping the Supabase current_news fast-path. Flip this back to true to
     re-enable the pre-analysed server feed. The realtime current_news subscription is gated on the same flag. */
  const USE_SERVER_NEWS = false;
  window.__IM_USE_SERVER_NEWS = USE_SERVER_NEWS;
  /* (#R169) moved verbatim to js/news-feed.js — see Architecture.md §3.1. */

  /* ===== Search =====
     Stats & Information filter live as you type (#27). News & Saved wait for the button /
     Enter (matching the request that those tabs are button-driven since search is heavier). */
  const searchInput=document.getElementById('search-input');
  /* (#R9/#52) Paste coordinates into the search box → instantly fly there. Accepts "lat, lng",
     "lat lng", and hemisphere forms like "35.68N, 139.76E" / "139.76°W 35.68°S" (either order). */
  function parseLatLng(raw){
    if(!raw) return null; const s=String(raw).trim();
    let m=s.match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if(m){ const a=+m[1], b=+m[2];
      if(Math.abs(a)<=90&&Math.abs(b)<=180) return [b,a];           /* lat,lng → [lng,lat] */
      if(Math.abs(b)<=90&&Math.abs(a)<=180) return [a,b];           /* given lng,lat */
      return null; }
    const N='(\\d{1,3}(?:\\.\\d+)?)';
    m=s.match(new RegExp('^'+N+'\\s*°?\\s*([NSns])\\s*[,\\s]\\s*'+N+'\\s*°?\\s*([EWew])$'));
    if(m){ const lat=+m[1]*(/[Ss]/.test(m[2])?-1:1), lng=+m[3]*(/[Ww]/.test(m[4])?-1:1); if(Math.abs(lat)<=90&&Math.abs(lng)<=180) return [lng,lat]; }
    m=s.match(new RegExp('^'+N+'\\s*°?\\s*([EWew])\\s*[,\\s]\\s*'+N+'\\s*°?\\s*([NSns])$'));
    if(m){ const lng=+m[1]*(/[Ww]/.test(m[2])?-1:1), lat=+m[3]*(/[Ss]/.test(m[4])?-1:1); if(Math.abs(lat)<=90&&Math.abs(lng)<=180) return [lng,lat]; }
    return null;
  }
  let _coordFlyT=null;
  function coordFly(ll){ if(!ll||!GE().hasRenderer()) return; clearTimeout(_coordFlyT); _coordFlyT=setTimeout(()=>{ try{ GE().camera.flyTo({center:ll, zoom:Math.max(GE().camera.getZoom?GE().camera.getZoom():2,6), speed:1.3, essential:true}); }catch(_){} },160); }
  searchInput.addEventListener('input',()=>{ const ll=parseLatLng(searchInput.value); if(ll){ coordFly(ll); return; } if(currentMode==='stats')renderStats(searchVal()); else if(currentMode==='info')renderDashboard(); });
  function runSearch(){ const ll=parseLatLng(searchInput.value); if(ll){ coordFly(ll); return; } if(currentMode==='stats'){ renderStats(searchVal()); return; } if(currentMode==='info'){ renderDashboard(); return; } if(currentMode==='saved'){ startNews(); return; } activeSearchQuery=searchInput.value.trim(); globalData=[]; fetchData(); }
  document.getElementById('btn-search').onclick=runSearch;
  searchInput.addEventListener('keydown',(e)=>{ if(e.key==='Enter')runSearch(); });

  /* ===== View / Projection ===== */
  /* (#R13c) Map/Sat switching was "often" failing: btn-view-map early-returned whenever currentMapType
     was already 'map', so if the state ever desynced from what's drawn (a style op overwrote the basemap
     visibility), clicking Map did nothing. Now both always re-assert, and schedule one more reassert on the
     next idle to win any race with a concurrent style/layer change. */
  /* (#R15c) "反応しないことがある" — re-assert a few times after the click too, so a click that lands while
     the style is mid-swap (idle may have already passed) still takes effect. Cheap + idempotent. */
  /* (#R16) "反応しないことがある" for good: POLL until the basemap visibility actually matches the chosen
     mode. Fixed-delay re-asserts (120/400/900 ms) all miss when the style finishes loading later than that
     and the (continuously-rendering globe) never fires `idle`. This keeps re-applying every 150 ms until
     layer-sat visibility == wanted (or the user switches again / a ~5 s cap), so the switch always lands. */
  function _reassertBase(mode){
    let n=0; clearInterval(window._baseReassertT);
    window._baseReassertT=setInterval(()=>{
      n++;
      try{
        if(typeof currentMapType==='undefined' || currentMapType!==mode){ clearInterval(window._baseReassertT); return; }
        if(canDraw() && GE().layers.has('layer-sat')){
          const wantSat=(mode==='sat'), isSat=(GE().layers.getLayout('layer-sat','visibility')==='visible');
          if(wantSat!==isSat) applyTheme(); else { clearInterval(window._baseReassertT); }
        }
      }catch(_){}
      if(n>34){ clearInterval(window._baseReassertT); }
    },150);
  }
  /* ===================================================================
     (#R82) IntMap OS — the ATLAS KERNEL.  ★ Structural inversion (ATLAS-VISION 最終定義) ★
     Not "Atlas lives inside IntMap" but "all of IntMap runs ON TOP OF Atlas." Every operation flows through
     THIS one kernel. The graphical UI and the Atlas chat are both thin SHELLS that submit intents to it; the
     kernel executes them via registered commands (the real engine work) and the Atlas action dispatcher. This
     replaces the old indirection where Atlas operated IntMap by SIMULATING UI clicks (clickId) — now the UI
     shell → kernel → engine AND the NL shell → kernel → engine (one path, observable). Additive + staged: the
     map-view + tab controls are TRULY inverted this round (their real logic lives in kernel COMMANDS that both
     the button onclick and Atlas call); the rest of the UI stays reachable through the bound Atlas dispatch
     (IntMapOS.dispatch) + catalogued (IntMapOS.catalog) and is logged, then progressively converted. Every op
     from either shell is recorded in the syscall log + broadcast on the bus. ============================= */
  window.IntMapOS=(function(){
    const OS={}, commands={}, subs=[], _log=[];
    let _dispatch=null;
    function emit(ev){ subs.forEach(f=>{ try{ f(ev); }catch(_){} }); }
    function rec(o){ _log.push(o); if(_log.length>200) _log.shift(); emit(o); return o; }
    OS.register=function(id,run,meta){ if(id&&typeof run==='function') commands[id]={run:run,meta:meta||{}}; return id; };
    OS.has=function(id){ return !!commands[id]; };
    OS.meta=function(id){ return commands[id]?commands[id].meta:null; };
    OS.list=function(){ return Object.keys(commands); };
    OS.on=function(fn){ if(typeof fn==='function'){ subs.push(fn); return function(){ const i=subs.indexOf(fn); if(i>=0) subs.splice(i,1); }; } return function(){}; };
    OS.emit=emit;
    OS.log=function(){ return _log.slice(-80); };
    /* exec(id, ctx) — run a registered COMMAND: the canonical, INVERTED path (real engine work). */
    OS.exec=function(id, ctx){ ctx=ctx||{}; const c=commands[id];
      const r={t:Date.now(), cmd:id, source:ctx.source||'ui', ok:true};
      if(!c){ r.ok=false; r.err='no command'; rec(r); return {ok:false,err:'no command: '+id}; }
      let res; try{ res=c.run(ctx); if(res&&res.ok===false) r.ok=false; }catch(e){ r.ok=false; r.err=(e&&e.message)||'error'; }
      rec(r); return (res===undefined)?{ok:r.ok}:res; };
    /* dispatch(action) — the Atlas semantic (typed-action) layer, attached by Atlas at init. A bare
       {cmd:'id'} runs a registered command; everything else goes to the Atlas dispatcher. Both are logged. */
    OS.dispatch=function(a, ctx){ ctx=ctx||{};
      if(a&&a.cmd&&commands[a.cmd]) return OS.exec(a.cmd,{source:ctx.source||'api',params:a});
      rec({t:Date.now(), cmd:(a&&a.type)||'action', source:ctx.source||'api', ok:true, action:true});
      if(_dispatch) return _dispatch(a); return {ok:false,err:'kernel dispatcher not ready'}; };
    OS.state=function(){ return ''; };                       /* replaced by Atlas (stateContext) */
    OS.catalog=function(){ return {commands:OS.list()}; };   /* replaced by Atlas (full control/layer/module catalog) */
    OS._setDispatch=function(fn){ _dispatch=fn; };
    OS._bindState=function(fn){ if(typeof fn==='function') OS.state=fn; };
    OS._bindCatalog=function(fn){ if(typeof fn==='function') OS.catalog=fn; };
    OS.ready=function(){ return !!_dispatch; };
    return OS;
  })();
  /* map basemap — TRUE kernel commands (logic lives here; button + Atlas both call the SAME command). */
  IntMapOS.register('view.base.map', ()=>{ currentMapType='map'; document.getElementById('btn-view-map').classList.add('active'); document.getElementById('btn-view-sat').classList.remove('active'); applyTheme(); if(GE().hasRenderer()) GE().events.once('idle',()=>{ try{ if(currentMapType==='map') applyTheme(); }catch(_){} }); _reassertBase('map'); }, {label:'Map basemap', btn:'btn-view-map', group:'view'});
  /* (#R101) switching to Satellite no longer force-opens the provider/date panel (satPanelDismissed stays true on
     desktop). The panel is rendered ready; it opens only when the user re-clicks the active Satellite button. */
  IntMapOS.register('view.base.sat', ()=>{ currentMapType='sat'; document.getElementById('btn-view-sat').classList.add('active'); document.getElementById('btn-view-map').classList.remove('active'); applyTheme(); satReady(()=>{ satRenderController(); satApply(false); }); if(GE().hasRenderer()) GE().events.once('idle',()=>{ try{ if(currentMapType==='sat') applyTheme(); }catch(_){} }); _reassertBase('sat'); }, {label:'Satellite basemap', btn:'btn-view-sat', group:'view'});
  document.getElementById('btn-view-map').onclick=()=>IntMapOS.exec('view.base.map',{source:'ui'});
  /* (#R101) already on Satellite → toggle the provider/date panel (desktop). Otherwise switch to Satellite. */
  document.getElementById('btn-view-sat').onclick=()=>{ const _mob=window.matchMedia&&window.matchMedia('(max-width:768px)').matches;
    if(!_mob && typeof currentMapType!=='undefined' && currentMapType==='sat'){ const p=document.getElementById('sat-controller'); if(p){ const showing=(p.style.display==='block'); satPanelDismissed=showing; p.style.display=showing?'none':'block'; if(!showing){ try{ satRenderController(); }catch(_){} } } return; }
    IntMapOS.exec('view.base.sat',{source:'ui'}); };
  /* Self-heal: whenever the style changes (a layer add/remove can re-stack or reset basemap visibility),
     re-assert the basemap if it no longer matches the chosen mode. Guarded to a real mismatch → no loop. */
  if(GE().hasRenderer()) GE().events.on('styledata',()=>{ try{ if(!GE().ready()||!GE().layers.has('layer-sat')) return; const wantSat=(currentMapType==='sat'); const isSat=(GE().layers.getLayout('layer-sat','visibility')==='visible'); if(wantSat!==isSat) applyTheme(); }catch(_){} });
  /* (#R7-mobile-zoom) Mobile Mercator must zoom out far enough to see the whole world. A min-zoom of
     1.4 left the world bigger than a portrait phone, so it felt "stuck" — phones get 0 (full world),
     desktop keeps a sensible floor. */
  function flatMinZoom(){ return isMobile()?0:1.2; }
  /* projection — TRUE kernel commands (UI + Atlas both call these). */
  IntMapOS.register('view.proj.flat', ()=>{ currentProj='flat'; document.getElementById('btn-view-flat').classList.add('active'); document.getElementById('btn-view-globe').classList.remove('active'); if(!GE().hasRenderer())return; GE().camera.setProjection('flat'); GE().camera.setMinZoom(flatMinZoom()); try{ applyFlatPanSetting(); }catch(_){} updateOcclusion(); try{ window._cmpFollowProj&&window._cmpFollowProj(); }catch(_){} }, {label:'Flat map', btn:'btn-view-flat', group:'view'});
  IntMapOS.register('view.proj.globe', ()=>{ currentProj='globe'; document.getElementById('btn-view-globe').classList.add('active'); document.getElementById('btn-view-flat').classList.remove('active'); if(!GE().hasRenderer())return; try{ GE().camera.setMaxBounds(null); GE().camera.setRenderWorldCopies(false); }catch(_){} GE().camera.setMinZoom(0); GE().camera.setProjection('globe'); updateOcclusion(); try{ window._cmpFollowProj&&window._cmpFollowProj(); }catch(_){} }, {label:'Globe', btn:'btn-view-globe', group:'view'});
  document.getElementById('btn-view-flat').onclick=()=>IntMapOS.exec('view.proj.flat',{source:'ui'});
  document.getElementById('btn-view-globe').onclick=()=>IntMapOS.exec('view.proj.globe',{source:'ui'});

  /* ===== 3D terrain (Google-Earth-style relief) ===== */
  let terrain3D=false;
  function ensureTerrainSource(){
    if(GE().layers.hasSource('terrain-dem')) return true;
    /* Three host aliases for the SAME AWS terrarium DEM tiles. The browser opens a separate connection
       pool per hostname, so round-robining across them ~triples concurrent DEM throughput while tilted
       in 3D — the elevation tiles were the under-fetch bottleneck (user saw <10 Mbps) (#2,#18). */
    try{ GE().layers.addSource('terrain-dem',{type:'raster-dem',tiles:[
        /* (#R7) Five host aliases for the SAME AWS terrarium DEM bucket. Each distinct hostname gets its
           own browser connection pool, so round-robining ~5× the concurrent DEM fetches over HTTP/1.1
           S3 — the DEM tiles were the 3D under-fetch bottleneck the user measured (<10 Mbps). */
        'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
        'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png',
        'https://elevation-tiles-prod.s3.dualstack.us-east-1.amazonaws.com/terrarium/{z}/{x}/{y}.png',
        'https://elevation-tiles-prod.s3.us-east-1.amazonaws.com/terrarium/{z}/{x}/{y}.png',
        'https://s3.dualstack.us-east-1.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
      /* (#R19) Desktop DEM maxzoom 13→14: terrarium serves up to z15, so tilted close-ups get ~2× finer
         relief geometry (sharper ridgelines/valleys = the "画質を高めて" half) while the multi-host pool +
         SW cache keep it fast (the "表示速度" half — neither sacrificed). Phones stay at 13: the extra
         DEM tile set is real RAM that risks the tab. */
      /* (#R20) desktop 14→15 = terrarium's NATIVE max: tilted close-ups now load the finest mesh that
         exists, a straight quality win with no downscale anywhere; phones stay at 13 for RAM safety. */
      ],encoding:'terrarium',tileSize:256,maxzoom:(isMobile()?13:15)}); return true; }
    catch(e){ console.warn('terrain source failed',e); return false; }
  }
  function set3D(on){
    if(!GE().hasRenderer()) return;
    const b3=document.getElementById('btn-view-3d');
    const syncBtns=()=>{ if(b3) b3.classList.toggle('active',terrain3D); document.querySelectorAll('[data-proxy="btn-view-3d"]').forEach(b=>b.classList.toggle('active',terrain3D)); };
    if(on){
      if(!ensureTerrainSource()){ try{ imToast(currentLang==='jp'?'3D地形を読み込めませんでした':currentLang==='de'?'3D-Gelände konnte nicht geladen werden':currentLang==='ru'?'Не удалось загрузить 3D-рельеф':currentLang==='es'?'No se pudo cargar el terreno 3D':'Could not load 3D terrain'); }catch(_){} return; }
      terrain3D=true; syncBtns();
      try{ GE().scene.setTerrain({source:'terrain-dem',exaggeration:1.0}); }catch(e){}   /* true 1:1 vertical scale */
      /* ⚠ (#R196) THIS NO LONGER SETS THE SKY. It used to install a mercator-only block — a blue dome
         plus fog-ground-blend 0.35, i.e. the same white distance wash the flight simulator was told to
         drop this round — which then FOUGHT _applySkyAtmosphere for ownership: whichever ran last won,
         and the sky changed depending on the order in which 3-D and the basemap were toggled. The sky
         has one owner now (_applySkyAtmosphere) and it covers every projection, so switching terrain
         on simply leaves it alone. */
      /* (#R7-3D-notilt) Do NOT move the camera when 3D is enabled. The user asked that selecting 3D
         change nothing on screen — terrain is attached so relief appears the moment THEY tilt
         (right-drag / two-finger), but we never auto-pitch or auto-zoom. */
    } else {
      terrain3D=false; syncBtns();
      try{ GE().scene.setTerrain(null); }catch(e){}
      /* leave the camera exactly where it is — no forced flatten (don't move on toggle). */
    }
  }
  { const b3=document.getElementById('btn-view-3d'); if(b3) b3.onclick=()=>set3D(!terrain3D); }

  /* ===== Mode tabs (deselectable) ===== */
    /* (#R83) Countries(info) is NO LONGER auto-toggled by the Countries tab (user: 「Countriesで、Countries(info)が
       オンされるのは今後はなしで」). The Countries tab still loads the country DATA it needs for its rows/compare,
       but the MAP's Countries(info) overlay (cb-countries) is now fully manual — it is neither auto-enabled on
       entering the tab nor auto-disabled on leaving it. The checkbox in the Layers panel still works as always. */
    function _setCountriesInfo(on){ try{ const cb=document.getElementById('cb-countries'); if(cb&&cb.checked!==on){ cb.checked=on; cb.dispatchEvent(new Event('change',{bubbles:true})); } }catch(_){} }
  function setMode(mode,btnId){
    if(currentMode===mode){ currentMode=null; document.querySelectorAll('.control-panel .mode-btn').forEach(b=>b.classList.remove('active')); renderUI(); return; }
    currentMode=mode; document.querySelectorAll('.control-panel .mode-btn').forEach(b=>b.classList.remove('active')); document.getElementById(btnId).classList.add('active');
    if(mode==='stats'){ if(!countryDataLoaded)loadCountryData(); }
    renderUI();
  }
  /* (#R200) moved to js/session-tabs.js — a real ES module (see the import at the top of this file), not a
     window.IntMapModules entry and not a line in src/main.js's ordered list. */
  makeSessionTabs(IM_HOST, { GE, isMobile, setMode });

  /* ===== Language ===== */
  function setLang(lang){
    if(!['en','jp','de','ru','es'].includes(lang) || currentLang===lang) return;   /* (#R37) all four UI languages: EN/JP/DE/RU */
    currentLang=lang;
    try{ ['en','jp','de','ru','es'].forEach(L=>{ const b=document.getElementById('lang-'+L); if(b) b.classList.toggle('active',lang===L); }); }catch(_){}
    try{ document.documentElement.setAttribute('lang', lang==='jp'?'ja':lang); }catch(_){}
    const sl=document.getElementById('setting-lang'); if(sl) sl.value=lang;
    globalData=[]; updateI18n(); fetchData(); try{ saveSettings(); }catch(_){}
    try{ applyLabelLang(); }catch(_){}   /* (#R40) re-apply map place-label language immediately on pill switch (was only on Settings-Apply → RU/ES labels stayed English until Apply) */
    try{ window.dispatchEvent(new Event('intmap-lang')); }catch(_){}   /* modules that relabel on language change */
  }
  document.getElementById('lang-en').onclick=()=>setLang('en');
  document.getElementById('lang-jp').onclick=()=>setLang('jp');
  { const ld=document.getElementById('lang-de'); if(ld) ld.onclick=()=>setLang('de'); }
  { const lr=document.getElementById('lang-ru'); if(lr) lr.onclick=()=>setLang('ru'); }
  { const le=document.getElementById('lang-es'); if(le) le.onclick=()=>setLang('es'); }   /* (#R40) Spanish (beta) */
  { const sl=document.getElementById('setting-lang'); if(sl) sl.addEventListener('change',e=>setLang(e.target.value)); }
  /* Multi-select news languages (shown when "Multiple languages…" is chosen in Settings). */
  function newsLangNameOf(c){ return (NEWS_LANG_NAMES[c]&&(NEWS_LANG_NAMES[c][currentLang]||NEWS_LANG_NAMES[c].en))||c; }
  function updateNewsLangLabel(){ const lbl=document.getElementById('newslang-dd-label'); if(!lbl) return;
    const sel=newsLangs||[]; lbl.textContent = sel.length? sel.map(newsLangNameOf).join(', ') : (currentLang==='jp'?'未選択':currentLang==='de'?'Nichts ausgewählt':currentLang==='ru'?'Не выбрано':currentLang==='es'?'Nada seleccionado':'None selected'); }
  function renderNewsLangChecks(){
    const wrap=document.getElementById('newslang-multi'), hint=document.getElementById('newslang-hint'), sel=document.getElementById('setting-newslang'), dd=document.getElementById('newslang-dd');
    if(!wrap||!sel) return;
    const show=(sel.value==='multi');
    if(dd) dd.style.display=show?'block':'none'; if(hint) hint.style.display=show?'block':'none';
    if(!wrap.dataset.built){
      wrap.innerHTML=Object.keys(NEWS_LANG_NAMES).map(code=>`<label><input type="checkbox" value="${code}"> <span class="nlx" data-code="${code}"></span></label>`).join('');
      wrap.dataset.built='1';
      /* (#R33) The checked boxes are the SINGLE SOURCE OF TRUTH for newsLangs — update + persist on every
         change so the saved set always equals exactly what the user ticked (fixes the desync where other
         languages appeared checked / a tap didn't stick). */
      wrap.addEventListener('change',(e)=>{ if(e.target&&e.target.type==='checkbox'){ newsLangs=Array.from(wrap.querySelectorAll('input[type=checkbox]:checked')).map(c=>c.value);
          try{ localStorage.setItem('intmap_news_langs',JSON.stringify(newsLangs)); }catch(_){} try{ window._syncPrefsUp&&window._syncPrefsUp(); }catch(_){} }
        const lbl=document.getElementById('newslang-dd-label'); if(lbl) lbl.textContent=(newsLangs.length?newsLangs.map(newsLangNameOf).join(', '):(currentLang==='jp'?'未選択':currentLang==='de'?'Nichts ausgewählt':currentLang==='ru'?'Не выбрано':currentLang==='es'?'Nada seleccionado':'None selected')); });
    }
    wrap.querySelectorAll('input[type=checkbox]').forEach(cb=>{ cb.checked=newsLangs.includes(cb.value); });
    wrap.querySelectorAll('.nlx').forEach(s=>{ const c=s.getAttribute('data-code'); s.textContent=newsLangNameOf(c); });
    updateNewsLangLabel();
  }
  { const sel=document.getElementById('setting-newslang'); if(sel) sel.addEventListener('change',renderNewsLangChecks); }
  (function wireNewsLangDD(){ const dd=document.getElementById('newslang-dd'), btn=document.getElementById('newslang-dd-btn'); if(!dd||!btn) return;
    btn.addEventListener('click',(e)=>{ e.stopPropagation(); dd.classList.toggle('open'); });
    document.addEventListener('click',(e)=>{ if(dd.classList.contains('open') && !dd.contains(e.target)) dd.classList.remove('open'); });
  })();
  /* (#R35) DETERMINISTIC toggle for the multi-select dropdown checkboxes (news languages + countries).
     ROOT CAUSE of "タップした言語と違う言語にチェックが入る" on mobile: a nested <label><input> fires a
     ~300ms-delayed synthetic click on iOS that, after any reflow, can land on an ADJACENT label → the wrong
     box toggles. (pointer-events:none on the box + touch-action alone did NOT fully kill it.) We now OWN the
     toggle: on a real tap inside a label we preventDefault the native activation and flip EXACTLY that
     label's checkbox — never a neighbour. This is the root-cause fix, NOT a spacing hack. Delegated on the
     panel so it also covers checkboxes added later; a genuine scroll/drag still passes through. */
  (function wireDetTap(){
    document.querySelectorAll('.nc-dd-panel').forEach(panel=>{
      if(panel.dataset.detTap) return; panel.dataset.detTap='1';
      let downLab=null, dX=0, dY=0, moved=false, lastT=0, lastCb=null;
      /* (#R37) Resolve the row the finger went DOWN on, falling back to elementFromPoint so a tap that lands a hair
         into the row GAP still resolves to a real row (the old code left downLab=null there and then toggled the
         CLICK target — a NEIGHBOUR after a reflow → "タップした言語と違う言語にチェックが入る"). */
      const labAt=(e)=>{ let l=e.target&&e.target.closest?e.target.closest('label'):null; if(!l){ try{ const el=document.elementFromPoint(e.clientX,e.clientY); l=el&&el.closest?el.closest('label'):null; }catch(_){} } return (l&&panel.contains(l))?l:null; };
      panel.addEventListener('pointerdown',e=>{ downLab=labAt(e); dX=e.clientX; dY=e.clientY; moved=false; },true);
      panel.addEventListener('pointermove',e=>{ if(Math.abs(e.clientX-dX)>26||Math.abs(e.clientY-dY)>26) moved=true; },true);
      panel.addEventListener('click',e=>{
        /* Toggle the label the FINGER WENT DOWN ON — never the (drift-prone) click target. We always OWN it, so a
           delayed click landing on a neighbour can neither toggle the wrong row nor double-fire. */
        const lab = downLab; if(!lab){ if(e.target.closest&&e.target.closest('label')){ e.preventDefault(); e.stopPropagation(); } return; }
        e.preventDefault(); e.stopPropagation();              /* cancel the native (mis-targetable) label toggle */
        if(moved) return;                                     /* a real scroll/drag → no toggle */
        const cb=lab.querySelector('input[type=checkbox]'); if(!cb||cb.disabled) return;
        const now=Date.now(); if(cb===lastCb && now-lastT<350) return;   /* swallow a duplicate/echo click on the same box */
        lastT=now; lastCb=cb;
        cb.checked=!cb.checked; cb.dispatchEvent(new Event('change',{bubbles:true}));
      },true);
    });
  })();

  /* ===== Settings + Timezones ===== */
  let _tzZones=null;
  /* (#R18) iOS-friendly timezone COMBOBOX. A native `<select size>` is miserable on iOS (it renders a
     single-line wheel even with size>1, so the "search" never showed a usable list — "検索窓が使いにくい").
     Now: a text input + a custom tappable dropdown of big rows; the hidden `<select id=setting-tz>` is
     kept purely as the value store the Save pipeline already reads, so nothing downstream changes.
     populateTimezones(filter) rebuilds BOTH the hidden options (for value) and the visible rows. */
  function _tzList(){ if(!_tzZones){ try{ _tzZones=Intl.supportedValuesOf('timeZone'); }catch(e){ _tzZones=['UTC','Asia/Tokyo','America/New_York','Europe/London','Europe/Moscow','Europe/Berlin','Asia/Shanghai','America/Los_Angeles','Asia/Kolkata','Australia/Sydney']; } } return _tzZones; }
  function _tzSelect(val){ const sel=document.getElementById('setting-tz'), inp=document.getElementById('setting-tz-search'); if(!sel) return;
    if(!sel.querySelector('option[value="'+(window.CSS&&CSS.escape?CSS.escape(val):val)+'"]')){ const o=document.createElement('option'); o.value=val; o.textContent=(val==='auto'?(i18n[currentLang].optLocal):val.replace(/_/g,' ')); sel.appendChild(o); }
    sel.value=val; if(inp) inp.value=(val==='auto'?'':val.replace(/_/g,' ')); sel.dispatchEvent(new Event('change',{bubbles:true})); }
  function populateTimezones(filter){
    const sel=document.getElementById('setting-tz'); if(!sel) return;
    const res=document.getElementById('tz-results');
    const zones=_tzList(); const q=(filter||'').trim().toLowerCase();
    const prev=(sel.value||userTZ);
    /* hidden <select> = the full set (so the saved value always resolves) */
    sel.innerHTML='';
    const addOpt=(v,label)=>{ const o=document.createElement('option'); o.value=v; o.textContent=label; sel.appendChild(o); };
    addOpt('auto', i18n[currentLang].optLocal); addOpt('UTC','UTC');
    zones.forEach(z=>{ if(z!=='UTC') addOpt(z, z.replace(/_/g,' ')); });
    if(prev && !sel.querySelector('option[value="'+(window.CSS&&CSS.escape?CSS.escape(prev):prev)+'"]')) addOpt(prev, prev.replace(/_/g,' '));
    sel.value=prev;
    /* visible tappable rows = filtered */
    if(!res) return; res.innerHTML='';
    const rows=[]; const add=(v,label)=>rows.push({v,label});
    if(!q || 'auto'.includes(q) || (i18n[currentLang].optLocal||'').toLowerCase().includes(q)) add('auto', i18n[currentLang].optLocal);
    if(!q || 'utc'.includes(q)) add('UTC','UTC');
    zones.forEach(z=>{ if(z==='UTC')return; const disp=z.replace(/_/g,' '); if(!q || disp.toLowerCase().includes(q) || z.toLowerCase().includes(q)) add(z,disp); });
    rows.slice(0,80).forEach(r=>{ const d=document.createElement('div'); d.className='tz-row'+(r.v===prev?' sel':''); d.textContent=r.label; d.setAttribute('role','option');
      d.addEventListener('click',()=>{ _tzSelect(r.v); res.classList.remove('show'); }); res.appendChild(d); });
    if(!rows.length){ const d=document.createElement('div'); d.className='tz-row tz-empty'; d.textContent=(currentLang==='jp'?'該当なし':currentLang==='de'?'Kein Treffer':currentLang==='ru'?'Нет совпадений':currentLang==='es'?'Sin coincidencias':'No match'); res.appendChild(d); }
  }
  (function wireTzSearch(){ const inp=document.getElementById('setting-tz-search'), sel=document.getElementById('setting-tz'), res=document.getElementById('tz-results'); if(!inp||!res) return;
    const open=()=>{ populateTimezones(inp.value); res.classList.add('show'); };
    inp.addEventListener('input',open);
    inp.addEventListener('focus',()=>{ inp.value=''; open(); });
    /* Enter picks the first visible row (keyboard users) */
    inp.addEventListener('keydown',(e)=>{ if(e.key!=='Enter') return; e.preventDefault(); const first=res.querySelector('.tz-row:not(.tz-empty)'); if(first){ first.click(); inp.blur(); } });
    /* tapping outside the combo closes the list */
    document.addEventListener('click',(e)=>{ const combo=document.getElementById('tz-combo'); if(combo && !combo.contains(e.target)) res.classList.remove('show'); });
  })();
  const modal=document.getElementById('settings-modal');
  /* Discard-changes guard: any edit inside Settings marks it dirty; closing without Apply asks. */
  let settingsDirty=false;
  function closeSettings(){
    if(settingsDirty && !confirm(currentLang==='jp'?'変更を保存していません。破棄して閉じますか？':currentLang==='de'?'Ungespeicherte Änderungen verwerfen?':currentLang==='ru'?'Изменения не сохранены. Отменить их?':currentLang==='es'?'Hay cambios sin guardar. ¿Descartarlos?':'You have unsaved changes. Discard them?')) return;
    settingsDirty=false; modal.style.display='none';
    try{ window._accentPending=window.imAccent; applyAccent(); }catch(_){}   /* (#R114) discard any live accent preview → back to the committed colour */
  }
  modal.addEventListener('input', ()=>{ settingsDirty=true; });
  modal.addEventListener('change', ()=>{ settingsDirty=true; });
  /* ══ (#R212) THE DAY/NIGHT SWITCH TAKES EFFECT WHEN IT IS SWITCHED ═══════════════════════════════
     「設定から、昼夜を表示するのをオフにできるように。（追記：オフにしてもオフにならない。）」 #R210 wired
     it into the Apply handler, and Apply is `btn-close-settings` — but this dialog has a SECOND way
     out (`closeSettings`, the ✕ and Escape) which discards everything, and it is the one that looks
     like «close». A display toggle has no reason to wait for a commit at all: it is instant, it is
     reversible, and it persists itself (js/night-side.js writes the key). So it applies on `change`
     as well — the Apply path still runs and is now a no-op for this control. */
  { const ns=document.getElementById('setting-night-side');
    if(ns) ns.addEventListener('change',()=>{ try{ if(window.IntMapNightSide) window.IntMapNightSide.setEnabled(ns.value!=='off'); }catch(_){} }); }
  /* (#R21) Tutorial button (top of Settings) — closes the panel and replays the layer showcase. */
  (function(){ const tb=document.getElementById('btn-tutorial'); if(!tb) return;
    const lbl=()=>{ const e=document.getElementById('btn-tutorial-lbl'); if(e) e.textContent=(currentLang==='jp')?'チュートリアル（レイヤー紹介ツアー）':'Tutorial — layer showcase'; };
    lbl(); window.addEventListener('intmap-lang',lbl);
    tb.onclick=(e)=>{ e.preventDefault(); settingsDirty=false; modal.style.display='none';
      try{ window._imDemoStop&&window._imDemoStop(); }catch(_){}
      setTimeout(()=>{ try{ window._imStartDemo&&window._imStartDemo(true); }catch(_){} },150); };
  })();
  document.getElementById('btn-open-settings').onclick=()=>{ const sl=document.getElementById('setting-lang'); if(sl) sl.value=currentLang; document.getElementById('setting-theme').value=userTheme;
    /* (#R18) Reflect the SAVED timezone in the combo input and rebuild the (closed) list on every open. */
    try{ const tzs=document.getElementById('setting-tz-search'); const tzr=document.getElementById('tz-results');
      if(typeof populateTimezones==='function') populateTimezones('');
      document.getElementById('setting-tz').value=userTZ;
      if(tzs) tzs.value=(userTZ&&userTZ!=='auto')?userTZ.replace(/_/g,' '):'';
      if(tzr) tzr.classList.remove('show');
    }catch(_){}
    document.getElementById('setting-tz').value=userTZ; document.getElementById('setting-units').value=unitMode; { const tu=document.getElementById('setting-temp-unit'); if(tu) tu.value=window.imUnitTemp||'both'; } { const al=document.getElementById('setting-ailocate'); if(al) al.value=aiLocateMode; } document.getElementById('setting-newslang').value=newsLangMode; try{ renderNewsLangChecks(); }catch(_){} try{ satRenderKeyInputs(); }catch(_){} try{ aiRenderSettings(); }catch(_){} try{ aiFetchUsage(); }catch(_){}
    /* (#R20) nav sensitivity sliders reflect the saved values + live % labels */
    try{ const zs=document.getElementById('setting-zoom-sens'), ps=document.getElementById('setting-pan-sens'), is=document.getElementById('setting-inertia');
      const zv=document.getElementById('zoom-sens-val'), pv=document.getElementById('pan-sens-val'), iv=document.getElementById('inertia-val');
      if(zs){ zs.value=Math.round((window.imNavZoomSens||1)*100); if(zv) zv.textContent=zs.value+'%'; zs.oninput=()=>{ if(zv) zv.textContent=zs.value+'%'; }; }
      if(ps){ ps.value=Math.round((window.imNavPanSens||1)*100); if(pv) pv.textContent=ps.value+'%'; ps.oninput=()=>{ if(pv) pv.textContent=ps.value+'%'; }; }
      if(is){ is.value=Math.round((window.imNavInertia==null?1:window.imNavInertia)*100); if(iv) iv.textContent=is.value+'%'; is.oninput=()=>{ if(iv) iv.textContent=is.value+'%'; }; }
    }catch(_){}
    /* (#R171) tilt ceiling + viewpoint-altitude readout reflect the SAVED state (each subsystem owns it) */
    try{ const tl=document.getElementById('setting-tilt-limit'); if(tl&&window.IntMapTilt) tl.value=window.IntMapTilt.isUnlimited()?'unlimited':'standard';
      const ea=document.getElementById('setting-eye-alt'); if(ea&&window.IntMapEyeAlt) ea.value=window.IntMapEyeAlt.isOn()?'on':'off'; const ns=document.getElementById('setting-night-side'); if(ns&&window.IntMapNightSide&&window.IntMapNightSide.isOn) ns.value=window.IntMapNightSide.isOn()?'on':'off'; }catch(_){}   /* (#R210) 昼夜表示 */
    /* (#R180) the ENGINE, and — separately — the engine actually running. Those are two
       facts and conflating them is exactly how a silent fallback hides (#R162): Cesium can
       fail to load (no WebGL2, a blocked chunk, an offline first visit) and the session then
       runs on MapLibre while the stored choice still says otherwise. The select shows the
       CHOICE; the line under it shows what is really drawing, and only when they differ. */
    try{ const es=document.getElementById('setting-engine'), st=document.getElementById('engine-status');
      const ES=window.IntMapEngineSelect;
      if(es&&ES){ es.value=ES.choice();
        const live=ES.active(), fail=ES.failure();
        if(st){
          if(fail&&ES.choice()==='cesium'){ st.textContent=t('engineFellBack')+' ('+fail+')'; st.style.display=''; st.style.color='var(--danger-color,#ff3b30)'; }
          else if(live!==ES.choice()){ st.textContent=t('engineActive')+ES.label(live,currentLang); st.style.display=''; st.style.color=''; }
          else st.style.display='none';
        } } }catch(_){}
    settingsDirty=false; modal.style.display='flex';
    /* (#R9) Always open scrolled to the TOP. Previously the Apply button kept focus, so reopening
       scrolled it into view at the very bottom. Reset both the content and the modal scroll positions. */
    try{ document.activeElement&&document.activeElement.blur&&document.activeElement.blur(); }catch(_){}
    const _mc=modal.querySelector('.settings-scroll')||modal.querySelector('.modal-content'); if(_mc){ _mc.scrollTop=0; requestAnimationFrame(()=>{ _mc.scrollTop=0; modal.scrollTop=0; }); }
  };
  document.getElementById('btn-close-settings').onclick=()=>{
    const _prevTheme=userTheme;
    userTheme=document.getElementById('setting-theme').value; userTZ=document.getElementById('setting-tz').value; unitMode=document.getElementById('setting-units').value;
    /* (#R38) FIX "Themeを変えるとサイドバーの透明度選択がリセットされる": R29.1 used to auto-overwrite the
       sidebar appearance from a per-SKIN map when the theme changed. The skin themes that map needed were
       DELETED in R33, so every surviving theme (auto/light/dark) mapped to 'opaque' → ANY theme change
       silently wiped the user's Solid/Frosted/More-transparent choice. The sidebar appearance is an
       INDEPENDENT user setting now; theme changes must NOT touch it. (Block removed — no auto-pick.) */
    { const tu=document.getElementById('setting-temp-unit'); if(tu){ window.imUnitTemp=tu.value; try{ localStorage.setItem('intmap_temp_unit',window.imUnitTemp); }catch(_){} } }
    { const al=document.getElementById('setting-ailocate'); if(al){ aiLocateMode=al.value; localStorage.setItem('intmap_ai_locate',aiLocateMode); } }
    const prevNewsLang=newsLangMode; newsLangMode=document.getElementById('setting-newslang').value; localStorage.setItem('intmap_news_lang',newsLangMode);
    /* Read the individually-selected news languages (when in "multiple languages" mode). */
    const prevNewsLangs=newsLangs.slice();
    const wrap=document.getElementById('newslang-multi');
    if(wrap){ const picked=Array.from(wrap.querySelectorAll('input[type=checkbox]:checked')).map(c=>c.value); if(picked.length) newsLangs=picked; }
    { const nld=document.getElementById('newslang-dd'); if(nld) nld.classList.remove('open'); try{ updateNewsLangLabel(); }catch(_){} }
    try{ localStorage.setItem('intmap_news_langs',JSON.stringify(newsLangs)); }catch(_){}
    /* News pin position is chosen from the News tab's segmented control, not here. */
    /* (#R20) nav sensitivity — read sliders, apply live, persist via saveSettings (called in applyTheme path below via imSaveSettings users) */
    try{ const zs=document.getElementById('setting-zoom-sens'), ps=document.getElementById('setting-pan-sens'), is=document.getElementById('setting-inertia');
      if(zs) window.imNavZoomSens=Math.max(0.25,Math.min(3,(+zs.value||100)/100));
      if(ps) window.imNavPanSens=Math.max(0.25,Math.min(3,(+ps.value||100)/100));
      if(is) window.imNavInertia=Math.max(0,Math.min(1.5,(+is.value||100)/100));   /* (#R23) 0 → no inertia */
      window._applyNavSens&&window._applyNavSens();
    }catch(_){}
    /* (#R171) tilt ceiling + viewpoint altitude — both take effect immediately and persist themselves */
    try{ const tl=document.getElementById('setting-tilt-limit'); if(tl&&window.IntMapTilt) window.IntMapTilt.set(tl.value==='unlimited'); }catch(_){}
    try{ const ea=document.getElementById('setting-eye-alt'); if(ea&&window.IntMapEyeAlt) window.IntMapEyeAlt.set(ea.value==='on'); const ns=document.getElementById('setting-night-side'); if(ns&&window.IntMapNightSide) window.IntMapNightSide.setEnabled(ns.value!=='off'); }catch(_){}   /* (#R210) 昼夜表示 */
    /* (#R180) …and the ENGINE, which is the one setting that cannot take effect immediately:
       a scene cannot be moved from one renderer to another once its sources, layers, markers
       and camera hooks exist. So it is stored and the page reloads — announced, never silent,
       and only when the value actually changed. */
    let _engineReload=false;
    try{ const es=document.getElementById('setting-engine'), ES=window.IntMapEngineSelect;
      if(es&&ES&&es.value!==ES.choice()){ ES.set(es.value); _engineReload=true;
        try{ imToast(t('engineSwitching')); }catch(_){} } }catch(_){}
    try{ satSaveKeyInputs(); }catch(_){} try{ aiSaveSettings(); }catch(_){}
    settingsDirty=false; modal.style.display='none'; applyTheme(); if(toolMode)updateToolPanel();
    renderUI();
    /* Changing the news-language scope/selection changes which feeds we pull → re-fetch. */
    const langsChanged=(prevNewsLangs.length!==newsLangs.length)||prevNewsLangs.some((l,i)=>l!==newsLangs[i]);
    if(prevNewsLang!==newsLangMode || (newsLangMode==='multi' && langsChanged)){ globalData=[]; try{ fetchData(); }catch(_){} }
    /* (#R180) LAST, so every other setting on this panel has already been saved and applied
       before the page goes away. The delay is only long enough for the toast to be read. */
    if(_engineReload) setTimeout(()=>{ try{ location.reload(); }catch(_){} },700);
  };
  document.getElementById('settings-close-x').onclick=closeSettings;
  modal.addEventListener('click',(e)=>{ if(e.target===modal) closeSettings(); });

  /* ===== (#R9/#R10) "Buy me a blueberry" / 開発を支援する =====
     Stripe Payment Links — JPY page for the Japanese UI, USD page for the English UI. The "Continue"
     button is a direct <a href> to the hosted Stripe page (opens in a new tab). */
  window.INTMAP_STRIPE_URL_EN = 'https://donate.stripe.com/5kQdR2d2m1oa1lAadk5gc01?locale=en';
  window.INTMAP_STRIPE_URL_JP = 'https://donate.stripe.com/8x29AM9Qa2se7JYetA5gc00?locale=ja';
  window.stripeDonateURL = ()=> (currentLang==='jp' ? window.INTMAP_STRIPE_URL_JP : window.INTMAP_STRIPE_URL_EN);
  (function(){
    const bm=document.getElementById('blueberry-modal'); if(!bm) return;
    function fill(){ const set=(id,key)=>{ const el=document.getElementById(id); if(el) el.textContent=t(key); };
      set('blueberry-title','blueberryTitle'); set('blueberry-body','blueberryBody'); set('blueberry-go','blueberryGo'); set('blueberry-note','blueberryNote');
      const go=document.getElementById('blueberry-go'); if(go) go.href=window.stripeDonateURL();
      /* (#R22) Blueberry emoji removed everywhere per request (was EN-only before). */
      const em=document.getElementById('blueberry-emoji'); if(em) em.style.display='none'; }
    function open(){ fill(); bm.style.display='flex'; }
    function close(){ bm.style.display='none'; }
    const btn=document.getElementById('btn-blueberry'); if(btn) btn.onclick=open;
    const x=document.getElementById('blueberry-close-x'); if(x) x.onclick=close;
    /* (#R29.1) Settings → Feedback & bug report entry points. */
    { const fb=document.getElementById('btn-send-feedback'); if(fb) fb.onclick=()=>{ try{ window._openFeedback&&window._openFeedback(); }catch(_){} }; }
    { const bg=document.getElementById('btn-report-bug'); if(bg) bg.onclick=()=>{ try{ window._openBugReport&&window._openBugReport(); }catch(_){} }; }
    { const pg=document.getElementById('btn-playground'); if(pg) pg.onclick=()=>{ window.IntMapLazy.need('playground').then(()=>{ try{ window._openPlayground&&window._openPlayground(); }catch(_){} }); }; }
    bm.addEventListener('click',(e)=>{ if(e.target===bm) close(); });
    /* Record a donation INTENT for a logged-in user (so a future paid plan can recognise supporters).
       The actual payment is confirmed by Stripe; a webhook → Supabase can later upgrade this row. */
    const go=document.getElementById('blueberry-go');
    if(go) go.addEventListener('click', ()=>{ try{ if(typeof DB!=='undefined' && DB && typeof currentUser!=='undefined' && currentUser){ DB.from('donations').insert({ user_id:currentUser.id, email:currentUser.email||null, locale:currentLang, source:'support_button', status:'initiated' }); } }catch(_){} });
    window._openBlueberry=open;
  })();

  /* (#R167) moved to js/feedback.js — see Architecture.md §3.1. */
  window.IntMapModules.feedback(IM_HOST);

  /* ============================================================================
     (#R29.1) PLAYGROUND (beta) — experimental interactive modes, all in one hub:
       1) World Explorer  — satellite "where am I?" GeoGuessr
       2) Pandemic Simulator — Plague-Inc-style world spread on real countries
       3) Nation Sim — lead a real country (1900–2026), dictator or democracy
     All built with createElement + inline styles (no CSS-in-template-literal). ===========*/
  /* (#R166) moved to js/playground.js; (#R209) fetched when Settings ▸ Playground is pressed. */

  /* (#R167) moved to js/legal.js — see Architecture.md §3.1. */
  window.IntMapModules.legal(IM_HOST);
  _wireCountryPopupClose();

  /* ===================== Right-click pins ===================== */
  let userPins=[], activePinId=null, pinSeq=0;
  function setupPinLayers(){
    if(!canDraw()) return;
    if(!GE().layers.hasSource('user-pins')){
      GE().layers.addSource('user-pins',{type:'geojson',data:{type:'FeatureCollection',features:[]},promoteId:'fid'});
      GE().layers.add({id:'user-pin-shadow',type:'circle',source:'user-pins',paint:{'circle-radius':12,'circle-color':'#000','circle-opacity':0.18,'circle-blur':0.6}});
      GE().layers.add({id:'user-pin-dot',type:'circle',source:'user-pins',paint:{'circle-radius':['case',['boolean',['feature-state','hover'],false],10,8],'circle-color':'#ff3b30','circle-stroke-width':2.5,'circle-stroke-color':'#ffffff'}});
    }
    if(window._pinHandlersBound) return;
    window._pinHandlersBound=true;
    GE().events.onLayer('mouseenter','user-pin-dot',()=>{ GE().render.canvas().style.cursor='pointer'; });
    GE().events.onLayer('mouseleave','user-pin-dot',()=>{ GE().render.canvas().style.cursor=''; });
    GE().events.onLayer('click','user-pin-dot',(e)=>{
      if(!e.features.length) return;
      e.preventDefault();
      const fid=e.features[0].properties.fid; openPinPopup(fid);
    });
  }
  function refreshPins(){
    if(!GE().hasRenderer()||!GE().layers.hasSource('user-pins')) return;
    GE().layers.setSourceData('user-pins',{type:'FeatureCollection',features:userPins.map(p=>({type:'Feature',id:p.id,geometry:{type:'Point',coordinates:[p.lng,p.lat]},properties:{fid:p.id}}))});
  }
  async function fetchElevDepth(lat,lng){
    try{
      const r=await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}`);
      if(!r.ok) return null;
      const j=await r.json(); const e=j&&j.elevation&&j.elevation[0];
      return (typeof e==='number')?e:null;
    }catch(_){ return null; }
  }
  function addPin(lng,lat){
    const id='p'+(++pinSeq); const pin={id,lng,lat,elev:null};
    userPins.push(pin); refreshPins();
    fetchElevDepth(lat,lng).then(e=>{ pin.elev=e; if(activePinId===id) renderPinPopup(); });
    return id;
  }
  function removePin(id){ userPins=userPins.filter(p=>p.id!==id); if(activePinId===id){ activePinId=null; document.getElementById('pin-popup').style.display='none'; } refreshPins(); }
  function clearAllPins(){ userPins=[]; activePinId=null; document.getElementById('pin-popup').style.display='none'; refreshPins(); }
  function openPinPopup(id){ activePinId=id; renderPinPopup(); positionPinPopup(); }
  function renderPinPopup(){
    const pin=userPins.find(p=>p.id===activePinId); if(!pin){ document.getElementById('pin-popup').style.display='none'; return; }
    const el=document.getElementById('pin-popup'); el.style.display='block';
    let elevHTML='—';
    if(pin.elev!=null){
      if(pin.elev<0) elevHTML=`<b style="color:var(--info-maritime)">${Math.abs(Math.round(pin.elev))} m ${currentLang==='jp'?'(海中)':currentLang==='de'?'(unter Meeresspiegel)':currentLang==='ru'?'(ниже уровня моря)':currentLang==='es'?'(bajo el nivel del mar)':'(below sea)'}</b>`;
      else elevHTML=`<b>${Math.round(pin.elev)} m</b>`;
    }
    let distHTML2='';
    const idx=userPins.findIndex(p=>p.id===pin.id);
    if(idx>0 && hasTurf()){
      const prev=userPins[idx-1];
      const km=turf.distance(turf.point([prev.lng,prev.lat]),turf.point([pin.lng,pin.lat]),{units:'kilometers'});
      const brg=bearingDeg([prev.lng,prev.lat],[pin.lng,pin.lat]);
      distHTML2=`<div class="pin-popup-row"><span>${t('ctxDistFrom')}</span><b>${distTXT(km)}</b></div><div class="pin-popup-row"><span>${t('bearing')}</span><b>${brg.toFixed(1)}° ${compassDir(brg)}</b></div>`;
    }
    el.innerHTML=`<button class="pin-popup-close" onclick="window._closePinPopup()">✕</button>
      <div style="font-weight:600; margin-bottom:6px;">📍 ${currentLang==='jp'?'ピン':currentLang==='de'?'Pin':currentLang==='ru'?'Метка':currentLang==='es'?'Pin':'Pin'} #${idx+1}</div>
      <div class="pin-popup-row"><span>${t('coords')}</span><b>${fmtLL(pin.lng,pin.lat)}</b></div>
      <div class="pin-popup-row"><span>${pin.elev!=null&&pin.elev<0?t('depth'):t('elev')}</span>${elevHTML}</div>
      ${distHTML2}
      <div class="pin-popup-actions"><button onclick="window._measureFromPin('${pin.id}')">${t('measure')}</button><button onclick="window._radiusFromPin('${pin.id}')">⭕ ${t('radius')}</button><button style="background:var(--info-mil); color:#fff;" onclick="window._removePin('${pin.id}')">${t('deletePin')}</button></div>`;
  }
  function positionPinPopup(){
    const pin=userPins.find(p=>p.id===activePinId); if(!pin) return;
    const el=document.getElementById('pin-popup'); if(!el||el.style.display==='none')return;
    const pt=GE().coords.project([pin.lng,pin.lat]); el.style.left=pt.x+'px'; el.style.top=pt.y+'px';
  }
  window._closePinPopup=()=>{ activePinId=null; document.getElementById('pin-popup').style.display='none'; };
  window._removePin=(id)=>removePin(id);
  window._measureFromPin=(id)=>{ const p=userPins.find(x=>x.id===id); if(!p)return; if(toolMode!=='measure') setTool('measure'); measurePoints=[[p.lng,p.lat]]; refreshTool(); updateToolPanel(); _closePinPopup(); };
  /* Radius from this pin (#54) — fixed center, tune radius/color in the tool panel. */
  window._radiusFromPin=(id)=>{ const p=userPins.find(x=>x.id===id); if(!p)return; try{ window._radiusFromPoint(p.lng,p.lat); }catch(_){} _closePinPopup(); };
  /* #17 — open the azimuthal-equidistant viewer centerd on this pin (true distances/bearings from it). */
  window._azimuthalFromPin=(id)=>{ const p=userPins.find(x=>x.id===id); if(!p)return; if(window.ProjView) window.ProjView.open('azimuthal',[p.lng,p.lat]); };

  document.addEventListener('click',(e)=>{ const m=document.getElementById('ctx-menu'); if(m&&!m.contains(e.target)) m.style.display='none'; });

  /* ===================== GROUP 3: DATA LAYERS ===================== */
  /* (#R164) moved to js/data-layers.js — see Architecture.md §3.1. */
  window.IntMapModules.dataLayers(IM_HOST);
  /* ================ END GROUP 3 ================ */

  /* (#R200) moved to js/premium-plan.js — a real ES module (see the import at the top of this file), not a
     window.IntMapModules entry and not a line in src/main.js's ordered list. */
  makePremiumPlan(IM_HOST, { i18n, satRenderController, satRenderKeyInputs });
  /* (#R167) moved to js/news-timeline.js — see Architecture.md §3.1. */
  window.IntMapModules.newsTimeline(IM_HOST);

  /* (#R167) moved to js/map-extras.js — see Architecture.md §3.1. */
  window.IntMapModules.locate(IM_HOST);

  /* =============================================================================
   *  COMMUNITY TAB — user-placed pins + posts + comments. Uses localStorage.
   *  Posts get a pin on the map (rendered on a dedicated MapLibre layer).
   *  Click a pin to scroll its post into view; "Show on map" flies to it.
   *  ============================================================================= */
  let communityPosts=[];   /* cache; the source of truth is Supabase (loadCommunity) */
  let communityAddArmed=false; /* When true, the next map click creates a post here */
  let pendingPostLoc=null;
  function saveCommunity(){ /* community now lives in Supabase; nothing to persist locally */ }
  let pendingImg='', communitySort='hot';
  /* ---- Community v2 UI state ---- */
  let commCaps=null;                 /* detected schema capabilities (graceful degradation) */
  let commSearch='', commCatFilter='all', commInView=false;
  let composeEditId=null, composeCat='general', replyingTo=null;
  let commCollapsed={};              /* postId -> true when its comment thread is collapsed */
  /* (#R167) moved verbatim to js/tables.js — see Architecture.md §3.1. */
  const {COMM_CATEGORIES}=window.IntMapTables;
  /* (#R169) moved verbatim to js/community-board.js — see Architecture.md §3.1. */
  function compressImage(file, maxDim=1100, quality=0.72){
    return new Promise((resolve,reject)=>{
      const fr=new FileReader();
      fr.onload=()=>{ const img=new Image(); img.onload=()=>{
        let w=img.width, h=img.height;
        if(w>maxDim||h>maxDim){ const s=maxDim/Math.max(w,h); w=Math.round(w*s); h=Math.round(h*s); }
        try{ const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').drawImage(img,0,0,w,h); resolve(c.toDataURL('image/jpeg',quality)); }
        catch(_){ resolve(fr.result); }
      }; img.onerror=()=>resolve(fr.result); img.src=fr.result; };
      fr.onerror=reject; fr.readAsDataURL(file);
    });
  }
  /* Square-crop modal shown AFTER picking an avatar image (#12): drag to pan, slider to zoom, then
     Apply renders the visible square to a 256² JPEG. Resolves null if canceled. */
  window.imCropImage=function(file){
    return new Promise((resolve)=>{
      const url=URL.createObjectURL(file); const SIZE=260;
      const ov=document.createElement('div'); ov.className='crop-overlay';
      ov.innerHTML=`<div class="crop-card">
        <div class="crop-title">${currentLang==='jp'?'画像をトリミング':currentLang==='de'?'Bild zuschneiden':currentLang==='ru'?'Обрезать изображение':currentLang==='es'?'Recortar imagen':'Crop image'}</div>
        <div class="crop-stage" id="crop-stage"><img id="crop-img" alt="" draggable="false"><div class="crop-ring"></div></div>
        <div class="crop-zoom"><span>－</span><input type="range" id="crop-zoom" min="1" max="4" step="0.01" value="1"><span>＋</span></div>
        <div class="crop-actions"><button id="crop-cancel">${currentLang==='jp'?'キャンセル':currentLang==='de'?'Abbrechen':currentLang==='ru'?'Отмена':currentLang==='es'?'Cancelar':'Cancel'}</button><button id="crop-ok" class="crop-ok">${currentLang==='jp'?'適用':currentLang==='de'?'Anwenden':currentLang==='ru'?'Применить':currentLang==='es'?'Aplicar':'Apply'}</button></div>
      </div>`;
      document.body.appendChild(ov);
      const stage=ov.querySelector('#crop-stage'), img=ov.querySelector('#crop-img'), zoom=ov.querySelector('#crop-zoom');
      let scale=1, tx=0, ty=0, natW=0, natH=0;
      function clampPan(){ const w=natW*scale, h=natH*scale; tx=Math.min(0,Math.max(SIZE-w,tx)); ty=Math.min(0,Math.max(SIZE-h,ty)); }
      function render(){ clampPan(); img.style.transform=`translate(${tx}px,${ty}px) scale(${scale})`; }
      img.onload=()=>{ natW=img.naturalWidth; natH=img.naturalHeight; const base=Math.max(SIZE/natW,SIZE/natH);
        scale=base; zoom.min=base; zoom.max=base*4; zoom.step=base/100; zoom.value=base;
        tx=(SIZE-natW*scale)/2; ty=(SIZE-natH*scale)/2; img.style.transformOrigin='0 0'; render(); };
      img.src=url;
      zoom.addEventListener('input',()=>{ const c=SIZE/2, ns=parseFloat(zoom.value), k=ns/scale; tx=c-(c-tx)*k; ty=c-(c-ty)*k; scale=ns; render(); });
      let drag=false,sx=0,sy=0; const down=(x,y)=>{ drag=true; sx=x-tx; sy=y-ty; }; const move=(x,y)=>{ if(!drag)return; tx=x-sx; ty=y-sy; render(); }; const up=()=>{ drag=false; };
      const onMM=e=>move(e.clientX,e.clientY), onMU=()=>up();
      stage.addEventListener('mousedown',e=>{ e.preventDefault(); down(e.clientX,e.clientY); });
      window.addEventListener('mousemove',onMM); window.addEventListener('mouseup',onMU);
      stage.addEventListener('touchstart',e=>{ const t=e.touches[0]; if(t) down(t.clientX,t.clientY); },{passive:true});
      stage.addEventListener('touchmove',e=>{ const t=e.touches[0]; if(t){ move(t.clientX,t.clientY); e.preventDefault(); } },{passive:false});
      stage.addEventListener('touchend',up);
      const close=()=>{ try{ URL.revokeObjectURL(url); }catch(_){} window.removeEventListener('mousemove',onMM); window.removeEventListener('mouseup',onMU); ov.remove(); };
      ov.querySelector('#crop-cancel').onclick=()=>{ close(); resolve(null); };
      ov.addEventListener('click',e=>{ if(e.target===ov){ close(); resolve(null); } });
      ov.querySelector('#crop-ok').onclick=()=>{
        const out=document.createElement('canvas'); out.width=256; out.height=256; const cx=out.getContext('2d');
        const sxp=-tx/scale, syp=-ty/scale, sw=SIZE/scale, sh=SIZE/scale;
        let data=null; try{ cx.drawImage(img, sxp, syp, sw, sh, 0,0,256,256); data=out.toDataURL('image/jpeg',0.85); }catch(_){}
        close(); resolve(data);
      };
    });
  };
  function showComposeImgPreview(src){
    const wrap=document.getElementById('compose-img-preview'), thumb=document.getElementById('compose-img-thumb');
    if(!wrap||!thumb) return;
    if(src){ thumb.src=src; wrap.style.display='inline-block'; } else { thumb.removeAttribute('src'); wrap.style.display='none'; }
  }
  /* (#R169) moved verbatim to js/community-board.js — see Architecture.md §3.1. */
  function pushCommunityFeatures(){
    if(!GE().hasRenderer()||!GE().layers.hasSource('community-points')) return;
    /* Community pins are shown ONLY while the Community tab is active; selecting another
       tab clears them (the posts stay cached in communityPosts for an instant return). */
    const feats=(currentMode==='community') ? visibleCommunityPosts().map(p=>({
      type:'Feature', id:p.id, geometry:{type:'Point',coordinates:[p.lng,p.lat]},
      properties:{ fid:p.id, cat:p.category||'general', title:p.title||'', body:(p.body||'').slice(0,80), short:(p.title||'').slice(0,28)+((p.title||'').length>28?'…':'') }
    })) : [];
    GE().layers.setSourceData('community-points',{type:'FeatureCollection',features:feats});
  }
  /* (#R169) moved verbatim to js/community-board.js — see Architecture.md §3.1. */
  function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  /* When add-mode is armed, map-click drops a community post pin and opens the compose modal */
  if(GE().hasRenderer()){
    GE().events.on('click',(e)=>{
      if(!communityAddArmed) return;
      /* Skip if it's actually a tool action — handleMapClick will handle and toolMode set */
      if(toolMode) return;
      pendingPostLoc=[e.lngLat.lng, e.lngLat.lat];
      communityAddArmed=false;
      openComposeModal();
    });
  }
  /* (#R169) moved verbatim to js/community-board.js — see Architecture.md §3.1. */
  document.getElementById('compose-cancel').onclick=()=>{
    document.getElementById('compose-modal').classList.remove('active'); pendingPostLoc=null; composeEditId=null;
    if(currentMode==='community') renderCommunity();
  };
  /* "Move pin on map": hide the composer, arm a one-shot map tap that re-opens it at the new spot */
  document.getElementById('compose-place').onclick=()=>{
    document.getElementById('compose-modal').classList.remove('active');
    communityAddArmed=true;
    imToast(currentLang==='jp'?'地図をタップしてピンを移動':currentLang==='de'?'Karte antippen, um den Pin zu verschieben':currentLang==='ru'?'Коснитесь карты, чтобы переместить метку':currentLang==='es'?'Toca el mapa para mover el pin':'Tap the map to move the pin');
  };
  document.getElementById('compose-submit').onclick=async()=>{
    if(!requireLogin()) return;
    /* Anti-spam: enforce a 30-second cooldown between NEW posts (#community-cooldown). */
    if(!composeEditId){
      let last=0; try{ last=+localStorage.getItem('intmap_last_post')||0; }catch(_){}
      const wait=Math.ceil((30000-(Date.now()-last))/1000);
      if(wait>0){ imToast(currentLang==='jp'?`投稿は30秒に1回までです（あと${wait}秒）`:currentLang==='de'?`Bitte warte ${wait}s vor dem nächsten Beitrag`:currentLang==='ru'?`Подождите ${wait} с перед следующей публикацией`:currentLang==='es'?`Espera ${wait}s antes de publicar de nuevo`:`Please wait ${wait}s before posting again`); return; }
    }
    const title=document.getElementById('compose-post-title').value.trim();
    const body=document.getElementById('compose-post-body').value.trim();
    if(!title && !body){ imToast(currentLang==='jp'?'タイトルか本文を入力してください。':currentLang==='de'?'Titel oder Text eingeben.':currentLang==='ru'?'Введите заголовок или текст.':currentLang==='es'?'Escribe un título o texto.':'Enter a title or some text.'); return; }
    /* never dead-end on a missing location: fall back to the current map center */
    if(!pendingPostLoc){ if(GE().hasRenderer()){ const c=GE().camera.getCenter(); pendingPostLoc=[c.lng,c.lat]; } else { imToast(currentLang==='jp'?'位置が設定されていません。':currentLang==='de'?'Kein Ort festgelegt.':currentLang==='ru'?'Местоположение не задано.':currentLang==='es'?'Ubicación no establecida.':'Location not set.'); return; } }
    const loc=[pendingPostLoc[0],pendingPostLoc[1]], img=pendingImg||'';
    const btn=document.getElementById('compose-submit'); btn.disabled=true;
    try{
      if(composeEditId) await cmEditPost(composeEditId,{ title, body, img, category:composeCat, lat:loc[1], lng:loc[0] });
      else { await cmAddPost(title, body, img, loc[1], loc[0], composeCat); try{ localStorage.setItem('intmap_last_post',Date.now()); }catch(_){} }
    }
    catch(e){ btn.disabled=false; alert(((composeEditId?(currentLang==='jp'?'更新に失敗しました: ':currentLang==='de'?'Aktualisierung fehlgeschlagen: ':currentLang==='ru'?'Не удалось обновить: ':currentLang==='es'?'Error al actualizar: ':'Update failed: '):(currentLang==='jp'?'投稿に失敗しました: ':currentLang==='de'?'Beitrag fehlgeschlagen: ':currentLang==='ru'?'Не удалось опубликовать: ':currentLang==='es'?'Error al publicar: ':'Post failed: ')))+((e&&e.message)||e)); return; }
    btn.disabled=false;
    document.getElementById('compose-modal').classList.remove('active');
    const wasEdit=!!composeEditId; composeEditId=null;
    pendingPostLoc=null; pendingImg=''; showComposeImgPreview('');
    await loadCommunity();
    /* Fly to the new / updated post */
    if(!wasEdit) GE().camera.flyTo({center:[loc[0],loc[1]],zoom:5,speed:1.0});
  };
  /* Compose image input wiring (bound once) */
  (function(){
    const inp=document.getElementById('compose-img');
    if(inp){
      inp.addEventListener('change', async (e)=>{
        const f=e.target.files&&e.target.files[0]; if(!f) return;
        if(!/^image\//.test(f.type||'')){ alert(currentLang==='jp'?'画像ファイルを選択してください':currentLang==='de'?'Bitte eine Bilddatei wählen':currentLang==='ru'?'Выберите файл изображения':currentLang==='es'?'Elige un archivo de imagen':'Please choose an image file'); e.target.value=''; return; }
        try{ pendingImg=await compressImage(f); showComposeImgPreview(pendingImg); }catch(_){ }
        e.target.value='';
      });
    }
    const rm=document.getElementById('compose-img-remove');
    if(rm) rm.onclick=()=>{ pendingImg=''; showComposeImgPreview(''); };
  })();
  /* Push community pins when style first loads, so they appear without needing to enter the tab */
  if(GE().hasRenderer()){
    if(canDraw()){ try{ setupCommunityLayer(); }catch(_){} }
    GE().events.on('load',()=>{ try{ setupCommunityLayer(); }catch(_){} });
    GE().events.on('styledata',()=>{ try{ setupCommunityLayer(); }catch(_){} });
    /* "In view" filter: as you pan, re-filter the feed + pins to the visible map area. */
    let _commViewT=null;
    GE().events.on('moveend',()=>{ if(commInView && currentMode==='community'){ clearTimeout(_commViewT); _commViewT=setTimeout(()=>{ try{ renderCommList(); }catch(_){} },120); } });
  }

  /* (#R167) moved to js/mobile-ui.js — see Architecture.md §3.1. */
  const initMobileUI=window.IntMapModules.mobileUI(IM_HOST);

  /* =====================================================================
   *  SUPABASE INTEGRATION — cloud data loading, auth, community + favorites,
   *  and realtime. This block turns the prototype into a multi-user service.
   * ===================================================================== */
  const DB = window.sb;        /* Supabase client (null only if the SDK failed to load) */
  let currentUser = null;      /* {id,email,name,isAdmin} when logged in, else null */
  function imToast(msg){ try{ aiToast(msg); }catch(_){ try{ satToast(msg); }catch(__){ try{ alert(msg); }catch(___){} } } }

  /* ---------- DATA: dashboard_cards -> extendedDashDB ---------- */
  /* 50 curated strategic-location cards (#info-cards). Bundled locally so the Information tab is
     rich even before/without Supabase; merged with any DB cards (deduped by English title).
     Images are lazy-fetched from Wikipedia by applyWikiImageBackground(). */
  /* (#R162) moved to js/reference-data.js — see Architecture.md "File layout". */
  const DEFAULT_DASH_CARDS=window.IntMapRefData.dashCards;
  async function loadDashFromSupabase(){
    let rows=[];
    if(DB){ const { data, error } = await DB.from('dashboard_cards').select('*').order('sort_order',{ascending:true});
      if(error){ console.warn('[IntMap] dashboard_cards load failed:', error.message); } else rows=data||[]; }
    const fromDB=rows.map(r=>({
      id: r.slug || ('card-'+r.id), layerRef: r.layer_ref||null, cat: r.cat, type: r.type, loc:[r.lng,r.lat],
      img: r.img||'', title:{en:r.title_en, jp:r.title_jp||r.title_en}, badge:r.badge||'',
      body:{en:r.body_en||'', jp:r.body_jp||r.body_en||''},
      wiki: (r.wiki_en||r.wiki_jp)?{en:r.wiki_en||r.wiki_jp, jp:r.wiki_jp||r.wiki_en}:null,
      specs: r.specs||undefined
    }));
    /* Append the bundled cards that aren't already provided by the DB (dedupe by English title). */
    const have=new Set(fromDB.map(c=>(c.title.en||'').toLowerCase()));
    extendedDashDB=fromDB.concat(DEFAULT_DASH_CARDS.filter(c=>!have.has((c.title.en||'').toLowerCase())));
  }

  /* (#R155) Have-I-Been-Pwned k-ANONYMITY breach check. Only the first 5 hex chars of the SHA-1
     are ever sent — the password/full hash never leaves the device. Returns the breach count
     (0 = not found). FAIL-OPEN on any error: the dashboard's server-side leaked-password
     protection is the backstop, so a HIBP outage never blocks a legitimate signup. */
  /* (#R155) Render the signed-in user's passkeys into #acct-passkeys (management list).
     Defensive about the exact SDK return/param shape (Beta API) so a shape change degrades
     gracefully instead of throwing. */
  window._imOpenSetPassword=_openSetPassword;
  /* Account avatar (#28) — chosen emoji icon, persisted locally. */
  window.imGetAvatar=function(){ try{ return localStorage.getItem('intmap_avatar')||'👤'; }catch(_){ return '👤'; } };
  window.imGetAvatarImg=function(){ try{ return localStorage.getItem('intmap_avatar_img')||''; }catch(_){ return ''; } };
  window.imSetAvatarImg=function(d){ try{ if(d) localStorage.setItem('intmap_avatar_img',d); else localStorage.removeItem('intmap_avatar_img'); }catch(_){} try{ updateAccountButton(); }catch(_){} try{ window._syncPrefsUp&&window._syncPrefsUp(); }catch(_){} };
  window.imAvatarHue=function(){ const s=(currentUser&&(currentUser.name||currentUser.email))||'?'; let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))|0; return Math.abs(h)%360; };
  window.imSetAvatar=function(e){ try{ localStorage.setItem('intmap_avatar',e); }catch(_){} try{ updateAccountButton(); }catch(_){} try{ window._syncPrefsUp&&window._syncPrefsUp(); }catch(_){} };
  function updateAccountButton(){ const b=document.getElementById('btn-account'); if(b){
      if(!currentUser){ b.textContent=(currentLang==='jp'?'ログイン':currentLang==='de'?'Anmelden':currentLang==='ru'?'Войти':currentLang==='es'?'Iniciar sesión':'Log in'); }
      else { const nm=(currentUser.name||currentUser.email.split('@')[0]), img=window.imGetAvatarImg();
        /* (#R30) name wrapped in .acct-name so mobile can show the avatar ONLY (the full name made the
           account / feedback / settings row wrap = "横一列に並ばず改行されてしまう"). */
        b.innerHTML = (img?`<span class="acct-av" style="background:url('${IntMapSafe.html(IntMapSafe.url(img,{allowData:true}))}') center/cover;"></span>`:`<span class="acct-av">${IntMapSafe.html(window.imGetAvatar())}</span>`)+'<span class="acct-name">'+escapeHtml(nm)+'</span>'; }   /* (#R138 SEC) validate+escape the stored avatar data-URL */
    }
    /* Sidebar EN/JP toggle shows only when logged OUT; logged-in users switch language in Settings. */
    const lt=document.querySelector('.lang-toggle'); if(lt) lt.style.display = currentUser ? 'none' : 'flex';
  }
  /* (#R169) moved verbatim to js/community-board.js — see Architecture.md §3.1. */
  window.imViewProfile=imViewProfile;
  document.addEventListener('click',e=>{ const a=e.target.closest&&e.target.closest('.comm-author-link'); if(a && !(e.target.closest&&e.target.closest('.comm-post-loc'))){ e.preventDefault(); imViewProfile(a.getAttribute('data-uid'),a.getAttribute('data-author')); } });


  /* ---------- COMMUNITY (cloud) ---------- */
  function requireLogin(){ if(!currentUser){ openAuthModal(); return false; } return true; }
  /* (#R169) moved verbatim to js/community-board.js — see Architecture.md §3.1. */


  /* (#R27) Count a genuine, user-initiated login (email submit success OR an OAuth return — NOT a
     session restore on reload, NOT a token refresh) and, on the user's 3rd login, show the feedback
     popup once. _loginCounted caps it at one per page load so OAuth's double signal can't double-count.
     Stored per-user in localStorage and mirrored best-effort to profiles.login_count (column optional). */
  let _loginCounted=false;
  function recordLogin(uid){
    try{
      uid=uid||(currentUser&&currentUser.id); if(_loginCounted||!uid) return; _loginCounted=true;
      const key='intmap_login_count_'+uid; let n=parseInt(localStorage.getItem(key)||'0',10)||0; n++;
      try{ localStorage.setItem(key,String(n)); }catch(_){}
      try{ if(window.sb) window.sb.from('profiles').update({login_count:n}).eq('id',uid); }catch(_){}
      if(n===3){ const dk='intmap_fb_prompted_'+uid; let done=false; try{ done=!!localStorage.getItem(dk); }catch(_){}
        if(!done){ try{ localStorage.setItem(dk,'1'); }catch(_){} setTimeout(()=>{ try{ window._openFeedback&&window._openFeedback(); }catch(_){} },1500); } }
    }catch(_){}
  }
  window.recordLogin=recordLogin;


  /* (#R200) moved to js/i18n-late.js — a real ES module (see the import at the top of this file), not a
     window.IntMapModules entry and not a line in src/main.js's ordered list. */
  makeI18nLate(IM_HOST, { i18n });
  /* ---------- Settings persistence (#48) ---------- */
  window.imLabelLang='ui'; window.imFlatPan='fixed'; window.imSidebarStyle='opaque'; window.imMapColor='auto'; window.imLayerPanel='right';   /* (#R154) normal-mode layer panel now defaults to the RIGHT sidebar ("通常モードのLayer panelはright sidebarをデフォルトに"); a saved 'classic' setting still wins (line ~17447) */
  /* (#R170) ticker defaults to OFF everywhere ("ティッカーはオフをデフォルトに"). This also removes a long-standing
     lie: the Settings dropdown has said "Off (default)" since #R63 while #R101 actually defaulted desktop to ON.
     A saved 'on' still wins (see loadSettings); mobile hides the bar via CSS regardless. */
  window.imTicker='off';
  window.imNewsCountries=[]; window.imLayerFavs=[];
  /* (#R207) the chosen news OUTLETS — empty = every one. Persisted beside the country list. */
  window.imNewsSources=[];
  /* (#R167) moved verbatim to js/tables.js — see Architecture.md §3.1. */
  const {NEWS_COUNTRY_FEEDS}=window.IntMapTables;
  window.NEWS_COUNTRY_FEEDS=NEWS_COUNTRY_FEEDS;
  /* (#R114) ===== Accent color ===== recolour the UI accent (--primary-color) from Settings.
     window.imAccent = 'default' (theme blue) | '#rrggbb'. A custom value is injected as an !important override on
     :root/body so it beats each theme's --primary-color; 'default' removes it. Persisted in intmap_settings (so it
     syncs to the account) and applied on load. Live-previews while the panel is open; commits on Apply, reverts on Cancel. */
  if(typeof window.imAccent==='undefined') window.imAccent='default';
  function applyAccentColor(val){ try{
    const ok=(typeof val==='string')&&/^#[0-9a-fA-F]{6}$/.test(val);
    let st=document.getElementById('im-accent-style');
    if(ok){ if(!st){ st=document.createElement('style'); st.id='im-accent-style'; (document.head||document.documentElement).appendChild(st); }
      st.textContent=':root,body{--primary-color:'+val+' !important;}'; }
    else if(st&&st.parentNode){ st.parentNode.removeChild(st); }
  }catch(_){} }
  function applyAccent(){ applyAccentColor((window.imAccent&&window.imAccent!=='default')?window.imAccent:null); }
  window.applyAccent=applyAccent;
  (function(){
    const pk=()=>document.getElementById('accent-picker');
    const ci=()=>document.getElementById('setting-accent-custom');
    function markSel(val){ const p=pk(); if(!p) return;
      p.querySelectorAll('.accent-sw,.accent-custom').forEach(el=>el.classList.remove('sel'));
      const hex=/^#[0-9a-fA-F]{6}$/.test(val||''); let sw=null;
      if(val==='default') sw=p.querySelector('.accent-sw[data-accent="default"]');
      else if(hex){ const lc=String(val).toLowerCase(); sw=Array.prototype.find.call(p.querySelectorAll('.accent-sw'),b=>(b.getAttribute('data-accent')||'').toLowerCase()===lc)||null; }
      if(sw){ sw.classList.add('sel'); }
      else if(hex){ const c=p.querySelector('.accent-custom'); if(c) c.classList.add('sel'); const x=ci(); if(x) x.value=val; }
    }
    function preview(val){ window._accentPending=val; applyAccentColor(val==='default'?null:val); markSel(val); }
    window._accentPending=window.imAccent||'default';
    /* reflect the COMMITTED accent in the picker (called on Settings open + after Atlas changes it) */
    window._syncAccentPicker=function(){ window._accentPending=window.imAccent||'default'; const x=ci(); if(x&&/^#[0-9a-fA-F]{6}$/.test(window.imAccent||'')) x.value=window.imAccent; markSel(window.imAccent||'default'); };
    /* delegated so it works regardless of when the modal mounts; buttons don't fire input/change → set dirty here */
    document.addEventListener('click',(e)=>{ try{ const p=pk(); if(!p) return; const b=e.target&&e.target.closest&&e.target.closest('.accent-sw'); if(!b||!p.contains(b)) return; e.preventDefault(); preview(b.getAttribute('data-accent')||'default'); try{ settingsDirty=true; }catch(_){} }catch(_){} });
    document.addEventListener('input',(e)=>{ try{ const t2=e.target; if(!t2||t2.id!=='setting-accent-custom') return; preview(String(t2.value||'')); try{ settingsDirty=true; }catch(_){} }catch(_){} });
  })();
  function loadSettings(){
    let s={}; try{ s=JSON.parse(localStorage.getItem('intmap_settings')||'{}')||{}; }catch(_){ s={}; }
    window.imAccent=(typeof s.accent==='string'&&s.accent)?s.accent:'default'; try{ applyAccent(); }catch(_){}   /* (#R114) restore accent */
    if(s.theme) userTheme=(s.theme==='tactical'?'cyber':s.theme); if(s.tz) userTZ=s.tz; if(s.units) unitMode=s.units;   /* (#R22) migrate retired Tactical → Cyber */
    if(['en','jp','de','ru','es'].includes(s.lang)){ currentLang=s.lang; ['en','jp','de','ru','es'].forEach(L=>{ const b=document.getElementById('lang-'+L); if(b) b.classList.toggle('active',currentLang===L); }); }   /* (#R37) restore ALL four UI languages (was en/jp only → DE/RU never persisted across reloads) */
    if(s.newsPinMode) newsPinMode=s.newsPinMode;
    if(s.sidebarStyle) window.imSidebarStyle=s.sidebarStyle;
    if(s.labelLang) window.imLabelLang=s.labelLang;
    if(s.flatPan) window.imFlatPan=s.flatPan;
    if(s.mapColor) window.imMapColor=s.mapColor;
    /* (#R155) Right sidebar is the default (#R154). Only a saved value the user EXPLICITLY chose
       (layerPanelSet) may override it — a stale 'classic' left over from before the default flipped is
       ignored, so returning users actually get the right sidebar they asked for (re-reported request). */
    if(s.layerPanelSet===true && (s.layerPanel==='right'||s.layerPanel==='classic')){ window.imLayerPanel=s.layerPanel; window.imLayerPanelSet=true; }
    if(s.showRank==='on'||s.showRank==='off') window.imShowRank=s.showRank;   /* (#R137) Countries rank numbers (default off) */
    if(s.ticker==='on'||s.ticker==='off') window.imTicker=s.ticker;   /* (#R63) */
    if(Array.isArray(s.newsCountries)) window.imNewsCountries=s.newsCountries;
    if(Array.isArray(s.newsSources)) window.imNewsSources=s.newsSources;   /* (#R207) */
    if(Array.isArray(s.layerFavs)) window.imLayerFavs=s.layerFavs;
    if(s.navZoom) window.imNavZoomSens=+s.navZoom||1;   /* (#R20) nav sensitivity */
    if(s.navPan)  window.imNavPanSens=+s.navPan||1;
    if(s.navInertia!=null) window.imNavInertia=+s.navInertia;   /* (#R23) inertia (0..1.5); 0 allowed */
    try{ window._applyNavSens&&window._applyNavSens(); }catch(_){}
    applySidebarStyle();
  }
  function saveSettings(){
    try{ localStorage.setItem('intmap_settings',JSON.stringify({
      theme:userTheme, tz:userTZ, units:unitMode, lang:currentLang, newsPinMode, accent:(window.imAccent||'default'),   /* (#R114) accent colour */
      sidebarStyle:window.imSidebarStyle, labelLang:window.imLabelLang, flatPan:window.imFlatPan, mapColor:window.imMapColor, layerPanel:window.imLayerPanel, layerPanelSet:window.imLayerPanelSet===true, ticker:window.imTicker, showRank:window.imShowRank,
      newsCountries:window.imNewsCountries, newsSources:window.imNewsSources, layerFavs:window.imLayerFavs,
      navZoom:window.imNavZoomSens||1, navPan:window.imNavPanSens||1, navInertia:(window.imNavInertia==null?1:window.imNavInertia)
    })); }catch(_){}
    try{ window._syncPrefsUp&&window._syncPrefsUp(); }catch(_){}   /* (#R20) mirror to the account when logged in */
  }
  window.imSaveSettings=saveSettings;
  function applySidebarStyle(animate){ const s=window.imSidebarStyle;
    const frosted=(s==='translucent'||s==='glass2');
    document.body.classList.toggle('sidebar-translucent', frosted);
    document.body.classList.toggle('sidebar-glass2', s==='glass2');
    document.body.classList.toggle('sidebar-glass', frosted);   /* drives the desktop overlay-frost MATERIAL only (blur/translucency) */
    /* (#R160) NO camera padding on toggle or style change anymore. Both solid and frosted sidebars overlay a
       FIXED full-width map (see the layout CSS), so the map keeps its own centre and must never be optically
       shifted — that optical shift was exactly the "地図が勝手に動いてしまう" the user reported. The `animate`
       argument is kept only for call-site compatibility and is now a no-op. Mobile bottom-sheet padding is
       owned by the detent system elsewhere and is deliberately left untouched. As a one-time safety net, clear
       any stray desktop left/right map padding a prior build may have set (fresh maps already start at 0). */
    try{ if(GE().camera.getPadding && GE().camera.setPadding && !isMobile()){ const cur=GE().camera.getPadding(); if(cur && (cur.left||cur.right)) GE().camera.setPadding({top:cur.top||0,right:0,bottom:cur.bottom||0,left:0}); } }catch(_){}
  }

  /* (#R167) moved to js/mobile-ui.js — see Architecture.md §3.1. */
  window.IntMapModules.layoutReflow(IM_HOST);

  /* (#R200) moved to js/screenshot.js — a real ES module (see the import at the top of this file), not a
     window.IntMapModules entry and not a line in src/main.js's ordered list. */
  makeScreenshot(IM_HOST, { GE, aiWaitMapIdle, imToast, t, ymdISO });

  /* (#R200) moved to js/layer-favs.js — a real ES module (see the import at the top of this file), not a
     window.IntMapModules entry and not a line in src/main.js's ordered list. */
  _IM_LFAVS = makeLayerFavs(IM_HOST, { escapeHtml, geoLayersDB, i18n, saveSettings, t });

  /* ---------- Data sources & attribution modal (#37) ---------- */  /* (#R162) the list moved to js/reference-data.js — see Architecture.md "File layout". */
  const DATA_SOURCES=window.IntMapRefData.dataSources;
  /* (#R218) DE/RU/ES descriptions live in js/locales/pages.<lang>.js (`sourceUse`) — the same file sources.html reads — fetched ONLY when this dialog opens in one of those languages, so the five-language registry costs a phone nothing at start-up. Per-key fallback to en/jp. */
  const _pgDoc=(l)=>{ try{ return window.IntMapPageI18N&&window.IntMapPageI18N.doc&&window.IntMapPageI18N.doc(l); }catch(_){ return null; } };
  function openSourcesModal(){
    const m=document.getElementById('sources-modal'); if(!m) return;
    document.getElementById('sources-title').textContent=t('srcModalTitle'); document.getElementById('sources-sub').textContent=t('srcModalSub');
    const use=(s)=>{ const d=_pgDoc(currentLang); return (d&&d.sourceUse&&d.sourceUse[s.n])||s.use[currentLang]||s.use.en; };
    const paint=()=>{ document.getElementById('sources-body').innerHTML=DATA_SOURCES.map(s=>`<div class="src-item"><b>${escapeHtml(s.n)}</b> — <span class="src-use">${escapeHtml(use(s))}</span><br><a href="${s.u}" target="_blank" rel="noopener">${escapeHtml(s.u)}</a></div>`).join(''); };
    paint(); m.style.display='flex';
    if(['de','ru','es'].includes(currentLang)&&!_pgDoc(currentLang)){ const sc=document.createElement('script'); sc.src='./js/locales/pages.'+currentLang+'.js'; sc.async=true; sc.onload=paint; document.head.appendChild(sc); } }
  { window.imOpenSources=openSourcesModal;   /* (#R215) Settings offers the PAGE, not a lesser in-app copy beside it (see index.html) — the dialog is kept reachable by name rather than deleted, so its markup and its ~90-entry renderer are not dead code */
    const x=document.getElementById('sources-close-x'); if(x) x.onclick=()=>{ document.getElementById('sources-modal').style.display='none'; };
    const m=document.getElementById('sources-modal'); if(m) m.addEventListener('click',e=>{ if(e.target===m) m.style.display='none'; }); }   /* (#R218) folded onto one line: tests/r200 ⑤ ratchets this file and the Sources dialog's language fetch cost it two */

  /* (#R207) BOTH news pickers (by-country #29, by-outlet new) live in js/news-sources.js — one
     feature, one nc-dd shape, and instruction 13 says new work leaves the core. Thin names only here. */
  window.IntMapModules.newsSources(IM_HOST,{ NEWS_COUNTRY_FEEDS });
  const NS=()=>window.IntMapNewsSources;
  const renderNewsCountryChecks=()=>{ try{ NS().renderCountries(); }catch(_){} };
  const updateNewsCountryLabel=()=>{ try{ NS().syncCountryLabel(); }catch(_){} };
  const renderNewsSourceChecks=()=>{ try{ NS().render(); }catch(_){} };
  const updateNewsSourceLabel=()=>{ try{ NS().syncLabel(); }catch(_){} };
  window._populateNewsSources=renderNewsSourceChecks;

  /* ---------- Wire the new Settings controls (open → fill, Apply → commit+save) ---------- */
  { const open=document.getElementById('btn-open-settings');
    if(open) open.addEventListener('click',()=>{
      const v=(id)=>document.getElementById(id);
      if(v('setting-sidebar-style')) v('setting-sidebar-style').value=window.imSidebarStyle;
      if(v('setting-label-lang'))    v('setting-label-lang').value=window.imLabelLang;
      if(v('setting-flat-pan'))      v('setting-flat-pan').value=window.imFlatPan;
      if(v('setting-map-color'))     v('setting-map-color').value=window.imMapColor;
      if(v('setting-layerpanel'))    v('setting-layerpanel').value=(window.imLayerPanel||'classic');
      if(v('setting-showrank'))      v('setting-showrank').value=(window.imShowRank||'on');   /* (#R139) default ON */
      if(v('setting-ticker'))        v('setting-ticker').value=(window.imTicker||'off');
      try{ window._populateTickerSyms&&window._populateTickerSyms(); }catch(_){}   /* (#R102) ticker symbol/item picker */
      /* (#R207) the ticker's item picker follows the SELECT, not the saved value, so On/Off shows and
         hides it without waiting for Apply (`_populateTickerSyms` reads the select — js/i18n-late.js). */
      try{ const ts=v('setting-ticker'); if(ts&&!ts.__imTickVis){ ts.__imTickVis=true;
        ts.addEventListener('change',()=>{ try{ window._populateTickerSyms&&window._populateTickerSyms(); }catch(_){} }); } }catch(_){}
      try{ window._syncAccentPicker&&window._syncAccentPicker(); }catch(_){}   /* (#R114) reflect the committed accent */
      renderNewsCountryChecks();
      try{ renderNewsSourceChecks(); }catch(_){}   /* (#R207) rebuilt on every open — the feed it lists changes */
    });
  }
  { const apply=document.getElementById('btn-close-settings');
    if(apply) apply.addEventListener('click',()=>{
      const v=(id)=>document.getElementById(id);
      if(window._accentPending!=null){ window.imAccent=window._accentPending; try{ applyAccent(); }catch(_){} }   /* (#R114) commit the previewed accent (saveSettings below persists it) */
      if(v('setting-sidebar-style')) window.imSidebarStyle=v('setting-sidebar-style').value;
      if(v('setting-label-lang'))    window.imLabelLang=v('setting-label-lang').value;
      if(v('setting-flat-pan'))      window.imFlatPan=v('setting-flat-pan').value;
      if(v('setting-map-color'))     window.imMapColor=v('setting-map-color').value;
      if(v('setting-layerpanel')){ const _oldLP=window.imLayerPanel; window.imLayerPanel=v('setting-layerpanel').value; window.imLayerPanelSet=true; /* (#R155) explicit choice → now it persists across the right-default */
        /* (#R160) ROOT CAUSE of "設定を変更すると勝手に右サイドバーが出てくる": apply() ALWAYS re-opens the right
           panel (if(!isMob()) open()), and it ran on EVERY settings save — so changing any unrelated setting
           (theme, units, …) reopened a panel the user had deliberately closed. Only reconcile when the layer-panel
           MODE actually changed; otherwise leave the panel's open/closed state exactly as the user left it. */
        if(_oldLP!==window.imLayerPanel){ try{ window.IntMapLayerSidebar&&window.IntMapLayerSidebar.apply(); }catch(_){} } }
      if(v('setting-showrank')){ window.imShowRank=v('setting-showrank').value; try{ if(window._countriesActive&&window._countriesActive()&&typeof renderStats==='function') renderStats((typeof _countriesSearchVal==='function')?_countriesSearchVal():searchVal()); }catch(_){} }   /* (#R137) re-render Countries so the rank column appears/disappears immediately */
      if(v('setting-ticker')){ window.imTicker=v('setting-ticker').value; try{ window.IntMapTicker&&window.IntMapTicker.apply(); }catch(_){} }
      /* (#R207) both news pickers commit in js/news-sources.js. The COUNTRY one changes which feeds
         are fetched; the OUTLET one is a view filter, so it re-renders rather than re-fetching. */
      let newsCountriesChanged=false, newsSourcesChanged=false;
      try{ newsCountriesChanged=!!NS().commitCountries(); }catch(_){}
      try{ newsSourcesChanged=!!NS().commit(); }catch(_){}
      applySidebarStyle();
      try{ applyFlatPanSetting(); }catch(_){}
      try{ applyLabelLang(); }catch(_){}
      try{ applyTheme(); }catch(_){}        /* re-apply so a Map-color change takes effect */
      saveSettings();
      /* (#R8c) Reflect EVERY saved setting on screen immediately — the user reported Save not taking
         effect. updateI18n() re-localizes + re-emits timezone/units-dependent text and the wind pill;
         renderUI() re-renders the active tab; the coord readout is refreshed for the new units. */
      try{ updateI18n(); }catch(_){}
      try{ renderUI(); }catch(_){}
      try{ if(typeof renderCoordReadout==='function') renderCoordReadout(); }catch(_){}
      /* (#R15) Changing the national-media selection now actually refreshes the feed — refetch the news
         so the chosen countries' outlets appear (previously the setting saved but nothing changed). */
      if(newsCountriesChanged){ try{ updateNewsCountryLabel(); }catch(_){} try{ if(currentMode==='news'||currentMode==='saved'){ globalData=[]; fetchData(); } }catch(_){} }
      /* (#R207) the outlet filter needs no network — recompute the filtered list and repaint. */
      if(newsSourcesChanged){ try{ updateNewsSourceLabel(); }catch(_){}
        try{ newsFiltered=computeFilteredNews(); renderedCount=0; renderUI(); }catch(_){}
        try{ window._refreshNewsPins&&window._refreshNewsPins(); }catch(_){} }
    });
  }
  /* Persist on the simpler toggles too (these have their own handlers; we just add saving) */
  ['lang-en','lang-jp','lang-de','lang-ru','lang-es'].forEach(id=>{ const b=document.getElementById(id); if(b) b.addEventListener('click',()=>setTimeout(saveSettings,0)); });

  /* ---------- Flat-map pan mode ----------
     Fixed = a single, non-repeating world (no infinite horizontal wrap) — you can still pan/zoom
     to the whole globe; it just doesn't tile sideways. Free = world copies repeat left/right.
     NEVER cage the camera with maxBounds (that was the "locked near Europe" bug). */
  function applyFlatPanSetting(){
    if(!GE().hasRenderer()) return;
    try{ GE().camera.setMaxBounds(null); }catch(_){}
    if(currentProj!=='flat') return;
    try{ GE().camera.setRenderWorldCopies(window.imFlatPan==='free'); }catch(_){}
    /* (#R28) keep the compare map's world-copies in step with the main map's free-pan setting */
    try{ window._cmpFollowProj&&window._cmpFollowProj(); }catch(_){}
  }
  window.applyFlatPanSetting=applyFlatPanSetting;

  /* ---------- Unified time slider → dated weather layers + community (#8) ---------- */
  window.applyGlobalDate=function(){
    const iso=newsDate?ymdISO(newsDate):null;
    try{ if(typeof window.setGlobalLayerDate==='function') window.setGlobalLayerDate(iso); }catch(_){}
    try{ if(typeof pushCommunityFeatures==='function') pushCommunityFeatures(); }catch(_){}
    try{ if(currentMode==='community' && typeof renderCommunity==='function') renderCommunity(); }catch(_){}
    /* update the slider gradient fill (#R101: min-aware — the slider is now year-based [min 1900], not 0-based) */
    const sl=document.getElementById('ntl-slider'); if(sl){ const mn=+sl.min||0, mx=+sl.max||1; const pct=(mx>mn?((+sl.value-mn)/(mx-mn)*100):0); sl.style.setProperty('--ntl-fill',pct+'%'); }
  };
  /* (#R94) news + dated-raster + community core now runs on EVERY kernel change (the slider used to call it
     directly; the kernel keeps newsDate in lock-step first, so applyGlobalDate reads the fresh instant). */
  try{ window.IntMapTime.on(()=>{ try{ applyGlobalDate(); }catch(_){} }); }catch(_){}

  /* ============================================================================
   *  (#R94e) MADDISON PROJECT — authoritative HISTORICAL GDP & population back to 1900 (real GDP in constant
   *  2011 international dollars; Bolt & van Zanden 2020). World Bank annual series only start in 1960 and give
   *  no figure at all for dissolved states, so the deep past & the former states (Former USSR / Yugoslavia /
   *  Czechoslovakia are first-class Maddison entities) come from here. Bundled as data/maddison.json =
   *  { ISO3|SUN|YUG|CSK : { year : [gdpPerCapita2011intl, populationThousands] } }, lazy-loaded on first travel.
   *  ========================================================================== */
  /* (#R162) moved to js/history.js — see Architecture.md "File layout". */
  window.IntMapMaddison=window.IntMapModules.maddison();

  /* (#R200) moved to js/time-countries.js — a real ES module (see the import at the top of this file), not a
     window.IntMapModules entry and not a line in src/main.js's ordered list. */
  makeTimeCountries(IM_HOST, { countryStats, loadCountryData, renderStats, searchVal });

  /* ============================================================================
   *  (#R94b) HISTORICAL / FORMER STATES — when the master clock is inside a former country's real lifespan,
   *  the Countries tab & country card show THAT state (Soviet Union, Yugoslavia, Serbia & Montenegro,
   *  Czechoslovakia …) with its historical flag, instead of the modern successors — faithful to the actual
   *  dissolution dates (e.g. Yugoslavia at 1991, Serbia & Montenegro at 2000, all-separate from 2007). Its
   *  figures are the REAL aggregate of the successor states' World Bank data for that year (populations & GDP
   *  summed; life-expectancy / fertility / internet population-weighted) — honest, no invented numbers. The
   *  period BORDERS come from the Historical-borders layer (aourednik) that the clock already drives. The
   *  table is data-driven, so more former states extend it trivially. ========================================= */
  /* (#R162) moved to js/history.js — see Architecture.md "File layout". */
  window.IntMapHistStates=window.IntMapModules.histStates(countryStats);

  /* ============================================================================
   *  (#R94k) HISTORICAL COUNTRY IDENTITY — a modern country whose TERRITORY is roughly the same but whose
   *  NAME and FLAG were different in an earlier era (China: Qing→Republic of China→PRC; German Empire; Kingdom
   *  of Italy; Persia; Siam …). When the clock is in that era, the country keeps its own Maddison data but shows
   *  the historical name + flag. Multi-nation empires that HID several modern countries live in IntMapHistStates
   *  instead; this is only for single-country renamings. ============================================= */
  /* (#R162) moved to js/history.js — see Architecture.md "File layout". */
  window.IntMapHistId=window.IntMapModules.histId(countryStats);

  /* (#R94) Köppen climate era follows the clock (uses the existing period rasters, no new assets). Only
     reloads the texture when the climate layer is actually on; otherwise just remembers the era. */
  try{ window.IntMapTime.on(e=>{
    const on=(()=>{ try{ const c=document.getElementById('dl-climate'); return !!(c&&c.checked); }catch(_){ return false; } })();
    const y=e.year; const era=e.isLive?'1991-2020':(y>=1991?'1991-2020':y>=1961?'1961-1990':y>=1931?'1931-1960':'1901-1930');
    if(window._koppenPeriod===era) return;
    if(on && typeof window.setKoppenPeriod==='function'){ window.setKoppenPeriod(era); }
    else { window._koppenPeriod=era; }
  }); }catch(_){}

  /* (#R94) Dated NASA rasters that Earth Replay used to reload (air-temp, NO₂, CO, active-fire, true-color,
     VIIRS) now follow the master clock centrally. sst/snow/aod/thermal/precip stay with setGlobalLayerDate
     (called from applyGlobalDate) so each dated layer is refreshed by exactly one subscriber. GIBS lags ~2 d,
     so the request date is clamped back to the freshest processed day. */
  try{ window.IntMapTime.on(e=>{ try{ const LD=window._imLayerDates; if(!LD) return;
    const maxIso=new Date(Date.now()-2*864e5).toISOString().slice(0,10);
    let d=e.isLive?maxIso:e.iso; if(d>maxIso) d=maxIso;
    ['temp','no2','co','fire','truecolor','viirs'].forEach(k=>{ try{ const cb=document.getElementById('dl-'+k); if(cb&&cb.checked){ LD[k]=d; if(window.refreshDatedLayer&&GE().layers.has('lyr-'+k)&&GE().layers.getLayout('lyr-'+k,'visibility')==='visible') window.refreshDatedLayer(k); } }catch(_){} });
  }catch(_){} }); }catch(_){}

  /* ============================================================================
   *  PROJECTION VIEWER (#16 flat-map projections, #17 azimuthal-equidistant on a pin)
   *  MapLibre GL renders ONLY mercator + globe, so true equal-area / compromise /
   *  azimuthal projections can't come from the basemap. This draws them on a 2D
   *  canvas from real Natural-Earth country geometry + a graticule. Self-contained:
   *  own DOM, CSS, projection math and input handling.
   *  ========================================================================== */
  /* (#R166) moved to js/map-tools.js — see Architecture.md §3.1. */
  window.IntMapModules.projView(IM_HOST);

  /* ---------- Animated wind layer (#9) ---------- */
  /* REAL global 10 m wind field from Open-Meteo (GFS), no key, CORS-enabled (Access-Control-Allow-
     Origin:* — works from file:// too). The previous version advected particles in SCREEN space using a
     single center-based px/degree, which is badly wrong everywhere except the center on the globe (the
     projection curves and the bearing rotates north away from "up") — that is why it looked like
     nonsense. This version keeps every particle as a true GEOGRAPHIC coordinate (lng/lat), advects it
     through the wind field in degrees, and PROJECTS it with the live map each frame — so the flow is
     correct under any projection/zoom/rotation and pans & zooms locked to the map ("座標ベース"). */
  /* (#R166) moved to js/weather.js — see Architecture.md §3.1. */
  window.IntMapModules.wind(IM_HOST);

  /* ===================== Freehand DRAW / trace tool (#R7) =====================
     Click (or tap) once to start, move the cursor to trace a freehand curve in real time, click again
     to finish — no repeated clicking. Shows live geodesic LENGTH and, where the trajectory crosses
     itself, the total spherical AREA of the enclosed loops.
       • Length is measured along the displayed (smoothed) polyline → a "resolution / smoothing" slider
         thins the points (Douglas–Peucker) so the line simplifies and the length shrinks live.
       • Area is ALWAYS computed from the full-resolution RAW trajectory and pinned, so moving the
         smoothing slider never changes the area number — only the line's look & length change.
       • Distance = great-circle (turf), area = spherical-excess polygon (ringArea) → correct at any
         latitude, antimeridian/pole-safe like the other tools. ============================= */
  /* (#R166) moved to js/map-tools.js — see Architecture.md §3.1. */
  window.IntMapModules.drawTool(IM_HOST);

  /* (#R167) moved to js/dash-extended.js — see Architecture.md §3.1. */
  window.IntMapModules.dashExtended(IM_HOST);

  /* ===== (#R9b/#40/#41/#42/#14) Earth, sky & airspace: major dams, active volcanoes, NOAA aurora
     forecast (live), and approximate Air-Defense Identification Zones. Self-contained, additive. ===== */
  /* (#R166) moved to js/layer-packs.js — see Architecture.md §3.1. */
  window.IntMapModules.earthSky(IM_HOST);

  /* ===== (#R11) Land cover & earth science: ESA WorldCover 2021 (WMTS raster), RESOLVE/WWF Ecoregions
     2017 (PMTiles vector), and tectonic plates (real polygons + boundaries). Self-contained. ===== */
  /* (#R166) moved to js/layer-packs.js — see Architecture.md §3.1. */
  window.IntMapModules.landCover(IM_HOST);

  /* ===== (#R19) Beta layers — Ukraine frontline (LIVE, DeepState API) · 3D city buildings
     (OpenFreeMap vector building footprints, fill-extrusion) · Historical borders time slider
     (aourednik/historical-basemaps, 1900→2010 — ≥100 years back as requested).
     All three rows are swept into "Others (beta)" by reorganizeLayerPanel. Each registers an
     opacity legend via _registerLayerOpacity. Everything lazy-loads on first toggle. ===== */
  /* (#R164) moved to js/beta-overlays.js — see Architecture.md §3.1. */
  window.IntMapModules.betaOverlays(IM_HOST);

  /* ===== (#R21) Beta layer pack 2 — Data centers & AI infra · World railways by gauge · Pharma &
     health (factory hubs + life-expectancy choropleth) · Corruption indicator (World Bank WGI,
     live) · Globe tour (slow auto-rotation). All rows land in "Others (beta)" via the
     reorganize sweep; data is lazy-loaded on first toggle and exposed through
     window.IntMapBeta2.load(key,cb) so the Compare view reuses the same FeatureCollections. ===== */
  /* (#R166) moved to js/layer-packs.js — see Architecture.md §3.1. */
  window.IntMapModules.betaPack2(IM_HOST);

  /* ===== (#R22) Religion & language distribution — categorical country choropleths (beta). Each
     country is shaded by its DOMINANT religion / PRIMARY official language (well-established facts;
     ISO-3 keyed; countries without an entry stay neutral gray — real data, nothing fabricated). ===== */
  /* (#R166) moved to js/layer-packs.js — see Architecture.md §3.1. */
  window.IntMapModules.religionLang(IM_HOST);

  /* ===== Widgets retired (#R15) — the clock/weather/FX widget panel was removed per user request.
     A no-op stub remains so any stray reference can't throw. ===== */
  window.IntMapWidgets={ toggle:function(){}, refresh:function(){} };

  /* (#R21) Flag rendering that works on PCs: Windows has no color-emoji flags (a 🇩🇪 renders as the
     letters "DE"), so every flag display goes through this helper — it derives the ISO-2 code from the
     flag emoji's regional-indicator pair and serves a flagcdn.com PNG, with the emoji as alt/fallback. */
  window.imFlagISO2=function(fl){ try{ const cps=[...String(fl||'')].map(c=>c.codePointAt(0)).filter(c=>c>=0x1F1E6&&c<=0x1F1FF);
    if(cps.length===2) return String.fromCharCode(cps[0]-0x1F1E6+65,cps[1]-0x1F1E6+65).toLowerCase(); }catch(_){} return null; };
  window.imFlagHTML=function(fl,h){ const c=window.imFlagISO2(fl); h=h||20;
    if(!c) return '<span>'+(fl||'🏳️')+'</span>';
    return '<img src="https://flagcdn.com/h'+(h<=24?'24':h<=40?'40':'80')+'/'+c+'.png" alt="'+(fl||'')+'" style="height:'+h+'px;border-radius:3px;vertical-align:-3px;box-shadow:0 0 0 1px rgba(128,128,128,0.25);" loading="lazy">'; };

  /* ===== (#R19) Apple-style SIDEBAR widgets — shown ONLY in the no-tab-selected blank state.
     Per the spec: default = NONE; the user adds widgets from a gallery ("+"), iOS-widget look
     (rounded glass cards, 2-col grid), removable (hover/tap ✕), prefs persist. Data: clock (user TZ),
     weather (Open-Meteo @ map center), FX (open.er-api.com), markets (CoinGecko — keyless+CORS;
     stock APIs are key-walled/CORS-blocked, so markets = crypto majors, honestly labeled). ===== */
  /* (#R164) moved to js/widgets.js — see Architecture.md §3.1. */
  window.IntMapModules.widgets(IM_HOST);
  (function(){
    return; /* widgets disabled */
    if(!GE().hasRenderer() || !GE().hasRenderer()) return;
    const jp=()=>currentLang==='jp'; const KEY='intmap_widgets';
    let cfg={clock:true,weather:true,fx:false}; try{ const s=JSON.parse(localStorage.getItem(KEY)||'null'); if(s) cfg=Object.assign(cfg,s); }catch(_){}
    let panel=null, tick=null, dataTick=null;
    function save(){ try{ localStorage.setItem(KEY,JSON.stringify(cfg)); }catch(_){} }
    function ensure(){ if(panel) return panel; panel=document.createElement('div'); panel.id='widget-panel'; panel.className='tool-panel'; (document.getElementById('map-container')||document.body).appendChild(panel); return panel; }
    function chk(k,label){ return '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" data-w="'+k+'" '+(cfg[k]?'checked':'')+'> '+label+'</label>'; }
    function render(){ const p=ensure();
      p.style.cssText='display:block;position:absolute;top:70px;right:24px;left:auto;bottom:auto;z-index:1500;width:240px;';
      p.innerHTML='<div class="tp-header"><span class="tp-title">🧩 '+(jp()?'ウィジェット':'Widgets')+'</span><button class="tp-close" title="'+t('close')+'">✕</button></div>'
        +'<div id="wdg-clock" style="'+(cfg.clock?'':'display:none;')+'margin-bottom:7px;"></div>'
        +'<div id="wdg-weather" style="'+(cfg.weather?'':'display:none;')+'font-size:12px;color:var(--text-muted);margin-bottom:7px;">'+(jp()?'天気を取得中…':'Loading weather…')+'</div>'
        +'<div id="wdg-fx" style="'+(cfg.fx?'':'display:none;')+'font-size:12px;color:var(--text-muted);margin-bottom:7px;">'+(jp()?'為替を取得中…':'Loading FX…')+'</div>'
        +'<div style="border-top:1px solid rgba(128,128,128,0.18);padding-top:7px;display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:var(--text-muted);">'+chk('clock',jp()?'時計':'Clock')+chk('weather',jp()?'天気':'Weather')+chk('fx',jp()?'為替':'FX')+'</div>';
      p.querySelector('.tp-close').onclick=()=>{ p.style.display='none'; };
      try{ makeDraggable(p,p.querySelector('.tp-header')); }catch(_){}
      p.querySelectorAll('input[data-w]').forEach(c=>c.onchange=()=>{ cfg[c.getAttribute('data-w')]=c.checked; save(); render(); });
      updateClock(); refreshData(); }
    function updateClock(){ const el=panel&&panel.querySelector('#wdg-clock'); if(!el||!cfg.clock||(panel&&panel.style.display==='none')) return; const now=new Date(); let tz; try{ if(typeof userTZ!=='undefined'&&userTZ&&userTZ!=='auto') tz=userTZ; }catch(_){}
      let tstr,dstr; try{ tstr=now.toLocaleTimeString(jp()?'ja-JP':'en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:tz}); }catch(_){ tstr=now.toLocaleTimeString(); }
      try{ dstr=now.toLocaleDateString(jp()?'ja-JP':'en-GB',{weekday:'short',month:'short',day:'numeric',timeZone:tz}); }catch(_){ dstr=now.toLocaleDateString(); }
      el.innerHTML='<div style="font-size:27px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--text-main);line-height:1.1;">'+tstr+'</div><div style="font-size:11px;color:var(--text-muted);">'+dstr+(tz?' · '+tz:'')+'</div>'; }
    function wIcon(c){ if(c==null) return '🌡'; if(c===0) return '☀️'; if(c<=3) return '⛅'; if(c<=48) return '🌫'; if(c<=67) return '🌧'; if(c<=77) return '❄️'; if(c<=82) return '🌦'; if(c<=99) return '⛈'; return '🌡'; }
    function fxF(v){ return v==null?'—':(v<10?(+v).toFixed(3):(+v).toFixed(2)); }
    async function refreshData(){
      if(cfg.weather && panel){ try{ const c=GE().hasRenderer()?GE().camera.getCenter():{lat:35.68,lng:139.76}; const r=await fetch('https://api.open-meteo.com/v1/forecast?latitude='+c.lat.toFixed(2)+'&longitude='+c.lng.toFixed(2)+'&current=temperature_2m,weather_code,wind_speed_10m'); const j=await r.json(); const cu=j.current||{}; const el=panel.querySelector('#wdg-weather'); if(el) el.innerHTML='<b style="color:var(--text-main);font-size:14px;">'+wIcon(cu.weather_code)+' '+(window.fmtTemp?window.fmtTemp(cu.temperature_2m):Math.round(cu.temperature_2m)+'°C')+'</b><br><span style="font-size:10.5px;">'+(jp()?'風 ':'wind ')+Math.round(cu.wind_speed_10m)+' km/h · '+(jp()?'地図中心':'map center')+'</span>'; }catch(_){ const el=panel.querySelector('#wdg-weather'); if(el) el.textContent=jp()?'天気を取得できません':'Weather unavailable'; } }
      if(cfg.fx && panel){ try{ const r=await fetch('https://open.er-api.com/v6/latest/USD'); const j=await r.json(); const rt=j.rates||{}; const el=panel.querySelector('#wdg-fx'); if(el) el.innerHTML='<b style="color:var(--text-main);">USD</b> → JPY '+fxF(rt.JPY)+' · EUR '+fxF(rt.EUR)+' · CNY '+fxF(rt.CNY)+' · GBP '+fxF(rt.GBP); }catch(_){ const el=panel.querySelector('#wdg-fx'); if(el) el.textContent=jp()?'為替を取得できません':'FX unavailable'; } }
    }
    function toggle(){ const p=ensure(); if(p.style.display==='none'||!p.style.display){ render(); if(!tick) tick=setInterval(updateClock,1000); if(!dataTick) dataTick=setInterval(()=>{ if(panel&&panel.style.display!=='none') refreshData(); },300000); } else { p.style.display='none'; } }
    function wire(){ const b=document.getElementById('btn-widgets'); if(b) b.onclick=toggle; }   /* mobile m-tool proxy clicks btn-widgets directly */
    if(document.readyState!=='loading') setTimeout(wire,0); else document.addEventListener('DOMContentLoaded',wire);
    window.addEventListener('intmap-lang',()=>{ if(panel&&panel.style.display!=='none') render(); });
    window.IntMapWidgets={ toggle, refresh:refreshData };
  })();

  /* (#R167) moved to js/map-extras.js — see Architecture.md §3.1. */
  window.IntMapModules.annotations(IM_HOST);
  /* Densify a click-path into a great-circle polyline so the saved annotation matches the drawn arc. */
  function _gcDensify(pts){ if(!hasTurf()||pts.length<2) return pts.slice(); const out=[pts[0].slice()];
    for(let i=1;i<pts.length;i++){ try{ const gc=turf.greatCircle(turf.point(pts[i-1]),turf.point(pts[i]),{npoints:24}); const g=gc.geometry;
      if(g.type==='LineString') out.push(...g.coordinates.slice(1)); else g.coordinates.forEach(seg=>out.push(...seg)); }catch(_){ out.push(pts[i].slice()); } }
    return out; }
  window._finalizeMeasurement=function(){
    try{
      if(toolMode==='measure' && measurePoints.length>=2){ const v=hasTurf()?distHTML(totalDistance(measurePoints)):''; window.IntMapAnnotations.add({type:'LineString',coordinates:_gcDensify(measurePoints)},{color:'#0a84ff',name:(currentLang==='jp'?'計測線':currentLang==='de'?'Messlinie':currentLang==='ru'?'Измеренная линия':currentLang==='es'?'Línea medida':'Measured line'),value:v}); }
      else if(toolMode==='area' && measurePoints.length>=3){ const v=hasTurf()?areaHTML(ringArea(measurePoints)):''; window.IntMapAnnotations.add({type:'Polygon',coordinates:[_gcDensify([...measurePoints,measurePoints[0]])]},{color:'#34c759',op:0.18,name:(currentLang==='jp'?'計測範囲':currentLang==='de'?'Gemessene Fläche':currentLang==='ru'?'Измеренная площадь':currentLang==='es'?'Área medida':'Measured area'),value:v}); }
      else if(toolMode==='radius' && radiusItems.length){ radiusItems.forEach(c=>{ try{ const v=hasTurf()?(distHTML(c.radiusKm)+' ('+areaHTML(Math.PI*c.radiusKm*c.radiusKm)+')'):''; diskFillPolys(c.center,c.radiusKm,c.radiusKm>3000?200:140).forEach(poly=>{ const g=poly.geometry||poly; window.IntMapAnnotations.add(g,{color:c.color,op:c.opacity,name:(currentLang==='jp'?'半径 ':currentLang==='de'?'Radius ':currentLang==='ru'?'Радиус ':currentLang==='es'?'Radio ':'Radius ')+c.radiusKm+' km',value:v}); }); }catch(_){} }); }
      else return;
      exitTool();
    }catch(_){}
  };

  /* (#R169) moved verbatim to js/elevation-profile.js — see Architecture.md §3.1. */
  /* (#R154) reusable core — profile ANY [lng,lat][] path (≥2 pts). Extracted from _elevationProfile so the freehand
     Draw tool can reach it too ("DrawでもElevation profileを使えるように"). Same densify → sample → DEM → chart pipeline. */
  window._profileFromCoords=function(pts){
    if(!hasTurf() || !pts || pts.length<2) return;
    let line; try{ line=turf.lineString(_gcDensify(pts)); }catch(_){ return; }
    let len; try{ len=turf.length(line,{units:'kilometers'}); }catch(_){ len=0; }
    if(!(len>0)) return;
    /* High resolution: ~1 sample / 1.5 km, 60–240 samples (DEM tiles are cached so many samples share fetches). */
    const N=Math.min(240, Math.max(60, Math.round(len/1.5)));
    const samples=[], dist=[];
    for(let i=0;i<N;i++){ const d=len*i/(N-1); let pt=null; try{ pt=turf.along(line,d,{units:'kilometers'}).geometry.coordinates; }catch(_){} if(pt){ samples.push(pt); dist.push(d); } }
    if(samples.length<2) return;
    _openProfilePanel(samples,dist);
  };
  window._elevationProfile=function(){
    if(toolMode!=='measure' && toolMode!=='area') return;
    const pts = (toolMode==='area')?[...measurePoints,measurePoints[0]]:measurePoints;
    window._profileFromCoords(pts);
  };
  /* (#R169) moved verbatim to js/elevation-profile.js — see Architecture.md §3.1. */

  /* ===== (#R9b/#53) Country isolation — show only the selected country; mask the rest with the globe-style
     background. A floating "Exit isolation" pill restores the full map. ===== */
  /* (#R166) moved to js/map-tools.js — see Architecture.md §3.1. */
  window.IntMapModules.isolate(IM_HOST);

  /* (#R167) moved to js/map-extras.js — see Architecture.md §3.1. */
  window.IntMapModules.layerHoverPopup(IM_HOST);

  /* ===== (#R9b/#9) Per-country time-series graphs from the World Bank Open Data API (CORS *). Opened
     from the country detail popup; draws a small SVG line chart per indicator. ===== */
  /* (#R166) moved to js/analysis-panels.js — see Architecture.md §3.1. */
  window.IntMapModules.timeSeries(IM_HOST);

  /* ===== (#R62) COUNTRY COMPARISON — rebuilt from the ground up ("根本的な部分から作り変えて"): up to FIVE
     countries side by side, ~20 indicators (multi-select), SOURCE switching (World Bank ⇄ IMF WEO for the
     economic series — different institutions report different GDP figures), latest values table + overlaid
     multi-country time-series charts with a shared crosshair, fully wired into Atlas (compareStats action).
     Desktop = wide modal; mobile = the same modal compacted (smaller charts, scrollable columns). ===== */
  /* (#R163) moved to js/stats-compare.js — see Architecture.md §3.1. */
  window.IntMapStatsCompare=window.IntMapModules.statsCompare(IM_HOST);

  /* ===== (#R11) Line-of-sight / radar-shadow viewshed. Place a "radar site", set antenna height + range,
     and the terrain DEM is cast in 96 rays (earth-curvature-corrected) → terrain-blocked dead zones are
     filled red, the visible coverage outlined green. Uses the same cached terrarium DEM as the readout. ===== */
  /* (#R166) moved to js/map-tools.js, then (#R176) to js/viewshed.js — see Architecture.md §3.1.
     ===== (#R176) The three simulators the round was asked for. Each is self-contained in its own file
     and reached from the map's right-click menu and from Atlas (never from the Measure menu).
     (#R192) 「波の伝播のわかるアニメーション津波シミュレーター」 — linear long waves over the real sea
     floor, offered by the seismic panel when the event screens as tsunamigenic; it is fetched WITH
     seismic (js/lazy-modules.js ALSO) because that is what hands it an event.
     ⚠ (#R209) los / terrainWater / seismic / tsunami are no longer instantiated here — 162 kB of
     minified source that a session which never right-clicks the map never downloads. The four are
     fetched by js/lazy-modules.js from the context-menu items and from Atlas. */
  window.IntMapModules.insolation(IM_HOST);     /* terrain shade + the year, driven by the Sun panel */

  /* ===== (#R12 / #57) Maritime routing & pathfinding engine — click two SEA points → an A* route that
     avoids land, follows open water (a near-coast cost penalty keeps it off the 0 m coastline, per
     international-navigation common sense), honours user no-go zones, and offers a pure-shortest-distance
     (great-circle) mode. Land is rasterised ONCE from countryGeo into an equirectangular mask (fast pixel
     test); A* runs on that grid; the staircase path is string-pulled along clear-sea sightlines (faithful,
     not an invented curve). Canals (Suez/Panama) are land in the mask → not auto-traversed (documented). ===== */
  /* (#R166) moved to js/map-tools.js — see Architecture.md §3.1. */
  window.IntMapModules.seaRoute(IM_HOST);

  /* ===== (#R12 / #20,#21) ECMWF (Open-Meteo data_spatial) weather suite — the official Open-Meteo
     weather-map-layer SDK decodes the ECMWF IFS .om tiles through a MapLibre `om://` protocol and applies
     Windy-style color scales per variable. We lazy-load the UMD build, register the protocol once, and
     add each variable as a raster (or vector contours for isobars) BETWEEN the basemap and the labels via
     beforeId. Hourly time selection comes from latest.json's valid_times; the active valid-time is shown.
     Everything is guarded — if the SDK/endpoint fails, the rest of the app is unaffected. Exposes
     window.toggleWeatherLayer(id, visible) + per-layer opacity. ===== */
  /* (#R166) moved to js/weather.js — see Architecture.md §3.1. */
  window.IntMapModules.weatherEC(IM_HOST);

  /* ===== (#R12 / compare) Compare-mode window — a resizable / minimisable / draggable floating window
     holding a SECOND MapLibre instance with its own basemap, projection and data layers, so two states
     can be viewed side by side (the whole point of "compare"). It mirrors the main map's controls (view +
     layers) minus the sidebar, and can optionally lock its camera to the main map. Independent layer state
     is intentional. (Full parity with every main-map tool isn't cloned — the app is single-instance — but
     the core comparison surface is here and behaves like the main map.) ===== */
  /* (#R20) Compare REBUILT to the requested spec:
     · NO Flat/Globe selector — the compare projection auto-follows the MAIN map in every mode.
     · THREE exclusive modes ("二択なものです…三択にして"): SYNC / FREE (independent) / X-RAY.
       - SYNC: bidirectional ("メインとサブ、どちらの地図を動かしても同期") and the compare window
         shows, at its center, the geography under the CENTROID OF THE UNCOVERED MAIN-MAP AREA
         ("compare viewに隠れていない領域の中心を、compare viewの中心とする").
       - FREE: fully independent camera, no interference with the main map.
       - X-RAY: the R18 pixel-registered clip-path lens.
     · Map/Satellite buttons now RETRY until the style is ready (the "押しても地図が変わらない" bug
       was a click landing before cmap load → setVis silently no-oped with no retry).
     · A "Layers ▾" pulldown with EVERY portable layer (Köppen, land cover, ecoregions, plates,
       hillshade, night lights, snow, aerosol, SST, temperature, precipitation, thermal, population
       grid, Ukraine frontline, volcanoes). Country choropleths are main-map feature-state layers and
       are not cloned (documented in DEV-NOTES).
     · Resizable from ALL FOUR corners ("四隅でできるように"). */
  /* (#R163) moved to js/compare.js — see Architecture.md §3.1. */
  window.IntMapCompare=window.IntMapModules.compare(IM_HOST);

  /* ===== (#R20) LAYER PRESETS — save the current layer set (selection + opacities) under a name and
     re-apply it in one tap ("レイヤーを自分の好きな設定や透明度、複数選択…で保存できる機能").
     Lives in Layers → Tools; persists locally + (when logged in) in the account prefs blob. ===== */
  /* (#R166) moved to js/map-ui.js — see Architecture.md §3.1. */
  window.IntMapModules.layerPresets(IM_HOST);

  /* ===== (#R20) ACCOUNT PREFS SYNC — a logged-in user's settings / layer favorites / widget board /
     layer presets live in Supabase `user_prefs` (supabase_user_prefs.sql, own-row RLS) so they follow
     the account across devices ("ユーザーが設定できるものなどは、アカウント登録者では保持して"). ===== */
  (function(){
    let upT=null, applying=false;
    function collect(){ const d={};
      try{ d.settings=JSON.parse(localStorage.getItem('intmap_settings')||'{}'); }catch(_){ d.settings={}; }
      try{ d.widgets=JSON.parse(localStorage.getItem('intmap_widgets3')||'[]'); }catch(_){ d.widgets=[]; }
      try{ d.presets=JSON.parse(localStorage.getItem('intmap_layer_presets')||'[]'); }catch(_){ d.presets=[]; }
      try{ d.tempUnit=localStorage.getItem('intmap_temp_unit')||null; }catch(_){}
      try{ d.newsLang=localStorage.getItem('intmap_news_lang')||null; d.newsLangs=JSON.parse(localStorage.getItem('intmap_news_langs')||'null'); }catch(_){}
      try{ d.aiLocate=localStorage.getItem('intmap_ai_locate')||null; }catch(_){}
      /* (#R32b) Avatar (emoji + cropped image) now syncs with the account so it follows across devices and
         never silently reverts to the default ("デバイス間で共有されておらず…デフォルトに戻ってしまう"). */
      try{ d.avatar=localStorage.getItem('intmap_avatar')||null; d.avatarImg=localStorage.getItem('intmap_avatar_img')||null; }catch(_){}
      return d; }
    window._syncPrefsUp=function(){ if(applying) return; clearTimeout(upT);
      upT=setTimeout(async ()=>{ try{
        if(typeof DB==='undefined'||!DB||typeof currentUser==='undefined'||!currentUser) return;
        await DB.from('user_prefs').upsert({ user_id:currentUser.id, data:collect(), updated_at:new Date().toISOString() });
      }catch(_){} },1500); };
    window._syncPrefsDown=async function(){ try{
      if(typeof DB==='undefined'||!DB||typeof currentUser==='undefined'||!currentUser) return;
      const {data,error}=await DB.from('user_prefs').select('data').eq('user_id',currentUser.id).maybeSingle();
      if(error||!data||!data.data){ window._syncPrefsUp(); return; }   /* nothing stored yet → seed from this device */
      const d=data.data; applying=true;
      try{
        if(d.settings&&typeof d.settings==='object'){ localStorage.setItem('intmap_settings',JSON.stringify(d.settings)); try{ loadSettings(); }catch(_){} }
        if(d.tempUnit){ localStorage.setItem('intmap_temp_unit',d.tempUnit); window.imUnitTemp=d.tempUnit; }
        if(d.newsLang) localStorage.setItem('intmap_news_lang',d.newsLang);
        if(Array.isArray(d.newsLangs)) localStorage.setItem('intmap_news_langs',JSON.stringify(d.newsLangs));
        if(d.aiLocate) localStorage.setItem('intmap_ai_locate',d.aiLocate);
        if(d.avatar){ localStorage.setItem('intmap_avatar',d.avatar); } if(d.avatarImg){ localStorage.setItem('intmap_avatar_img',d.avatarImg); } try{ if(d.avatar||d.avatarImg) updateAccountButton(); }catch(_){}
        if(Array.isArray(d.presets)&&window.IntMapPresets) window.IntMapPresets._set(d.presets);
        if(Array.isArray(d.widgets)&&window.IntMapWidgets2&&window.IntMapWidgets2._setActive) window.IntMapWidgets2._setActive(d.widgets);
        try{ applyTheme(); }catch(_){} try{ updateI18n(); }catch(_){} try{ applySidebarStyle(); }catch(_){}
      }finally{ applying=false; }
    }catch(_){ applying=false; } };
  })();

  /* ===== (#R20) AI RESEARCH ASSISTANT — click a place label → "AI brief": the configured BYOK model
     writes a structured brief (background · history · economy · military/strategic significance ·
     recent developments), seeded with the nearby geocoded news headlines so it is stronger on "now"
     than an encyclopedia. Needs an AI key (Settings → AI features); reuses askAI(). ===== */
  /* (#R166) moved to js/analysis-panels.js — see Architecture.md §3.1. */
  window.IntMapModules.aiResearch(IM_HOST);

  /* ===== (#R39) TWO-LAYER CORRELATION / SCATTER — pick any two NUMERIC, ABSOLUTE-SCALE country metrics
     ("数値があるかつ絶対尺度のレイヤーのみ") and see a scatter plot + correlation coefficient over every
     country that has both values. Opened from a button at the bottom of the Layers panel. ===== */
  /* (#R166) moved to js/analysis-panels.js — see Architecture.md §3.1. */
  window.IntMapModules.correlate(IM_HOST);

  /* ===== (#R20) WORLD EVENTS ARCHIVE — the Information tab gains a Places | Events split
     ("既存カードをplaceとして中分類…eventとして新たな中分類を新設"). Events = curated key moments
     (wars, disasters, revolutions, assassinations, space, economic crises) searchable by TEXT
     (existing search box) and YEAR RANGE, each plotted on the map. ===== */
  /* (#R166) moved to js/analysis-panels.js — see Architecture.md §3.1. */
  window.IntMapModules.worldEvents(IM_HOST);

  /* ===== (#R22) ACLED CONFLICT EVENTS card removed from the News tab per request ("News欄のACLEDは削除"). ===== */
  (function(){
    return; /* ACLED card retired (#R22) */
    if(!GE().hasRenderer()||!GE().hasRenderer()) return;
    const jp=()=>currentLang==='jp';
    const esc=(s)=>String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    const PROX=[x=>x, x=>'https://corsproxy.io/?url='+encodeURIComponent(x), x=>'https://api.allorigins.win/raw?url='+encodeURIComponent(x)];
    const KEY='intmap_acled';
    let cred={email:'',key:''}; try{ const s=JSON.parse(localStorage.getItem(KEY)||'null'); if(s) cred=s; }catch(_){}
    let card=null, open=false, events=[], pinsOn=true;
    const TYPE_COL={'Battles':'#ff3b30','Explosions/Remote violence':'#ff9500','Violence against civilians':'#af52de','Protests':'#0a84ff','Riots':'#ffd60a','Strategic developments':'#8e8e93'};
    function ensureLayer(){ if(GE().layers.hasSource('acled-src')) return true; if(!canDraw()) return false;
      try{
        GE().layers.addSource('acled-src',{type:'geojson',data:{type:'FeatureCollection',features:[]},attribution:'ACLED'});
        const before=GE().layers.has('tool-poly')?'tool-poly':undefined;
        GE().layers.add({id:'acled-pt',type:'circle',source:'acled-src',layout:{visibility:'none'},paint:{
          'circle-radius':['interpolate',['linear'],['zoom'],1,2.4,5,4.4,9,7],
          'circle-color':['coalesce',['get','col'],'#ff3b30'],'circle-stroke-color':'#fff','circle-stroke-width':0.8,'circle-opacity':0.88}},before);
        GE().events.onLayer('click','acled-pt',e=>{ const f=e.features&&e.features[0]; if(!f) return; const p=f.properties||{};
          try{ GE().ui.attach(GE().ui.popup({closeButton:true,closeOnClick:true,className:'plc-popup',maxWidth:'300px'}).setLngLat(f.geometry.coordinates)
            .setHTML('<div style="min-width:170px;"><div style="font-weight:700;font-size:13px;color:var(--text-main);">'+esc(p.tp)+'</div><div style="font-size:11.5px;color:var(--text-muted);margin-top:3px;">'+esc(p.d)+' · '+esc(p.loc)+', '+esc(p.cty)+(p.fat>0?(' · '+(jp()?'死者 ':'fatalities ')+p.fat):'')+'</div>'+(p.notes?'<div style="font-size:11px;color:var(--text-main);margin-top:5px;line-height:1.5;">'+esc(String(p.notes).slice(0,220))+'…</div>':'')+'</div>')); }catch(_){}
        });
        GE().events.onLayer('mouseenter','acled-pt',()=>{ GE().render.canvas().style.cursor='pointer'; });
        GE().events.onLayer('mouseleave','acled-pt',()=>{ GE().render.canvas().style.cursor=''; });
        return true;
      }catch(_){ return false; } }
    function setPins(on){ pinsOn=on; const a=()=>{ if(!ensureLayer()){ GE().events.once('idle',a); return; } try{ GE().layers.setLayout('acled-pt','visibility',on&&events.length?'visible':'none'); }catch(_){} }; a(); }
    function pushPins(){ const a=()=>{ if(!ensureLayer()){ GE().events.once('idle',a); return; }
      try{ GE().layers.setSourceData('acled-src',{type:'FeatureCollection',features:events.map(ev=>({type:'Feature',geometry:{type:'Point',coordinates:[+ev.longitude,+ev.latitude]},properties:{tp:ev.event_type,d:ev.event_date,loc:ev.location,cty:ev.country,fat:+ev.fatalities||0,notes:ev.notes||'',col:TYPE_COL[ev.event_type]||'#ff3b30'}}))}); }catch(_){}
      setPins(pinsOn); }; a(); }
    async function loadEvents(){
      const st=card.querySelector('#acled-status'); const list=card.querySelector('#acled-list');
      if(!cred.email||!cred.key){ st.textContent=jp()?'メールとAPIキーを入力してください（acleddata.comで無料登録）。':'Enter your email + API key (free registration at acleddata.com).'; return; }
      st.textContent=jp()?'取得中…':'Loading…'; list.innerHTML='';
      const d2=new Date(), d1=new Date(Date.now()-14*864e5);
      const f=(d)=>d.toISOString().slice(0,10);
      const url='https://api.acleddata.com/acled/read?key='+encodeURIComponent(cred.key)+'&email='+encodeURIComponent(cred.email)+
        '&event_date='+f(d1)+'|'+f(d2)+'&event_date_where=BETWEEN&limit=400&fields=event_date|event_type|country|location|latitude|longitude|fatalities|notes';
      let j=null;
      for(const wrap of PROX){ try{
        const ctrl=new AbortController(); const to=setTimeout(()=>{ try{ctrl.abort();}catch(_){} },20000);
        const r=await fetch(wrap(url),{signal:ctrl.signal}); clearTimeout(to);
        if(!r.ok) continue; j=await r.json(); if(j&&(j.data||j.success!==undefined)) break;
      }catch(_){} }
      const rows=(j&&j.data)||[];
      if(!rows.length){ st.textContent=(j&&j.error)?((jp()?'エラー: ':'Error: ')+esc(j.error.message||JSON.stringify(j.error)).slice(0,160)):(jp()?'取得できませんでした。キー・メール・利用枠を確認してください。':'Nothing returned — check the key, email and your API quota.'); return; }
      events=rows.filter(ev=>ev&&ev.latitude&&ev.longitude);
      st.textContent=(jp()?('直近14日間: '+events.length+'件 · ACLED'):(events.length+' events, last 14 days · ACLED'));
      const fmt=events.slice(0,40).map(ev=>'<div class="acled-row" data-ll="'+(+ev.longitude)+','+(+ev.latitude)+'" style="display:flex;gap:7px;align-items:flex-start;padding:6px 4px;border-bottom:1px solid rgba(128,128,128,0.12);cursor:pointer;font-size:11.5px;line-height:1.45;">'+
        '<span style="width:9px;height:9px;border-radius:5px;flex:none;margin-top:3px;background:'+(TYPE_COL[ev.event_type]||'#ff3b30')+';"></span>'+
        '<span><b style="color:var(--text-main);">'+esc(ev.event_type)+'</b> · '+esc(ev.event_date)+'<br><span style="color:var(--text-muted);">'+esc(ev.location)+', '+esc(ev.country)+(+ev.fatalities>0?(' · '+(jp()?'死者 ':'†')+ev.fatalities):'')+'</span></span></div>').join('');
      list.innerHTML=fmt;
      list.querySelectorAll('.acled-row').forEach(rw=>rw.onclick=()=>{ try{ const [lng,lat]=rw.getAttribute('data-ll').split(',').map(Number); GE().camera.flyTo({center:[lng,lat],zoom:7}); }catch(_){} });
      pushPins();
    }
    function build(){
      if(card) return card;
      const feed=document.getElementById('live-news-feed'); if(!feed||!feed.parentElement) return null;
      card=document.createElement('div'); card.id='acled-card';
      card.style.cssText='display:none;flex:0 0 auto;background:var(--card-bg);border:1px solid rgba(128,128,128,0.12);border-radius:14px;padding:10px 12px;margin:0 0 10px;box-shadow:var(--shadow);';
      feed.parentElement.insertBefore(card,feed);
      render();
      return card;
    }
    function render(){
      if(!card) return;
      card.innerHTML='<div id="acled-head" style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:12.5px;font-weight:700;color:var(--text-main);">⚔ '+(jp()?'紛争イベント（ACLED）':'Conflict events (ACLED)')+'<span style="margin-left:auto;font-size:10px;color:var(--text-muted);">beta</span><span style="opacity:0.6;font-size:10px;">'+(open?'▾':'▸')+'</span></div>'+
        (open?('<div style="margin-top:8px;">'+
          '<div style="display:flex;gap:6px;margin-bottom:6px;">'+
          '<input id="acled-email" type="email" placeholder="email" value="'+esc(cred.email)+'" style="flex:1;min-width:0;padding:6px 8px;border-radius:8px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);font-size:11.5px;">'+
          '<input id="acled-key" type="password" placeholder="API key" value="'+esc(cred.key)+'" style="flex:1;min-width:0;padding:6px 8px;border-radius:8px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);font-size:11.5px;"></div>'+
          '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">'+
          '<button id="acled-load" class="ai-test-btn" style="flex:1;">'+(jp()?'直近14日間を取得':'Load last 14 days')+'</button>'+
          '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-muted);cursor:pointer;"><input id="acled-pins" type="checkbox" '+(pinsOn?'checked':'')+'>'+(jp()?'ピン':'Pins')+'</label></div>'+
          '<div id="acled-status" style="font-size:10.5px;color:var(--text-muted);margin-bottom:4px;">'+(jp()?'ACLED（武力紛争位置・事件データ）。無料登録のメール+APIキーが必要です。':'Armed Conflict Location & Event Data. Needs the free-registration email + API key.')+'</div>'+
          '<div id="acled-list" style="max-height:230px;overflow-y:auto;"></div></div>'):'');
      card.querySelector('#acled-head').onclick=()=>{ open=!open; render(); };
      if(open){
        const em=card.querySelector('#acled-email'), ky=card.querySelector('#acled-key');
        [em,ky].forEach(i=>i.addEventListener('change',()=>{ cred={email:em.value.trim(),key:ky.value.trim()}; try{ localStorage.setItem(KEY,JSON.stringify(cred)); }catch(_){} }));
        card.querySelector('#acled-load').onclick=()=>{ cred={email:em.value.trim(),key:ky.value.trim()}; try{ localStorage.setItem(KEY,JSON.stringify(cred)); }catch(_){} loadEvents(); };
        card.querySelector('#acled-pins').onchange=(e)=>setPins(e.target.checked);
        if(events.length){ const st=card.querySelector('#acled-status'); st.textContent=(jp()?('直近14日間: '+events.length+'件 · ACLED'):(events.length+' events, last 14 days · ACLED')); }
      }
    }
    function syncVis(){ const c=build(); if(!c) return;
      c.style.display=(typeof currentMode!=='undefined'&&(currentMode==='news'||currentMode==='saved'))?'block':'none'; }
    /* follow the tab switches */
    try{ const orig=renderUI; renderUI=function(){ const r=orig.apply(this,arguments); try{ syncVis(); }catch(_){} return r; }; }catch(_){}
    if(document.readyState!=='loading') setTimeout(syncVis,400); else document.addEventListener('DOMContentLoaded',()=>setTimeout(syncVis,400));
    window.addEventListener('intmap-lang',()=>{ try{ render(); }catch(_){} });
    window.IntMapACLED={load:loadEvents};
  })();

  /* (#R167) moved to js/map-extras.js — see Architecture.md §3.1. */
  window.IntMapModules.layerSearch(IM_HOST);

  /* ===== (#R20) EDUCATION MODE — quizzes + learning cards built on the bundled country data
     ("世界地理…を学べるモード。クイズ、解説カード"). Entry: Layers → Tools → 🎓 Learn. Three quiz
     types: flag→country, capital→country, find-the-country-on-the-map (click; point-in-polygon). ===== */
  /* (#R166) moved to js/analysis-panels.js — see Architecture.md §3.1. */
  window.IntMapModules.edu(IM_HOST);

  /* ===== (#R11) Mobile measuring is CENTER-FIXED: a subtle crosshair marks the map center, a bottom-
     center "Add point" button adds the center coordinate (for measure / area / radius), and a small
     bottom-left readout shows the center's coords + active-layer value. The button also replaces the
     (now-disabled) long-press context menu when no tool is active. On desktop it shows only while a
     measurement tool is active (so right-click still drives the menu). ===== */
  (function(){
    if(!GE().hasRenderer()) return;
    const mob=()=>{ try{ return isMobile(); }catch(_){ return !!(window.matchMedia&&window.matchMedia('(max-width:768px)').matches); } };
    const mc=document.getElementById('map-container')||document.body;
    const st=document.createElement('style'); st.textContent=`
      #m-crosshair{ display:none; position:absolute; top:50%; left:50%; width:28px; height:28px; margin:-14px 0 0 -14px; pointer-events:none; z-index:600; }
      #m-crosshair::before,#m-crosshair::after{ content:''; position:absolute; background:rgba(255,255,255,0.6); box-shadow:0 0 1.5px rgba(0,0,0,0.7); }
      #m-crosshair::before{ left:50%; top:0; width:1.4px; height:100%; margin-left:-0.7px; }
      #m-crosshair::after{ top:50%; left:0; height:1.4px; width:100%; margin-top:-0.7px; }
      #m-addpoint{ display:none; position:absolute; left:50%; bottom:calc(var(--sheet-cover, 80px) + 14px); transform:translateX(-50%); z-index:1200; background:var(--primary-color); color:#fff; border:none; border-radius:999px; padding:11px 22px; font-size:14px; font-weight:700; box-shadow:0 4px 16px rgba(0,0,0,0.32); cursor:pointer; }
      #m-addpoint:active{ transform:translateX(-50%) scale(0.96); }
      /* (#R15c) Mobile readout: ALWAYS one line (was wrapping to two when the layer value was long),
         smaller, and tucked into the very corner. nowrap + ellipsis keeps it compact. */
      /* (#R18) The always-on readout hugs the sheet — only a sliver of a gap ("ボトムシートとの間にわずかに隙間がある程度まで下げて"). */
      @media(max-width:768px){ .coord-readout{ left:6px !important; right:auto !important; bottom:calc(var(--sheet-cover, 80px) + 4px) !important; top:auto !important; font-size:9.5px !important; padding:3px 7px !important; gap:7px !important; max-width:calc(100vw - 12px); flex-wrap:nowrap !important; white-space:nowrap !important; overflow:hidden; text-overflow:ellipsis; border-radius:8px !important; }
        .coord-readout span{ white-space:nowrap; flex-shrink:0; }
        /* (#R16) The crosshair must mark the center of the VISIBLE map space — the area NOT covered by the
           bottom sheet — not the center of the phone screen. Sit it halfway down the uncovered area. */
        #m-crosshair{ top:calc((100% - var(--sheet-cover, var(--peek-h, 196px))) / 2) !important; } }`;
    document.head.appendChild(st);
    const cross=document.createElement('div'); cross.id='m-crosshair'; cross.innerHTML=''; mc.appendChild(cross);
    const btn=document.createElement('button'); btn.id='m-addpoint'; btn.type='button'; mc.appendChild(btn);
    function setLabel(){ btn.textContent=(currentLang==='jp'?'＋ 地点を追加':currentLang==='de'?'＋ Punkt hinzufügen':currentLang==='ru'?'＋ Добавить точку':currentLang==='es'?'＋ Añadir punto':'＋ Add point'); }
    setLabel(); window.addEventListener('intmap-lang',setLabel);
    /* (#R12) The crosshair sits at the GEOMETRIC center of the map (50%/50%). map.getCenter() returns the
       PADDED center (the bottom-sheet/sidebar shift the map padding), so it was offset from the crosshair
       — adding measure points in the wrong place. Unproject the visual center pixel instead so the
       crosshair's center IS the exact point. */
    function centerLL(){ const r=mc.getBoundingClientRect();
      /* (#R16) Match the crosshair: on mobile the target point is the center of the UNCOVERED map area
         (above the sheet), so unproject that exact pixel — keeps Add-point and long-press accurate. */
      let cy=r.height/2;
      if(mob()){ const cs=getComputedStyle(mc); const cover=parseFloat(cs.getPropertyValue('--sheet-cover'))||parseFloat(cs.getPropertyValue('--peek-h'))||0; cy=(r.height-cover)/2; }
      const px=[r.width/2, cy]; const ll=GE().coords.unproject(px); return {lng:ll.lng, lat:ll.lat, px:{x:px[0],y:px[1]}}; }
    window._mCenterLL=centerLL;
    /* (#R13) The +Add point button (and the center crosshair) now appear ONLY while a measurement tool
       is active — the user didn't want a permanent button cluttering the mobile map. When idle, long-press
       drives the context menu instead. */
    /* (#R15 / #1) The crosshair is now ALWAYS visible on mobile (the user wants the center point's
       coords/elevation/layer value shown at all times), while the +Add-point button stays tool-only. */
    /* (#R33) "Add point" pill is MOBILE-ONLY now — on desktop you add points by clicking the map, so the
       pill is redundant ("Don't show 'Add point' pill in desktop mode"). */
    function update(){ const m=mob(); const tool=!!(typeof toolMode!=='undefined' && toolMode); cross.style.display=m?'block':'none'; btn.style.display=(tool&&m)?'block':'none'; }
    /* (#R12) Mobile bottom-left readout = coords + elevation + active-layer value at the crosshair
       center, mirroring desktop. updateCoord() early-returns on mobile, so compute them here directly. */
    function readout(){ if(!mob()) return; try{ const c=centerLL();
      const dem=demElevAt(c.lng,c.lat,()=>{ const d2=demElevAt(c.lng,c.lat); if(d2!=null){ lastElev=elevText(d2); renderCoordReadout(c.lng,c.lat); } });
      if(dem!=null) lastElev=elevText(dem);
      try{ updateLayerReadout(c.lng,c.lat); }catch(_){}
      renderCoordReadout(c.lng,c.lat); }catch(_){} }
    let _roT=0,_updRAF=0,_roRAF=0;
    GE().events.on('moveend',()=>{ readout(); update(); });
    /* (#R25) Smoother pan/zoom ("動きがカクツク"): coalesce the per-move DOM work to ONE frame, and run the
       heavier readout (DEM + queryRenderedFeatures) at most ~every 110ms during motion (the precise final
       value still lands on moveend). The crosshair stays live without sampling on every single move event. */
    GE().events.on('move',()=>{ if(!_updRAF) _updRAF=requestAnimationFrame(()=>{ _updRAF=0; update(); });
      /* (#R37) Mobile pan/zoom smoothness ("抜本的に滑らかに"): during motion render ONLY the cheap coordinate
         text. The heavy crosshair readout — DEM elevation lookup + queryRenderedFeatures for the active-layer
         value — no longer runs every ~110ms mid-gesture (which spiked the main thread when a data layer was on);
         it settles once on moveend below. Pure per-frame-work reduction, zero render-quality change. */
      if(mob()&&!_roRAF){ _roRAF=requestAnimationFrame(()=>{ _roRAF=0; try{ const c=centerLL(); renderCoordReadout(c.lng,c.lat); }catch(_){} }); } });
    window.addEventListener('resize',update);
    btn.onclick=()=>{ try{ const c=centerLL(); if(typeof toolMode!=='undefined' && toolMode){ handleMapClick(c.lng,c.lat,c.px,true); } else { showContextMenu({x:c.px.x,y:c.px.y},{lng:c.lng,lat:c.lat}); } }catch(_){} };
    setTimeout(()=>{ update(); readout(); },400);
    window._mAddPoint=btn; window._mAddPointUpdate=update;
  })();

  /* ===== (#R8c) Click a place LABEL → paint that place's area red + a popup with a copy button.
     Country labels fill the real country polygon (point-in-polygon over countryGeo); city/other labels
     drop a red highlight at the point. Non-destructive: layer-scoped handlers fire only on a label. ===== */
  /* (#R166) moved to js/map-ui.js — see Architecture.md §3.1. */
  window.IntMapModules.labelPopup(IM_HOST);

  /* ===== (#R9/#49) User GeoJSON upload — load any .geojson/.json from the Layers menu OR by dropping
     it on the map. Auto-styles fill/line/point, fits bounds, and each upload is removable. ===== */
  /* (#R166) moved to js/map-ui.js — see Architecture.md §3.1. */
  window.IntMapModules.geojsonUpload(IM_HOST);

  /* ===== (#R40) Comprehensive LIVE weather popup (right-click → "Weather here"). Open-Meteo forecast API
     (free, no key, CORS-enabled) → always-latest current conditions + a 5-day outlook. Self-contained;
     5-language; reuses fmtTemp for the unit setting. CSS is added via cssText with single quotes only (no
     back-tick in a CSS template-literal → no blank-site risk). ===== */
  /* (#R166) moved to js/weather.js — see Architecture.md §3.1. */
  window.IntMapModules.weatherPanel(IM_HOST);

  /* ===== (#R8c) View bookmarks — the live map state (center, zoom, bearing, pitch, projection AND the
     set of active data layers) is mirrored into the URL hash, so the address bar is a shareable permalink
     and a reload restores the exact analysis view. "Copy link to this view" lives in the right-click menu. ===== */
  /* (#R166) moved to js/map-ui.js — see Architecture.md §3.1. */
  window.IntMapModules.viewHash(IM_HOST);

  /* ===== (#R42/#R42b) "Share this view" — a REAL, surfaced share PANEL ("今の状態をそのままURLで共有"). The
     permalink (IntMapBookmark / the address bar) encodes center/zoom/bearing/pitch, projection, satellite base,
     ALL active layers, the time-travel slider AND the compare state; R42b made the address bar itself a complete
     shareable link and restore() now reproduces it on a fresh open OR a same-tab paste (the hashchange fix), so
     "コピーしたリンクを開いてもそのままにならない" is resolved. This panel SURFACES the link with one-tap copy +
     the native share sheet + a list of exactly what travels in the URL. 5-language. CSS via cssText with single
     quotes only (no back-tick in CSS → no blank-site risk). ===== */
  /* (#R166) moved to js/map-ui.js — see Architecture.md §3.1. */
  window.IntMapModules.share(IM_HOST);
  try{ const _sb=document.getElementById('btn-share'); if(_sb) _sb.onclick=()=>{ try{ window.IntMapShare.open(); }catch(_){} }; }catch(_){}

  /* ===== (#R42) "Atlas" — natural-language console (beta) ("自然言語版ターミナル"). Type a request in plain
     language and the AI turns it into a STRICT JSON action plan that this REAL dispatcher executes against the
     live map: toggle any data layer, fly to a place, switch projection/base map, open compare/weather/AI-brief,
     AND run genuine country-data analysis over countryStats — rank top/bottom N by a metric, rank by a ratio, or
     a regression-RESIDUAL "relate" (e.g. "map countries with low HDI relative to GDP per capita" = the most
     negative residual of HDI on log(GDP per-capita)) — highlighting the matched countries on the shared
     `countries` source and listing them. Not a facade: every action maps to existing engine code. 5-language.
     Launch: a small ⌨ toolbar button (beta), the right-click menu, or Ctrl/⌘+K. CSS via single-quoted cssText
     (no back-tick in CSS → no blank-site risk). ===== */
  /* ===== (#R53) Place-label OUTLINE — click any place-name label on the map and its REAL extent is drawn as a
     polygon (user request: "地名ラベルをクリックしたら、その地域の範囲がポリゴンで表示されるように"). Also exposed as
     window.IntMapOutline.show(name, ctx) so Atlas can outline any place. Click-point disambiguation picks the match
     nearest the label (so the "Paris" label near France → France's Paris, not Paris TX). CSS via single-quoted
     cssText (no back-tick → no blank-site risk). 5-language. ===== */
  /* (#R166) moved to js/map-tools.js — see Architecture.md §3.1. */
  window.IntMapModules.outline(IM_HOST);
  /* ===== (#R122) MOVE / TRUE-SIZE — drag any outlined place (country or sub-national/region) to a new location. In
     Mercator, projected size distorts with latitude, so as the shape is dragged its vertices rescale by
     cos(lat0)/cos(latNew) to keep its REAL area constant ("メルカトルでは面積一定になるように") — the classic
     "true size of…" comparison. Painted in its own source so it never disturbs the layer state. ===== */
  /* (#R166) moved to js/map-tools.js — see Architecture.md §3.1. */
  window.IntMapModules.moveShape(IM_HOST);
  /* ===== (#R83) ROAD ROUTING ("Atlasで経路機能を…（Google Map）のような") — real turn-by-turn directions from the
     public OSRM road network (car via router.project-osrm.org; foot/bike via routing.openstreetmap.de). Draws the
     route on the map with start/end pins and returns distance, duration and step-by-step guidance. Separate from
     the existing IntMapRoute (which is a maritime/sea A* route). ===== */
  /* (#R163) moved to js/routing.js — see Architecture.md §3.1. */
  window.IntMapRouting=window.IntMapModules.routing(IM_HOST);
  /* (#R184) the analyses the directions panel runs on a computed route (window.IntMapRoutingOps):
     elevation from the DEM, border crossings from the country polygons, weather/earthquakes/news
     along the way, arrival times, where the alternatives differ, and routing on OSM's record of the
     network as it was in a chosen year. The panel reaches for it by name and simply offers nothing
     if it is absent, so this is an addition to routing rather than a change to it. */
  window.IntMapModules.routingOps(IM_HOST);
  /* ===== (#R86) ISOCHRONE / 到達圏 — "車で30分" "徒歩15分" "自転車1時間" as a real REACHABILITY AREA that follows the
     road network & terrain (not a distance circle). Keyless public Valhalla (FOSSGIS) /isochrone → time-contour GeoJSON
     polygons for drive / walk / cycle. Opened from the right-click menu or Atlas. Store-siting, evacuation, travel, etc. ===== */
  /* (#R166) moved to js/map-tools.js — see Architecture.md §3.1. */
  window.IntMapModules.isochrone(IM_HOST);
  /* ===== (#R83) STREET VIEW ("ストリートビューを使えるように") — an embedded, KEYLESS Google Street View panel
     (the classic maps.google.com output=svembed endpoint, no API key/billing) plus an "open in Google Maps" jump.
     Draggable floating window; used from the map context menu and from Atlas. ===== */
  /* (#R163) moved to js/street-view.js; (#R209) fetched on the context menu's Street View item. */
  /* ===== (#R83) RADIATION DISPERSION — a real Lagrangian particle model ("流体力学にのっとった粒子飛散モデルで、
     風向きや気温、降水も考慮"). Particles are released from a source and advected by a LIVE, space+time-varying
     wind field (Open-Meteo 6×6 grid, hourly, 3-day forecast), spread by turbulent diffusion scaled by atmospheric
     stability (from temperature), scavenged by real precipitation (wet deposition), dry-deposited, and decayed by
     radioactive half-life. Rendered as an animated particle plume + concentration heatmap. Not an operational
     forecast — clearly labelled educational. ===== */
  /* (#R166) moved to js/sims.js — see Architecture.md §3.1. */
  window.IntMapModules.radiation(IM_HOST);
  /* ===== (#R84) 3-D ARC OVERLAY — a screen-space canvas that lifts a ground track off the map by REAL altitude so
     ballistic trajectories read as a dimensional arc (「地図にのっぺりではなく立体的な軌道」), coloured by altitude.
     MapLibre line layers can't be raised off the surface, so this projects each ground point every frame and
     offsets it upward by its altitude — the arc pans/zooms/rotates with the map. ===== */
  /* (#R166) moved to js/map-tools.js — see Architecture.md §3.1. */
  window.IntMapModules.arc3d(IM_HOST);
  /* ===== (#R83) FLIGHT SIMULATOR ("Atlasでフライトシミュレーターを使えるように") — a real, flyable arcade flight
     model over the actual world map: coordinated-turn banking, pitch/throttle, stall, gravity and ground/terrain
     collision, with the MapLibre camera as the cockpit view and a live HUD (airspeed, altitude, heading, VSI,
     throttle, artificial horizon). Keyboard: W/S throttle, ↑/↓ pitch, ←/→ bank, A/D rudder, Esc exit. ===== */
  /* (#R163) moved to js/flight-sim.js; (#R209) 102 kB fetched when a flight is actually started. */
  window.IntMapConsole=window.IntMapModules.atlasConsole(IM_HOST);   /* (#R165) the Atlas kernel (~6,200 lines) moved to js/atlas-console.js — see Architecture.md §3.1 */
  try{ const _ab=document.getElementById('btn-atlas'); if(_ab) _ab.onclick=()=>{ try{ window.IntMapConsole.toggle(); }catch(_){} }; }catch(_){}
  /* (#R42) Ctrl/⌘+K opens Atlas (skip when typing in a field). */
  window.addEventListener('keydown',e=>{ if((e.ctrlKey||e.metaKey)&&(e.key==='k'||e.key==='K')){ const ae=document.activeElement; if(ae&&/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return; e.preventDefault(); try{ window.IntMapConsole.toggle(); }catch(_){} } });

  /* (#R167) moved to js/map-extras.js — see Architecture.md §3.1. */
  window.IntMapModules.runwaySearch(IM_HOST);

  loadSettings();

  /* (#R167) moved to js/onboarding.js — see Architecture.md §3.1. */
  window.IntMapModules.onboarding(IM_HOST);

  /* ===== (#R31) NEW BETA LAYERS — 10 real-data additions (≥10 to β, per request) =====
     Self-contained: each row owns a change handler (no edits to the big toggleLayer switch); rows are
     swept into "Others (beta)" by reorganizeLayerPanel; active-layers + the deterministic toggle pick them
     up automatically. Data: World Bank Open Data (latest value per country, CORS) + USGS earthquakes
     (realtime feed + historical query) + a news-density "Heat of Attention" heatmap. */
  /* (#R164) moved to js/wb-layers.js — see Architecture.md §3.1. */
  window.IntMapModules.wbLayers(IM_HOST);

  /* ===== (#R86/#R87) LIVE CAMERAS — REBUILT REAL, then GREATLY EXPANDED ("coverageが限定的すぎる…20倍にしろ").
     EVERY pin genuinely displays live imagery IN-APP (no link-out facade). Sources, all KEYLESS + CORS-open + direct
     images verified to actually load (list-access AND image-display both tested — a proxy-only list whose image won't
     hotlink was rejected, e.g. NYC): (1) OpenStreetMap webcams via Overpass, worldwide, FILTERED to cams that show
     (direct refreshing image / YouTube-live / Roundshot·Panomax 360° / video); (2) Transport for London JamCams —
     882 cams; (3) Caltrans (California DOT) — ~3,500 cams across 12 districts (direct refreshing JPEG); (4) Fintraffic
     / Digitraffic Finland road-weather cams — 811 stations / 2,272 views (deterministic weathercam.digitraffic.fi
     JPEGs; the popup switches between a station's views); (5) more US state DOTs (Colorado / Indiana / Alaska /
     Arizona = 1,815 cams) via the MIT OpenTrafficCamMap dataset on the jsDelivr CDN, pinned to a commit and host-
     allowlisted to only the feeds whose images verifiably hotlink. Pins colour-coded by network. The popup plays the live image
     AUTO-REFRESHING every few seconds (or a looping clip / embedded stream); a momentarily-offline cam says so
     honestly. Each dense network is fetched ONCE. Keyless, worldwide, ODbL / TfL / Caltrans / Fintraffic.
     (#R96c) MASSIVELY EXPANDED again ("coverageを5倍に"): added the US-state + Canadian-province DOT "511" camera
     platform — ~17,000 more live cameras across 13 regions (FL/GA/NY/PA/NC/NV/WI/ID/LA + New England + ON/AB/YT),
     each list proxied ONCE (/map/mapIcons/Cameras) and every image hotlinking directly (/map/Cctv/{id}). ===== */
  /* (#R164) moved to js/cameras.js — see Architecture.md §3.1. */
  window.IntMapModules.cameras(IM_HOST);

  /* ===== (#R88) UNIVERSAL OBJECT LIST ("汎用オブジェクト一覧") — ONE place to see & manage EVERY user object on the
     map (pins · radius circles · kept drawings/annotations · uploaded GeoJSON · the active route · the reachable-area
     isochrone), instead of six scattered UIs. Per object: fly-to, rename, recolour, hide, delete — done where each
     subsystem supports it. Reads the REAL existing state and calls the REAL existing remove APIs (fully additive — no
     subsystem is refactored). A small count-badge button appears bottom-left whenever ≥1 object exists. ===== */
  /* (#R166) moved to js/map-tools.js — see Architecture.md §3.1. */
  window.IntMapModules.objectList(IM_HOST);

  /* (#R167) moved to js/onboarding.js — see Architecture.md §3.1. */
  window.IntMapModules.progressCtl(IM_HOST);

  /* ===== (#R118) PRECISE POPULATION INSIDE A DRAWN AREA ("囲んだ範囲の人口を超正確に算出") =====
     Real gridded-census data, not a country-share guess: the WorldPop Global Project population raster
     (~100 m grid, 2020) summed over the exact polygon by the WorldPop stats API (api.worldpop.org, CORS-open,
     async task polling). Rings are decimated to ≤80 vertices for the GET URL; results are cached per shape. */
  /* ==================== (#R141) AREA MONITORS — saved area watches + evidence-backed change reports ====================
     Additive & self-contained. Lives inside the main app scope so it can read currentLang / map / radiusItems /
     currentUser / requireLogin / DrawTool / IntMapRegionResolver / IntMapOutline. Data + auth via window.sb (RLS
     scopes every read to the owner). The server-side runner is the monitor-run Edge Function; this module only
     CREATES/EDITS monitors and DISPLAYS runs/evidence/reports — it never fabricates a run or a report. */
  (function(){
    const I18=(o)=>{ try{ Object.assign(i18n.en,o.en); Object.assign(i18n.jp,o.jp); Object.assign(i18n.de,o.de); Object.assign(i18n.ru,o.ru); Object.assign(i18n.es,o.es); }catch(_){} };
    I18({
      en:{ tabMonitors:'Monitors' }, jp:{ tabMonitors:'モニター' }, de:{ tabMonitors:'Monitore' }, ru:{ tabMonitors:'Мониторы' }, es:{ tabMonitors:'Monitores' }
    });
  })();
  /* (#R162) moved to js/monitors.js — see Architecture.md §3.1.
     (#R163) its private host object became the shared IM_HOST, which is a superset of the ten values
     this module reads (lang/user/mode/radiusItems live, plus the six helpers). */
  window.IntMapMonitors=window.IntMapModules.monitors(IM_HOST);

  /* (#R166) moved to js/sims.js — see Architecture.md §3.1. */
  window.IntMapModules.popArea(IM_HOST);

  /* (#R167) moved to js/map-extras.js — see Architecture.md §3.1. */
  window.IntMapModules.terrain(IM_HOST);

  /* ===== (#R89) SLOPE / ASPECT ANALYSIS ("傾斜・方角解析") — colour-codes terrain steepness (slope angle) or the
     direction each slope faces (aspect), computed from the real DEM over the current view. Disaster / hiking /
     construction / military use. Keyless (terrarium DEM). Recomputes on pan/zoom. ===== */
  /* (#R166) moved to js/sims.js — see Architecture.md §3.1. */
  window.IntMapModules.slope(IM_HOST);

  /* ===== (#R89) RF / RADIO COVERAGE ("電波・通信圏") — from an antenna (position, height, power, frequency),
     draw the terrain-aware line-of-sight service area: 360 rays marched over the real DEM, each stopped at the
     first ridge that breaks line of sight, capped by the radio horizon (4/3-earth) and the free-space-path-loss
     range from the link budget. Keyless (terrarium DEM). Real viewshed, not a distance circle. ===== */
  /* (#R166) moved to js/sims.js — see Architecture.md §3.1. */
  window.IntMapModules.rf(IM_HOST);

  /* ===== (#R90) SUN & SHADOW ("日照・影") — pick a date+time and see the sun's position, the day's sun-path times,
     and REAL cast shadows: OSM buildings in view are projected along the sun vector (length = height / tan(altitude))
     into ground-shadow polygons, and maplibre's 3D light is aimed from the sun so extrusions self-shade. Astronomy
     is the standard SunCalc solar-position algorithm. Keyless. ===== */
  /* (#R166) moved to js/sims.js — see Architecture.md §3.1. */
  window.IntMapModules.sun(IM_HOST);

  /* ===== (#R91) TRANSIT ISOCHRONE — REACHABLE BY RAIL ("鉄道で1時間以内") — the area you can reach from a point
     within a time budget riding the REAL OSM rail network: fetch rail ways + stations (Overpass), build a welded
     graph, Dijkstra from the nearest station (edge time = length / class speed), then every station reached within
     budget is plotted (coloured by minutes) and a reachable-area hull (stations buffered by the leftover walk time)
     is drawn. Complements the drive/walk/cycle Valhalla isochrone. Keyless. ===== */
  /* (#R166) moved to js/sims.js — see Architecture.md §3.1. */
  window.IntMapModules.transitReach(IM_HOST);

  /* ===== (#R92) UNIFIED DISASTER SIMULATOR ("災害シミュレーター") — one framework, one panel, one time slider for
     FLOOD & TSUNAMI (connected DEM flood-fill / inundation from real elevation), ASHFALL & SMOKE (wind-advected
     downwind plume on live Open-Meteo wind), and RADIOACTIVE fallout (delegates to the existing Lagrangian
     IntMapRadiation). Pick a hazard + origin + conditions; the slider steps the impact area through time. Keyless.
     EDUCATIONAL approximation — in a real emergency follow official authorities. ===== */
  /* (#R166) moved to js/sims.js — see Architecture.md §3.1. */
  window.IntMapModules.disaster(IM_HOST);

  /* ===== (#R93) EARTH REPLAY — "世界を巻き戻す" — a master clock that reconstructs the world at a chosen moment by
     driving EVERY dated layer from one time axis: a real day/night terminator computed for the datetime (works for
     ANY date), plus — for dates within the archives' reach — the time-travel of news / satellite imagery / quakes
     (existing timeTravel engine) and any dated raster layers (temp/precip/SST/… via refreshDatedLayer). Not a
     separate history map — it puts the existing dated features onto one shared globe clock. ▶ plays time forward. ===== */
  /* (#R166) moved to js/sims.js — see Architecture.md §3.1. */
  window.IntMapModules.earthReplay(IM_HOST);

  /* (#R167) moved to js/map-extras.js — see Architecture.md §3.1. */
  window.IntMapModules.railSeaOverlays(IM_HOST);

  /* ===== (#R41) Time-zone layer — REAL boundaries (Natural Earth ne_10m_time_zones, loaded on demand from
     jsDelivr, CORS-OK) PLUS the CURRENT local time labelled on every zone, refreshed each minute
     ("タイムゾーンの境界…現在の時間もそれぞれのタイムゾーン上に表示"). Key-free; only fetched when toggled. Layer
     ids are `tzl-*` so they don't collide with the generic dl- orphan sweep (id `tz`). ===== */
  window.IntMapModules.timeZones(IM_HOST);   /* (#R166) moved to js/layer-packs.js — see Architecture.md §3.1. */

  /* (#R38) "レイヤーを大幅増強して" — EIGHT additional REAL NASA GIBS science rasters. Every tile endpoint was
     curl-verified (HTTP 200 / image/*) before wiring (wrong GIBS layer ids serve blank tiles). Self-contained +
     additive: rows are filed into their categories by reorganizeLayerPanel (ids added to GROUPS), labels are
     full EN/JP/DE/RU from the start, each registers the shared opacity legend + a one-line source note. Daily
     layers request the freshest reliably-processed GIBS day (−2 d); Blue Marble is a static composite. Built via
     DOM APIs (no innerHTML/template literals → no CSS-back-tick risk). */
  window.IntMapModules.gibsScience(IM_HOST);   /* (#R166) moved to js/layer-packs.js — see Architecture.md §3.1. */
  window.IntMapModules.worldPacks(IM_HOST);    /* (#R211) trade / energy mix / warnings / tides / crops — js/world-packs.js */
  window.IntMapModules.industryWeb(IM_HOST); window.IntMapModules.oceanCurrents(IM_HOST);   /* (#R213/#R216) the industry ownership web (js/industry-web.js) and the ocean currents (js/ocean-currents.js). BOTH after worldPacks: they borrow that module's panel/row toolkit. */

  /* ===== (#R94f) MAP BORDERS FOLLOW THE CLOCK — travel to a past year and the map's OWN borders (and the
     country names) become that era's, drawn crisp exactly like the modern ones — NOT the optional "Historical
     borders" overlay. Historical polygons come from aourednik/historical-basemaps (the nearest snapshot at or
     before the year; the repo jumps 1960→1994, so 1960 covers the late-Cold-War world incl. the USSR). The
     modern boundary line + country labels are hidden while a past year is shown and restored at "Now". ===== */
  /* (#R163) moved to js/time-borders.js — see Architecture.md §3.1. */
  window.IntMapTimeBorders=window.IntMapModules.timeBorders(IM_HOST);

  /* ===== Init ===== */
  /* (#R21) Mobile-start smoothness: the gazetteer index + the 420-zone timezone list build in an
     idle slice on phones (both are re-built on demand anyway — search warms the index, opening
     Settings repopulates the list). Desktop keeps the synchronous boot. */
  (function(){ const heavy=()=>{ try{ rebuildGeoIndex(); }catch(_){} try{ populateTimezones(); }catch(_){} };
    if(typeof isMobile==='function'&&isMobile()&&window.requestIdleCallback) requestIdleCallback(heavy,{timeout:3500}); else heavy(); })();
  updateI18n(); fetchData(); setInterval(fetchData,180000); bootSupabase();
  /* (#R17) Warm the country gazetteer shortly AFTER first paint (idle, non-blocking) so place search has
     strong LOCAL matches (countries/capitals/major places) even if the online geocoders are slow/blocked —
     the search then practically never comes back empty, without delaying initial load. */
  /* ══ (#R193) …AND 4 s IS NOT LATE ENOUGH EITHER ═══════════════════════════════════════════════════
     「起動時の読み込みをもっと早く。」 Measured on a cold load: the Natural Earth 10 m country file is
     4.3 MB and started at 2,846 ms — while the first satellite tiles and the Köppen raster were still
     arriving, so it competed for the connection with everything the user can actually see. Nothing on
     screen waits for it: it warms the LOCAL gazetteer, and every real consumer (the Countries tab, the
     search box on focus, Atlas) calls loadCountryData() itself and awaits the same latched promise.
     Same treatment #R192 gave data/cshapes.js, for the same reason and with the same guarantees: still
     eager, but behind the map's own first idle and the browser's idle callback, with a ceiling so a
     permanently busy page still gets it, and not at all on Data Saver or 2G. */
  (function(){ const warm=()=>{ try{ if(typeof loadCountryData==='function') loadCountryData(); }catch(_){} };
    const go=()=>{ try{ const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
        if(c&&(c.saveData===true||/(^|-)2g$/.test(c.effectiveType||''))) return; }catch(_){}
      if('requestIdleCallback' in window) requestIdleCallback(warm,{timeout:7000}); else setTimeout(warm,4000); };
    let started=false; const once=()=>{ if(started) return; started=true; go(); };
    try{ GE().events.once('idle',()=>setTimeout(once,300)); }catch(_){}
    setTimeout(once,5000); })();
  try{ initMobileUI(); }catch(e){ console.warn('initMobileUI failed:',e); }
  /* (#R104) Start / welcome page REMOVED per request ("スタートページはいらない") — the auto-shown first-run
     card no longer appears. The builder (`_imWelcome`) is KEPT so nothing is deleted (still reachable if ever
     wired to a menu), it is simply never auto-invoked on load. */
  /* try{ setTimeout(_imWelcome,900); }catch(_){} */
  try{ ['en','jp','de','ru','es'].forEach(L=>{ const b=document.getElementById('lang-'+L); if(b) b.classList.toggle('active',currentLang===L); }); }catch(_){}   /* (#R37) sync the active language pill for all four languages on boot */
};
  /* (#R180) …and the other half of the barrier. `then(boot, boot)` on purpose: a
     Cesium that fails to load must still give the user the app — on MapLibre,
     which is still the installed adapter because js/cesium-engine.js only calls
     IntMapGeoEngine.use() after the widget is actually up. */
  let _p=null; try{ _p=window.IntMapEnginePending; }catch(_){}
  if(_p&&typeof _p.then==='function') _p.then(_imAppBoot,_imAppBoot); else _imAppBoot();
});
