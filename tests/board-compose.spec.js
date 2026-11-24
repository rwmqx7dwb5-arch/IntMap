/* workspace — the board and the declared view, held on ONE booted page (the suite's serial time is a budget: three files
   were three boots, 28 s entered; one boot is the same claims for 19). Driven through the console's own door
   (runDirect → executor → dispatch), no model. The rules are held by tests/board-compose-checks.test.mjs,
   tests/declarative-workspace-checks.test.mjs and tests/workspace-editing-checks.test.mjs; this holds that the page does what they say.
   ① board-compose: a row moves the main map, the clock changes the figures, a job feeds partial rows.
   ② declarative-workspace: a view is drawn with IntMap parts, a bad one is refused with every reason.
   ③ workspace-editing: edit a cell, add/rename/remove a column, undo, filter, delta, re-analyse, save, reload (last: it reloads the page). */
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

const VIEW = {
  type: 'dashboard', title: 'Japan & Korea',
  blocks: [
    { kind: 'metrics', items: [{ label: 'Japan', value: 123.3, unit: 'M', delta: -0.5 }, { label: 'Korea', value: 51.7, unit: 'M', delta: -0.1 }], source: 'World Bank WDI 2024' },
    { kind: 'table', title: 'Population', columns: ['Country', 'Millions'], rows: [['Japan', 123.3], ['Korea', 51.7]], source: 'World Bank WDI 2024' },
    { kind: 'chart', chart: { kind: 'bar', source: 'World Bank WDI 2024', series: [{ points: [{ x: 0, y: 123.3, label: 'Japan' }, { x: 1, y: 51.7, label: 'Korea' }] }] } },
    { kind: 'places', items: [{ label: 'Tokyo', lat: 35.68, lng: 139.76, zoom: 8 }] },
    { kind: 'text', md: '**Both** are shrinking.' },
  ],
};

const EDIT_BOARD = {
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


test.describe.configure({ mode: 'serial' });
let context, page;
test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(context);
  page = await context.newPage();
  await page.goto('/', { waitUntil: 'load' });
  await page.evaluate(() => window.IntMapLazy.need('atlasConsole'));
  await page.waitForFunction(() => !!window.IntMapConsole, null, { timeout: 60_000 });
});
test.afterAll(async () => { if (context) await context.close(); });

test('board-compose: a row moves the main map, the clock changes the figures, a job feeds partial rows', async () => {

  /* the camera is spied, not trusted: a headless page may have no GPU renderer, and what is held here is that the board ASKS the real map */
  await page.evaluate(() => {
    const G = window.IntMapGeoEngine; window.__cam = [];
    G.hasRenderer = () => true;
    G.fitBounds = (b) => { window.__cam.push(['fitBounds', b]); };
  });
  /* "objects" reads the type/name columns; this fixture's rows have no type column, so the objects widget is refused by name */
  const refused = await page.evaluate(async (b) => { await window.IntMapConsole.runDirect('board', [b]); return document.querySelector('.bd-panel') ? 'opened' : 'refused'; }, BOARD);
  expect(refused).toBe('refused');

  const withType = JSON.parse(JSON.stringify(BOARD));
  withType.data.rows.forEach((r) => { r.type = 'city'; });
  await page.evaluate((b) => window.IntMapConsole.runDirect('board', [b]), withType);
  const panel = page.locator('.bd-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.bd-tile .bd-tv').first()).toHaveText('3');   /* live: every row exists as of now */

  /* selecting ONE row with a place flies the real map there */
  await panel.locator('tbody tr', { hasText: 'Beta' }).click();
  await expect.poll(() => page.evaluate(() => window.__cam.length)).toBeGreaterThan(0);
  const cam = await page.evaluate(() => window.__cam[window.__cam.length - 1]);
  expect(cam[0]).toBe('fitBounds'); expect(cam[1][0][0]).toBeLessThan(2.35); expect(cam[1][1][0]).toBeGreaterThan(2.35);   /* the box around Beta */
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
    return { panel: false, blocks: last ? Array.from(last.querySelectorAll('.atl-ui-b')).map((x) => x.getAttribute('data-kind')) : [] };
  }, withType);
  /* the block is a card; pressing it opens the very same board */
  await page.locator('.atl-ui-bdo').last().click();
  await expect(page.locator('.bd-panel')).toBeVisible();
  expect(viaView.blocks).toEqual(['text', 'board']);
});

test('declarative-workspace: a view is drawn with IntMap parts, a bad one is refused with every reason', async () => {

  const draw = (label, act) => page.evaluate(async ([l, a]) => {
    await window.IntMapConsole.runDirect(l, [a]);
    const bs = document.querySelectorAll('.atl-b.a'), b = bs[bs.length - 1];
    const ui = b && b.querySelector('section.atl-ui');
    return {
      blocks: ui ? Array.from(ui.querySelectorAll('.atl-ui-b')).map((x) => x.getAttribute('data-kind')) : [],
      tiles: b ? b.querySelectorAll('.atl-ui-mi').length : 0, cells: b ? b.querySelectorAll('.atl-md-table td').length : 0,
      marks: b ? b.querySelectorAll('[data-mark="1"]').length : 0, places: b ? b.querySelectorAll('.atl-ui-go[data-lat]').length : 0,
      why: b ? Array.from(b.querySelectorAll('.atl-ui-why li')).map((li) => li.textContent) : [],
      scripts: b ? b.querySelectorAll('script,iframe,img[onerror]').length : -1,
    };
  }, [label, act]);

  const ok = await draw('view', VIEW);
  expect(ok.blocks).toEqual(['metrics', 'table', 'chart', 'places', 'text']);
  expect(ok.tiles).toBe(2);
  expect(ok.cells).toBe(4);
  expect(ok.marks, 'the chart block drew both bars through chart.compose').toBe(2);
  expect(ok.places).toBe(1);
  await page.locator('.atl-b.a').last().screenshot({ path: test.info().outputPath('view.png') });

  const bad = await draw('bad view', { type: 'dashboard', blocks: [
    { kind: 'text', md: '<img src=x onerror=alert(1)>' },
    { kind: 'metrics', items: [{ label: 'x', value: 1 }], source: 'see https://example.com' },
    { kind: 'table', columns: ['a', 'b'], rows: [['1']], source: 's' },
  ] });
  expect(bad.blocks, 'nothing is drawn from a refused view').toEqual([]);
  expect(bad.why.length).toBe(3);
  expect(bad.why.join('\n')).toMatch(/blocks\[0\]\.md[\s\S]*blocks\[1\]\.source[\s\S]*blocks\[2\]\.rows\[0\]/);
  expect(bad.scripts).toBe(0);
  await page.locator('.atl-b.a').last().screenshot({ path: test.info().outputPath('refused.png') });
});

test('workspace-editing: edit a cell, add/rename/remove a column, undo, filter, delta, re-analyse, save, reload', async () => {
  await page.evaluate(() => window.IntMapBoard.close());   /* the shared page still shows ①'s board */
  await page.evaluate((b) => window.IntMapConsole.runDirect('board', [b]), EDIT_BOARD);
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
  await expect(page.locator('.bd-panel .bd-tile .bd-tv').first()).toHaveText('125');
  /* the Saved list opens it too */
  await page.locator('.bd-panel [data-act="saved"]').click();
  await expect(page.locator('.bd-panel [data-saved="list"] button', { hasText: 'Edit me' }).first()).toBeVisible();
});
