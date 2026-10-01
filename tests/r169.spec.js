// R169 behavioural checks in a real browser — the eighth index.html split.
//
// WHY a browser test: static analysis cannot see the #R162 failure shape. Soft dependencies here are
// `typeof X!=='undefined'` inside try/catch, so a moved subject that lost a binding throws NOTHING —
// a branch is skipped and the feature quietly disappears.
//
// What THIS round has to prove beyond "the globals exist":
//   1. All eleven factories ran, and index.html's SHIMS really reach them. A shim that forwarded to
//      the wrong object would not throw; it would just do nothing.
//   2. The moved subjects still do their real work through those shims: the news pipeline builds a
//      feed and locates every headline, the search box answers from the local gazetteer, the
//      satellite controller renders, the place-label layers exist, the readout formats coordinates.
//   3. WRITE-THROUGH for the new RW members. `HOST.x=v` on a getter-only object is a SILENT no-op, so
//      "no error" proves nothing: each assertion below forces index.html's OWN code to re-derive from
//      the bare closure variable afterwards (the grid toggle reads `isGridOn`, the lazy news batch
//      reads `renderedCount`/`newsFiltered`).
//   4. The host getters are LIVE: modules built while the UI was English follow a runtime switch.
//
// What is NOT claimed here, deliberately (#R167's rule: never pretend to prove what you cannot):
//   · js/community-board.js. Its renderer is only reached through loadCommunity(), which awaits
//     detectCommCaps() against Supabase — blocked by the hermetic policy — and the community feed has
//     no button of its own (it opens from a community map pin, and with no posts there are no pins).
//     Same conclusion #R168 reached for js/community.js. Source-level cover: r169-checks #1/#2/#5.
//   · js/elevation-profile.js. _openProfilePanel() is reached only from the freehand Draw tool's
//     "Elevation profile" action, which first samples a real terrain-RGB DEM over the network.
//   · js/article-reader.js. Unreachable in the product since #R11 (see the file header) — there is no
//     entry point to drive, and inventing one would be a product change, not a refactor.
//   · The AI transport itself (aiCallServerFull): it needs the ai-proxy Edge Function. Only the parts
//     that work offline — the config/quota surface on window.__ai — are exercised.
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics, isBenign } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

let page, diag;

/* 45 fake headlines (> NEWS_BATCH=30) pre-seeded into the news cache, so the feed is deterministic
   with no network AND large enough that a second lazy batch really has something to append. */
const NEWS_SEED = {
  ts: Date.now(),
  lang: 'en',
  data: Array.from({ length: 45 }, (_, i) => ({
    title: `Tokyo test headline number ${i + 1}`,
    link: `https://example.invalid/item-${i + 1}`,
    publisher: 'Test Wire',
    pubDate: new Date().toUTCString(),
    description: `Test item ${i + 1} from Tokyo`,
    /* fetchData()'s cache path hands these straight to the renderer, so the seed carries the
       analysis the live path would compute. analyzeContext itself is exercised directly in #2b. */
    analysis: { loc: [139.69, 35.69], name: 'Tokyo', country: 'JPN', type: 'city' },
  })),
};

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: seededStorageState() });
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

test('R169 #1 all eleven files loaded and all eleven factories ran', async () => {
  const res = await page.evaluate(() => ({
    check: window.__imModuleCheck,
    facs: ['satellite', 'aiCore', 'placeLabels', 'windowManager', 'searchGeocode', 'newsContext',
      'newsFeed', 'articleReader', 'communityBoard', 'mapReadout', 'elevationProfile']
      .filter((k) => typeof (window.IntMapModules || {})[k] !== 'function'),
  }));
  expect(res.check.missing, 'no required global is missing').toEqual([]);
  expect(res.check.missingFactories, 'no factory is missing').toEqual([]);
  expect(res.facs, 'every #R169 factory is a real function').toEqual([]);
});

test('R169 #2 THE NEWS PIPELINE: the moved fetch built a real feed', async () => {
  // js/news-feed.js (loadNewsCache → fetchData → startNews) is reached only through index.html's
  // shims. If either shim were dead the feed would stay on "Loading…".
  const first = await page.evaluate(async () => {
    // setMode() TOGGLES, so only click when the tab is not already active.
    const nb = document.getElementById('btn-news');
    if (nb && !nb.classList.contains('active')) { nb.click(); await new Promise((r) => setTimeout(r, 1400)); }
    document.getElementById('newsfilter-all')?.click();
    await new Promise((r) => setTimeout(r, 1200));
    const feed = document.getElementById('live-news-feed');
    return {
      cards: feed.querySelectorAll('.news-item, .news-card').length,
      text: (feed.innerText || '').slice(0, 80),
    };
  });
  expect(first.cards, 'the first lazy batch (NEWS_BATCH=30) rendered').toBe(30);
  expect(first.text).toContain('Tokyo test headline');
});

test('R169 #2b the moved locator resolves a headline to a real place', async () => {
  // analyzeContext moved into js/news-context.js; index.html keeps the shim and publishes it as
  // window._imAnalyzeContext. A dead shim would throw; a locator that lost its gazetteer (the #R162
  // shape — geoDB read as a bare identifier) would return an unlocated result instead.
  const a = await page.evaluate(() => {
    try { return window._imAnalyzeContext('Heavy rain warning issued for Tokyo', 'Test Wire', 'https://example.invalid/x', ''); }
    catch (e) { return { error: String(e) }; }
  });
  expect(a.error, 'the shim reached the module').toBeUndefined();
  expect(Array.isArray(a.loc), 'the headline was located').toBe(true);
  expect(a.loc[0]).toBeGreaterThan(135);
  expect(a.loc[0]).toBeLessThan(145);
  expect(String(a.name)).toMatch(/Tokyo|東京/);
});

test('R169 #3 WRITE-THROUGH: appendNewsBatch advances renderedCount past the first batch', async () => {
  // renderedCount / newsFiltered live in index.html; js/news-feed.js replaces them through the host
  // setters when startNews() re-derives the list. index.html's own scroll handler then compares
  // `renderedCount<newsFiltered.length` off the closure to decide whether a second batch exists — so
  // a silent no-op write would leave the feed stuck at 30 cards.
  // ⚠ THE FEED IS BROUGHT TO ITS END AT ONCE, AND READ IN THE SAME TASK — NOT 900 ms LATER.
  // The feed is a `.content-area`, which css/intmap.css gives `scroll-behavior:smooth`, so
  // `feed.scrollTop = feed.scrollHeight` does not move it: it starts an animation. MEASURED
  // 2026-10-01 on this boot: scrollTop was still 0 when the synthetic scroll below ran (so the
  // listener's «near the end» test was false and nothing was appended), and the second batch came
  // 614-644 ms later from the animation's own scroll events — a margin of under 300 ms against the
  // 900 ms this waited, on a frame-driven animation that a loaded runner stretches. That is the
  // «30, not 45» the deep tier recorded on 5 of 14 nights (2026-09-16…27, each passing on retry) and
  // again in run 36772277497. The same wait was also a window for somebody else's re-render: a probe
  // with the feed's innerHTML setter wrapped saw js/auth-ui.js onAuthStateChange → startNews() empty
  // the feed and re-render the first 30 about 3.3 s after the News tab opened.
  // `behavior:'instant'` overrides the stylesheet for this one scroll, so the position is at the end
  // when the listener (js/app-body.js) runs; it and appendNewsBatch (js/news-ui.js) are synchronous,
  // so the second batch is in the DOM when dispatchEvent returns. The claim is the write-through —
  // the closure's own `renderedCount<newsFiltered.length` — and one synchronous read proves it.
  const res = await page.evaluate(() => {
    const feed = document.getElementById('live-news-feed');
    const count = () => feed.querySelectorAll('.news-item, .news-card').length;
    const before = count();
    feed.scrollTo({ top: feed.scrollHeight, behavior: 'instant' });
    feed.dispatchEvent(new Event('scroll', { bubbles: true }));
    const links = [...feed.querySelectorAll('.news-item, .news-card')]
      .map((c) => c.getAttribute('data-link') || c.querySelector('a')?.getAttribute('href') || c.innerText.slice(0, 60));
    return { before, after: count(), unique: new Set(links).size };
  });
  expect(res.before).toBe(30);
  expect(res.after, 'the second batch appended the remaining 15 of the 45 seeded items').toBe(45);
  expect(res.unique, 'every card is distinct — the counters really advanced').toBe(45);
});

test('R169 #3b an auth event does not take the reader back to the first batch', async () => {
  // MEASURED 2026-10-01: the auth listener (js/auth-ui.js) redrew the list from the top, so the
  // 45 cards #3 reached went back to 30 and the reader lost their place. A genuine supabase-js
  // SIGNED_OUT drives the real path (listener → renderUI → startNews). The node half is
  // tests/news-list-keeps-position-checks.test.mjs.
  // ⚠ THE READER IS PUT ON CARD 34 WITH `behavior:'instant'`, NOT `scrollTop +=` — the same trap
  // #3 documents above. The feed is a `.content-area` (`scroll-behavior:smooth`), so `scrollTop +=`
  // only STARTS a flight from where #3 left it (card 25) to card 34, and `before` was read at that
  // instant. MEASURED in run 36783323529 (Linux, rest 2/2, try and retry) and here under CPU ×4,
  // 5 of 5: before = card 25 every time, after = 30 / 32 / 33 / 34 — wherever the flight had got to
  // when the redraw ran. Reading the flight's start and comparing it with a point along the flight
  // is not a test of the redraw. From a SETTLED position under the same ×4 throttle the redraw
  // kept card 21 at 0 px offset in every run, so the product half was not what failed.
  // The wait is for the redraw itself, not for a time: startNews() empties, refills and puts the
  // place back in one task, so the MutationObserver's callback (the microtask after that task) sees
  // the finished list — and the test now fails if no redraw happened at all, instead of comparing
  // an untouched list with itself after a 5-second fallback.
  const where = () => page.evaluate(() => {
    const f = document.getElementById('live-news-feed'); const top = f.getBoundingClientRect().top;
    const c = [...f.querySelectorAll('.news-item')].find((x) => x.getBoundingClientRect().bottom > top);
    return { n: f.querySelectorAll('.news-item').length,
      card: c ? c.querySelector('.news-title').textContent : null, off: c ? Math.round(top - c.getBoundingClientRect().top) : null };
  });
  await page.evaluate(() => {
    const f = document.getElementById('live-news-feed'); const c = f.querySelectorAll('.news-item')[33];
    f.scrollTo({ top: f.scrollTop + c.getBoundingClientRect().top - f.getBoundingClientRect().top + 12, behavior: 'instant' });
  });
  const before = await where();
  expect(before.n).toBe(45);
  expect(before.card, 'the reader is settled on card 34 before the auth event').toBe('Tokyo test headline number 34');
  /* armed before the event is raised; resolves on the redraw's first mutation */
  await page.evaluate(() => {
    const f = document.getElementById('live-news-feed');
    window.__r169Redrawn = new Promise((res) => { const mo = new MutationObserver(() => { mo.disconnect(); res(true); }); mo.observe(f, { childList: true }); });
  });
  await page.evaluate(() => window.sb.auth.signOut());
  expect(await page.evaluate(() => window.__r169Redrawn), 'the auth event redrew the list').toBe(true);
  const after = await where();
  expect(after.n, 'the second batch is still rendered').toBe(45);
  expect(after.card, 'the reader is on the same card').toBe(before.card);
  expect(Math.abs(after.off - before.off), 'at the same offset into it').toBeLessThanOrEqual(1);
});

test('R169 #4 WRITE-THROUGH: the grid toggle round-trips through HOST.isGridOn', async () => {
  // index.html keeps `toggleGrid(){ setGrid(!isGridOn); }` and reads the BARE closure variable;
  // js/map-readout.js owns setGrid and writes HOST.isGridOn. If that write were a silent no-op the
  // second click would compute !false again and turn the grid ON a second time instead of off.
  const gridFeatures = () => page.evaluate(() => {
    try { const s = window.__imap.getSource('grid-source'); return (s.serialize().data.features || []).length; }
    catch { return -1; }
  });
  await page.evaluate(() => document.getElementById('btn-tool-grid').click());
  await page.waitForTimeout(400);
  const on = await gridFeatures();
  await page.evaluate(() => document.getElementById('btn-tool-grid').click());
  await page.waitForTimeout(400);
  const off = await gridFeatures();
  expect(on, 'the graticule was built by the moved buildGridFeatures()').toBeGreaterThan(0);
  expect(off, 'the second click really turned it off — HOST.isGridOn was written through').toBe(0);
  expect(await page.evaluate(() => document.getElementById('cb-grid').checked)).toBe(false);
});

test('R169 #5 the search box answers from the moved geocoder', async () => {
  // preprocessNLQuery / localFuzzyPlaces / doGeocode all live in js/search-geocode.js now, and the
  // input's Enter handler in index.html calls the shim. Nominatim and Open-Meteo are blocked by the
  // hermetic policy, so anything that appears came from the LOCAL gazetteer path.
  await page.fill('#ms-input', 'Tokyo');
  await page.press('#ms-input', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('#ms-results .ms-item').length > 0,
    null, { timeout: 15_000 });
  const items = await page.evaluate(() => [...document.querySelectorAll('#ms-results .ms-item')].map((d) => d.textContent));
  expect(items.join(' | ')).toMatch(/Tokyo/i);
});

test('R169 #6 the satellite module built the controller and its debug surface is the real one', async () => {
  const sat = await page.evaluate(() => {
    const s = window.__sat;
    if (!s) return { ok: false };
    const esri = s.hasKey(s.providers.find((p) => p.id === 'esri'));
    const tiles = s.build(s.providers.find((p) => p.id === 'esri'));
    return { ok: true, providers: s.providers.length, esri, tiles, day: s.state.day };
  });
  expect(sat.ok, 'window.__sat exists (it captures the index.html shims)').toBe(true);
  expect(sat.providers, 'the provider table reached the module').toBeGreaterThan(1);
  expect(sat.esri, 'satHasKey() runs in the module and says the free provider is usable').toBe(true);
  // satBuildTiles() really ran in the module and produced a tile template for the free provider
  // (a paid provider with no saved key is the case that returns null).
  expect(Array.isArray(sat.tiles) && sat.tiles.length > 0, 'satBuildTiles() returned tile URLs').toBe(true);
  expect(String(sat.tiles[0])).toMatch(/^https?:\/\/.*\{z\}/);
  expect(sat.day, 'satState reached the module').toMatch(/^\d{4}-\d{2}-\d{2}$/);

  // satSetup() runs at style-load and renders the controller when the basemap is satellite.
  await page.evaluate(() => { const b = document.getElementById('sat-controller'); if (b) b.style.display = 'block'; });
  const html = await page.evaluate(() => {
    try { window.__sat.render(); } catch { /* not exposed */ }
    return (document.getElementById('sat-controller') || {}).innerHTML || '';
  });
  expect(html, 'satRenderController() filled the panel through the shim').toContain('satc-row');
});

test('R169 #7 the AI core surface is live and answers from the module', async () => {
  const ai = await page.evaluate(() => {
    const a = window.__ai;
    if (!a) return { ok: false };
    return { ok: true, cfg: !!a.config(), ready: typeof a.ready(), vision: typeof a.visionReady(),
      parsed: a.parse('{"a":1}') };
  });
  expect(ai.ok, 'window.__ai exists (it captures the index.html shims)').toBe(true);
  expect(ai.cfg).toBe(true);
  expect(ai.ready, 'aiReady() ran in the module').toBe('boolean');
  expect(ai.vision, 'aiVisionReady() ran in the module').toBe('boolean');
  expect(ai.parsed, 'aiParseJSON() ran in the module').toEqual({ a: 1 });
});

test('R169 #8 the place-label and readout modules really touched the map', async () => {
  const res = await page.evaluate(() => {
    const m = window.__imap;
    const ids = ['ofm-country', 'ofm-city', 'geo-sea'].filter((id) => !!m.getLayer(id));
    const cr = document.getElementById('coord-readout');
    return { ids, hasReadout: !!cr };
  });
  // ensurePlaceLabels() + ensureGeoLayers() are called from index.html's style-load path through
  // their shims; the layers they add are the observable proof.
  expect(res.ids, 'the moved label layers were added').toEqual(['ofm-country', 'ofm-city', 'geo-sea']);
  expect(res.hasReadout).toBe(true);
});

test('R169 #9 LIVE getters: modules built in English follow a runtime language switch', async () => {
  await page.evaluate(() => document.getElementById('lang-jp').click());
  await page.waitForTimeout(2500);
  const jp = await page.evaluate(() => {
    let sat = '';
    try { window.__sat.render(); sat = (document.getElementById('sat-controller') || {}).innerHTML || ''; } catch { /* ignore */ }
    return { sat, feed: (document.getElementById('live-news-feed') || {}).innerText || '' };
  });
  // satRenderController() re-renders from HOST.lang. If the module had captured the language at
  // factory time it would still be English here.
  expect(jp.sat, 'the satellite controller re-rendered in Japanese').toMatch(/[ぁ-んァ-ン一-龯]/);
  await page.evaluate(() => document.getElementById('lang-en').click());
  await page.waitForTimeout(1500);
  expect(jp.feed.length).toBeGreaterThan(0);
});

test('R169 #10 no IntMap-originated console error or uncaught exception during the exercise', async () => {
  const bad = [...diag.pageErrors, ...diag.consoleErrors].filter((t) => !isBenign(t));
  expect(bad, `unexpected page errors:\n${bad.join('\n')}`).toEqual([]);
});
