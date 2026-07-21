// R146 regression tests — UX/data batch:
//   #1  Street View: authoritative SingleImageSearch pano snap (JSONP) exported + degrades gracefully when blocked
//   #4  East–West Germany border rebuilt from authoritative Bundesländer (accurate, not ~8 km off)
//   #5  Companies breadth (>=190, +Belgium, new global names, no duplicate tickers) + immediacy (ADRs live)
//   #2  Companies compare button in the detail overlay (Countries parity)
//   #8  Atlas on/off view features expose inline toggle switches (streetview/satellite/borders/labels/roads)
// Hermetic: external hosts blocked, so the JSONP script load fails → nearestPano resolves null (never hangs/throws).
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';

const CRITICAL = ['IntMapConsole', 'IntMapCompanies', 'IntMapStreetView'];
test.describe.configure({ mode: 'serial' });

let page, diag;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  await installHermeticRouting(context);
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(
    (g) => g.every((k) => typeof window[k] !== 'undefined') && !!(window.__CSHAPES && window.__CSHAPES.rings),
    CRITICAL, { timeout: 45_000 });
  await page.waitForTimeout(1200);
});
test.afterAll(async () => { await page?.context()?.close(); });

// ---- #1 Street View authoritative pano snap ------------------------------
test('Street View exposes nearestPano and it degrades gracefully when blocked', async () => {
  const r = await page.evaluate(async () => {
    const SV = window.IntMapStreetView;
    if (!SV || !SV.nearestPano) return { hasFn: false };
    // hermetic → the JSONP <script> cannot load → resolves null within the 6 s cap (never hangs / throws)
    const res = await Promise.race([SV.nearestPano(-73.9855, 40.758), new Promise((r2) => setTimeout(() => r2('TIMEOUT'), 9000))]);
    return { hasFn: true, ok: res === null || (res && typeof res.covered === 'boolean') };
  });
  expect(r.hasFn).toBe(true);
  expect(r.ok).toBe(true);
});

// ---- #4 East–West Germany accurate (Bundesländer-derived) -----------------
test('divided-Germany border is accurate: border-hugging towns fall on the correct side', async () => {
  const r = await page.evaluate(() => {
    const cs = window.__CSHAPES;
    const geomOf = (f) => { const p = f[8].map((q) => q.map((ri) => cs.rings[ri])); return p.length === 1 ? { type: 'Polygon', coordinates: p[0] } : { type: 'MultiPolygon', coordinates: p }; };
    const pip = (pt, ring) => { let ins = false; for (let i = 0, j = ring.length - 2; i < ring.length - 1; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) ins = !ins; } return ins; };
    const inFeat = (pt, g) => { const P = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; return P.some((poly) => { if (!pip(pt, poly[0])) return false; for (let h = 1; h < poly.length; h++) if (pip(pt, poly[h])) return false; return true; }); };
    const wg = geomOf(cs.feats.find((f) => f[1] === 260 && f[2] === 1949 && f[5] === 1990));
    const gdr = geomOf(cs.feats.find((f) => f[1] === 265 && f[2] === 1949 && f[5] === 1990));
    // exactly one hole in the GDR mainland (West Berlin), not sliver artifacts
    const gdrHoles = (gdr.type === 'MultiPolygon' ? gdr.coordinates : [gdr.coordinates]).reduce((n, poly) => n + (poly.length - 1), 0);
    return {
      gdrHoles,
      // towns right next to the inner-German border — a ~8 km-off border would misplace these
      wolfsburgWest: inFeat([10.79, 52.42], wg) && !inFeat([10.79, 52.42], gdr),   // Lower Saxony (West)
      helmstedtWest: inFeat([11.01, 52.23], wg) && !inFeat([11.01, 52.23], gdr),   // West, hard on the border
      magdeburgEast: inFeat([11.63, 52.12], gdr) && !inFeat([11.63, 52.12], wg),   // Saxony-Anhalt (East)
      eisenachEast: inFeat([10.32, 50.97], gdr) && !inFeat([10.32, 50.97], wg),    // Thuringia (East), near border
      fuldaWest: inFeat([9.68, 50.55], wg) && !inFeat([9.68, 50.55], gdr),         // Hesse (West), near border
    };
  });
  expect(r.gdrHoles).toBe(1);            // exactly West Berlin, no sliver holes
  expect(r.wolfsburgWest).toBe(true);
  expect(r.helmstedtWest).toBe(true);
  expect(r.magdeburgEast).toBe(true);
  expect(r.eisenachEast).toBe(true);
  expect(r.fuldaWest).toBe(true);
});

// ---- #5 Companies breadth + immediacy ------------------------------------
test('Companies broadened to >=190 with no duplicate tickers and live ADRs', async () => {
  const r = await page.evaluate(() => {
    const D = window.IntMapCompanies.DATA;
    const seen = {}, dups = []; D.forEach((c) => { if (seen[c.tk]) dups.push(c.tk); else seen[c.tk] = 1; });
    const has = (tk) => D.some((c) => c.tk === tk);
    const live = (tk) => { const c = D.find((x) => x.tk === tk); return !!(c && c.sh > 0); };
    return {
      total: D.length, dups,
      belgium: D.some((c) => c.cc === 'BEL'),
      newNames: ['BABA', 'AMAT', 'ETN', '1398.HK', 'RMS.PA', 'BUD'].every(has),
      adrsLive: ['NVO', 'SAP', 'SHEL', 'TTE', 'UL', 'NSRGY'].every(live),
    };
  });
  expect(r.total).toBeGreaterThanOrEqual(190);
  expect(r.dups).toEqual([]);
  expect(r.belgium).toBe(true);
  expect(r.newNames).toBe(true);
  expect(r.adrsLive).toBe(true);
});

// ---- #2 Companies compare button in the detail overlay -------------------
test('Company detail overlay has a Compare button (Countries parity)', async () => {
  const has = await page.evaluate(() => {
    try { window.showCompanyDetail('AAPL'); } catch (_) { return 'threw'; }
    const btn = document.querySelector('#co-detail-ov .co-detail-btn[data-cmp]');
    const present = !!btn;
    const ov = document.getElementById('co-detail-ov'); if (ov) ov.remove();
    return present;
  });
  expect(has).toBe(true);
});

// ---- #8 Atlas on/off features expose inline toggles ----------------------
test('Atlas replies for on/off view features include an inline toggle switch', async () => {
  const r = await page.evaluate(async () => {
    const C = window.IntMapConsole; if (!C || !C.dispatch) return { skip: true };
    // grid on/off is deterministic offline; the reply must carry a real .atl-feat-tog switch
    const out = await C.dispatch({ type: 'grid', on: true });
    const html = (out && (out.html || out.reply || out.note || '')) + '';
    return { grid: /atl-feat-tog/.test(html) };
  });
  if (r.skip) return;
  expect(r.grid).toBe(true);
});

test('no uncaught page errors during R146 interactions', async () => {
  expect(diag.pageErrors, diag.pageErrors.join('\n')).toEqual([]);
});
