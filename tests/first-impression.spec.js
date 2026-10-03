/* ============================================================================
 *  first-impression — the state a reader meets on their FIRST visit, asked of a running app.
 * ----------------------------------------------------------------------------
 *  ONE cold boot (no storage at all: no `intmap_session2`, no cache, Service Worker blocked) at the
 *  1024×768 desktop size the report was measured on, then three questions about it:
 *
 *   ①  the map has the whole window: neither sidebar opened itself. A panel opens when the reader
 *      opens it, and nothing on a first visit is a reason for one to open itself.
 *   ②  the boot did not buy what nobody asked for: no layer-panel thumbnail (`preview_*.png`) and no
 *      world gazetteer (`data/gazetteer-world.json.gz`) is requested before the reader reaches for
 *      the panel or the search box — and when they do, each one IS requested (a deferred fetch,
 *      never a lost one).
 *   ③  the year is on the first screen: the Chronos entry carries a year rail, and a mark on it
 *      sends the master clock to that year.
 *
 *  ⚠ This spec does NOT use the shared-page fixture or the suite's seeded storage: its subject is the
 *  unseeded first visit, which is exactly what the seed exists to avoid (tests/helpers/session-seed.js).
 *  It measures same-origin bytes only — the hermetic routing blocks every third-party host, so a
 *  third-party figure here would be a figure about the blocker.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { BASE } from './helpers/session-seed.js';
import { installHermeticRouting } from './helpers/network.js';

test.describe.configure({ mode: 'serial' });

let context, page;
const ledger = [];            /* every same-origin response: { path, bytes, t } */
let t0 = 0, tReady = 0;
const isPreview = (p) => /\/preview_[^/]*\.png$/.test(p);
const isWorldGaz = (p) => /\/data\/gazetteer-world\.json\.gz$/.test(p);

test.beforeAll(async ({ browser }) => {
  /* ⚠ storageState IS WRITTEN OUT, EMPTY. playwright.config.js gives every context — browser.newContext() included —
     the suite's seeded session (tests/helpers/session-seed.js), so leaving it out booted this «first visit» with a
     saved answer for both columns: ① passed while asking nothing about the unanswered case (MEASURED: when the
     seed gained `sbOpen:true`, ① went red on the left column). The init script records what the page found. */
  context = await browser.newContext({ viewport: { width: 1024, height: 768 }, serviceWorkers: 'block',
    timezoneId: 'UTC', locale: 'en-US', colorScheme: 'light', storageState: { cookies: [], origins: [] } });
  await context.addInitScript(() => { try { window.__fiBootSession = localStorage.getItem('intmap_session2'); } catch (_) { window.__fiBootSession = 'unreadable'; } });
  await installHermeticRouting(context);
  /* the CONTEXT's event, not the page's: js/data-door.js fetches the shipped data/ files from a Worker */
  context.on('requestfinished', async (req) => {
    try {
      const u = new URL(req.url());
      if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return;
      const s = await req.sizes();
      ledger.push({ path: u.pathname, bytes: (s.responseBodySize || 0) + (s.responseHeadersSize || 0), t: Date.now() - t0 });
    } catch (_) { /* a request that finished after the context closed */ }
  });
  page = await context.newPage();
  t0 = Date.now();
  await page.goto(BASE + '/');
  await page.waitForFunction(() => { try { return window.IntMapGeoEngine.canDraw(); } catch (_) { return false; } }, null, { timeout: 60_000 });
  tReady = Date.now();
});
test.afterAll(async () => { await context?.close(); });

test('① a first visit at desktop width boots with the map full-width and both panels shut', async () => {
  /* the right panel used to open on the first idle (≤3 s after its 1.5 s build) — wait past both */
  await page.waitForTimeout(6000);
  const st = await page.evaluate(() => {
    const sb = document.getElementById('sidebar'), lsr = document.getElementById('layer-sidebar-r');
    const canvas = document.querySelector('.map-container canvas') || document.querySelector('canvas');
    const vis = (el) => { if (!el) return 0; const r = el.getBoundingClientRect();
      /* the width of the panel that is actually inside the window */
      return Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)); };
    return {
      stored: localStorage.getItem('intmap_session2'),
      bootSession: window.__fiBootSession,
      leftCollapsed: !!sb && sb.classList.contains('collapsed'),
      rightOpen: !!lsr && lsr.classList.contains('open'),
      lsrBody: document.body.classList.contains('lsr-open'),
      leftOnScreen: sb && sb.classList.contains('collapsed') ? 0 : vis(sb),
      canvasW: canvas ? Math.round(canvas.getBoundingClientRect().width) : 0,
      innerW: innerWidth,
    };
  });
  console.log('[first-impression] panels', JSON.stringify(st));
  /* the first screen, kept beside the result for a reader of the run */
  await page.screenshot({ path: test.info().outputPath('first-screen.png') });
  expect(st.bootSession, 'the page booted with NO saved session — this is the unanswered first visit').toBeNull();
  expect(st.leftCollapsed, 'the left sidebar is shut on a first visit').toBe(true);
  expect(st.rightOpen, 'the right layer panel is shut on a first visit').toBe(false);
  expect(st.lsrBody).toBe(false);
  /* the map is the window, not the strip between two panels */
  expect(st.canvasW).toBeGreaterThanOrEqual(st.innerW - 2);
});

test('② the boot fetches no layer thumbnail and no world gazetteer; reaching for them fetches them', async () => {
  /* the old desktop gate opened at the map's first idle or a 6 s ceiling, and the world gazetteer
     arrived with the boot's first news-locator pass — measure the boot over 16 s from the first draw */
  await page.waitForTimeout(Math.max(0, 16000 - (Date.now() - tReady)));
  const boot = ledger.slice();
  const sum = (rows) => rows.reduce((a, r) => a + r.bytes, 0);
  const previews = boot.filter((r) => isPreview(r.path));
  const gaz = boot.filter((r) => isWorldGaz(r.path));
  console.log('[first-impression] boot same-origin', JSON.stringify({ requests: boot.length, bytes: sum(boot),
    previews: previews.length, previewBytes: sum(previews), gazetteer: gaz.length, gazetteerBytes: sum(gaz) }));
  expect(previews.map((r) => r.path), 'no thumbnail before the panel is opened').toEqual([]);
  expect(gaz.map((r) => r.path), 'no world gazetteer before anyone searches').toEqual([]);
  /* ⚠ the request ledger is not the only witness: js/data-door.js reads data/ from a Worker, and a
     Worker's request is not always reported to the context (MEASURED: the boot's read was, a later one
     after the focus below was not — while the rows arrived). The reader's own state says it either way:
     `world()` is null until the rows have been read. */
  expect(await page.evaluate(() => window.IntMapGazetteer.world()), 'the world rows were never read at boot').toBeNull();

  /* the reader opens the Layers panel — the thumbnails come */
  const nBefore = ledger.length;
  await page.click('#btn-layers');
  await expect.poll(() => ledger.slice(nBefore).filter((r) => isPreview(r.path)).length,
    { timeout: 20_000, message: 'opening the panel fetches its thumbnails' }).toBeGreaterThan(0);
  /* …and the reader reaches for the search box — the world gazetteer comes */
  await page.evaluate(() => { const b = document.getElementById('layer-sidebar-r'); if (b && b.classList.contains('open') && window.IntMapLayerSidebar) window.IntMapLayerSidebar.close(); });
  await page.focus('#ms-input');
  /* focusing it is what fetches the world gazetteer: the rows reach the search's own reader */
  await page.waitForFunction(() => { try { const w = window.IntMapGazetteer.world(); return Array.isArray(w) && w.length > 1000; } catch (_) { return false; } }, null, { timeout: 30_000 });
});

test('③ the first screen carries the year: a mark on the Chronos rail sends the clock there', async () => {
  const rail = await page.evaluate(() => {
    const tl = document.getElementById('news-timeline'), r = document.getElementById('ntl-peek');
    const marks = r ? Array.from(r.querySelectorAll('[data-year]')) : [];
    const box = r ? r.getBoundingClientRect() : null;
    return { collapsed: tl.classList.contains('collapsed'), marks: marks.map((m) => m.dataset.year),
      shown: !!box && box.width > 120 && box.height > 0 && getComputedStyle(r).display !== 'none',
      bottom: box ? Math.round(innerHeight - box.bottom) : null };
  });
  console.log('[first-impression] rail', JSON.stringify(rail));
  expect(rail.collapsed).toBe(true);
  expect(rail.shown, 'the year rail is on the first screen').toBe(true);
  expect(rail.marks.length).toBeGreaterThanOrEqual(4);
  /* the marks are the kernel's own reach: the first is its floor, and «now» closes the rail */
  const floor = await page.evaluate(() => +window.IntMapTime.min);
  expect(+rail.marks[0]).toBe(floor);
  expect(rail.marks[rail.marks.length - 1]).toBe('now');
  /* a mark in the past travels — the same write the slider makes */
  const target = rail.marks.find((y) => y !== 'now' && +y >= 1800 && +y < 2000) || rail.marks[1];
  /* the mark is a real target under a pointer, not covered by anything */
  const hit = await page.evaluate((y) => { const m = document.querySelector('#ntl-peek [data-year="' + y + '"]');
    const r = m.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!el && (el === m || m.contains(el)); }, target);
  expect(hit, 'the mark is what a pointer at its centre lands on').toBe(true);
  await page.click('#ntl-peek [data-year="' + target + '"]');
  await expect.poll(() => page.evaluate(() => { const s = window.IntMapTime.state(); return s.isLive ? 'live' : s.year; }),
    { timeout: 10_000 }).toBe(+target);
  /* the collapsed button now names the year it is showing, as it does for any other route in */
  await expect.poll(() => page.evaluate(() => document.getElementById('news-timeline').classList.contains('active'))).toBe(true);
  /* and «now» brings it back */
  await page.click('#ntl-peek [data-year="now"]');
  await expect.poll(() => page.evaluate(() => window.IntMapTime.state().isLive), { timeout: 10_000 }).toBe(true);
});
