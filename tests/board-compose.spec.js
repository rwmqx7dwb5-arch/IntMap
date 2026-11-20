/* board-compose — the board is linked to the REAL map and the REAL clock, and a view (ui.compose) opens one.
   Driven through the console's own door (runDirect → executor → dispatch), no model. The rules are held by
   tests/board-compose-checks.test.mjs; this holds that the page does what they say: selecting a row moves the main
   map's camera, the Chronos clock changes the figures, a long job's partial rows arrive through feed(). */
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

const BOARD = {
  type: 'board', title: 'Cities over time', source: 'unit fixture',
  data: { rows: [
    { name: 'Alpha', pop: 10, at: '1990-01-01', lng: 139.7, lat: 35.7 },
    { name: 'Beta', pop: 30, at: '2005-06-01', lng: 2.35, lat: 48.85 },
    { name: 'Gamma', pop: 5, at: '2020-03-01', lng: 10, lat: 50 },
  ], lngField: 'lng', latField: 'lat', timeField: 'at' },
  widgets: [
    { kind: 'metrics', items: [{ label: 'Cities', agg: 'count' }, { label: 'Population', agg: 'sum', field: 'pop', unit: 'M' }] },
    { kind: 'time' }, { kind: 'table', columns: ['name', 'pop'] }, { kind: 'map' }, { kind: 'objects' },
  ],
};

test('board-compose: a row moves the main map, the clock changes the figures, a job feeds partial rows', async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(context);
  const page = await context.newPage();
  await page.goto('/', { waitUntil: 'load' });
  await page.evaluate(() => window.IntMapLazy.need('atlasConsole'));
  await page.waitForFunction(() => !!window.IntMapConsole, null, { timeout: 60_000 });

  /* the camera is spied, not trusted: a headless page may have no GPU renderer, and what is held here is that the board ASKS the real map */
  await page.evaluate(() => {
    const G = window.IntMapGeoEngine; window.__cam = [];
    G.hasRenderer = () => true;
    G.camera.flyTo = (o) => { window.__cam.push(['flyTo', o.center]); };
    G.camera.fitBounds = (b) => { window.__cam.push(['fitBounds', b]); };
  });
  /* "objects" reads the type/name columns; this fixture's rows have no type column, so the objects widget is refused by name */
  const refused = await page.evaluate(async (b) => { await window.IntMapConsole.runDirect('board', [b]); return document.querySelector('#board-panel') ? 'opened' : 'refused'; }, BOARD);
  expect(refused).toBe('refused');

  const withType = JSON.parse(JSON.stringify(BOARD));
  withType.data.rows.forEach((r) => { r.type = 'city'; });
  await page.evaluate((b) => window.IntMapConsole.runDirect('board', [b]), withType);
  const panel = page.locator('#board-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.bd-tile .bd-tv').first()).toHaveText('3');   /* live: every row exists as of now */

  /* selecting ONE row with a place flies the real map there */
  await panel.locator('tbody tr', { hasText: 'Beta' }).click();
  await expect.poll(() => page.evaluate(() => window.__cam.length)).toBeGreaterThan(0);
  const cam = await page.evaluate(() => window.__cam[window.__cam.length - 1]);
  expect(cam[0]).toBe('flyTo'); expect(cam[1][0]).toBeCloseTo(2.35, 1);
  /* …and the figures follow the selection */
  await expect(panel.locator('.bd-tile .bd-tv').first()).toHaveText('1');

  /* the clock: 2000 — only the 1990 row exists; the table, metrics and the footer all say so */
  await panel.locator('tbody tr', { hasText: 'Beta' }).click();   /* deselect */
  await page.evaluate(() => globalThis.IntMapTime.setYear(2000, { source: 'test' }));
  await expect(panel.locator('.bd-tile .bd-tv').first()).toHaveText('1');
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await expect(panel.locator('tbody tr').first()).toContainText('Alpha');
  await page.evaluate(() => globalThis.IntMapTime.setNow({ source: 'test' }));
  await expect(panel.locator('tbody tr')).toHaveCount(3);

  /* a long job's partial result */
  const f1 = await page.evaluate(() => window.IntMapBoard.feed({ rows: [{ name: 'Delta', pop: 7, at: '2010-01-01', lng: 0, lat: 0, type: 'city' }], progress: 0.5 }));
  expect(f1.ok).toBe(true);
  await expect(panel.locator('.bd-foot')).toContainText(/partial result|途中経過/);
  await expect(panel.locator('tbody tr')).toHaveCount(4);
  await page.evaluate(() => window.IntMapBoard.feed({ rows: [], done: true }));
  await expect(panel.locator('.bd-foot')).not.toContainText(/partial result|途中経過/);
  await panel.screenshot({ path: test.info().outputPath('board.png') });

  /* a view carries a live board: one composer, two doors */
  await page.evaluate(() => window.IntMapBoard.close());
  const viaView = await page.evaluate(async (b) => {
    const { type, ...board } = b;
    await window.IntMapConsole.runDirect('view', [{ type: 'dashboard', title: 'v', blocks: [{ kind: 'text', md: 'hello' }, { kind: 'board', board }] }]);
    const bs = document.querySelectorAll('.atl-b.a'), last = bs[bs.length - 1];
    return { panel: !!document.querySelector('#board-panel'), blocks: last ? Array.from(last.querySelectorAll('.atl-ui-b')).map((x) => x.getAttribute('data-kind')) : [] };
  }, withType);
  expect(viaView.panel).toBe(true);
  expect(viaView.blocks).toEqual(['text', 'board']);
  await context.close();
});
