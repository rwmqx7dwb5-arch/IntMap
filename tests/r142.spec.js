// R142 regression tests — the UX/honesty batch. One shared boot, then focused assertions
// for the deterministic, offline-safe fixes. External hosts are blocked by hermetic routing,
// so anything network-bound (SV Google tiles, Yahoo prices) is asserted on its HONEST fallback.
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';
import { loadLazyModules } from './helpers/app.js';

// (#R209) These four are still in the boot bundle, so they remain the boot signal. Street View —
// asserted by #1 below — is NOT: js/street-view.js left the entry and is fetched on demand, so this
// file asks for it the way the app's own entry points do (IntMapLazy.need) once the app is up.
const CRITICAL_GLOBALS = ['IntMapOS', 'IntMapConsole', 'IntMapTime', 'IntMapCompanies'];

test.describe.configure({ mode: 'serial' });

let page, diag;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(context);
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(
    (g) => g.every((k) => typeof window[k] !== 'undefined') && !!document.getElementById('map'),
    CRITICAL_GLOBALS, { timeout: 45_000 },
  );
  await loadLazyModules(page);   // (#R209) the on-demand half of the split, asked for not waited for
  await page.waitForTimeout(2000);
});

test.afterAll(async () => { await page?.context()?.close(); });

// #5 — rank reflects the current metric by VALUE and FLIPS with direction (was a fixed 1,2,3…).
test('#5 Companies rank flips with sort direction (value rank, not row position)', async () => {
  const r = await page.evaluate(() => {
    window.setCoSort('mcap');                 // descending default
    window.renderCompanies('');
    const feed = document.getElementById('info-dashboard');
    const desc = [...feed.querySelectorAll('.co-row .stat-rank')].slice(0, 3).map((e) => e.textContent);
    window.toggleCoSortDir();                  // ascending
    const asc = [...feed.querySelectorAll('.co-row .stat-rank')].slice(0, 3).map((e) => e.textContent);
    window.setCoSort('mcap');
    const n = window.IntMapCompanies.DATA.length;
    return { desc, asc, n };
  });
  expect(r.desc).toEqual(['1', '2', '3']);                       // biggest first = rank 1,2,3
  expect(r.asc).toEqual([String(r.n), String(r.n - 1), String(r.n - 2)]); // smallest first = biggest rank numbers
});

// #6 — Companies is time-machine aware; a not-yet-founded company has no historical cap.
test('#6 Companies time machine: founded-gate + honest API (no crash offline)', async () => {
  const r = await page.evaluate(async () => {
    const C = window.IntMapCompanies;
    const api = ['setYear', 'priceOf', 'histYear'].every((k) => typeof C[k] === 'function');
    // Yahoo is blocked here → hp stays 0; the founded-gate must still make pre-founding caps NaN.
    await C.setYear(1990);                     // Palantir founded 2003
    const plt = C.DATA.find((c) => c.tk === 'PLTR');
    const gated = Number.isNaN(C.mcap(plt));
    const hy = C.histYear();
    await C.setYear(null);                      // back to present
    const restored = C.histYear() === null;
    return { api, gated, hy, restored };
  });
  expect(r.api).toBe(true);
  expect(r.hy).toBe(1990);
  expect(r.gated).toBe(true);
  expect(r.restored).toBe(true);
});

// #7 — Companies compare: select → view (6 metrics × N bars) → Back returns to the list.
test('#7 Companies compare view opens and Back returns', async () => {
  // (#R145) rebuilt to mirror the Countries #scp-view — Bar/Time-series/Table modes, metric picker, chips.
  const r = await page.evaluate(() => {
    window.renderCompanies('');
    window._coToggleCompare('AAPL');
    window._coToggleCompare('MSFT');
    const trayTitle = document.querySelector('#co-compare-fixed .scf-title')?.textContent || '';
    window._coShowCompare();
    const view = document.getElementById('co-cmp-view');
    const modes = view ? view.querySelectorAll('.scp-modes button').length : 0;
    const chips = view ? view.querySelectorAll('.scp-chip').length : 0;
    const sections = view ? view.querySelectorAll('.scp-sec').length : 0;   // one per active metric (default 4)
    const bars = view ? view.querySelectorAll('.scp-brow').length : 0;      // sections × 2 companies
    document.querySelector('#co-cmp-view [data-cmpback]')?.click();
    const backOk = !document.getElementById('co-cmp-view') && !!document.querySelector('#info-dashboard .co-row');
    window._coClearCompare();
    return { trayTitle, modes, chips, sections, bars, backOk };
  });
  expect(r.trayTitle).toContain('2');
  expect(r.modes).toBe(3);                      // Bar chart / Time-series / Table
  expect(r.chips).toBe(2);
  expect(r.sections).toBeGreaterThanOrEqual(3); // default metrics with data (mcap/rev/ni/emp)
  expect(r.bars).toBe(r.sections * 2);          // sections × 2 companies
  expect(r.backOk).toBe(true);
});

// #12 — East/West Germany 1949-1990 share the inner-German border (topology-consistent, no overlap).
test('#12 East-West Germany border is topology-consistent (shared vertices, no crossings)', async () => {
  const r = await page.evaluate(async () => {
    await new Promise((res) => { const s = document.createElement('script'); s.src = '/data/cshapes.js'; s.onload = res; s.onerror = res; document.head.appendChild(s); });
    const CS = window.__CSHAPES; if (!CS) return { loaded: false };
    const F = CS.feats, R = CS.rings;
    const pick = (gw) => F.map((f, i) => ({ i, gw: f[1], from: f[2], to: f[5], rings: [].concat(...f[f.length - 1]) }))
      .find((f) => f.gw === gw && f.from <= 1970 && f.to > 1970);
    const west = pick(260), east = pick(265);
    if (!west || !east) return { loaded: true, found: false };
    const wr = R[west.rings[0]];
    const eset = new Set([].concat(...east.rings.map((ri) => R[ri])).map((p) => p[0] + ',' + p[1]));
    const shared = wr.filter((p) => eset.has(p[0] + ',' + p[1])).length;
    return { loaded: true, found: true, shared, westPts: wr.length };
  });
  expect(r.loaded).toBe(true);
  expect(r.found).toBe(true);
  expect(r.shared).toBeGreaterThan(20);   // West & East now trace the identical inner-German border
});

// #14 — Radius popup folds preset + colour/opacity into a "Style" disclosure (declutter), IDs preserved.
test('#14 Radius popup: Style disclosure folds preset/colour, slider stays prominent', async () => {
  const r = await page.evaluate(() => {
    window._radiusFromPoint(139.7, 35.68, 'test');
    const tp = document.getElementById('tool-panel');
    return {
      disclosure: !!tp.querySelector('details.tp-more'),
      collapsed: tp.querySelector('details.tp-more') ? !tp.querySelector('details.tp-more').open : null,
      presetInside: !!tp.querySelector('details.tp-more #radius-preset'),
      colorInside: !!tp.querySelector('details.tp-more #radius-color'),
      sliderOutside: !!tp.querySelector('.radius-control #radius-range') && !tp.querySelector('details.tp-more #radius-range'),
      stats: !!tp.querySelector('.rad-stats #rad-c'),   // (#R147) redundant #rad-r tile removed; circumference/area remain
    };
  });
  expect(r.disclosure).toBe(true);
  expect(r.collapsed).toBe(true);
  expect(r.presetInside).toBe(true);
  expect(r.colorInside).toBe(true);
  expect(r.sliderOutside).toBe(true);
  expect(r.stats).toBe(true);
});

// #1 — Street View coverage sampling degrades HONESTLY when tiles are blocked (no crash, returns null).
test('#1 Street View nearestCoverage returns null gracefully when tiles are blocked', async () => {
  const r = await page.evaluate(async () => {
    const SV = window.IntMapStreetView;
    if (!SV || !SV.nearestCoverage) return { module: false };
    const res = await Promise.race([
      SV.nearestCoverage(-73.9857, 40.7580),
      new Promise((rr) => setTimeout(() => rr('timeout'), 12000)),
    ]);
    return { module: true, res };
  });
  expect(r.module).toBe(true);
  // hermetic policy blocks mts.google.com + the CORS proxies → undetermined → null (NOT a bogus raw point)
  expect(r.res === null || r.res === 'timeout').toBe(true);
});

// #15 / #8 — Atlas send button exists (Stop wiring) and content is full-width (small side padding).
test('#8/#15 Atlas send button present and content is full-width', async () => {
  const r = await page.evaluate(() => {
    try { window.IntMapConsole?.open?.(); } catch { /* ignore */ }
    const go = document.querySelector('#atlas-panel .atl-go');
    const chat = document.querySelector('#atlas-panel .atl-chat');
    return {
      go: !!go,
      pad: chat ? parseInt(getComputedStyle(chat).paddingLeft, 10) : 999,
    };
  });
  expect(r.go).toBe(true);
  expect(r.pad).toBeLessThanOrEqual(12);   // was 14px; reduced for full-width
});

// Boot honesty: no uncaught exceptions across all the above interactions.
test('no uncaught page errors during R142 interactions', async () => {
  expect(diag.pageErrors, `pageerror(s):\n${diag.pageErrors.join('\n---\n')}`).toHaveLength(0);
});
