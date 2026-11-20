/* declarative-workspace — a view Atlas declares (ui.compose) is drawn in the real reply, and a bad one is refused with
   its reasons. Driven through the console's own door (runDirect → the executor → the dispatch), no model. The rules
   themselves are held by tests/declarative-workspace-checks.test.mjs; this holds that the page draws what they say. */
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

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

test('declarative-workspace: a view is drawn with IntMap parts, a bad one is refused with every reason', async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(context);
  const page = await context.newPage();
  await page.goto('/', { waitUntil: 'load' });
  await page.evaluate(() => window.IntMapLazy.need('atlasConsole'));
  await page.waitForFunction(() => !!window.IntMapConsole, null, { timeout: 60_000 });

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
  await context.close();
});
