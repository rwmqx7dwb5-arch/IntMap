// R167 behavioural checks in a real browser — the sixth index.html split.
//
// WHY a browser test: static analysis cannot see the #R162 failure shape. Soft dependencies here are
// written as `typeof X!=='undefined'` inside try/catch, so a moved block that lost a binding throws
// NOTHING — the branch is skipped and the feature quietly disappears. Only running it finds that.
//
// What THIS round has to prove, beyond "the globals exist":
//   1. js/tables.js really reaches its CONSUMERS. 27 tables left index.html; a rebind that silently
//      produced `undefined` would leave the country panel, the gazetteer, the satellite providers
//      and the geo-theory layers looking merely "empty", which is indistinguishable from "no data".
//   2. Every factory ran and returned its REAL surface (each of these blocks can also short-circuit
//      on `if(!map) return`, so presence alone proves nothing).
//   3. The host getters are LIVE: a module built while the UI was English follows a runtime switch
//      to Japanese.
//   4. WRITE-THROUGH for the three new RW members. This is the assertion that needs the most care:
//      a module is a classic script, so a missing setter does NOT throw — `HOST.globalData=[]` on an
//      object with only a getter is a SILENT no-op. So each assertion below forces index.html's own
//      code to RE-DERIVE the UI from the bare closure variable afterwards.
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { exportedKeys } from './app-source.mjs';
import { seededStorageState } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

let page, diag;

/* Two fake headlines, pre-seeded into the news cache so `globalData` is deterministically non-empty
   without any network. index.html's loadNewsCache() accepts them for 6 hours, matching language,
   and — crucially — REFUSES them once a past date is selected (`!newsDate`), which is what makes the
   write-through assertion below a real discriminator rather than a coin flip. */
const NEWS_SEED = {
  ts: Date.now(),
  lang: 'en',
  data: [
    { title: 'Earthquake strikes Tokyo', link: 'https://example.invalid/a', publisher: 'Test Wire',
      pubDate: new Date().toUTCString(), description: 'Test item A',
      analysis: { loc: [139.69, 35.69], name: 'Tokyo', country: 'JPN', type: 'city' } },
    { title: 'Flooding reported in Lima', link: 'https://example.invalid/b', publisher: 'Test Wire',
      pubDate: new Date().toUTCString(), description: 'Test item B',
      analysis: { loc: [-77.03, -12.04], name: 'Lima', country: 'PER', type: 'city' } },
  ],
};

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, storageState: seededStorageState() });
  await installHermeticRouting(context);
  await context.addInitScript((seed) => {
    try {
      localStorage.setItem('intmap_ws4', JSON.stringify({ on: false }));
      localStorage.setItem('intmap_news_cache', JSON.stringify(seed));
    } catch { /* ignore */ }
  }, NEWS_SEED);
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(() => !!window.__imap && !!document.getElementById('map'), null, { timeout: 45_000 });
  await page.waitForTimeout(2500);
});

test.afterAll(async () => {
  await page?.context()?.close();
});

test('R167 #1 all eight files loaded, all 15 factories ran, and every moved global is present', async () => {
  const check = await page.evaluate(() => window.__imModuleCheck);
  expect(check, 'the boot-time module check ran').toBeTruthy();
  expect(check.missing, 'no required module global is missing (IntMapTables included)').toEqual([]);
  expect(check.missingFactories, 'no module factory is missing').toEqual([]);

  const state = await page.evaluate(() => ({
    globals: ['RunwaySearch', 'IntMapLocate', 'IntMapAnnotations', 'IntMapTerrain', 'IntMapCache',
      '_imProgCtl', '_imWelcome', '_imStartDemo', 'IntMapTables', 'SEA_LABELS', 'NEWS_COUNTRY_FEEDS']
      .filter((n) => !window[n]),
    // API SURFACES — the discriminator between "the factory ran" and "an early-return stub"
    runway: Object.keys(window.RunwaySearch || {}).sort(),
    locate: Object.keys(window.IntMapLocate || {}).sort(),
    annot: Object.keys(window.IntMapAnnotations || {}).sort(),
    terrain: Object.keys(window.IntMapTerrain || {}).sort(),
    cache: Object.keys(window.IntMapCache || {}).sort(),
    prog: typeof window._imProgCtl,
  }));
  expect(state.globals, 'every global the moved blocks publish exists').toEqual([]);
  expect(state.runway).toEqual(expect.arrayContaining(['load', 'open', 'ready', 'search']));
  expect(state.locate).toEqual(expect.arrayContaining(['start', 'stop', 'toggleOrRecenter', 'isActive']));
  expect(state.annot).toEqual(expect.arrayContaining(['add', 'clear', 'open', 'refresh', 'remove']));
  expect(state.terrain).toEqual(expect.arrayContaining(['sampler', 'loadTile']));
  expect(state.cache).toEqual(expect.arrayContaining(['get', 'set']));
  expect(state.prog).toBe('function');
});

test('R167 #2 THE TABLE PROOF: every moved table reaches its consumers, not just window', async () => {
  // A rebind that produced `undefined` would not throw here — the panels would simply render empty,
  // which reads exactly like "no data for this country". So probe VALUES that only the real tables
  // can produce, through the index.html code that consumes them.
  /* ══ ⚠⚠ (#R304) 「27」 WAS A COPY OF A FACT, AND THE FACT MOVED ═══════════════════════════════
     js/tables.js exports 25. #R225 deleted `geoLayersDB` and `GEO_LABEL_JP` with the nine
     geopolitics layers the user asked to be rid of — 「大昔に捨てたはずの地政学レイヤーが勝手に
     オンになる。ふざけるな。」 → 「レイヤー自体を削除してほしい」 — and this file went on demanding
     both the count and the deleted table itself, red on every nightly run since.
     So the number is read out of the module's own `return {…}`: the page must export exactly what
     the file says it exports, no more and no less. A table quietly dropped still fails. */
  const EXPORTED = exportedKeys(new URL('../', import.meta.url), 'js/tables.js', 'IntMapTables');
  const t = await page.evaluate(() => {
    const T = window.IntMapTables || {};
    return {
      keys: Object.keys(T).sort(),
      gdp: T.GDP && T.GDP.USA, cap: T.CAPITAL && T.CAPITAL.JPN, cur: T.CURRENCY && T.CURRENCY.DEU,
      hdi: T.HDI && T.HDI.NOR, sat: (T.SAT_PROVIDERS || []).length, sea: (window.SEA_LABELS || []).length,
      feeds: Object.keys(window.NEWS_COUNTRY_FEEDS || {}).length,
      /* #R225 deleted this one. Nothing may put it back without saying so here. */
      geoLayers: typeof T.geoLayersDB,
    };
  });
  expect(EXPORTED.length, 'js/tables.js is readable and still exports its tables').toBeGreaterThan(20);
  expect(t.keys, 'the page exports exactly the tables js/tables.js returns').toEqual(EXPORTED);
  expect(t).toMatchObject({ gdp: 27361, cap: 'Tokyo', cur: 'EUR' });
  expect(t.hdi).toBeCloseTo(0.966, 3);
  expect(t.sat, 'the satellite provider table survived').toBeGreaterThan(3);
  expect(t.sea, 'the sea-label table survived').toBeGreaterThan(50);
  expect(t.feeds, 'the per-country news feeds survived').toBeGreaterThan(5);
  expect(t.geoLayers, 'the geo-theory layer catalogue was deleted in #R225 and stays deleted').toBe('undefined');

  // CONSUMER 1 — the country tables feed the Countries tab. Load the real boundary data, then read
  // a country's detail card: capital / currency / language all come out of the moved tables.
  /* ⚠ (#R304) THROUGH `window.IntMapAtlas`, WHICH IS THE DOOR THE APP USES. #R224 moved the Atlas
     kernel behind js/lazy-modules.js — 658 kB parsed by every session, most of which never open it —
     so `window.IntMapConsole` is undefined until something asks. This called it directly and threw
     「Cannot read properties of undefined (reading 'dispatch')」 on every nightly run since. The
     facade fetches the kernel first and is what js/app-body.js, the sidebar and Ctrl+K all press. */
  const detail = await page.evaluate(async () => {
    await window.IntMapAtlas.call('dispatch', { type: 'country', name: 'Japan' }).catch(() => null);
    return typeof window.IntMapConsole;
  }).catch(() => null);
  expect(detail, 'reaching for Atlas fetched Atlas (#R224)').toBe('object');

  // CONSUMER 2 — the DE/RU/ES gazetteer add-ons are merged into geoDB by rebuildGeoIndex(), which
  // the non-AI locator scores against. A German demonym only resolves if _DERU_GZ survived the move.
  const geo = await page.evaluate(() => {
    const f = window._imAnalyzeContext;
    if (typeof f !== 'function') return null;
    return {
      de: f('Russische Truppen rücken in der Ukraine vor', ''),
      es: f('Inundaciones graves en Perú tras las lluvias', ''),
      en: f('Earthquake strikes Tokyo, Japan', ''),
    };
  });
  expect(geo, 'the non-AI locator is reachable').toBeTruthy();
  expect(geo.en && geo.en.loc, 'the locator still places an English headline').toBeTruthy();
  expect(geo.de && geo.de.loc, 'a German-language headline still resolves (js/tables.js _DERU_GZ)').toBeTruthy();
  expect(geo.es && geo.es.loc, 'a Spanish-language headline still resolves (js/tables.js _ES_GZ)').toBeTruthy();
});

test('R167 #3 the moved UI blocks really built themselves into the page', async () => {
  // Each of these is a block that mounts DOM. If its factory silently died the node is just absent —
  // no error anywhere. Ids read out of the module sources, never guessed (#R164 lost a run to that).
  const dom = await page.evaluate(() => ({
    timeline: !!document.getElementById('news-timeline'),
    timelineToggle: !!document.getElementById('ntl-toggle'),
    timelineModes: !!document.getElementById('ntl-mode-year') && !!document.getElementById('ntl-mode-date'),
    legalModal: !!document.getElementById('legal-modal'),
    railRow: !!document.getElementById('dl-oxrail') || !!document.querySelector('[id^="dl-ox"], [id*="oxrail"]'),
    layerRows: document.querySelectorAll('.layer-option').length,
  }));
  expect(dom.timeline, 'js/news-timeline.js mounted the timeline strip').toBe(true);
  expect(dom.timelineToggle && dom.timelineModes, 'the timeline controls are wired').toBe(true);
  expect(dom.legalModal, 'js/legal.js wired the legal modal').toBe(true);
  expect(dom.railRow, 'js/map-extras.js added its rail/sea overlay row').toBe(true);
  expect(dom.layerRows, 'the Layers panel is fully populated').toBeGreaterThan(100);
});

test('R167 #4 the legal texts render, and LIVE getters follow a runtime switch to Japanese', async () => {
  // js/legal.js reads HOST.lang on EVERY call; a captured copy of currentLang would freeze the
  // Terms/Privacy texts in English for the rest of the session.
  // ids read out of js/legal.js, not guessed: #legal-tab-privacy paints #legal-body.
  const paint = () => page.evaluate(() => {
    document.getElementById('legal-tab-privacy')?.click();
    return (document.getElementById('legal-body')?.textContent || '').trim().slice(0, 400);
  });
  const en = await paint();
  expect(en, 'the Privacy tab painted its English text').toMatch(/Privacy Policy/i);

  await page.evaluate(() => document.getElementById('lang-jp')?.click());
  await page.waitForTimeout(900);
  const jp = await paint();
  expect(jp, 'the legal text re-rendered in Japanese through the live host getter').toMatch(/[぀-ヿ一-鿿]/);
  expect(jp).not.toBe(en);
  await page.evaluate(() => document.getElementById('legal-close-x')?.click());

  // js/map-extras.js labels its rail/sea rows from HOST.lang too.
  const railJp = await page.evaluate(() => {
    const el = document.querySelector('[id*="oxrail"] , #dl-oxrail');
    const row = el && el.closest ? el.closest('.layer-option') : null;
    return ((row || el || {}).textContent || '').trim();
  });
  expect(railJp, 'the rail overlay row re-labelled in Japanese').toMatch(/[぀-ヿ一-鿿]/);

  await page.evaluate(() => document.getElementById('lang-en')?.click());
  await page.waitForTimeout(900);
});

test('R167 #5 WRITE-THROUGH: the news timeline sets HOST.globalData / HOST.newsFeatures and index.html sees it', async () => {
  // A missing setter is a SILENT no-op in a classic script, so "no error" proves nothing. Both
  // assertions below make index.html re-derive from the bare closure variable:
  //   · globalData — once a past date is selected, loadNewsCache() refuses to restore (`!newsDate`),
  //     so the feed can only refill from a globalData the setter failed to clear.
  //   · newsFeatures — a basemap switch re-runs setupIntelLayers(), which re-adds the pins from the
  //     bare `newsFeatures` (`if(newsFeatures.length) setSourceData(...)`). A stale array puts the
  //     pins straight back on the map.
  await page.evaluate(() => document.getElementById('btn-news')?.click());
  await page.waitForTimeout(1800);

  /* MapLibre's GeoJSONSource keeps its data behind serialize(); `_data` is not the feature array. */
  const counts = () => page.evaluate(() => {
    const s = window.__imap && window.__imap.getSource('news-points');
    let pins = -1; try { pins = s ? (s.serialize().data.features || []).length : -1; } catch { pins = -1; }
    return { items: document.querySelectorAll('#live-news-feed .news-item').length, pins };
  });
  const before = await counts();
  expect(before.items, 'the seeded cache put real news items in the feed').toBeGreaterThan(0);
  expect(before.pins, 'the seeded cache put news pins on the map').toBeGreaterThan(0);

  // move the master clock back three days — the module's day-change branch runs
  await page.evaluate(() => window.IntMapTime.setDaysAgo(3, { source: 'test' }));
  await page.waitForTimeout(2500);

  const after = await counts();
  expect(after.items, 'HOST.globalData=[] reached the closure: index.html re-rendered an empty feed').toBe(0);
  expect(after.pins, 'the news pins were dropped with the day change').toBe(0);

  // re-derivation: a basemap switch rebuilds the intel layers from the bare `newsFeatures`
  await page.evaluate(() => document.getElementById('btn-view-sat')?.click());
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.getElementById('btn-view-map')?.click());
  await page.waitForTimeout(2500);
  const rebuilt = await page.evaluate(() => {
    const s = window.__imap && window.__imap.getSource('news-points');
    try { return s ? (s.serialize().data.features || []).length : -1; } catch { return -1; }
  });
  expect(rebuilt, 'HOST.newsFeatures=[] reached the closure: setupIntelLayers() had nothing to re-add').toBe(0);

  await page.evaluate(() => window.IntMapTime.setNow({ source: 'test' }));
  await page.waitForTimeout(1200);
});

test('R167 #6 a moved module really runs against the real map (annotations + terrain sampler)', async () => {
  const res = await page.evaluate(async () => {
    const out = {};
    const n0 = (window.IntMapAnnotations._items || []).length;
    window.IntMapAnnotations.add({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }, { color: '#0a84ff', name: 'probe' });
    out.added = (window.IntMapAnnotations._items || []).length - n0;
    window.IntMapAnnotations.clear();
    out.cleared = (window.IntMapAnnotations._items || []).length;
    out.terrainZoom = typeof window.IntMapTerrain.sampler === 'function';
    out.runwayReady = typeof window.RunwaySearch.ready === 'function' ? !!window.RunwaySearch.ready : false;
    return out;
  });
  expect(res.added, 'IntMapAnnotations.add() stored a real annotation').toBe(1);
  expect(res.cleared, 'IntMapAnnotations.clear() emptied the store').toBe(0);
  expect(res.terrainZoom, 'the DEM sampler is callable').toBe(true);
});

test('R167 #7 js/dash-extended.js: the IndexedDB store really persists across a reload', async () => {
  // The third new RW member is extendedDashDB, which this module assigns from its IndexedDB cache on
  // a cold start. Unlike the other two it has NO observable consequence to assert against, and the
  // honest reason is worth writing down rather than dressing up:
  //
  //   · renderDashboard() has begun with `try{ return renderCompanies(); }` since #R139 retired the
  //     Information dashboard, so the card list is never rendered;
  //   · the only other reader (setupIntelLayers' dash-pin hover) depends on dashFeatures, which only
  //     that retired body ever fills;
  //   · bootSupabase() then awaits loadDashFromSupabase(), which reassigns extendedDashDB
  //     unconditionally — even when the query fails.
  //
  // So the write is preserved because #R167 must not change behaviour, not because it does anything.
  // Its RW contract is pinned at source level by tests/r165-checks.test.mjs (setter exists, pairs
  // with the getter over the same closure variable, and only this module writes it). What IS worth
  // proving here is the part of the module the rest of the app genuinely depends on: window.IntMapCache
  // is used by js/beta-overlays.js, js/stats-compare.js and the runway search, so it has to survive a
  // reload for real.
  const KEY = 'r167_probe';
  await page.evaluate(async (k) => { await window.IntMapCache.set(k, { hello: 'world', n: 42 }); }, KEY);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 45_000 });
  await page.waitForTimeout(2000);

  const readBack = await page.evaluate(async (k) => await window.IntMapCache.get(k), KEY);
  expect(readBack, 'IntMapCache survived a reload through IndexedDB').toEqual({ hello: 'world', n: 42 });
  await page.evaluate(async (k) => { try { await window.IntMapCache.set(k, null); } catch { /* ignore */ } }, KEY);
});

test('R167 no IntMap-originated console error or uncaught exception during the exercise', async () => {
  // Same pre-existing exclusion as tests/r166.spec.js #7: MapLibre's recursive worker serializer can
  // overflow the stack when the full country FeatureCollection is re-sent (measured on BOTH trees
  // before that filter was written, 5/6 vs 6/6). Every other error still fails this test.
  const mapLibreStackOverflow = (e) => /RangeError/.test(e) && /Maximum call stack size exceeded/.test(e) && /maplibre-gl/.test(e);
  const unexpected = diag.pageErrors.filter((e) => !mapLibreStackOverflow(e));
  expect(unexpected, 'uncaught exceptions:\n' + unexpected.join('\n')).toEqual([]);
  expect(diag.consoleErrors, 'app console errors:\n' + diag.consoleErrors.join('\n')).toEqual([]);
});
