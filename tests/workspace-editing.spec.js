/* workspace-editing — analysis → the reader edits the table → map/chart/figures follow → re-analyse → save → reload.
   Driven through the console's own door (runDirect → executor → dispatch), no model. The rules are held by
   tests/workspace-editing-checks.test.mjs; this holds that the page does what they say. */
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

const BOARD = {
  type: 'board', title: 'Edit me', source: 'unit fixture', save: true,
  data: { rows: [
    { name: 'Alpha', pop: 10, kind: 'a', lng: 139.7, lat: 35.7 },
    { name: 'Beta', pop: 30, kind: 'b', lng: 2.35, lat: 48.85 },
    { name: 'Gamma', pop: 5, kind: 'a', lng: 10, lat: 50 },
  ], lngField: 'lng', latField: 'lat' },
  widgets: [
    { kind: 'metrics', items: [{ label: 'Total', agg: 'sum', field: 'pop' }] },
    { kind: 'table', columns: ['name', 'pop'] }, { kind: 'chart', chart: 'bar', x: 'name', y: 'pop' },
    { kind: 'filter', field: 'kind', control: 'category' },
  ],
};

async function boot(browser) {
  const context = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(context);
  const page = await context.newPage();
  await page.goto('/', { waitUntil: 'load' });
  await page.evaluate(() => window.IntMapLazy.need('atlasConsole'));
  await page.waitForFunction(() => !!window.IntMapConsole, null, { timeout: 60_000 });
  return { context, page };
}

test('workspace-editing: edit a cell, add/rename/remove a column, undo, filter, delta, re-analyse, save, reload', async ({ browser }) => {
  const { context, page } = await boot(browser);
  await page.evaluate((b) => window.IntMapConsole.runDirect('board', [b]), BOARD);
  const panel = page.locator('.bd-panel');
  await expect(panel).toBeVisible();
  const total = panel.locator('.bd-tile .bd-tv').first();
  await expect(total).toHaveText('45');

  /* edit mode: the cell is an input; a value typed in reaches the figures and the chart */
  await panel.locator('[data-act="edit"]').click();
  const cell = panel.locator('input.bd-cell[data-f="pop"]').nth(1);   /* Beta */
  await cell.fill('100'); await cell.press('Enter');
  await expect(total).toHaveText('115');
  /* a number column does not take text — refused, the cell goes back */
  const c2 = panel.locator('input.bd-cell[data-f="pop"]').nth(0);
  await c2.fill('lots'); await c2.press('Enter');
  await expect(panel.locator('.bd-editmsg')).toContainText('not a number');
  await expect(total).toHaveText('115');

  /* undo / redo */
  await panel.locator('[data-act="undo"]').click(); await expect(total).toHaveText('45');
  await panel.locator('[data-act="redo"]').click(); await expect(total).toHaveText('115');

  /* a column: add, rename (the chart's y follows), remove is refused while a widget is drawn from it */
  await panel.locator('[data-act="colname"]').fill('note');
  await panel.locator('[data-act="addcol"]').click();
  await expect(panel.locator('th', { hasText: 'note' })).toHaveCount(1);
  await panel.locator('[data-act="column"]').selectOption('pop');
  await panel.locator('[data-act="colname"]').fill('people');
  await panel.locator('[data-act="rencol"]').click();
  await expect(panel.locator('th', { hasText: 'people' })).toHaveCount(1);
  await expect(total).toHaveText('115');   /* the metric was carried to the new name */
  await panel.locator('[data-act="column"]').selectOption('people');
  await panel.locator('[data-act="delcol"]').click();
  await expect(panel.locator('.bd-editmsg')).toContainText('drawn from this column');
  await panel.locator('[data-act="undo"]').click();   /* the column add... undo steps back: rename first */
  await panel.locator('[data-act="undo"]').click();
  await expect(panel.locator('th', { hasText: 'pop' })).toHaveCount(1);
  await expect(total).toHaveText('115');
  await panel.locator('[data-act="redo"]').click(); await panel.locator('[data-act="redo"]').click();

  /* the same edits as Atlas's capability: one door */
  const viaAtlas = await page.evaluate(async () => {
    await window.IntMapConsole.runDirect('boardEdit', [{ type: 'boardEdit', op: 'cells', edits: [{ where: { field: 'name', equals: 'Alpha' }, field: 'people', value: 20 }] }]);
    await window.IntMapConsole.runDirect('boardEdit', [{ type: 'boardEdit', op: 'filter', field: 'kind', values: ['a'] }]);
    return window.IntMapBoard.api().delta();
  });
  expect(viaAtlas.cells.map((c) => c.field + ':' + c.to).sort()).toEqual(['people:100', 'people:20'].sort());
  await expect(total).toHaveText('25');   /* filter kind=a: Alpha 20 + Gamma 5 */
  const dt = await page.evaluate(() => window.IntMapBoard.api().deltaText());
  expect(dt).toContain('Alpha'); expect(dt).toContain('10 → 20'); expect(dt).toContain('kind');
  await page.evaluate(async () => window.IntMapConsole.runDirect('boardEdit', [{ type: 'boardEdit', op: 'filter', field: 'kind', clear: true }]));

  /* "redo the analysis": the delta goes to Atlas as one question */
  await page.evaluate(() => { window.__asked = []; window.IntMapConsole.run = (q) => { window.__asked.push(q); }; });
  await panel.locator('[data-act="reanalyze"]').click();
  await expect.poll(() => page.evaluate(() => window.__asked.length)).toBe(1);
  expect(await page.evaluate(() => window.__asked[0])).toContain('Beta');

  /* save → reload the page → open it from the Saved list: the edits are there, the delta still measured from the original */
  await panel.getByRole('button', { name: /^Save$/ }).click();
  await expect(panel.getByRole('button', { name: /Board saved/ })).toBeVisible();
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => window.IntMapLazy.need('board'));
  await page.waitForFunction(() => !!window.IntMapBoard);
  await page.evaluate((b) => window.IntMapConsole && 0, null).catch(() => {});
  const r = await page.evaluate(async () => { const x = await window.IntMapBoard.restore('Edit me'); return { ok: x.ok, d: window.IntMapBoard.api().delta(), cols: Object.keys(window.IntMapBoard.rows()[0].properties) }; });
  expect(r.ok).toBe(true);
  expect(r.cols).toContain('people'); expect(r.cols).toContain('note');
  expect(r.d.cells.length).toBe(2);
  await expect(page.locator('.bd-panel .bd-tile .bd-tv').first()).toHaveText('130');
  /* the Saved list opens it too */
  await page.locator('.bd-panel [data-act="saved"]').click();
  await expect(page.locator('.bd-panel [data-saved="list"] button', { hasText: 'Edit me' }).first()).toBeVisible();
  await context.close();
});
