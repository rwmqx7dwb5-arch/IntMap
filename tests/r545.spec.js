// R545 — 「相関ウィンドウが『読み込み中』のまま止まる」「残差で地図を塗ろうとすると、ダイアログだけ
// 閉じて何も起きない」。
//
// ⚠ WHY THIS IS A BROWSER TEST AND WHY IT INJECTS A FAULT. Both defects are ARMS THAT NEVER RUN, and
// no reading of the source shows that: js/analysis-correlate.js guarded each fallback with
// `typeof loadCountryData==='function'`, which is ALWAYS TRUE (js/app-body.js publishes it as a
// getter over a hoisted declaration), and neither chain had a rejection handler at all. So the code
// reads as if it has three outcomes and has one. On a load that fails, `.then(…)` never runs and
// nothing else does either — and residualMap() closes the chooser FIRST, so the reader is left
// looking at the map with nothing drawn, nothing said and nothing in the console.
//
// A spelling check («is there a .catch») would pass the moment somebody typed one, whatever it did.
// So the load is MADE TO FAIL and the panel is asked what it does:
//
//   ③ nothing broken → the scatter draws and the residual map paints (non-regression, and it is the
//     fixture the other two start from: a regression line to take residuals of)
//   ② the countries source is gone AND the reload rejects → the residual map must reach its failure
//     pill instead of stopping in silence
//   ① the panel has no country data and the load rejects → the card must stop saying «Loading
//     country data…» and say what happened
//
// ⚠ THE FAULT IS INJECTED AT THE SEAM THE PANEL ITSELF USES, not by patching the panel. This module
// receives `loadCountryData` as js/app-body.js's hoisted shim over
// `IntMapModules.countriesUi(HOST).loadCountryData`, so wrapping that ONE method — before any page
// script runs — is the dependency failing, for every caller that reaches it that way. Nothing
// test-only is added to the application.
// ⚠ AND THE FIXTURE IS NOT «BLOCK THE DOWNLOAD». MEASURED: refusing the Natural Earth fetch locks
// the main thread within about two seconds (js/countries-ui.js caches a promise that RESOLVES while
// `countryDataLoaded` stays false, so renderStats re-enters itself through it for ever) — a
// different defect, in a different file, that would have made this spec hang instead of report.
// ⚠ THE THREE RUN IN ONE PAGE AND IN THIS ORDER, so the file pays for one boot: ③ needs the data,
// ② takes the map's source away, ① takes the published geometry away and never gives it back.
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

let context, page, diag;

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 1280, height: 800 } });
  await installHermeticRouting(context);
  await context.addInitScript(() => {
    /* while this is true, `loadCountryData()` returns a REJECTED promise to everything that goes
       through the host — exactly what a loader that threw would give them. It starts false so the
       session boots with real country data. */
    window.__imFailCountryData = false;
    /* js/countries-ui.js runs later and ASSIGNS its factory here; the accessor lets the wrapper sit
       between that assignment and js/app-body.js's single `IntMapModules.countriesUi(IM_HOST)` call,
       which is the only way in — the module keeps the factory in a closure const. */
    const M = (window.IntMapModules = window.IntMapModules || {});
    let real = null;
    const wrapped = function (HOST) {
      const api = real(HOST);
      const load = api.loadCountryData;
      api.loadCountryData = function () {
        if (window.__imFailCountryData) return Promise.reject(new Error('__imFailCountryData'));
        return load.apply(this, arguments);
      };
      return api;
    };
    Object.defineProperty(M, 'countriesUi', {
      configurable: true,
      enumerable: true,
      get() { return real ? wrapped : undefined; },
      set(f) { real = f; },
    });
  });
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  /* the Layers row is built at boot by the eager shell (js/analysis-panels.js); the country data
     arrives from Natural Earth, which the hermetic policy lets through with the rest of jsDelivr */
  await page.waitForFunction(() => {
    try { return !!document.getElementById('btn-correlate') && !!window.countryGeo && !!window.IntMapGeoEngine.canDraw(); }
    catch (_) { return false; }
  }, null, { timeout: 60_000 });
});
test.afterAll(async () => { await context?.close().catch(() => { }); });

/** press the Layers → Tools button and wait for the overlay the on-demand module mounts */
async function openPanel() {
  await page.evaluate(() => { document.getElementById('btn-correlate').click(); });
  await page.waitForFunction(() => {
    const o = document.getElementById('corr-overlay');
    return !!o && o.classList.contains('show');
  }, null, { timeout: 30_000 });
}
const wrapText = () => page.evaluate(() => ((document.querySelector('#corr-overlay .corr-svg-wrap') || {}).textContent || '').trim());
const pillText = () => page.evaluate(() => {
  const p = document.getElementById('corr-resid-pill');
  return (p && p.style.display !== 'none') ? (p.textContent || '').trim() : '';
});

test('#R545 ③ (non-regression) with the data present the scatter draws and the residual map paints', async () => {
  await openPanel();
  const drawn = await page.waitForFunction(() => {
    const svg = document.querySelector('#corr-overlay .corr-svg-wrap svg');
    const btn = document.getElementById('corr-resid-btn');
    if (!svg || !btn) return null;
    return {
      dots: svg.querySelectorAll('circle.corr-dot').length,
      stats: (document.querySelector('#corr-overlay .corr-r') || {}).textContent || '',
    };
  }, null, { timeout: 45_000 }).then((h) => h.jsonValue());
  expect(drawn.dots, 'the scatter must plot the countries that have both values').toBeGreaterThan(2);
  expect(drawn.stats, 'the correlation figures must be printed').toContain('Pearson');

  await page.evaluate(() => { document.getElementById('corr-resid-btn').click(); });
  const painted = await page.waitForFunction(() => {
    const p = document.getElementById('corr-resid-pill');
    if (!p || p.style.display === 'none') return null;
    return { text: (p.textContent || '').trim(), fill: window.IntMapGeoEngine.layers.has('corr-resid-fill') };
  }, null, { timeout: 30_000 }).then((h) => h.jsonValue());
  expect(painted.fill, 'the residual fill must be on the map').toBe(true);
  expect(painted.text, 'a successful paint must not show the failure notice').not.toContain('Could not load country data');
  expect(painted.text, 'the legend names the two metrics it painted').toContain('Life expectancy');
});

test('#R545 ② a rejected reload during the residual map ends at the failure pill, not in silence', async () => {
  /* THE STATE ensureCountriesSrc EXISTS TO REPAIR, produced the way the app produces it: a basemap
     style swap drops the `countries` source and every layer standing on it (js/app-body.js #R29).
     With the reload also failing there is nothing to repair it WITH — and «cannot recover» must not
     mean «say nothing», which is what it meant. */
  const gone = await page.evaluate(() => {
    const m = window.__imap;
    (m.getStyle().layers || []).filter((l) => l.source === 'countries')
      .forEach((l) => { try { m.removeLayer(l.id); } catch (_) { } });
    try { m.removeSource('countries'); } catch (_) { }
    window.__imFailCountryData = true;
    return {
      src: window.IntMapGeoEngine.layers.hasSource('countries'),
      fill: window.IntMapGeoEngine.layers.has('corr-resid-fill'),
    };
  });
  expect(gone.src, 'the fixture needs the countries source ABSENT').toBe(false);
  expect(gone.fill, 'the fixture needs the previous residual fill gone with its source').toBe(false);

  await openPanel();
  await page.waitForSelector('#corr-resid-btn', { state: 'attached', timeout: 30_000 });
  expect(await pillText(), 'the pill must not already be showing the failure notice').not.toContain('Could not load country data');

  await page.evaluate(() => { document.getElementById('corr-resid-btn').click(); });
  /* the chooser closes first, so from here the reader is looking at the map: either it is painted or
     they are told why not. Before the fix neither happened — ensureCountriesSrc's `.then` never ran,
     so paint() was never called again, its retry counter never reached its limit, and
     residPill(…, true) was unreachable. */
  const said = await page.waitForFunction(() => {
    const p = document.getElementById('corr-resid-pill');
    if (!p || p.style.display === 'none') return null;
    const s = (p.textContent || '').trim();
    return /Could not load country data/.test(s) ? s : null;
  }, null, { timeout: 30_000 }).then((h) => h.jsonValue(), () => null);

  expect(said, `the residual map stopped silently — the dialog closed and nothing was drawn or said (pill: ${JSON.stringify(await pillText())})`).not.toBeNull();
  expect(await page.evaluate(() => window.IntMapGeoEngine.layers.has('corr-resid-fill')),
    'nothing may be painted from data that never arrived').toBe(false);
});

test('#R545 ① a country-data load that REJECTS ends in an honest notice, not «Loading…» for ever', async () => {
  /* The panel's own gate for «do I have anything to plot» is `window.countryGeo` beside the stats
     table, and until the load lands that global is not there. This is that moment, with a load that
     will not land: the reject arm the chain never had. ⚠ Nothing after this test may need the
     geometry — it is not given back, which is why this one runs last. */
  await page.evaluate(() => { window.countryGeo = null; window.__imFailCountryData = true; });

  await openPanel();
  const said = await page.waitForFunction(() => {
    const w = document.querySelector('#corr-overlay .corr-svg-wrap');
    const s = w ? (w.textContent || '').trim() : '';
    return /Could not load country data/.test(s) ? s : null;
  }, null, { timeout: 25_000 }).then((h) => h.jsonValue(), () => null);

  expect(said, `the panel never answered the failed load; the card is showing: ${JSON.stringify(await wrapText())}`).not.toBeNull();
});
