// (#R141) Area-monitors UI + Atlas-integration browser tests.
// Hermetic (all external hosts blocked, incl. Supabase — see helpers/network.js), so these
// exercise DOM/structure, the login gating, the honest Atlas routing, the geometry accessor,
// and — critically — that a report renders XSS-inert. The logged-in DB round-trip is proven
// separately by pgTAP (RLS) + the Node logic tests; here we prove the client never lies about
// success and never injects untrusted report/monitor text as live HTML.
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics, isBenign } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

let page, diags;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(context);
  page = await context.newPage();
  diags = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(() => typeof window.IntMapMonitors !== 'undefined', null, { timeout: 45_000 });
});

test.afterAll(async () => {
  await page?.context()?.close();
});

test('Monitors module + tab are present and the module exposes its API', async () => {
  const info = await page.evaluate(() => ({
    hasModule: !!window.IntMapMonitors,
    fns: window.IntMapMonitors ? Object.keys(window.IntMapMonitors).sort() : [],
    tab: !!document.getElementById('btn-monitors'),
    feed: !!document.getElementById('monitors-feed'),
    atlas: window.IntMapMonitors ? typeof window.IntMapMonitors.atlas : null,
    drawGetter: !!(window.DrawTool && window.DrawTool.currentGeometry),
  }));
  expect(info.hasModule).toBe(true);
  expect(info.tab).toBe(true);
  expect(info.feed).toBe(true);
  expect(info.atlas).toBe('object');
  expect(info.drawGetter).toBe(true);
  for (const fn of ['render', 'create', 'openCreateDialog', 'openDetail', 'openReport', 'pause', 'resume', 'remove', 'runNow', 'activeArea']) {
    expect(info.fns, `missing ${fn}`).toContain(fn);
  }
});

test('tab label localizes across languages (EN + JP)', async () => {
  const en = await page.evaluate(() => { document.getElementById('lang-en')?.click(); return document.getElementById('btn-monitors').textContent.trim(); });
  expect(en).toBe('Monitors');
  const jp = await page.evaluate(() => { document.getElementById('lang-jp')?.click(); return document.getElementById('btn-monitors').textContent.trim(); });
  expect(jp).toBe('モニター');
  await page.evaluate(() => document.getElementById('lang-en')?.click());
});

test('opening the Monitors tab (logged out) shows the login prompt, not a fake list', async () => {
  const html = await page.evaluate(async () => {
    try { window.IntMapOS.exec('tab.monitors', { source: 'test' }); } catch (e) { return 'exec-err:' + e.message; }
    await new Promise((r) => setTimeout(r, 300));
    return document.getElementById('monitors-feed').innerHTML;
  });
  expect(html).toContain('mon-empty');
  expect(html.toLowerCase()).toMatch(/log in/);
  expect(html).toContain('mon-login-btn');
});

test('Atlas monitor action is HONEST: never claims success when it cannot', async () => {
  /* (#R224) the Atlas kernel is fetched on demand — ask for it, as a reader's first click does */
  await page.waitForFunction(() => !!window.IntMapAtlas, null, { timeout: 45_000 });
  await page.evaluate(() => window.IntMapAtlas.ensure());
  const res = await page.evaluate(async () => {
    const out = {};
    // Extract plain text via an INERT DOMParser document (never executes scripts /
    // fires onerror, and — unlike a tag-stripping regex — can't be defeated by
    // malformed markup; also silences CodeQL js/incomplete-multi-character-sanitization).
    const asText = (h) => (new DOMParser().parseFromString(String(h || ''), 'text/html').body.textContent || '');
    // no area selected → must ask for one, not create
    const create0 = await window.IntMapConsole.dispatch({ type: 'monitor', op: 'create' });
    out.createNoArea = { ok: create0.ok, txt: asText(create0.html) };
    // list (logged out) → must say login required, not open an empty list as success
    const list0 = await window.IntMapConsole.dispatch({ type: 'monitor', op: 'list' });
    out.listLoggedOut = { ok: list0.ok, txt: asText(list0.html) };
    // with an area but logged out → login required
    if (window._radiusFromPoint) window._radiusFromPoint(139.7, 35.68);
    const create1 = await window.IntMapConsole.dispatch({ type: 'monitor', op: 'create' });
    out.createLoggedOut = { ok: create1.ok, txt: asText(create1.html) };
    return out;
  });
  expect(res.createNoArea.ok).toBe(false);
  expect(res.createNoArea.txt.toLowerCase()).toMatch(/radius|area|region|範囲/);
  expect(res.listLoggedOut.ok).toBe(false);
  expect(res.listLoggedOut.txt.toLowerCase()).toMatch(/log in|ログイン/);
  expect(res.createLoggedOut.ok).toBe(false);
  expect(res.createLoggedOut.txt.toLowerCase()).toMatch(/log in|ログイン/);
});

test('activeArea() captures a radius circle as a real Polygon geometry', async () => {
  const a = await page.evaluate(() => {
    if (window._radiusFromPoint) window._radiusFromPoint(2.35, 48.85);
    return window.IntMapMonitors.activeArea();
  });
  expect(a).toBeTruthy();
  expect(a.geometry_kind).toBe('circle');
  expect(a.geometry.type).toBe('Polygon');
  expect(a.center_lng).toBeCloseTo(2.35, 2);
  expect(Array.isArray(a.bbox)).toBe(true);
  expect(a.radius_km).toBeGreaterThan(0);
});

test('a report renders XSS-INERT (untrusted headline/claim/evidence are escaped, no script runs)', async () => {
  const result = await page.evaluate(async () => {
    window.__xss = 0;
    const evilReport = {
      id: 'r1', run_id: 'run1', monitor_id: 'mon1', severity: 'high',
      headline: '<img src=x onerror="window.__xss=1">PWNED',
      summary: 'A <script>window.__xss=2<\/script> summary',
      changes: [{ claim: 'Claim with <img src=y onerror="window.__xss=3"> payload', evidence_ids: ['ev_1'] }],
      unchanged: ['<b>should be text</b>'], data_gaps: [], limitations: ['loc note'],
      metrics: { articles: { prev: 0, cur: 2, delta: 2 }, new_clusters: 1, publishers: { prev: 0, cur: 2 } },
      change_points: [], created_at: new Date().toISOString(),
    };
    await window.IntMapMonitors.openReport(evilReport);
    await new Promise((r) => setTimeout(r, 250));
    const ov = document.querySelector('.mon-ov-report');
    const headEl = ov ? ov.querySelector('.mon-h3') : null;
    const res = {
      overlay: !!ov,
      xss: window.__xss,
      // the payload must appear as TEXT, and there must be NO live <img onerror> node injected from it
      headlineText: headEl ? headEl.textContent : '',
      injectedImg: ov ? ov.querySelectorAll('img[onerror]').length : -1,
      injectedScript: ov ? ov.querySelectorAll('script').length : -1,
      hasChange: ov ? ov.querySelectorAll('.mon-change').length : 0,
      hasMetrics: ov ? !!ov.querySelector('.mon-metrics') : false,
    };
    if (ov) ov.remove();
    return res;
  });
  expect(result.overlay).toBe(true);
  expect(result.xss, 'no injected handler/script executed').toBe(0);
  expect(result.injectedImg, 'no live <img onerror> injected').toBe(0);
  expect(result.injectedScript, 'no <script> injected into the overlay').toBe(0);
  expect(result.headlineText).toContain('PWNED');           // shown as text
  expect(result.headlineText).toContain('<img');            // escaped literal, not a node
  expect(result.hasChange).toBe(1);
  expect(result.hasMetrics).toBe(true);
});

test('the create dialog is login-gated (logged out → auth modal, no create dialog)', async () => {
  const r = await page.evaluate(async () => {
    window.IntMapMonitors.openCreateDialog();
    await new Promise((res) => setTimeout(res, 150));
    return { createDialog: !!document.querySelector('.mon-ov-create'), authModalShown: !!document.getElementById('auth-modal') };
  });
  expect(r.createDialog).toBe(false);   // never opens the create form when logged out
  expect(r.authModalShown).toBe(true);  // it routes to login instead
});

test('(#R144) Workspace desktop: the Monitors window has a default rect — opening ws-mode does not throw', async () => {
  // Regression guard for R142: the R141 Monitors window had NO defRects() entry, so
  // mkWin() got an undefined rect and clampRect(undefined) threw at every desktop
  // ws-mode boot (silently swallowed). Prove the window is now created cleanly and
  // that entering/leaving ws-mode raises no page errors.
  const before = diags.pageErrors.length;
  await page.setViewportSize({ width: 1440, height: 900 });   // ws-mode is desktop-only
  const r = await page.evaluate(async () => {
    const out = { hasWs: !!window.IntMapWorkspace };
    try {
      window.IntMapWorkspace.open();                            // enter ws-mode → builds all windows (incl. hidden Monitors)
      await new Promise((res) => setTimeout(res, 400));
      out.wsActive = window.IntMapWorkspace.active();
      out.monitorsWin = !!document.querySelector('.ws-monitors');  // the window wrapper exists = mkWin succeeded (no clampRect throw)
      out.feedStillPresent = !!document.getElementById('monitors-feed');
      // unhide + render it in ws-mode (mobile tab code path must not run here)
      try { window.IntMapOS.exec('tab.monitors', { source: 'test' }); } catch (e) { out.execErr = String(e && e.message || e); }
      await new Promise((res) => setTimeout(res, 250));
      out.monitorsRendered = !!document.querySelector('.ws-monitors .mon-wrap, .ws-monitors .mon-empty');
    } catch (e) {
      out.threw = String(e && e.message || e);
    } finally {
      try { window.IntMapWorkspace.close(); } catch (_) { /* */ }
    }
    return out;
  });
  await page.setViewportSize({ width: 675, height: 900 });     // restore the mobile-ish default for later assertions
  const after = diags.pageErrors.length;
  expect(r.hasWs).toBe(true);
  expect(r.wsActive).toBe(true);
  expect(r.monitorsWin, 'the Monitors ws-window must be created (defRects entry present)').toBe(true);
  expect(r.feedStillPresent).toBe(true);
  expect(r.threw, `ws-mode threw: ${r.threw}`).toBeUndefined();
  expect(r.execErr, `tab.monitors exec threw: ${r.execErr}`).toBeUndefined();
  expect(r.monitorsRendered, 'Monitors content renders inside its ws-window').toBe(true);
  expect(after - before, 'no new page errors during ws-mode open/close').toBe(0);
});

test('no uncaught page errors and no non-benign console errors', async () => {
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  expect(diags.pageErrors, `page errors:\n${diags.pageErrors.join('\n')}`).toHaveLength(0);
  const real = diags.consoleErrors.filter((t) => !isBenign(t));
  expect(real, `console errors:\n${real.join('\n')}`).toHaveLength(0);
});
