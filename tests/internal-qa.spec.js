// Runs IntMap's own in-page QA harnesses from CI.
// Both are PURE (fixtures + deterministic math, no network, no AI, no auth), so they are
// safe to run hermetically. See docs/TESTING.md for the full classification of every
// IntMap*QA / *Test / *Audit / *Health entry point and why the others are not run here.
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';

test.describe.configure({ mode: 'serial' });

let page;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  await installHermeticRouting(context);
  page = await context.newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(
    () => typeof window.IntMapAtlasQA !== 'undefined' && typeof window.IntMapRegionResolverTest !== 'undefined',
    null,
    { timeout: 45_000 },
  );
});

test.afterAll(async () => {
  await page?.context()?.close();
});

test('IntMapAtlasQA.run() — analysis/evidence/freshness harness passes', async () => {
  const res = await page.evaluate(() => window.IntMapAtlasQA.run());
  const failed = (res.results || []).filter((r) => !r.ok).map((r) => r.id);
  expect(failed, `failed sub-checks: ${failed.join(', ')}`).toHaveLength(0);
  expect(res.pass, `AtlasQA passed ${res.passed}/${res.total}`).toBe(true);
});

test('IntMapRegionResolverTest.run() — region-resolver geometry math passes', async () => {
  const res = await page.evaluate(() => window.IntMapRegionResolverTest.run());
  const failed = (res.results || []).filter((r) => !r.pass).map((r) => r.name);
  expect(failed, `failed cases: ${failed.join(', ')}`).toHaveLength(0);
  expect(res.ok, `RegionResolverTest passed ${res.pass}/${res.total}`).toBe(true);
});

test('IntMapUIAudit.run() — Atlas UI naming coverage runs and reports totals', async () => {
  // Not a strict pass/fail gate (coverage %, not a boolean), but exercising it in CI
  // catches a throw and confirms the UI is addressable. Informational thresholds only.
  const res = await page.evaluate(() => window.IntMapUIAudit.run());
  expect(res, 'UIAudit returned a report').toBeTruthy();
  expect(res.total, 'UIAudit counted interactive elements').toBeGreaterThan(0);
});
