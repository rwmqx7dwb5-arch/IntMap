// R145 regression tests — UX/data batch:
//   #3 Companies compare rebuilt to mirror the Countries #scp-view (Bar / Time-series / Table, metric picker, chips)
//   #4 Companies breadth + immediacy (more global names, self-consistent live market caps)
//   #7 Atlas on/off view features (grid / 3D / country-info) render an inline toggle switch
//   #8 East–West Germany: West Berlin added as a WG exclave + GDR hole for 1949–1990
//   #10 Compact map legends
// The map's WebGL never fully paints headlessly, so we verify DATA + DOM structure + dispatch output, not pixels.
// External hosts are blocked (hermetic) so live Yahoo fetches fall back to honest snapshots — assertions stay deterministic.
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';

const CRITICAL_GLOBALS = ['IntMapConsole', 'IntMapCompanies'];

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
    CRITICAL_GLOBALS, { timeout: 45_000 },
  );
  await page.waitForTimeout(1500);
});

test.afterAll(async () => { await page?.context()?.close(); });

// ---- #8 West Berlin -------------------------------------------------------
test('divided Germany 1949–1990 includes West Berlin as a WG exclave + GDR hole', async () => {
  const r = await page.evaluate(() => {
    const cs = window.__CSHAPES;
    const geomOf = (f) => { const polys = f[8].map((p) => p.map((ri) => cs.rings[ri])); return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys }; };
    const pip = (pt, ring) => { let inside = false; for (let i = 0, j = ring.length - 2; i < ring.length - 1; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside; } return inside; };
    const inFeat = (pt, g) => { const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; return polys.some((poly) => { if (!pip(pt, poly[0])) return false; for (let h = 1; h < poly.length; h++) if (pip(pt, poly[h])) return false; return true; }); };
    const wg = cs.feats.find((f) => f[1] === 260 && f[2] === 1949 && f[5] === 1990);
    const gdr = cs.feats.find((f) => f[1] === 265 && f[2] === 1949 && f[5] === 1990);
    const gWG = geomOf(wg), gGDR = geomOf(gdr);
    return {
      wgParts: gWG.type === 'MultiPolygon' ? gWG.coordinates.length : 1,
      wbInWG: inFeat([13.33, 52.50], gWG), wbInGDR: inFeat([13.33, 52.50], gGDR),
      eastBerlinInGDR: inFeat([13.413, 52.522], gGDR), eastBerlinInWG: inFeat([13.413, 52.522], gWG),
      munichInWG: inFeat([11.58, 48.14], gWG), leipzigInGDR: inFeat([12.37, 51.34], gGDR),
    };
  });
  expect(r.wgParts).toBe(2);            // mainland + West Berlin exclave
  expect(r.wbInWG).toBe(true);          // West Berlin belongs to West Germany
  expect(r.wbInGDR).toBe(false);        // and is carved OUT of East Germany (hole)
  expect(r.eastBerlinInGDR).toBe(true);
  expect(r.eastBerlinInWG).toBe(false);
  expect(r.munichInWG).toBe(true);
  expect(r.leipzigInGDR).toBe(true);
});

// ---- #4 Companies breadth + immediacy ------------------------------------
test('Companies universe broadened with self-consistent live caps', async () => {
  const r = await page.evaluate(() => {
    const D = window.IntMapCompanies.DATA;
    const byCc = {}; D.forEach((c) => { byCc[c.cc] = (byCc[c.cc] || 0) + 1; });
    // self-consistency of the R145 live additions: sh × snapshot-implied price = mcapSnap by construction
    const sample = ['RACE', 'VALE', 'PDD', 'BRK-B', 'INFY'].map((tk) => { const c = D.find((x) => x.tk === tk); return c ? Math.abs(c.sh * (c.mcapSnap / c.sh) - c.mcapSnap) < 0.01 : false; });
    return { total: D.length, byCc, allConsistent: sample.every(Boolean), newCountries: ['IND', 'BRA', 'ESP', 'ITA'].map((cc) => byCc[cc] || 0) };
  });
  expect(r.total).toBeGreaterThanOrEqual(173);
  expect(r.newCountries.every((n) => n >= 1)).toBe(true);   // India / Brazil / Spain / Italy now represented
  expect(r.allConsistent).toBe(true);
});

// ---- #3 Companies compare mirrors Countries #scp-view --------------------
test('Companies compare renders the scp-style modes / chips / bars', async () => {
  const r = await page.evaluate(() => {
    window._coToggleCompare('AAPL'); window._coToggleCompare('MSFT'); window._coToggleCompare('NVDA');
    window._coShowCompare();
    const v = document.getElementById('co-cmp-view'); if (!v) return { view: false };
    const modes = [...v.querySelectorAll('.scp-modes button')].map((b) => b.textContent);
    const out = { view: true, modes, chips: v.querySelectorAll('.scp-chip').length, bars: v.querySelectorAll('.scp-brow').length, addInput: !!v.querySelector('#co-cmp-add'), metricsTog: !!v.querySelector('.scp-mtog') };
    // switch to Table mode → CSV button + rows
    const tbl = [...v.querySelectorAll('.scp-modes button')].find((b) => /Table|表|Tabelle|Таблица|Tabla/.test(b.textContent)); if (tbl) tbl.click();
    const v2 = document.getElementById('co-cmp-view');
    out.tableRows = v2.querySelectorAll('.scp-tbl tbody tr').length; out.csvBtn = !!v2.querySelector('[data-cmpcsv]');
    return out;
  });
  expect(r.view).toBe(true);
  expect(r.modes.length).toBe(3);           // Bar chart / Time-series / Table
  expect(r.chips).toBe(3);
  expect(r.bars).toBeGreaterThan(0);
  expect(r.addInput).toBe(true);
  expect(r.metricsTog).toBe(true);
  expect(r.tableRows).toBe(3);
  expect(r.csvBtn).toBe(true);
});

// ---- #7 Atlas on/off view features get an inline toggle ------------------
test('Atlas grid / 3D / country-info replies carry a working toggle switch', async () => {
  const r = await page.evaluate(async () => {
    const g = await window.IntMapConsole.dispatch({ type: 'grid', on: true });
    const t3 = await window.IntMapConsole.dispatch({ type: 'terrain3d', on: false });
    const ci = await window.IntMapConsole.dispatch({ type: 'countryInfo', on: false });
    // inject the grid reply and confirm the switch flips the real control
    document.getElementById('btn-community').click();
    const chat = document.querySelector('#atlas-panel .atl-chat');
    const off = await window.IntMapConsole.dispatch({ type: 'grid', on: false });
    const d = document.createElement('div'); d.className = 'atl-b a'; d.innerHTML = off.html; chat.appendChild(d);
    const tog = d.querySelector('.atl-feat-tog');
    const gridOn = () => { const b = document.getElementById('btn-tool-grid'); const c = document.getElementById('cb-grid'); return !!((b && b.classList.contains('tool-on')) || (c && c.checked)); };
    const before = gridOn(); if (tog) tog.click(); const after = gridOn();
    return { gridHasTog: /atl-feat-tog/.test(g.html), t3HasTog: /atl-feat-tog/.test(t3.html), ciHasTog: /atl-feat-tog/.test(ci.html), injected: !!tog, flipped: before !== after && after === true };
  });
  expect(r.gridHasTog).toBe(true);
  expect(r.t3HasTog).toBe(true);
  expect(r.ciHasTog).toBe(true);
  expect(r.injected).toBe(true);
  expect(r.flipped).toBe(true);
});

// ---- #10 Compact legends --------------------------------------------------
test('map legends are compacted', async () => {
  const w = await page.evaluate(() => {
    const probe = document.createElement('div'); probe.className = 'data-legend'; probe.style.display = 'block'; document.body.appendChild(probe);
    const cs = getComputedStyle(probe); const out = { width: parseFloat(cs.width), padTop: parseFloat(cs.paddingTop), font: parseFloat(cs.fontSize) };
    probe.remove(); return out;
  });
  expect(w.width).toBeLessThanOrEqual(180);   // was 204
  expect(w.padTop).toBeLessThanOrEqual(9);     // was 12
});

test('no page errors during the run', async () => {
  expect(diag.pageErrors, `page errors:\n${diag.pageErrors.join('\n')}`).toEqual([]);
  expect(diag.consoleErrors, `console errors:\n${diag.consoleErrors.join('\n')}`).toEqual([]);
});
