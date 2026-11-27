/* workspace — the board and the declared view, held on ONE booted page (the suite's serial time is a budget: three files
   were three boots, 28 s entered; one boot is the same claims for 19). Driven through the console's own door
   (runDirect → executor → dispatch), no model. The rules are held by tests/board-compose-checks.test.mjs,
   tests/declarative-workspace-checks.test.mjs and tests/workspace-editing-checks.test.mjs; this holds that the page does what they say.
   ① board-compose: a row moves the main map, the clock changes the figures, a job feeds partial rows.
   ② declarative-workspace: a view is drawn with IntMap parts, a bad one is refused with every reason.
   ④ atlas-controls-receipts (after ③, on the page its reload left): the controls inside a reply and the map they switch are one state, read back after a real press —
     the reply's switch turns off what that turn drew through every painter; tabs pressed 0 → 1 → 2 quickly with 2 failing come back to 1 (row, record,
     map); a call reports the controls it DREW (ids on the page); after each press the map shows that option's year and each category its one colour.
     The rules are tests/atlas-controls-receipts-checks.test.mjs. Here rather than in a file of their own: the same boot and the same door, and the suite's
     total had no room for a second boot (scripts/test-budget.mjs).
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

/* in the page: the layers a run drew, then what is still visible after the reply's own switch goes OFF, and after a style event, and after ON */
const SWITCH_ROUND = async ({ label, acts, hideFirst }) => {
  const GE = window.IntMapGeoEngine, C = window.IntMapConsole, M = GE.raw();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (f, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await sleep(50); } return false; };
  const layers = () => (M.getStyle() || {}).layers || [];
  const vis = () => new Set(layers().filter((l) => !l.layout || l.layout.visibility !== 'none').map((l) => l.id));
  /* which content each GeoJSON source holds: the data object the renderer keeps (setData replaces it) */
  const contents = () => { const m = new Map(); Object.keys((M.getStyle() || {}).sources || {}).forEach((id) => { const d = GE.layers.sourceData(id); if (d && typeof d === 'object') m.set(id, d); }); return m; };
  const lastReply = () => { const bs = document.querySelectorAll('#atlas-panel .atl-b.a'); return bs[bs.length - 1]; };
  const T = [Date.now()]; await C.dispatch({ type: 'clear' }); T.push(Date.now());   /* the dispatch, not a turn: the case starts from a clear map without a reply of its own */
  if (hideFirst) { await C.runDirect(hideFirst.label, hideFirst.acts); const t = lastReply().querySelector('.atl-map-toggle'); if (t) { t.click(); await until(() => t.getAttribute('aria-checked') === 'false'); } }
  const v0 = vis(), c0 = contents();
  T.push(Date.now()); await C.runDirect(label, acts); T.push(Date.now());
  const v1 = vis(), c1 = contents();
  const changed = new Set([...c1.keys()].filter((id) => c1.get(id) !== c0.get(id) && Array.isArray(c1.get(id).features) && c1.get(id).features.length));
  /* what the run drew, read off the map: layers it made visible, and visible layers reading a source whose content it replaced */
  const drew = layers().filter((l) => v1.has(l.id) && (!v0.has(l.id) || changed.has(l.source))).map((l) => l.id);
  const reply = lastReply(), chip = reply && reply.querySelector('.atl-map-toggle');
  if (!chip) return { label, chip: false, drew, text: String(reply && reply.textContent || '').slice(0, 160) };
  chip.click(); await until(() => chip.getAttribute('aria-checked') === 'false');
  M.fire('styledata'); await sleep(250);   /* a painter that re-asserts its visibility does it here (the slowest waits 160 ms after the event) */
  const offNow = vis(); const stillOn = drew.filter((x) => offNow.has(x));
  const chipOff = chip.getAttribute('aria-checked');
  chip.click(); await until(() => chip.getAttribute('aria-checked') === 'true');
  const onNow = vis(); const backOn = drew.filter((x) => onNow.has(x));
  T.push(Date.now());
  return { label, chip: true, drew, stillOn, chipOff, backOn, chipOn: chip.getAttribute('aria-checked'), ms: T.map((t, i) => (i ? t - T[i - 1] : 0)).slice(1) };
};

test('atlas-controls-receipts ① the reply switch turns off what that turn drew, through every painter, and back on', async () => {
  test.setTimeout(120_000);
  await page.evaluate(() => window.IntMapLazy.need('atlasConsole'));   /* after ③'s reload */
  await page.waitForFunction(() => !!window.IntMapConsole && (() => { try { return window.IntMapGeoEngine.raw().loaded(); } catch (_) { return false; } })(), null, { timeout: 60_000 });
  const cases = [
    { label: 'highlight', acts: [{ type: 'highlight', interpretation: 'x', targets: [{ name: 'France', iso3: 'FRA' }, { name: 'Spain', iso3: 'ESP' }] }] },
    { label: 'line', acts: [{ type: 'drawLine', points: [[0, 40], [20, 50], [30, 45]], label: 'L' }] },
    { label: 'pin', acts: [{ type: 'pin', place: 'Paris', title: 'P' }] },
    { label: 'isolate', acts: [{ type: 'isolate', country: 'Japan', on: true }] },
    { label: 'compose', acts: [{ type: 'compose', title: 't', items: [{ name: 'Tokyo', lat: 35.68, lng: 139.76 }, { name: 'France', shape: 'area' }] }] },
    /* a GeoJSON user layer (geo.shadeAreas): ④ shades anyway, and turns that reply's switch off and on there — one load of the first-level index, not two */
    /* a later drawing into the layers an earlier reply's switch had turned OFF */
    { label: 'polygon', acts: [{ type: 'drawPolygon', points: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]] }], hideFirst: { label: 'highlight first', acts: [{ type: 'highlight', interpretation: 'x', targets: [{ name: 'Italy', iso3: 'ITA' }] }] } },
  ];
  /* once, before the first case: what the page switches by itself while it settles after the reload is not a run's */
  await page.evaluate(() => new Promise((r) => { const M = window.IntMapGeoEngine.raw(); if (M.loaded() && !M.isMoving()) setTimeout(r, 1500); else { M.once('idle', () => setTimeout(r, 1500)); } }));
  const seen = [];
  for (const c of cases) seen.push(await page.evaluate(SWITCH_ROUND, c));
  for (const r of seen) {
    expect.soft(r.chip, r.label + ': the reply that drew has a switch ' + JSON.stringify(r)).toBe(true);
    if (!r.chip) continue;
    expect.soft(r.drew.length, r.label + ': the run drew something on the map').toBeGreaterThan(0);
    expect.soft(r.stillOn, r.label + ': nothing the run showed stays on after OFF (and a style event)').toEqual([]);
    expect.soft(r.chipOff, r.label + ': the switch reads OFF').toBe('false');
    expect.soft(r.backOn.sort(), r.label + ': ON brings back what was drawn').toEqual(r.drew.slice().sort());
    expect.soft(r.chipOn, r.label + ': the switch reads ON').toBe('true');
  }
});

test('atlas-controls-receipts ② tabs pressed 0 → 1 → 2 quickly with 2 failing half-way: row, record and map all come back to 1', async () => {
  test.setTimeout(120_000);
  const r = await page.evaluate(async () => {
    const C = window.IntMapConsole, sleep = (ms) => new Promise((x) => setTimeout(x, ms));
    await C.runDirect('time 1900', [{ type: 'timeTravel', year: 1900 }]);
    await C.runDirect('tabs', [{ type: 'controls', items: [{ kind: 'tabs', label: 'Era', options: [
      { label: '1900', calls: [{ type: 'timeTravel', year: 1900 }] },
      { label: '1950', calls: [{ type: 'timeTravel', year: 1950 }] },
      { label: '2000', calls: [{ type: 'timeTravel', year: 2000 }, { type: 'isolate', country: 'Nowhere-that-is-no-country', on: true }] },
    ] }] }]);
    const bs = document.querySelectorAll('#atlas-panel .atl-b.a'); const reply = bs[bs.length - 1];
    const row = reply.querySelector('.atl-ctl-tabrow');
    row.querySelector('.atl-ctl-tab[data-i="1"]').click();
    row.querySelector('.atl-ctl-tab[data-i="2"]').click();   /* while 1 is still running */
    for (let i = 0; i < 600 && (row.querySelector('.busy') || !row.querySelector('.atl-ctl-why')); i++) await sleep(50);   /* the failed press says so once its rollback has run */
    const on = row.querySelector('.atl-ctl-tab.on');
    return { shown: on ? on.getAttribute('data-i') : null, record: row.getAttribute('data-confirmed'), year: window.IntMapTime.year(), note: (row.querySelector('.atl-ctl-why') || {}).textContent || '' };
  });
  expect(r.note, 'the row says the switch failed').toMatch(/./);
  expect(r).toMatchObject({ shown: '1', record: '1', year: 1950 });
});

test('atlas-controls-receipts ③ a call reports the controls it drew, with ids on the page — not the ones it was asked for', async () => {
  const r = await page.evaluate(async () => {
    const C = window.IntMapConsole;
    await C.runDirect('controls', [{ type: 'controls', items: [
      { kind: 'button', label: 'Again', run: 'show Japan' },
      { kind: 'tabs', options: [{ label: 'only one', calls: [{ type: 'timeTravel', year: 1900 }] }] },   /* one option: not drawable */
    ] }]);
    const bs = document.querySelectorAll('#atlas-panel .atl-b.a'); const reply = bs[bs.length - 1];
    const res = (reply.__atlResults || []).find((x) => x && x.act && x.act.type === 'controls');
    const meta = (res && res.meta) || {};
    return { drawn: meta.drawn || null, problems: (meta.problems || []).map((p) => p.at), onPage: [...reply.querySelectorAll('[data-ctl-id]')].map((n) => n.getAttribute('data-ctl-id')), tabs: reply.querySelectorAll('.atl-ctl-tab').length };
  });
  expect(r.drawn.map((d) => d.kind)).toEqual(['button']);
  expect(r.onPage).toEqual(r.drawn.map((d) => d.id));
  expect(r.problems).toEqual(['[1].options']);
  expect(r.tabs).toBe(0);
});

test('atlas-controls-receipts ④ after each press the map shows that option: its year, and each category its one colour', async () => {
  test.setTimeout(120_000);
  const r = await page.evaluate(async () => {
    const C = window.IntMapConsole, GE = window.IntMapGeoEngine, M = GE.raw(), sleep = (ms) => new Promise((x) => setTimeout(x, ms));
    const shade = (rows) => ({ type: 'shadeAreas', rows, country: 'Japan', source: 'unit fixture', compare: 'era' });
    const optA = [{ type: 'timeTravel', year: 1900 }, shade([{ area: 'JP-01', group: 'North' }, { area: 'JP-47', group: 'South' }])];
    const optB = [{ type: 'timeTravel', year: 2000 }, shade([{ area: 'JP-01', group: 'South' }, { area: 'JP-13', group: 'North' }, { area: 'JP-47', group: 'Islands' }])];
    const copy = (x) => JSON.parse(JSON.stringify(x));   /* a run stamps its result on the action object; the options carry the calls as written */
    for (const c of copy(optA)) await C.runDirect('first state', [c]);
    /* the shading's own reply: its switch takes exactly its user layer off, and back */
    const ugj = () => (M.getStyle().layers || []).filter((l) => /^ugj-\d+-/.test(l.id)).map((l) => [l.id, !l.layout || l.layout.visibility !== 'none']);
    const rs = document.querySelectorAll('#atlas-panel .atl-b.a'); const chip = rs[rs.length - 1].querySelector('.atl-map-toggle');
    const shadeSwitch = { chip: !!chip, before: ugj() };
    if (chip) { chip.click(); await sleep(100); M.fire('styledata'); await sleep(250); shadeSwitch.off = ugj(); chip.click(); await sleep(150); shadeSwitch.on = ugj(); }
    await C.runDirect('tabs', [{ type: 'controls', items: [{ kind: 'tabs', options: [{ label: 'A', calls: copy(optA) }, { label: 'B', calls: copy(optB) }] }] }]);
    const bs = document.querySelectorAll('#atlas-panel .atl-b.a'); const row = bs[bs.length - 1].querySelector('.atl-ctl-tabrow');
    if (!row) return { notDrawn: String(bs[bs.length - 1].textContent || '').slice(0, 400) };
    /* the colour each group is painted with: the topmost visible user layer's own paint, read back from the renderer */
    const colours = () => { const st = M.getStyle(); const ls = (st.layers || []).filter((l) => /^ugj-\d+-fill$/.test(l.id) && (!l.layout || l.layout.visibility !== 'none'));
      const top = ls[ls.length - 1]; if (!top) return null;
      const src = GE.layers.sourceData(top.source); const groups = [...new Set(((src && src.features) || []).map((f) => f.properties && f.properties.group).filter((g) => g != null))];
      return { layer: top.id, paint: M.getPaintProperty(top.id, 'fill-color'), groups }; };
    const press = async (i) => { row.querySelector('.atl-ctl-tab[data-i="' + i + '"]').click(); await sleep(50); for (let w = 0; w < 600 && (row.querySelector('.busy') || row.getAttribute('data-confirmed') !== String(i)); w++) await sleep(50); await sleep(150);
      return { confirmed: row.getAttribute('data-confirmed'), year: window.IntMapTime.year(), colours: colours() }; };
    const b = await press(1); const a = await press(0); const b2 = await press(1);
    /* leave the page cleared: the map, the clock, the panel */
    try { await C.dispatch({ type: 'clear' }); await C.dispatch({ type: 'timeTravel', now: true }); C.close(); } catch (_) { }
    return { a, b, b2, shadeSwitch };
  });
  expect(r.shadeSwitch.chip, 'the shading reply has a switch').toBe(true);
  expect(r.shadeSwitch.before.length, 'the shading drew its user layer').toBeGreaterThan(0);
  expect(r.shadeSwitch.off.filter(([, v]) => v), 'OFF hides it (and a style event does not bring it back)').toEqual([]);
  expect(r.shadeSwitch.on, 'ON brings it back').toEqual(r.shadeSwitch.before);
  expect(r.notDrawn, 'the tab row was drawn').toBeUndefined();
  expect(r.b).toMatchObject({ confirmed: '1', year: 2000 });
  expect(r.a).toMatchObject({ confirmed: '0', year: 1900 });
  expect(r.b2).toMatchObject({ confirmed: '1', year: 2000 });
  expect(r.a.colours && r.b.colours, 'each option shaded the areas').toBeTruthy();
  expect(r.a.colours.groups.sort()).toEqual(['North', 'South']);
  expect(r.b.colours.groups.sort()).toEqual(['Islands', 'North', 'South']);
  /* the shared colour scale (geo.shadeAreas "compare"): a group painted in one option has the same colour in the other */
  const colourOf = (c, g) => { const p = c.paint; if (!Array.isArray(p) || p[0] !== 'match') return JSON.stringify(p); for (let i = 2; i < p.length - 1; i += 2) if (p[i] === g || (Array.isArray(p[i]) && p[i].includes(g))) return p[i + 1]; return null; };
  for (const g of ['North', 'South']) {
    expect(colourOf(r.a.colours, g), g + ' is painted').toBeTruthy();
    expect(colourOf(r.a.colours, g), g + ' keeps one colour across the options').toBe(colourOf(r.b.colours, g));
    expect(colourOf(r.b.colours, g), g + ' is the same after pressing back and forth').toBe(colourOf(r.b2.colours, g));
  }
});
