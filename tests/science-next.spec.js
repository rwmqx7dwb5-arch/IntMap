/* ============================================================================
 *  IntMap · science-next — the attribution ladder of the 2011 answer-check, in a browser
 * ----------------------------------------------------------------------------
 *  tests/science-next-checks.test.mjs guards the numbers. Only a page can show that a reader reaches them:
 *  the radioactive-dispersion panel's «Checked against 2011» block offers the rungs the BUNDLE has (not a copy),
 *  pressing one redraws the model map for that rung, the release timeline and the per-rung table are drawn, and
 *  Atlas's `rung` reaches the same door — refusing an unknown rung with the list of real ones.
 *  Uses the worker-scoped shared page (one boot for the file).
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';
import { readFileSync } from 'node:fs';

const B = JSON.parse(readFileSync(new URL('../data/radiation-hindcast.json', import.meta.url), 'utf8'));
const RUNGS = ['preset'].concat(B.variants.map((v) => v.id));

test.describe.configure({ mode: 'serial' });

test('the panel offers the bundle\'s rungs, and a rung redraws the model and its table', async ({ app }) => {
  test.setTimeout(120_000);
  const { page } = app;
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message)));
  await page.waitForFunction(() => !!(window.IntMapRadiation && window.IntMapRadiation.openPanel), null, { timeout: 60_000 });
  await page.evaluate(() => window.IntMapRadiation.openPanel({ lng: 141.03, lat: 37.42 }));
  await page.waitForSelector('#rad-panel .rad-hc-b[data-v="model"]', { state: 'visible', timeout: 20_000 });
  await page.click('#rad-panel .rad-hc-b[data-v="model"]');
  await page.waitForSelector('#rad-panel .rad-hc-r', { timeout: 30_000 });
  const ids = await page.$$eval('#rad-panel .rad-hc-r', (bs) => bs.map((b) => b.dataset.r));
  expect(ids).toEqual(RUNGS);
  expect(await page.$eval('#rad-panel .rad-hc-r[data-r="preset"]', (b) => b.getAttribute('aria-pressed'))).toBe('true');
  /* the release timeline: one bar per hour that released something, and the preset's dashed rate */
  const bars = await page.$$eval('#rad-panel .rad-hc svg rect', (r) => r.length);
  const released = B.release.hourlyBqPerH.filter((x) => x > 0).length;
  expect(bars).toBe(released);
  expect(await page.$$eval('#rad-panel .rad-hc svg line', (l) => l.length)).toBe(1);
  /* the table: a header and one row per rung */
  expect(await page.$$eval('#rad-panel .rad-hc table tr', (r) => r.length)).toBe(RUNGS.length + 1);

  await page.click('#rad-panel .rad-hc-r[data-r="jaea"]');
  await page.waitForFunction(() => { const b = document.querySelector('#rad-panel .rad-hc-r[data-r="jaea"]'); return b && b.getAttribute('aria-pressed') === 'true'; }, null, { timeout: 20_000 });
  const stat = await page.$eval('#rad-panel .rad-hc', (el) => el.textContent);
  expect(stat).toContain('r = ' + B.variants.find((v) => v.id === 'jaea').metrics.pearsonLog.toFixed(2));
  expect(stat).toMatch(/not an independent test|独立の検証ではありません/);
  expect(errors).toEqual([]);
});

test('the door takes a rung, answers with the whole ladder, and refuses one that does not exist', async ({ app }) => {
  test.setTimeout(90_000);
  const { page } = app;
  await page.waitForFunction(() => !!(window.IntMapRadiation && window.IntMapRadiation.hindcast), null, { timeout: 60_000 });
  const r = await page.evaluate(() => window.IntMapRadiation.hindcast('ratio', 'jaea-regional-particulate'));
  expect(r.ok).toBe(true);
  expect(r.rung).toBe('jaea-regional-particulate');
  expect(r.cells).toBe(B.obs.cells.length);
  expect(r.ladder.map((x) => x.id)).toEqual(RUNGS);
  expect(r.metrics.fac2).toBe(B.variants.find((v) => v.id === 'jaea-regional-particulate').metrics.fac2);
  expect(r.release && r.release.inferred).toMatch(/not an independent test/);
  const bad = await page.evaluate(() => window.IntMapRadiation.hindcast('model', 'no-such-rung'));
  expect(bad.ok).toBe(false);
  expect(bad.reason).toBe('rung');
  expect(bad.rungs).toEqual(RUNGS);
});
