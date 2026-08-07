// R168 behavioural checks in a real browser — the seventh index.html split.
//
// WHY a browser test: static analysis cannot see the #R162 failure shape. Soft dependencies in this
// codebase are `typeof X!=='undefined'` inside try/catch, so a moved subject that lost a binding
// throws NOTHING — a branch is skipped and the feature quietly disappears.
//
// What THIS round has to prove beyond "the globals exist":
//   1. The six factories ran and each subject really rebuilt its own UI (each of these renderers can
//      also bail out early on a missing element or an empty dataset, so presence proves nothing).
//   2. THE SHIMS FORWARD. index.html now calls these functions through hoisted one-line shims. A shim
//      that reached the wrong object would not throw — it would just do nothing.
//   3. The host getters are LIVE: a module built while the UI was English follows a runtime switch.
//   4. WRITE-THROUGH for the new RW members. This needs the most care: a module is a classic script,
//      so `HOST.x=v` on an object with only a getter is a SILENT no-op, and "no error" proves
//      nothing. Every assertion below therefore forces index.html's OWN code to re-derive from the
//      bare closure variable afterwards.
//
// What is NOT claimed here, deliberately (#R167's rule: do not pretend to prove what you cannot):
//   · currentUser / geoRaw. js/auth-ui.js writes both, but only along paths that need a real
//     Supabase session — a logged-in refreshCurrentUser() and loadGeoFromSupabase(). The hermetic
//     policy blocks Supabase, and putting real credentials in a test is not an option. Both stay
//     pinned at source level by r165-checks (setter exists, is paired with its getter over the same
//     closure variable, and js/auth-ui.js is its declared owner).
//   · dashFeatures. renderDashboard() has had no on-screen consequence since #R139 (it starts with
//     `try{ return renderCompanies(); }`), so there is nothing to observe; #R167 reached the same
//     conclusion about extendedDashDB.
//   · js/community.js's DOM and its six filter/compose RW members. renderCommunity() is only ever
//     reached through loadCommunity(), which awaits detectCommCaps() against Supabase — blocked here
//     — and the community FEED mode has no button of its own (it is opened by clicking a community
//     map pin, and with no posts there are no pins). Verified this is pre-existing, not a split
//     artefact: the same probe leaves #community-feed empty on main at 730b401 too. The module's
//     presence and factory are covered by #1, its scope and RW contract by r168-checks/r165-checks.
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
    title: `Test headline number ${i + 1}`,
    link: `https://example.invalid/item-${i + 1}`,
    publisher: 'Test Wire',
    pubDate: new Date().toUTCString(),
    description: `Test item ${i + 1}`,
    analysis: { loc: [139.69, 35.69], name: 'Tokyo', country: 'JPN', type: 'city' },
  })),
};

/* A two-country stand-in for the 4.7 MB Natural Earth file js/countries-ui.js downloads. Same shape
   (ISO_A3_EH + POP_EST), so loadCountryData() takes its normal path and finishes in milliseconds. */
const NE_STUB = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { ISO_A3_EH: 'JPN', ADMIN: 'Japan', NAME: 'Japan', POP_EST: 125000000 },
      geometry: { type: 'Polygon', coordinates: [[[130, 31], [146, 31], [146, 45], [130, 45], [130, 31]]] } },
    { type: 'Feature', properties: { ISO_A3_EH: 'FRA', ADMIN: 'France', NAME: 'France', POP_EST: 68000000 },
      geometry: { type: 'Polygon', coordinates: [[[-5, 42], [8, 42], [8, 51], [-5, 51], [-5, 42]]] } },
  ],
};

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: seededStorageState() });
  await installHermeticRouting(context);
  /* Registered AFTER the catch-all so it wins (Playwright runs the most recent matching handler
     first): the Natural Earth boundaries resolve instantly instead of downloading 4.7 MB. */
  await context.route(/natural-earth-vector.*admin_0_countries\.geojson/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NE_STUB) }));
  await context.addInitScript((seed) => {
    try {
      localStorage.setItem('intmap_ws4', JSON.stringify({ on: false }));
      localStorage.setItem('intmap_news_cache', JSON.stringify(seed));
      localStorage.removeItem('intmap_bookmarks');
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

test('R168 #1 all six files loaded, all six factories ran, and no factory is missing', async () => {
  const res = await page.evaluate(() => ({
    check: window.__imModuleCheck,
    facs: ['countriesUi', 'newsUi', 'companiesUi', 'toolPanel', 'authUi', 'community']
      .map((f) => [f, typeof (window.IntMapModules || {})[f]]),
  }));
  expect(res.check, 'the boot guard ran').toBeTruthy();
  expect(res.check.missing, 'no required module namespace is missing').toEqual([]);
  expect(res.check.missingFactories, 'no factory is missing — a js/ file that failed to deploy shows up here').toEqual([]);
  for (const [f, t] of res.facs) expect(t, `window.IntMapModules.${f} is a function`).toBe('function');
});

test('R168 #2 THE SHIMS FORWARD: each shim reaches the module and does the real work', async () => {
  // A shim that resolved to the wrong object would throw nothing useful — it would silently do
  // nothing. So call through each one and require a real, subject-specific effect.
  const res = await page.evaluate(async () => {
    const out = {};
    // countries — renderStats() fills the Countries feed from the (stubbed) boundary data
    await window.IntMapModules && null;
    document.getElementById('btn-stats')?.click();
    await new Promise((r) => setTimeout(r, 1200));
    out.countryRows = document.querySelectorAll('#countries-feed .stat-item, #countries-feed .country-row, #countries-feed [data-cid]').length;
    out.countriesFeedText = (document.getElementById('countries-feed')?.innerText || '').slice(0, 400);
    // news — setupIntelLayers() created the real map source; the feed rendered the seeded batch
    out.newsSource = !!window.__imap.getSource('news-points');
    document.getElementById('btn-news')?.click();
    await new Promise((r) => setTimeout(r, 1200));
    out.newsCards = document.querySelectorAll('#live-news-feed .news-item, #live-news-feed .news-card').length;
    // companies — renderCompanies() fills the Companies feed
    document.getElementById('btn-info')?.click();
    await new Promise((r) => setTimeout(r, 1200));
    out.companyText = (document.getElementById('info-dashboard')?.innerText || '').slice(0, 400);
    // tool panel — the measure tool builds the panel
    document.getElementById('btn-tool-measure')?.click();
    await new Promise((r) => setTimeout(r, 500));
    out.toolPanel = !!document.getElementById('tool-panel') && document.getElementById('tool-panel').style.display !== 'none';
    out.toolText = (document.getElementById('tool-panel')?.innerText || '').slice(0, 200);
    // auth — injectAuthUI() mounted the account control, openAuthModal() opens the modal
    out.accountBtn = !!document.getElementById("btn-account");
    return out;
  });
  expect(res.newsSource, 'setupIntelLayers() created the news-points source on the real map').toBe(true);
  expect(res.newsCards, 'the news feed rendered the seeded batch').toBeGreaterThan(10);
  expect(res.countriesFeedText.length, 'renderStats() wrote into #countries-feed').toBeGreaterThan(10);
  expect(res.countriesFeedText, 'the Countries feed lists a country from the stubbed boundary file').toMatch(/Japan|France/);
  expect(res.companyText.length, 'renderCompanies() wrote into #info-dashboard').toBeGreaterThan(10);
  expect(res.toolPanel, 'the measure tool built #tool-panel').toBe(true);
  expect(res.accountBtn, 'injectAuthUI() mounted the account control').toBe(true);
});

test('R168 #3 js/auth-ui.js: the account button it built opens the modal its own openAuthModal() drives', async () => {
  // Two functions of the module in one chain, neither of them reachable by name from here:
  // injectAuthUI() creates #btn-account during boot, and clicking it as a guest runs
  // openAccountMenu() → `if(!currentUser) return openAuthModal();` → the modal is activated.
  // #auth-modal is in the static markup, so its EXISTENCE proves nothing — `display:flex`, which
  // only the module's openAuthModal() sets, is the discriminator.
  const before = await page.evaluate(() => ({
    btn: !!document.getElementById('btn-account'),
    display: document.getElementById('auth-modal')?.style.display || '',
  }));
  expect(before.btn, 'injectAuthUI() mounted #btn-account during boot').toBe(true);
  expect(before.display, 'the auth modal starts closed').not.toBe('flex');

  const res = await page.evaluate(async () => {
    document.getElementById('btn-account').click();
    await new Promise((r) => setTimeout(r, 800));
    const m = document.getElementById('auth-modal');
    return { display: m?.style.display, text: (m?.innerText || '').slice(0, 300) };
  });
  expect(res.display, 'openAccountMenu() → openAuthModal() opened the modal through the module').toBe('flex');
  expect(res.text.length, 'the modal rendered its content').toBeGreaterThan(5);

  await page.evaluate(async () => {
    const m = document.getElementById('auth-modal'); if (m) m.style.display = 'none';
    await new Promise((r) => setTimeout(r, 200));
  });
});

test('R168 #4 WRITE-THROUGH: the tool panel clears measurePoints and index.html rebuilds the map layer', async () => {
  // js/tool-panel.js's #tp-clear button sets HOST.measurePoints=[] and then calls HOST.refreshTool().
  // refreshTool() is index.html code: it feeds map source 'tool-source' from buildToolFeatures(),
  // which reads the closure array. If the setter write had not reached the closure, the measured
  // line would still be there afterwards — "no error" would have looked identical.
  const before = await page.evaluate(async () => {
    // Start from "no tool armed": the Atlas action calls setTool('measure'), and setTool TOGGLES —
    // if an earlier test left the measure tool on, it would switch off and draw nothing.
    const mb = document.getElementById('btn-tool-measure');
    if (mb && mb.classList.contains('tool-on')) { mb.click(); await new Promise((res) => setTimeout(res, 300)); }
    const r = await window.IntMapConsole.dispatch({ type: 'measure', from: 'Tokyo', to: 'Osaka' });
    await new Promise((res) => setTimeout(res, 600));
    const s = window.__imap.getSource('tool-source');
    const d = s && ((s.serialize && s.serialize().data) || s._data);   /* MapLibre 5: _data goes stale after setData; serialize() is live */
    return { ok: !!(r && r.ok), html: String(r && r.html || ''), feats: ((d && d.features) || []).length };
  });
  expect(before.ok, 'the measure action reported success').toBe(true);
  expect(before.html, 'the measure reply names both endpoints').toMatch(/Tokyo[\s\S]*Osaka/i);
  expect(before.feats, 'the measured line is on the map before clearing').toBeGreaterThan(0);

  const after = await page.evaluate(async () => {
    const btn = document.querySelector('#tool-panel #tp-clear');
    if (!btn) return { clicked: false };
    btn.click();
    await new Promise((res) => setTimeout(res, 600));
    const s = window.__imap.getSource('tool-source');
    const d = s && ((s.serialize && s.serialize().data) || s._data);   /* MapLibre 5: _data goes stale after setData; serialize() is live */
    return { clicked: true, feats: ((d && d.features) || []).length };
  });
  expect(after.clicked, 'the tool panel really rendered its Clear button').toBe(true);
  expect(after.feats, 'HOST.measurePoints=[] reached the closure — index.html rebuilt tool-source empty').toBe(0);
});

test('R168 #5 WRITE-THROUGH: the radius slider sets HOST.radiusKm and index.html stamps it into a new circle', async () => {
  // js/tool-panel.js's radius input runs setR(v) → HOST.radiusKm=v. The proof is a DIFFERENT piece
  // of code: window._radiusFromPoint() lives in index.html and copies the BARE closure radiusKm into
  // the new circle, which refreshTool() (also index.html) turns into a disk polygon on the map.
  // A lost write would leave the default 1000 km and the polygon would be ~6× bigger.
  const res = await page.evaluate(async () => {
    document.getElementById('btn-tool-radius')?.click();
    await new Promise((r) => setTimeout(r, 700));
    const num = document.querySelector('#tool-panel #radius-num') || document.querySelector('#tool-panel #radius-range');
    if (!num) return { found: false };
    window.clearAllRadius && window.clearAllRadius();
    num.value = '150';
    num.dispatchEvent(new Event('input', { bubbles: true }));
    num.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    window._radiusFromPoint(0, 0);          // index.html — reads the closure radiusKm/color/opacity
    await new Promise((r) => setTimeout(r, 500));
    const s = window.__imap.getSource('tool-source');
    const d = s && ((s.serialize && s.serialize().data) || s._data);   /* MapLibre 5: _data goes stale after setData; serialize() is live */
    const feats = (d && d.features) || [];
    // the disk is the polygon; measure its latitude span in degrees (1° lat ≈ 111 km)
    let span = 0;
    for (const f of feats) {
      if (!f.geometry || f.geometry.type !== 'Polygon') continue;
      const ring = f.geometry.coordinates[0] || [];
      const lats = ring.map((c) => c[1]);
      span = Math.max(span, Math.max(...lats) - Math.min(...lats));
    }
    return { found: true, span, n: feats.length };
  });
  expect(res.found, 'the radius panel rendered its input').toBe(true);
  expect(res.n, 'a radius circle was created').toBeGreaterThan(0);
  // 150 km radius → ~300 km diameter → ~2.7° of latitude. The stale default (1000 km) would be ~18°.
  expect(res.span, 'the circle was drawn at the NEW radius — HOST.radiusKm reached the closure').toBeGreaterThan(1.5);
  expect(res.span, 'and not at the stale 1000 km default').toBeLessThan(6);
  await page.evaluate(() => { try { window.clearAllRadius(); } catch { /* ignore */ } });
});

test('R168 #6 WRITE-THROUGH: bookmarking re-derives the Saved list from the closure array', async () => {
  // js/news-ui.js's bookmark button ADDS with HOST.bookmarks.push(...) — which would work through a
  // getter alone, because it mutates the array in place. Removing is the discriminator: it does
  // HOST.bookmarks=HOST.bookmarks.filter(...), a REASSIGNMENT that only lands if the setter exists.
  // Both directions are then judged by index.html's computeFilteredNews(), which decides the Saved
  // tab's contents from the bare closure array.
  const added = await page.evaluate(async () => {
    document.getElementById('btn-news')?.click();
    await new Promise((r) => setTimeout(r, 900));
    const card = document.querySelector('#live-news-feed .news-item, #live-news-feed .news-card');
    const bm = card && card.querySelector('.btn-bookmark');
    if (!bm) return { found: false };
    bm.click();
    await new Promise((r) => setTimeout(r, 400));
    document.getElementById('newsfilter-saved')?.click();
    await new Promise((r) => setTimeout(r, 900));
    return { found: true, saved: document.querySelectorAll('#live-news-feed .news-item, #live-news-feed .news-card').length };
  });
  expect(added.found, 'the news feed rendered a bookmark button').toBe(true);
  expect(added.saved, 'the bookmarked article shows in Saved — index.html read the closure array').toBe(1);

  const removed = await page.evaluate(async () => {
    const bm = document.querySelector('#live-news-feed .btn-bookmark');
    if (!bm) return { found: false };
    bm.click();                                   // guest path: HOST.bookmarks = filter(...)
    await new Promise((r) => setTimeout(r, 900));
    return { found: true, saved: document.querySelectorAll('#live-news-feed .news-item, #live-news-feed .news-card').length };
  });
  expect(removed.found, 'the Saved list rendered its bookmark button').toBe(true);
  expect(removed.saved, 'the REASSIGNMENT reached the closure — otherwise Saved would still list it').toBe(0);
  await page.evaluate(() => document.getElementById('newsfilter-all')?.click());
  await page.waitForTimeout(600);
});

test('R168 #7 WRITE-THROUGH: appendNewsBatch advances renderedCount (no duplicate second batch)', async () => {
  // js/news-ui.js does HOST.renderedCount+=next.length and slices the next page from it. index.html
  // owns the variable and resets it in startNews(). If the compound write were lost, the second call
  // would slice from 0 again and append the SAME 30 cards — 60 in the DOM, half of them duplicates.
  // Driven the way a user does it — index.html's own scroll handler on #live-news-feed reads
  // `renderedCount < newsFiltered.length` off the closure to decide whether to ask for more.
  const res = await page.evaluate(async () => {
    // setMode() TOGGLES, so only click when the tab is not already the active one — and the scroll
    // handler returns early unless currentMode is 'news'/'saved'.
    const nb = document.getElementById('btn-news');
    if (nb && !nb.classList.contains('active')) { nb.click(); await new Promise((r) => setTimeout(r, 1400)); }
    document.getElementById('newsfilter-all')?.click();
    await new Promise((r) => setTimeout(r, 1200));
    const feed = document.getElementById('live-news-feed');
    const count = () => feed.querySelectorAll('.news-item, .news-card').length;
    const first = count();
    feed.scrollTop = feed.scrollHeight;
    feed.dispatchEvent(new Event('scroll', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 900));
    const links = [...feed.querySelectorAll('.news-item, .news-card')]
      .map((c) => c.getAttribute('data-link') || c.querySelector('a')?.getAttribute('href') || c.innerText.slice(0, 60));
    return { first, second: count(), unique: new Set(links).size };
  });
  expect(res.first, 'the first batch rendered NEWS_BATCH cards').toBe(30);
  expect(res.second, 'the second batch appended the remaining 15 of 45 seeded items').toBe(45);
  expect(res.unique, 'every card is distinct — renderedCount really advanced').toBe(45);
});

test('R168 #8 WRITE-THROUGH: loadCountryData sets countryGeo/countryDataLoaded and index.html re-adds the layer', async () => {
  // js/countries-ui.js assigns HOST.countryGeo / HOST.countryDataLoaded / HOST.countryDataPromise.
  // (Natural Earth is stubbed in beforeAll, so the real 4.7 MB download costs milliseconds here.)
  // Loaded the way the app does it: setMode('stats') runs `if(!countryDataLoaded) loadCountryData()`
  // through the shim. The module then does `HOST.countryGeo=gj; window.countryGeo=HOST.countryGeo;`
  // — reading BACK through the host, so a missing setter would publish null here.
  const loaded = await page.evaluate(async () => {
    document.getElementById('btn-stats')?.click();
    await new Promise((r) => setTimeout(r, 2000));
    return { geo: !!window.countryGeo, feats: window.countryGeo ? window.countryGeo.features.length : 0 };
  });
  expect(loaded.geo, 'the boundary data landed and read back through the host').toBe(true);
  expect(loaded.feats, 'both stub countries parsed').toBe(2);

  // Second, INDEPENDENT proof, this one re-derived by index.html itself. The #cb-countries change
  // handler is index.html code:
  //     if(countryInfoOn && !countryDataLoaded){ loadCountryData().then(ensure); } else ensure();
  //     ensure = () => { if(countryInfoOn && countryGeo && … && !map.getSource('countries')) addCountryLayers(); … }
  // Both `countryGeo` and `countryDataLoaded` are read as bare closure variables there. Tear the
  // source off the map, toggle the checkbox off and on, and it can only come back if both writes
  // really landed in the closure.
  const res = await page.evaluate(async () => {
    const cb = document.getElementById('cb-countries');
    if (!cb) return { found: false };
    if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 800)); }
    // every layer bound to the source has to go first, or removeSource() throws
    for (const l of (window.__imap.getStyle().layers || [])) {
      if (l.source === 'countries') { try { window.__imap.removeLayer(l.id); } catch { /* ignore */ } }
    }
    try { window.__imap.removeSource('countries'); } catch { /* ignore */ }
    const gone = !window.__imap.getSource('countries');
    cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 900));
    cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 2500));
    return { found: true, gone, back: !!window.__imap.getSource('countries') };
  });
  expect(res.found, 'the countries checkbox exists').toBe(true);
  expect(res.gone, 'the countries source was really removed first').toBe(true);
  expect(res.back, 'HOST.countryGeo / countryDataLoaded reached the closure — index.html re-added the layer').toBe(true);
});

test('R168 #9 LIVE getters: four of the modules re-render after a runtime language switch', async () => {
  // All four were BUILT while the UI was English; every localized string in them reads HOST.lang at
  // call time. A captured copy of currentLang would keep these panels English forever — the #R162
  // "silently reads a dead value" shape, invisible to any static check.
  // (js/auth-ui.js is not probed here: its modal is localized by index.html's data-i18n sweep rather
  // than by the module, so it would not discriminate. js/community.js cannot be rendered hermetically
  // — see the header.)
  const res = await page.evaluate(async () => {
    document.getElementById('lang-jp')?.click();
    await new Promise((r) => setTimeout(r, 1400));
    const out = {};
    document.getElementById('btn-stats')?.click();
    await new Promise((r) => setTimeout(r, 1200));
    out.countries = (document.getElementById('countries-feed')?.innerText || '');
    document.getElementById('btn-info')?.click();
    await new Promise((r) => setTimeout(r, 1200));
    out.companies = (document.getElementById('info-dashboard')?.innerText || '');
    const nb = document.getElementById('btn-news');
    if (nb && !nb.classList.contains('active')) nb.click();
    await new Promise((r) => setTimeout(r, 1400));
    out.news = (document.getElementById('live-news-feed')?.innerText || '');
    document.getElementById('btn-tool-measure')?.click();
    await new Promise((r) => setTimeout(r, 700));
    out.tool = (document.getElementById('tool-panel')?.innerText || '');
    return out;
  });
  const cjk = /[぀-ヿ一-鿿]/;
  expect(cjk.test(res.countries), 'js/countries-ui.js re-rendered in Japanese').toBe(true);
  expect(cjk.test(res.companies), 'js/companies-ui.js re-rendered in Japanese').toBe(true);
  expect(cjk.test(res.news), 'js/news-ui.js re-rendered in Japanese').toBe(true);
  expect(cjk.test(res.tool), 'js/tool-panel.js re-rendered in Japanese').toBe(true);
  await page.evaluate(() => document.getElementById('lang-en')?.click());
  await page.waitForTimeout(800);
});

test('R168 #10 no IntMap-originated console error or uncaught exception during the exercise', () => {
  const real = [...diag.pageErrors, ...diag.consoleErrors].filter((t) => !isBenign(t));
  expect(real, 'IntMap-originated errors:\n' + real.join('\n')).toEqual([]);
});
