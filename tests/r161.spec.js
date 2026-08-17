// R161 behavioural checks in a REAL browser.
//  (A) js/newsgeo.js loads in the page and answers correctly (the node tests exercise the same file,
//      this proves the shipped <script> actually reaches the browser and runs there).
//  (B) analyzeContext — the app's own non-AI locator — is driven by the engine end-to-end:
//      the resulting pin carries the right coordinates, a non-empty name in EVERY UI language,
//      and the place TYPE the duplicate-pin spreader relies on.
//  (C) MapLibre reduction Phase 3: the news overlay is created and driven through IntMapGeoEngine,
//      and the broadened contract behaves like the raw map it wraps.
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

let page, diag;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, storageState: seededStorageState() });
  await installHermeticRouting(context);
  // Hermetic routing blocks the basemap's vector source (tiles.openfreemap.org), and MapLibre never
  // reports a style as "loaded" while one of its sources is still pending — which is why layer-level
  // assertions are impossible in the other specs. Stub that ONE source with a valid, empty TileJSON
  // (tiles point at a dead local port, so nothing is actually fetched) and the style completes, so the
  // app builds its real news overlay and we can verify the Phase-3 migration for real.
  await context.route('https://tiles.openfreemap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ tilejson: '2.2.0', tiles: ['http://127.0.0.1:1/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14, vector_layers: [] }) }));
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(
    () => !!window.IntMapNewsGeo && !!window.__imap && typeof window._imAnalyzeContext === 'function',
    null,
    { timeout: 45_000 },
  );
  await page.waitForTimeout(1500);
});

test.afterAll(async () => {
  await page?.context()?.close();
});

test('R161 (A) the NewsGeo engine loads in the browser with a populated gazetteer', async () => {
  const s = await page.evaluate(() => window.IntMapNewsGeo.stats());
  expect(s.entities).toBeGreaterThan(1200);
  expect(s.latin).toBeGreaterThan(2500);
  expect(s.cjk).toBeGreaterThan(900);
});

test('R161 (A) the engine reasons correctly in-page (dateline / ambiguity / trap / CJK)', async () => {
  const out = await page.evaluate(() => {
    const NG = window.IntMapNewsGeo, pick = (t) => { const r = NG.locate(t); return r ? { n: r.name.en, lng: +r.lng.toFixed(2), lat: +r.lat.toFixed(2) } : null; };
    return {
      dateline: pick('Blinken in Washington warns over Gaza ceasefire talks'),
      ambiguity: pick('Army shells Tripoli in northern Lebanon'),
      trap: pick('Paris Hilton testifies before Congress'),
      cjk: pick('ロシア軍がハルキウを砲撃　ウクライナ東部'),
      placeless: pick('Global markets rally on rate cut hopes'),
    };
  });
  expect(out.dateline.n).toBe('Gaza');
  expect(out.ambiguity.lat).toBeCloseTo(34.44, 1);      // Lebanese Tripoli, not the Libyan capital
  expect(out.trap).toBeNull();
  expect(out.cjk.n).toBe('Kharkiv');
  expect(out.placeless).toBeNull();
});

test('R161 (B) analyzeContext uses the engine and yields a usable pin in every UI language', async () => {
  const res = await page.evaluate(() => {
    const a = window._imAnalyzeContext('Explosion rocks Kharkiv as Russia steps up strikes on Ukraine', 'Reuters', 'x', '');
    return { loc: a.subjectLoc, name: a.subjectName, type: a.subjectType, conf: a.subjectConf, pinned: a.loc, mapped: a.mapped };
  });
  expect(res.loc[0]).toBeCloseTo(36.23, 1);
  expect(res.loc[1]).toBeCloseTo(49.99, 1);
  expect(res.type).toBe('flashpoint');
  expect(res.conf).toBeGreaterThan(0.5);
  expect(res.mapped).toBe(true);
  // the pin the map actually draws comes from the same analysis
  expect(res.pinned[0]).toBeCloseTo(36.23, 1);

  // a subject NAME must be present for every UI language — de/ru/es used to render `undefined`
  const names = await page.evaluate(async () => {
    const out = {};
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    /* ⚠ (#R251) THIS LOOP USED TO SWITCH NOTHING. It read
       `window.setLanguage ? window.setLanguage(lang) : null` — and there is no `window.setLanguage`;
       the switch is `setLang()`, a closure in js/app-body.js wired to `#lang-<code>`. The guard made
       it a silent no-op, so five iterations all measured English and the assertion below could not
       have failed for de/ru/es — the exact defect it was written for. Switch the way a reader does,
       and wait for the table (#R249: the <html lang> attribute lands before the strings do). */
    for (const lang of ['en', 'jp', 'de', 'ru', 'es']) {
      const btn = document.getElementById('lang-' + lang);
      if (btn) {
        btn.click();
        const tag = window.IntMapLang.htmlTag(lang);
        for (let i = 0; i < 100; i++) {
          if (window.IntMapLang.isLoaded(lang) && document.documentElement.getAttribute('lang') === tag) break;
          await sleep(50);
        }
      }
      out[lang] = { name: window._imAnalyzeContext('Deadly floods hit Rio de Janeiro state in Brazil', 'AP', 'y', '').subjectName,
        switched: !!btn && document.documentElement.getAttribute('lang') === window.IntMapLang.htmlTag(lang) };
    }
    return out;
  });
  for (const lang of Object.keys(names)) {
    expect(names[lang].switched, `the ${lang} pill actually switched the language`).toBe(true);
    expect(typeof names[lang].name, `subjectName for ${lang}`).toBe('string');
    expect(names[lang].name.length, `subjectName for ${lang}`).toBeGreaterThan(0);
  }
});

test('R161 (B) a genuinely placeless headline is left unpinned rather than guessed', async () => {
  const a = await page.evaluate(() => {
    const r = window._imAnalyzeContext('Five tips to cut your energy bill', 'BBC', 'z', '');
    return { subject: r.subjectLoc, mapped: r.mapped };
  });
  expect(a.subject).toBeNull();
  expect(a.mapped).toBe(false);       // dim "location unknown" pin, not a confident wrong place
});

test('R161 (C) the broadened engine contract is a faithful pass-through of the renderer', async () => {
  const r = await page.evaluate(() => {
    const GE = window.IntMapGeoEngine, m = window.__imap;
    const a = GE.coords.project([2.35, 48.85]), b = m.project([2.35, 48.85]);
    const c = m.getContainer(), sz = GE.render.size();
    GE.render.setCursor('pointer'); const cur = m.getCanvas().style.cursor; GE.render.setCursor('');
    return {
      hasContract: !!(GE.ready && GE.render.size && GE.render.container && GE.render.setCursor && GE.events.onLayer && GE.events.offLayer && GE.layers.getPaint),
      readyMatches: GE.ready() === m.isStyleLoaded(),
      containerSame: GE.render.container() === c,
      dx: Math.abs(a.x - b.x), dy: Math.abs(a.y - b.y),
      wOk: sz.width === c.clientWidth, hOk: sz.height === c.clientHeight,
      cursor: cur, cleared: m.getCanvas().style.cursor,
    };
  });
  expect(r.hasContract).toBe(true);
  expect(r.readyMatches).toBe(true);
  expect(r.containerSame).toBe(true);
  expect(r.dx).toBeLessThan(0.001);
  expect(r.dy).toBeLessThan(0.001);
  expect(r.wOk).toBe(true);
  expect(r.hOk).toBe(true);
  expect(r.cursor).toBe('pointer');
  expect(r.cleared).toBe('');
});

// The news overlay is created by setupIntelLayers() the moment the style reports loaded — which it
// now does, thanks to the stubbed basemap source in beforeAll. This asserts the overlay really was
// built THROUGH IntMapGeoEngine (source + three layers), and that data, feature-state and paint
// read-back all reach the underlying renderer.
test('R161 (C) the news overlay is really built and driven through the engine', async () => {
  await page.waitForFunction(() => window.IntMapGeoEngine && window.IntMapGeoEngine.ready()
    && window.IntMapGeoEngine.layers.has('news-labels'), null, { timeout: 30_000 });
  const r = await page.evaluate(() => {
    const GE = window.IntMapGeoEngine, m = window.__imap;
    // push a feature through the engine and read the result back off the RAW map
    GE.layers.setSourceData('news-points', { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { fid: 1, short: 'Kharkiv', mapped: 'true' }, geometry: { type: 'Point', coordinates: [36.23, 49.99] } }] });
    GE.layers.setFeatureState({ source: 'news-points', id: 1 }, { bnd: true });
    let threw = null; try { window._declutterNewsBands(); } catch (e) { threw = String(e && e.message); }
    return {
      src: !!m.getSource('news-points'),
      dots: !!m.getLayer('news-dots'),
      labels: !!m.getLayer('news-labels'),
      pulse: !!m.getLayer('news-pulse'),
      dash: !!m.getSource('dash-points'),
      haloEngine: GE.layers.getPaint('news-labels', 'text-halo-width'),
      haloRaw: m.getPaintProperty('news-labels', 'text-halo-width'),
      state: m.getFeatureState({ source: 'news-points', id: 1 }),
      threw,
    };
  });
  expect(r.src).toBe(true);
  expect(r.dots).toBe(true);
  expect(r.labels).toBe(true);
  expect(r.pulse).toBe(true);
  expect(r.dash).toBe(true);
  expect(r.haloEngine).toBe(r.haloRaw);
  expect(r.state.bnd).toBe(true);
  expect(r.threw).toBeNull();
});

test('R161 no page errors were raised during the run', async () => {
  expect(diag.pageErrors, `page errors: ${JSON.stringify(diag.pageErrors)}`).toHaveLength(0);
});
