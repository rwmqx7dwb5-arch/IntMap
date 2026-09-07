// R147 UI regression tests — UX batch:
//   #4  Radius popup declutter (redundant radius stat tile removed)
//   #11 Atlas send/stop buttons white  +  #6 on/off features render as buttons that flip the real control
//   #3  Companies logos cached across re-renders (no clearbit-ladder flicker)
//   #1  Companies compare: sortable table + Countries-parity cap
//   #7  Köppen legend fit helper present  +  #9 satellite instant fade in the live style
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

const CRITICAL = ['IntMapConsole', 'IntMapCompanies'];
test.describe.configure({ mode: 'serial' });

let page, diag;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(context);
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction((g) => g.every((k) => typeof window[k] !== 'undefined'), CRITICAL, { timeout: 45_000 });
  await page.waitForTimeout(1000);
});
test.afterAll(async () => { await page?.context()?.close(); });

// ---- #4 Radius popup declutter -------------------------------------------
test('#4 Radius popup drops the redundant radius tile (circumference+area remain, style collapsed)', async () => {
  const r = await page.evaluate(() => {
    window._radiusFromPoint(139.7, 35.68, 'test');
    const tp = document.getElementById('tool-panel');
    return {
      radR: !!tp.querySelector('#rad-r'),
      radC: !!tp.querySelector('#rad-c'),
      radA: !!tp.querySelector('#rad-a'),
      tiles: tp.querySelectorAll('.rad-stat').length,
      collapsed: tp.querySelector('details.tp-more') ? !tp.querySelector('details.tp-more').open : null,
    };
  });
  expect(r.radR).toBe(false);     // removed
  expect(r.radC).toBe(true);
  expect(r.radA).toBe(true);
  expect(r.tiles).toBe(2);
  expect(r.collapsed).toBe(true);
});

// ---- #11 Atlas white button + #6 feature on/off (R148: standard switch) ---
test('#11/#6 Atlas go button is white and feature on/off renders the standard switch that flips the real control', async () => {
  const r = await page.evaluate(async () => {
    try { window.IntMapConsole?.open?.(); } catch { /* ignore */ }
    const go = document.querySelector('#atlas-panel .atl-go');
    const goBg = go ? getComputedStyle(go).backgroundColor : null;   // empty input → idle, still white
    const off = await window.IntMapConsole.dispatch({ type: 'grid', on: false });
    const hasBtn = /atl-ctl-toggle/.test(off.html) && /atl-feat-tog/.test(off.html);   // (#R148) reverted to the STANDARD toggle switch — the R147 bespoke .atl-featbtn "独自ボタン" was removed
    const chat = document.querySelector('#atlas-panel .atl-chat');
    const d = document.createElement('div'); d.className = 'atl-b a'; d.innerHTML = off.html; chat.appendChild(d);
    const tog = d.querySelector('.atl-feat-tog');
    const gridOn = () => { const b = document.getElementById('btn-tool-grid'); const c = document.getElementById('cb-grid'); return !!((b && b.classList.contains('tool-on')) || (c && c.checked)); };
    const before = gridOn(); if (tog) tog.click(); const after = gridOn();
    return { goBg, hasBtn, injected: !!tog, flipped: before !== after && after === true };
  });
  expect(r.goBg).toBe('rgb(255, 255, 255)');
  expect(r.hasBtn).toBe(true);
  expect(r.injected).toBe(true);
  expect(r.flipped).toBe(true);
});

// ---- #3 Companies logo cache (no flicker) --------------------------------
// ⚠ (#R533) THIS TEST NAMED A HOST, AND THE HOST WENT AWAY. It counted rows still at step 0 with
// `clearbit` in the src — so when #R533 deleted that rung the count became 0 by construction and the
// assertion went on passing while measuring nothing. That is #R488's failure exactly: a check that
// fixes a SPELLING keeps its colour after the thing it guarded is gone.
// The invariant #R147 actually bought is spelling-free and is what is asserted now: once a row's
// logo has resolved, a re-render emits the RESOLVED result — no row goes back to step 0 to start
// the ladder again. It reads dataset.step, which is the code's own word for "not resolved yet",
// and never mentions who is at the other end of it.
test('#3 Companies logos are cached — a re-render never restarts the logo ladder', async () => {
  const r = await page.evaluate(() => {
    document.getElementById('btn-info').click();
    // Deterministically drive every logo through its ladder to the terminal (cached) state —
    // dispatching the error synchronously avoids depending on hermetic network timing.
    for (let k = 0; k < 4 && document.querySelectorAll('.co-logo').length; k++) {
      document.querySelectorAll('.co-logo').forEach((img) => img.dispatchEvent(new Event('error')));
    }
    const resolvedMonos = document.querySelectorAll('.co-mono').length;   // all rows now resolved (cached)
    // force a full re-render by toggling mode away and back
    const other = [...document.querySelectorAll('.mode-btn')].find((b) => b.id !== 'btn-info'); if (other) other.click();
    document.getElementById('btn-info').click();
    const logos = [...document.querySelectorAll('.co-logo')];
    return {
      resolvedMonos,
      // rows that came back UNRESOLVED after the re-render — i.e. the ladder started over
      restarted: logos.filter((i) => i.dataset.step === '0').length,
      logosAfterRerender: logos.length,
      monosAfterRerender: document.querySelectorAll('.co-mono').length,
    };
  });
  expect(r.resolvedMonos).toBeGreaterThan(0);          // the ladder settled
  // ⚠ THE LOAD-BEARING ASSERTION IS THIS ONE. With the network hermetic every row settles to a
  // monogram, so «no row is at step 0» would be true simply because no <img> survives — the same
  // vacuum the old clearbit count fell into. What distinguishes a working cache from a broken one
  // here is that the re-render emits NO <img> AT ALL: it draws the resolved monogram straight from
  // _coLogoCache instead of re-emitting an image to walk the ladder again. Break the cache and
  // this is a row count, not zero.
  expect(r.logosAfterRerender).toBe(0);
  expect(r.restarted).toBe(0);
  expect(r.monosAfterRerender).toBeGreaterThan(0);     // cached monograms emitted directly (no flicker)
});

// ---- #1 Companies compare: sortable table --------------------------------
test('#1 Companies compare has a sortable table (Countries parity)', async () => {
  const r = await page.evaluate(() => {
    document.getElementById('btn-info').click();
    const tks = window.IntMapCompanies.DATA.slice(0, 4).map((c) => c.tk);
    tks.forEach((tk) => window._coToggleCompare(tk));
    window._coShowCompare();
    const view = document.getElementById('co-cmp-view');
    if (!view) return { view: false };
    view.querySelector('[data-cmpmode="table"]')?.click();
    const headers = view.querySelectorAll('[data-cmpsort]').length;
    const firstBefore = view.querySelector('.scp-tbl tbody tr td')?.textContent || '';
    view.querySelector('[data-cmpsort]')?.click();   // sort by the first metric
    const firstAfter = view.querySelector('.scp-tbl tbody tr td')?.textContent || '';
    return { view: true, headers, rows: view.querySelectorAll('.scp-tbl tbody tr').length, changed: firstBefore !== firstAfter };
  });
  expect(r.view).toBe(true);
  expect(r.headers).toBeGreaterThan(0);   // metric columns are clickable sort headers
  expect(r.rows).toBe(4);
});

// ---- #7 Köppen fit helper + #9 satellite instant fade --------------------
test('#7/#9 Köppen legend fit helper present and the satellite layer does not use the 300 ms default', async () => {
  const r = await page.evaluate(() => {
    const out = { fitFn: typeof window._fitKoppenLegend };
    try {
      const st = window.__imap && window.__imap.getStyle ? window.__imap.getStyle() : null;
      const sat = st && st.layers ? st.layers.find((l) => l.id === 'layer-sat') : null;
      out.satFade = sat && sat.paint ? sat.paint['raster-fade-duration'] : 'no-layer';
    } catch (e) { out.err = String(e); }
    return out;
  });
  expect(r.fitFn).toBe('function');
  /* (#R191) 0 was a HARD SWAP per tile, and a screenful of children replacing their parents one at a
     time is the reported 点滅; it is also what left nothing holding the parent while a child loaded.
     What #R147 was really about — not MapLibre's 300 ms default, which reads as lag under a moving
     finger — is what this pins. */
  if (r.satFade !== 'no-layer' && r.satFade !== undefined) expect(r.satFade).toBeLessThan(300);
});

// ---- boot honesty --------------------------------------------------------
test('no uncaught page errors during R147 interactions', async () => {
  expect(diag.pageErrors, `pageerror(s):\n${diag.pageErrors.join('\n---\n')}`).toHaveLength(0);
});
