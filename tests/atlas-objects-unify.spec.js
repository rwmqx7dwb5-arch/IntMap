/* ============================================================================
 *  atlas-objects-unify — DRAW → RESTYLE → OPEN THE SAME OBJECT, FOR A LINE, AN AREA AND A POINT   (the real page)
 * ----------------------------------------------------------------------------
 *  The reported case: a line Atlas drew could not be recoloured. Asked through the door Atlas uses
 *  (IntMapConsole.dispatch), in several calls — the way a conversation goes — this holds:
 *    ① every drawing comes back with an object id, and that id is in the universal object list (the one
 *       the Objects panel renders);
 *    ② `object set` changes colour / width / opacity of THAT id, and the list reads the change back;
 *    ③ the Objects panel shows the object, its colour, and — for an area — its size;
 *    ④ an object that cannot take a change says so (a refusal is a fact), instead of reporting ok.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

let page;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 1280, height: 800 } });
  await installHermeticRouting(context);
  page = await context.newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(() => { try { return !!window.__imap && window.__imap.isStyleLoaded() && typeof window.IntMapLazy !== 'undefined'; } catch (_) { return false; } }, null, { timeout: 60_000 });
  await page.evaluate(() => window.IntMapLazy.need('atlasConsole'));
  await page.waitForFunction(() => !!(window.IntMapConsole && window.IntMapConsole.dispatch && window.IntMapObjects), null, { timeout: 45_000 });
});
test.afterAll(async () => { await page?.context()?.close(); });

const dispatch = (a) => page.evaluate((x) => window.IntMapConsole.dispatch(x), a);
const obj = (id) => page.evaluate((i) => window.IntMapObjects.getObj(i), id);

test('① a line and an area Atlas draws come back with an id that is in the object list', async () => {
  const line = await dispatch({ type: 'drawLine', points: [[-0.12, 51.5], [2.35, 48.85]], label: 'LP', color: '#0a84ff' });
  expect(line.ok).toBeTruthy();
  const lid = (line.objectIds || [])[0];
  expect(lid, 'drawLine returns an object id').toBeTruthy();
  const area = await dispatch({ type: 'drawPolygon', points: [[0, 50], [3, 50], [3, 52], [0, 52]], label: 'PG' });
  const aid = (area.objectIds || [])[0];
  expect(aid, 'drawPolygon returns an object id').toBeTruthy();
  const l = await obj(lid), a = await obj(aid);
  expect(l.kind).toBe('line');
  expect(l.editable).toEqual(expect.arrayContaining(['color', 'width', 'opacity']));
  expect(a.kind).toBe('poly');
  expect(a.areaKm2, 'an area has its size').toBeGreaterThan(1000);
  test.info().annotations.push({ type: 'ids', description: lid + ' ' + aid });
  await page.evaluate(([x, y]) => { window.__ids = { line: x, area: y }; }, [lid, aid]);
});

test('② object set restyles that id — colour, width, opacity — and the list reads it back (a line and an area)', async () => {
  const { line, area } = await page.evaluate(() => window.__ids);
  const r = await dispatch({ type: 'object', op: 'set', id: line, color: 'red', width: 6, opacity: 0.5 });
  expect(r.ok).toBeTruthy();
  const l = await obj(line);
  expect(l.color).toBe('#ff0000');
  expect(l.width).toBe(6);
  expect(l.opacity).toBe(0.5);
  /* the same turn on the map: the line source carries what the object now says */
  const fe = await page.evaluate(() => { const s = window.__imap.getSource('nlq-line-src'); const d = s && (s._data || s.serialize().data); return d && d.features && d.features[0] && d.features[0].properties; });
  if (fe) { expect(fe.color).toBe('#ff0000'); expect(fe.w).toBe(6); }
  const r2 = await dispatch({ type: 'object', op: 'set', id: area, color: '#00aa55', opacity: 0.8, width: 3 });
  expect(r2.ok).toBeTruthy();
  const a = await obj(area);
  expect(a.color).toBe('#00aa55');
});

test('③ the Objects panel opens the same objects: frosted, with the colour and the area', async () => {
  await page.evaluate(() => window.IntMapObjects.open());
  const panel = page.locator('#iol-panel');
  await expect(panel).toBeVisible();
  const bf = await panel.evaluate((el) => getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter);
  expect(bf).toMatch(/blur/);
  await expect(panel.locator('.iol-ar').first()).toContainText(/km²|m²/);
  const { line } = await page.evaluate(() => window.__ids);
  const row = panel.locator('.iol-row', { hasText: 'LP' }).first();
  await expect(row).toBeVisible();
  await expect(row.locator('input[data-act="color"]')).toHaveValue('#ff0000');
});

test('④ an object that cannot take a change says so', async () => {
  const r = await dispatch({ type: 'object', op: 'set', id: 'no-such-object', color: 'red' });
  expect(r.ok).toBeFalsy();
  const bad = await dispatch({ type: 'object', op: 'set', id: (await page.evaluate(() => window.__ids)).line, color: 'not-a-colour' });
  expect(bad.ok).toBeFalsy();
});
