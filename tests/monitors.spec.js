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

/* ⚠ (#R231) MONITORS IS WITHDRAWN FROM THE TAB ROW — 「MonitorsはNews/Companies/Countries/Atlasの
   並びから一旦撤去。」 The assertions below are INVERTED rather than deleted: 一旦 means the module,
   its API, its feed element and its Supabase tables are all still here and must keep working, and
   what must NOT exist is any ROUTE that lands on the tab. A check that simply disappeared would
   leave both halves of that unguarded. */
test('Monitors module is present and exposes its API — but the TAB is withdrawn', async () => {
  const info = await page.evaluate(() => ({
    hasModule: !!window.IntMapMonitors,
    fns: window.IntMapMonitors ? Object.keys(window.IntMapMonitors).sort() : [],
    tab: !!document.getElementById('btn-monitors'),
    feed: !!document.getElementById('monitors-feed'),
    atlas: window.IntMapMonitors ? typeof window.IntMapMonitors.atlas : null,
    drawGetter: !!(window.DrawTool && window.DrawTool.currentGeometry),
  }));
  expect(info.hasModule).toBe(true);
  expect(info.tab, 'the tab button is withdrawn from the row').toBe(false);
  expect(info.feed, 'its content area stays — the feature is unreachable, not removed').toBe(true);
  expect(info.atlas).toBe('object');
  expect(info.drawGetter).toBe(true);
  for (const fn of ['render', 'create', 'openCreateDialog', 'openDetail', 'openReport', 'pause', 'resume', 'remove', 'runNow', 'activeArea']) {
    expect(info.fns, `missing ${fn}`).toContain(fn);
  }
});

/* (#R231) …and this used to assert the tab LABEL in EN + JP. With no tab there is no label; what
   replaces it is the property that matters now — the kernel command that opened it is not
   registered, so nothing (Atlas, a share link, a saved session, a keyboard command) can reach it. */
test('the tab.monitors kernel command is no longer registered', async () => {
  const r = await page.evaluate(() => {
    const cmds = (window.IntMapOS && typeof window.IntMapOS.list === 'function') ? window.IntMapOS.list() : null;
    const names = Array.isArray(cmds) ? cmds.map((c) => (typeof c === 'string' ? c : c && c.id)) : null;
    let threw = null;
    try { window.IntMapOS.exec('tab.monitors', { source: 'test' }); } catch (e) { threw = String((e && e.message) || e); }
    return { names, mode: window.__imHostMode || null, threw };
  });
  if (Array.isArray(r.names)) expect(r.names, 'tab.monitors is not a registered command').not.toContain('tab.monitors');
  /* whether the kernel throws or ignores an unknown id, what must NOT happen is the tab opening */
  const feedShown = await page.evaluate(() => {
    const f = document.getElementById('monitors-feed');
    return !!f && getComputedStyle(f).display !== 'none';
  });
  expect(feedShown, 'an unknown command must not reveal the withdrawn feed').toBe(false);
});

/* (#R231) The tab can no longer be opened at all, so the honest-empty-list property is asserted
   against the RENDERER directly — js/monitors.js is untouched and must still refuse to fake a list
   when logged out, which is what makes the feature safe to bring back. */
test('render() logged out still shows the login prompt, not a fake list', async () => {
  const html = await page.evaluate(async () => {
    window.IntMapMonitors.render();
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
  /* ⚠ (#R231) THE HONESTY REQUIREMENT IS UNCHANGED, THE HONEST ANSWER IS NOT. The action is out of
     the catalogue and out of the local plan, so the planner cannot emit it; if one arrives anyway,
     the dispatch must say the feature is unavailable rather than reply "✓ Your monitors" and open a
     tab that no longer exists. Every reply must still be ok:false — never a claimed success. */
  for (const k of ['createNoArea', 'listLoggedOut', 'createLoggedOut']) {
    expect(res[k].ok, k + ' must never claim success').toBe(false);
    expect(res[k].txt.toLowerCase()).toMatch(/not available|利用いただけません|nicht verfügbar|недоступны|no están disponibles/);
  }
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

/* ⚠ (#R231) …AND THE WORKSPACE WINDOW IS WITHDRAWN WITH IT. This used to assert the opposite —
   that #R142's missing defRects() entry was fixed and the Monitors ws-window built cleanly. The
   window is one of the routes 「一旦撤去」 closes (a desktop reader could otherwise open by name the
   panel the sidebar no longer offers), so the assertion is inverted. What is KEPT verbatim is the
   #R142 regression it was written for: entering and leaving ws-mode must raise no page errors,
   which is exactly what a window removed from DEFS but left in defRects() (or vice versa) breaks. */
test('(#R231) Workspace desktop: no Monitors window, and ws-mode still opens cleanly', async () => {
  const before = diags.pageErrors.length;
  await page.setViewportSize({ width: 1440, height: 900 });   // ws-mode is desktop-only
  const r = await page.evaluate(async () => {
    const out = { hasWs: !!window.IntMapWorkspace };
    try {
      window.IntMapWorkspace.open();
      await new Promise((res) => setTimeout(res, 400));
      out.wsActive = window.IntMapWorkspace.active();
      out.monitorsWin = !!document.querySelector('.ws-monitors');
      out.feedStillPresent = !!document.getElementById('monitors-feed');
    } catch (e) {
      out.threw = String((e && e.message) || e);
    } finally {
      try { window.IntMapWorkspace.close(); } catch (_) { /* */ }
    }
    return out;
  });
  await page.setViewportSize({ width: 675, height: 900 });
  const after = diags.pageErrors.length;
  expect(r.hasWs).toBe(true);
  expect(r.wsActive).toBe(true);
  expect(r.monitorsWin, 'the Monitors ws-window is withdrawn').toBe(false);
  expect(r.feedStillPresent, 'its content area stays in the document').toBe(true);
  expect(r.threw, `ws-mode threw: ${r.threw}`).toBeUndefined();
  expect(after - before, 'no new page errors during ws-mode open/close').toBe(0);
});

test('no uncaught page errors and no non-benign console errors', async () => {
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  expect(diags.pageErrors, `page errors:\n${diags.pageErrors.join('\n')}`).toHaveLength(0);
  const real = diags.consoleErrors.filter((t) => !isBenign(t));
  expect(real, `console errors:\n${real.join('\n')}`).toHaveLength(0);
});
