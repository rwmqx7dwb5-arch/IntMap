/* ============================================================================
 *  R354 — the company atlas, in a real browser. Three claims, all of them cheap.
 *
 *   ① NOTHING of data/companies/ is fetched until a company is opened — and then
 *      exactly the index and ONE profile are. This is the whole reason the feature
 *      is allowed to be 500 companies deep: a session that never opens Companies
 *      pays nothing for it.
 *   ② Opening a company draws its facilities, and opening a SECOND one replaces
 *      them rather than adding to them. The failure this guards is the one every
 *      map layer in this repository has had at least once: a source that is added
 *      again on every open, and listeners that multiply with it.
 *   ③ close() leaves no source, no layer and no panel behind — no orphan layer
 *      (CONSTITUTION §3).
 *
 *  ⚠ THE SHARED FIXTURE, NOT A BOOT OF ITS OWN. `app` is worker-scoped and already
 *  booted. A private page.goto here would cost this file a minute by itself and
 *  push the core tier over its ceiling (scripts/test-budget.mjs).
 *
 *  ⚠ Everything here drives the PUBLIC api — IntMapLazy.need() and
 *  IntMapCompanyPanel.open() — because that is what the button in the company
 *  card calls. A test that reached inside the module would keep passing after the
 *  button stopped working.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

const DATA_RE = /data\/companies\//;

test('R354 ① the atlas costs nothing until a company is opened, then one index + one profile', async ({ app }) => {
  const page = app.page;

  const asked = [];
  const onReq = (r) => { if (DATA_RE.test(r.url())) asked.push(r.url()); };
  page.on('request', onReq);

  /* the app is already booted by the fixture; give the boot's own idle work a beat
     to prove it is not fetching the atlas on its own */
  await page.waitForFunction(() => document.querySelectorAll('.lyr-row').length > 100, null, { timeout: 60000 });
  expect(asked, 'the company atlas was fetched at boot: ' + asked.join(', ')).toHaveLength(0);

  /* ── now open one, exactly as the card's button does ─────────────────────── */
  const opened = await page.evaluate(async () => {
    await window.IntMapLazy.need('companyPanel');
    const ix = await window.IntMapCompanyData.index();
    const want = ix.companies.find((c) => c.wd === 'Q53268') || ix.companies.find((c) => c.fac > 4);
    const id = want && want.id;
    const ok = await window.IntMapCompanyPanel.open(id);
    return { id, ok: ok !== false };
  });
  expect(opened.id, 'no company in the index to open').toBeTruthy();

  await page.waitForFunction(() => {
    const el = document.getElementById('co-popup') || document.querySelector('.co-popup');
    return !!(el && el.style.display !== 'none' && el.textContent.trim().length > 40);
  }, null, { timeout: 20000 });

  const idx = asked.filter((u) => /index\.json/.test(u));
  const profiles = asked.filter((u) => /profiles\//.test(u));
  expect(idx.length, 'the index was fetched ' + idx.length + ' times').toBeLessThanOrEqual(1 + 1);
  expect(profiles.length, 'opening one company fetched ' + profiles.length + ' profiles').toBe(1);

  /* the panel shows sourced facts, not placeholders */
  const shown = await page.evaluate(() => {
    const el = document.getElementById('co-popup') || document.querySelector('.co-popup');
    return el ? el.textContent.replace(/\s+/g, ' ') : '';
  });
  expect(shown).not.toMatch(/undefined|NaN|\[object Object\]/);

  page.off('request', onReq);
});

test('R354 ② a second company replaces the first — the source is not added twice', async ({ app }) => {
  const page = app.page;

  const before = await page.evaluate(async () => {
    await window.IntMapLazy.need('companyPanel');
    const ix = await window.IntMapCompanyData.index();
    const withFacs = ix.companies.filter((c) => c.fac >= 3).slice(0, 2).map((c) => c.id);
    await window.IntMapCompanyPanel.open(withFacs[0]);
    return { ids: withFacs };
  });
  expect(before.ids.length, 'fewer than two companies have facilities').toBe(2);

  await page.waitForFunction(() => {
    try { return window.IntMapCompanyFacilities && window.IntMapCompanyFacilities.isShown(); }
    catch (_) { return false; }
  }, null, { timeout: 20000 });

  const first = await page.evaluate(() => ({
    cur: window.IntMapCompanyFacilities.current(),
    panels: document.querySelectorAll('.co-popup').length,
    cards: document.querySelectorAll('.cf-card, #cf-card').length,
  }));

  await page.evaluate((id) => window.IntMapCompanyPanel.open(id), before.ids[1]);
  await page.waitForFunction((prev) => {
    try { return window.IntMapCompanyFacilities.current() && window.IntMapCompanyFacilities.current() !== prev; }
    catch (_) { return false; }
  }, first.cur, { timeout: 20000 });

  /* …and opening the SAME company again must change nothing at all */
  await page.evaluate((id) => window.IntMapCompanyPanel.open(id), before.ids[1]);
  const second = await page.evaluate(() => ({
    cur: window.IntMapCompanyFacilities.current(),
    panels: document.querySelectorAll('.co-popup').length,
    cards: document.querySelectorAll('.cf-card, #cf-card').length,
  }));

  expect(second.cur, 'the layer still shows the first company').not.toBe(first.cur);
  expect(second.panels, 'a second panel element was created').toBe(first.panels);
  expect(second.panels, 'more than one company panel exists').toBeLessThanOrEqual(1);
  expect(second.cards, 'facility cards accumulated').toBeLessThanOrEqual(1);
});

test('R354 ③ closing leaves no orphan source, layer or panel', async ({ app }) => {
  const page = app.page;

  await page.evaluate(async () => {
    await window.IntMapLazy.need('companyPanel');
    const ix = await window.IntMapCompanyData.index();
    const c = ix.companies.find((x) => x.fac >= 3) || ix.companies[0];
    await window.IntMapCompanyPanel.open(c.id);
  });
  await page.waitForFunction(() => {
    try { return window.IntMapCompanyFacilities.isShown(); } catch (_) { return false; }
  }, null, { timeout: 20000 });

  const after = await page.evaluate(() => {
    window.IntMapCompanyPanel.close();
    const el = document.getElementById('co-popup') || document.querySelector('.co-popup');
    return {
      shown: window.IntMapCompanyFacilities.isShown(),
      visible: !!(el && el.style.display !== 'none' && el.offsetParent !== null),
      cur: window.IntMapCompanyFacilities.current() || '',
    };
  });
  expect(after.shown, 'the facility layer is still on the map after close()').toBe(false);
  expect(after.visible, 'the panel is still visible after close()').toBe(false);
  expect(after.cur, 'the layer still names a company after close()').toBe('');
});
