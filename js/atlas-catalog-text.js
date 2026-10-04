/* ============================================================================
 *  IntMap · ATLAS — what each capability IS, in the planner's own words  (#R318, atlas-capability-single-source)
 * ----------------------------------------------------------------------------
 *  This is the action catalogue that lived inside `function SYS()` in js/atlas-console.js until
 *  #R318 — 58 kB of hand-tuned prompt text, moved out VERBATIM, not rewritten, each block tagged with
 *  WHICH CAPABILITIES IT DOCUMENTS. `text(ids)` returns the blocks for a SET of capabilities,
 *  `text(null)` returns all of them in their order — the whole prompt — and the audit can ask the
 *  opposite question: is there a capability no block documents?
 *
 *  ⚠⚠ (atlas-capability-single-source) THE PROSE IS DECLARED WITH ITS CAPABILITY NOW, AND A BLOCK IS
 *  ASSEMBLED, NOT WRITTEN. A block used to be one source line here holding its `ids` and its whole
 *  text, so two PRs that each added a capability to the same block (TOOLS/PANELS documents thirty-four)
 *  rewrote the SAME LINE and had to be merged by hand. Now:
 *    · each capability's own words are the `doc` of its entry in js/atlas-cap-<namespace>.js —
 *      `{ in: <chunk>, at: <position>, text }` — beside its row, its schema and its run;
 *    · this file keeps only the ORDER of the blocks («chunks»), each chunk's heading (the words before
 *      the first capability it documents, which are about all of them) and the history of why it is there;
 *    · a block is its heading followed by the fragments that name it, in `at` order
 *      (js/atlas-caps.js catalogueBlocks()). Adding a capability to a block touches its own entry only.
 *  The split was made at each capability's `{"type":"<spelling>"` opening — the same seam the search
 *  credits evidence by (js/atlas-capabilities.js docBlocks()) — and the assembled text is the old text
 *  byte for byte (dev-notes/2026-10-02-atlas-capability-single-source.md has the comparison).
 *  An entry documented by a chunk's heading alone says so with `{ in: <chunk> }` and no text.
 *
 *  ⚠ WHY IT IS NOT IN js/atlas-capabilities.js. That file is in the BOOT bundle: IntMapOS.execute()
 *  and the UI need the descriptors before Atlas exists. This file is imported by
 *  js/atlas-console.js, which #R224 made load-on-demand precisely because it is large. Prose only
 *  the planner reads has no business on the boot path — and the entries that carry it are on the
 *  same on-demand path (js/atlas-caps-modules.js).
 *
 *  ⚠ DO NOT PARAPHRASE A FRAGMENT. Each one is the result of a long line of rounds correcting a
 *  specific misreading (#R115's radius-for-isochrone, #R157's highlight schema, #R278's six
 *  invisible features). "Tidying" one is how the correction gets lost. Change one only to fix
 *  what it says about the app, and say which round and which report in the change.
 * ==========================================================================*/
import { TOURS } from './tours.js';   /* (classroom-tours) the tours are LISTED from their declaration too */
import { SHOWCASE } from './showcase.js';   /* (landing-showcase) the example maps are LISTED from their declaration, never typed here — a typed list misses the next example */
import { CAPABILITY_MODULES } from './atlas-caps-modules.js';
import { catalogueBlocks, capabilityEntries } from './atlas-caps.js';

/* ══ THE CHUNKS, IN THE ORDER THE PLANNER READS THEM ════════════════════════════════════════════
   { name, head? } — `name` is what an entry's `doc` names in `in`; a chunk that documents one
   capability is named by that capability's id. `head` is a string, or a function of the same `c`
   a fragment's text receives (see makeAtlasCatalogText). The comments are the blocks' own history
   and their old numbers (other files still say «block 37»). */
export const CATALOGUE_CHUNKS = [
      /* 00 */
      { name: 'navigation-view', head: 'NAVIGATION/VIEW: ' },
      /* 01 */
      { name: 'layers', head: 'LAYERS: ' },
      /* 02 */
      { name: 'country-statistics', head: 'DATA ANALYSIS over country statistics (paints the map): ' },
      /* 02a */
      { name: 'data.query' },
      /* 02b */
      { name: 'spatial-analysis', head: 'SPATIAL ANALYSIS — RUN A GIS STEP AND GET A NEW DATASET BACK: ' },
      /* 02b-coverage ⚠⚠⚠ (#R760) THE BLOCK WHOSE ABSENCE WAS MEASURED IN MINUTES. It sits beside the
         spatial family above because it answers a question about SHAPES, and it says what it CANNOT do
         as loudly as what it can: production, 2026-09-16, with nothing here on the subject —
         「日本の47都道府県を人口順に色分けして」 spent EIGHT MINUTES and shaded nothing (there is no such
         indicator to shade by, and no reply ever said so), and 「東京から500kmの円が覆う都道府県」 spent
         4 min 42 s without producing the list (the capability was there and undescribed).
         A capability nobody described does not exist for the planner, and a LIMIT nobody described is
         a limit the planner discovers by spending a turn against it ([[intmap-catalogue-silence-is-a-denial]]). */
      { name: 'data.coverage' },
      /* 02c ⚠⚠⚠ (#R754) THE BLOCK WHOSE ABSENCE WAS THE DEFECT. Before this round the only thing this
         catalogue said about pandemics was one clause of block 06 — «open a Playground game» — so a model
         asked to simulate one from Lagos answered, correctly given what it had been told, that IntMap has
         no transmission simulator. It has had a seeded SEIR metapopulation engine since #R575. The planner
         cannot use a capability nobody described to it ([[intmap-prompt-that-hid-the-tools-in-hand]]).
         ⚠ THE VOCABULARY BELOW IS INLINE BECAUSE THE PLANNER MUST SEE IT, AND IT IS VERIFIED: the preset
         names and the parameter keys are asserted equal to js/pandemic-model.js's PANDEMIC_PRESETS and
         PANDEMIC_PARAMS by tests/atlas-pandemic-checks.test.mjs (#R754). A list written here and checked nowhere is the
         one that goes stale the first time a preset is added (.agents/rules/no-ad-hoc-hardcoding.md §2.4). */
      { name: 'pandemic', head: 'PANDEMIC SIMULATION — IntMap HAS an epidemiological transmission simulator (a seeded SEIR metapopulation model over ~180 countries, weighted by flight routes, land borders and travel volumes). NEVER answer that it does not. TO RUN ONE: ' },
      /* 03 */
      { name: 'country', head: 'COUNTRY: ' },
      /* 04 */
      { name: 'tools-panels', head: 'TOOLS/PANELS: ' },
      /* (world-at-time) */
      { name: 'time.coverage' },
      /* (time-compare-lapse) */
      { name: 'time-compare', head: 'TWO INSTANTS SIDE BY SIDE, AND THE CLOCK PLAYED FORWARD. ' },
      /* 05 */
      { name: 'layers.satellites' },
      /* 06 */
      { name: 'more-features', head: 'MORE FEATURES (first-class, use these instead of "control"): ' },
      /* 07 */
      { name: 'research.analyze' },
      /* 08 */
      { name: 'data.satelliteCompare' },
      /* 09 */
      { name: 'data.layerValues' },
      /* 10 */
      { name: 'data.populationIn' },
      /* 11 */
      { name: 'map.object' },
      /* 12 */
      { name: 'facilities', head: 'FACILITY / POI MAPPING: ' },
      /* 13 */
      { name: 'research.mapReport' },
      /* 14 */
      { name: 'research.situationMap' },
      /* 15 */
      { name: 'animated-flight', head: 'ANIMATED FLIGHT: ' },
      /* 16 */
      { name: 'ballistic', head: 'BALLISTIC MISSILE SIMULATION (real physics — use THIS for any ballistic/ICBM/弾道ミサイル request, NOT "fly"): ' },
      /* 17 */
      { name: 'elevation-highlight', head: 'ELEVATION HIGHLIGHT (real DEM data): ' },
      { name: 'layers.baseDisplay' },
      /* 18 */
      { name: 'historical-alliances', head: 'HISTORICAL ALLIANCE / POWER MAP (whole-world faction coloring ONLY): ' },
      /* 19 */
      { name: 'terrain-water', head: 'TERRAIN EDITING & WATER ROUTING: ' },
      /* 20 */
      { name: 'sim.earthquake' },
      /* 21 */
      { name: 'sim.space' },
      /* 22 */
      { name: 'sim.tsunami' },
      /* 23 */
      { name: 'night-sky', head: 'NIGHT SKY FROM A POINT: ' },
      /* 24 */
      { name: 'sunlight', head: 'SUNLIGHT HOURS & TERRAIN SHADE: ' },
      /* 25 */
      { name: 'radiation-dispersion', head: 'RADIATION DISPERSION & FALLOUT SIMULATION: ' },
      /* 26 */
      { name: 'sim.flightSim' },
      /* 27 */
      { name: 'free-drawing', head: 'FREE DRAWING (for advanced composite tasks): ' },
      /* 28 */
      { name: 'events', head: 'EVENTS (news grouped into real-world occurrences, vision "記事ではなく出来事"): ' },
      /* 28b (#R386) THE EVENT CATEGORY FILTER — the News list and the map pins at once. */
      { name: 'news.category' },
      /* 29 */
      { name: 'map.scoreMap' },
      /* 30 */
      { name: 'data.exploreRelated' },
      /* 31 */
      { name: 'research.impact' },
      /* (atlas-os) THE READER'S INVESTIGATION NOTEBOOK — what they asked before, kept beyond the session (js/atlas-notebook.js).
         Placed beside the research blocks because it is how an earlier investigation is picked up again. */
      { name: 'notebook', head: 'INVESTIGATION NOTEBOOK (調査ノート — earlier questions, answers, maps and query rows, kept across sessions): ' },
      /* 32 */
      { name: 'ui.inlineControls' },
      /* 33 */
      { name: 'settings', head: 'SETTINGS: ' },
      /* 34 */
      { name: 'answer', head: 'ANSWER: ' },
      /* 35 */
      { name: 'system.control' },
      /* 36 */
      { name: 'system.module' },
      /* 38 */
      { name: 'navigation', head: 'TURN-BY-TURN NAVIGATION (the LIVE half of routing \u2014 «directions» PLANS a route, these DRIVE it): ' },
      /* 37 */
      { name: 'metric-keys', head: (c) => 'Valid metric KEY values ONLY: ' + c.metricList() + '. Pass the KEY, not the human label — but a label IntMap itself prints ("Life expectancy", 「平均寿命」) is accepted and resolved, and a key IntMap does not have is REFUSED with the whole valid list in the refusal, so read that list instead of trying another spelling. If a needed metric is not in it, do NOT invent one — explain in "say" and omit that action. Default n=15.\n' },
      /* 39 (#R395) */
      { name: 'volcanoes', head: 'VOLCANOES (the Smithsonian GVP catalog this map carries — the Holocene volcanoes plus the ones an observatory publishes a current level for — with the eruption record and the live status ladder): ' },
      /* 43 (#R567) */
      { name: 'world-heritage', head: 'WORLD HERITAGE (the whole UNESCO List this map carries — 1,273 inscribed properties drawn as their 6,009 component parts, with the category, the year of inscription, the criteria, and whether the property is on the List in Danger today): ' },
      /* 44 (#R585) */
      { name: 'measured-radiation', head: 'MEASURED RADIATION — what instruments in the ground are ACTUALLY reading, from the national monitoring networks that publish under an open licence: ' },
      /* 40 (#R491) */
      { name: 'reader.gloss' },
      /* 42 (#R511) */
      { name: 'map.compose' },
      /* 43 (#R527) */
      { name: 'photo.locate' },
      /* 44 (#R543) */
      { name: 'chart.compose' },
      /* 45 (#R546) */
      { name: 'map.shakemap' },
      /* 46 (#R650) */
      { name: 'map.outbreaks' },
      /* 47 (#R773, #R790) */
      { name: 'attach.recall' },
      /* 48 (atlas-observer-undo) */
      { name: 'map.undo' },
      /* 41 (#R493) */
      { name: 'view.inspect' },
      /* 49 (landing-showcase) */
      { name: 'about-and-showcase', head: 'ABOUT INTMAP AND THE EXAMPLE MAPS: ' },
      /* 50 (classroom-tours) */
      { name: 'panel.tour' },
      /* 51 (learn-quests) */
      { name: 'learn.quest' },
];

export function makeAtlasCatalogText(HOST, CTX) {
  return (function () {
    var moduleCatalog = (CTX && CTX.moduleCatalog) || function () { return ''; };
    var langLine = (CTX && CTX.langLine) || function () { return 'English'; };
    /* ⚠⚠⚠ (#R740) THE METRIC KEYS ARE COUNTED, NOT TYPED. Block 37 used to carry a hand-written
       list — "pop, density, area, gdp, gdppc, hdi, dem, milSpend, milSpendGDP, tfr" — and the
       implementation had two more (`lifeExp`, `internet`, in `XMET`). So the prompt told the
       planner the map could not shade by life expectancy, block 02 told it the same keys "+ lifeExp,
       internet", and the Countries tab showed a column headed 「Life expectancy」. Measured on
       production: 「世界を平均寿命で色分けして」 spent 18 steps and 41.9 s and drew nothing.
       A list that is written down is a list that drifts; this one is `Object.keys` of the records. */
    var metricList = (CTX && CTX.metricList) || function () { return ''; };
    /* the entries the blocks are assembled from — the app's own, unless a check hands it a fixture */
    var modules = (CTX && CTX.modules) || CAPABILITY_MODULES;

    /* ⚠ FOUR TEXTS INTERPOLATE A RUNTIME VALUE, AND THAT IS WHY A TEXT MAY BE A FUNCTION.
       The ANSWER fragment names the reply language (#R155's lock), the MODULE fragment names the
       modules that exist right now, the metric chunk the metric keys and the showcase fragment the
       example maps. Each is `(c) => '…' + c.lang + '…'`, and `c` below is all they read. The blocks are
       rebuilt only when the language changes — a session changes language approximately never. */
    /* (landing-showcase) «id — English title» for every example in js/showcase.js (title is an LA(en, jp) tuple) */
    function showcaseList() { return SHOWCASE.map(function (x) { return x.id + ' — ' + x.title[0]; }).join('; '); }
    /* (classroom-tours) «id — English title (n steps)» for every tour in js/tours.js */
    function tourList() { return TOURS.map(function (x) { return x.id + ' — ' + x.title[0] + ' (' + x.steps.length + ' steps)'; }).join('; '); }
    var _cacheLang = null, _cache = null;
    function blocks() {
      var lang = langLine();
      if (_cache && _cacheLang === lang) return _cache;
      _cache = catalogueBlocks(modules, CATALOGUE_CHUNKS, { lang: lang, moduleCatalog: moduleCatalog, metricList: metricList, showcaseList: showcaseList, tourList: tourList });
      _cacheLang = lang;
      return _cache;
    }

    var API = {};
    /* ══ ⚠⚠⚠ (#732) THE PHRASES A READER USES FOR A CAPABILITY, WHERE THE PRODUCT ALREADY HOLDS THEM ══════
       MEASURED (R802 §10, production 2026-09-18): 「現在地」 did not reach `view.locate`. The registry row's
       spellings are `myLocation, whereAmI` — English identifiers, by design (a Japanese word there is a
       translation tuple, #R347) — so «my location» scored 100 and 「現在地」 scored 3. The search is handed
       the product's own vocabulary for the act instead of a translation of it: an entry's `phrases()`
       (js/atlas-cap-view.js `view.locate` reads js/atlas-geo-resolve.js's 「現在地」 table, all nine
       languages). js/atlas-capabilities.js scores a phrase exactly as it scores the row's own spellings. */
    var _phrases = null;
    API.phrases = function (id) {
      if (!_phrases) {
        _phrases = Object.create(null);
        try { capabilityEntries(modules).forEach(function (e) { if (typeof e.phrases === 'function') _phrases[e.id] = e.phrases; }); } catch (_) { }
      }
      var f = _phrases[id]; try { return f ? f().slice() : []; } catch (_) { return []; }
    };
    API.blocks = function () { return blocks().map(function (b) { return { name: b.name, ids: b.ids.slice(), bytes: b.t.length }; }); };
    API.count = function () { return blocks().length; };
    API.idsCovered = function () {
      var s = Object.create(null);
      blocks().forEach(function (b) { b.ids.forEach(function (i) { s[i] = 1; }); });
      return Object.keys(s).sort();
    };
    /* text(ids) — null/undefined means EVERY block, in order: the #R311 prompt, unchanged.
       An id set returns only the blocks that document one of them, still in order, so the
       planner never sees the catalogue in a different shape depending on what was asked. */
    API.text = function (ids) {
      if (!ids) return blocks().map(function (b) { return b.t; }).join('');
      var want = Object.create(null);
      (Array.isArray(ids) ? ids : [ids]).forEach(function (i) { want[i] = 1; });
      return blocks().filter(function (b) { return b.ids.some(function (i) { return want[i]; }); })
        .map(function (b) { return b.t; }).join('');
    };
    /* summaryFor(id) — the first sentence of the block that documents this capability. Used for the
       registry's `description` and for the audit's report; never sent to the model on its own. */
    API.summaryFor = function (id) {
      var B = blocks();
      for (var i = 0; i < B.length; i++) {
        if (B[i].ids.indexOf(id) < 0) continue;
        var t = B[i].t;
        var cut = t.indexOf(': ');
        return (cut > 0 && cut < 80 ? t.slice(0, cut) : t.slice(0, 80)).trim();
      }
      return '';
    };
    API.bytes = function (ids) { return API.text(ids).length; };
    return API;
  })();
}
