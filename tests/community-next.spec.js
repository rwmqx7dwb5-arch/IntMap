/* ============================================================================
 *  IntMap · community-next — a map correction, sent and answered, in a browser
 * ----------------------------------------------------------------------------
 *  What the node checks cannot see: the context-menu entry is in the shipped menu, the module is fetched by
 *  that click, the card attaches the map state (the share fragment) and the point to what it sends, the
 *  receipt the function answers is kept on the device, and «My map reports» shows the operator's answer read
 *  back with that receipt. The two backend calls are answered by the test (no row is written anywhere).
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { BASE } from './helpers/session-seed.js';

const RECEIPT = 'TESTtestTESTtestTESTtestTESTtestTESTtest123';

test('map correction: right-click → report → the receipt is kept → the answer comes back in My map reports', async ({ page }) => {
  let sent = null, asked = null;
  await page.route('**/functions/v1/reader-reports', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    sent = JSON.parse(route.request().postData() || 'null');
    return route.fulfill({ status: 201, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ stored: true, receipt: RECEIPT }) });
  });
  await page.route('**/rest/v1/rpc/map_correction_status', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
    asked = JSON.parse(route.request().postData() || 'null');
    const hash = await page.evaluate(async (r) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(r))), (b) => b.toString(16).padStart(2, '0')).join(''), RECEIPT);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify([{ receipt_hash: hash, id: '00000000-0000-4000-8000-000000000001', created_at: new Date().toISOString(), kind: 'name', status: 'fixed',
        reply: 'Thank you — the label now reads correctly.', fixed_ref: 'https://github.com/rwmqx7dwb5-arch/IntMap/pull/1', resolved_at: new Date().toISOString(),
        published: false, place_label: null, layer_label: null, lng: sent ? sent.lng : 0, lat: sent ? sent.lat : 0, year: null, map_link: sent ? sent.mapLink : null, message: 'The name is wrong' }]) });
  });
  await page.goto(BASE + '/?rafshim=1');
  await page.waitForFunction(() => window.__imBoot && window.__imBoot.isDone(), null, { timeout: 60000 });
  const pt = await page.evaluate(() => {
    const mc = document.getElementById('map-container').getBoundingClientRect();
    for (const fx of [0.6, 0.7, 0.5]) for (const fy of [0.5, 0.6, 0.4]) {
      const x = Math.round(mc.x + mc.width * fx), y = Math.round(mc.y + mc.height * fy);
      const top = document.elementsFromPoint(x, y)[0];
      if (top && top.tagName === 'CANVAS') return { x, y };
    }
    return null;
  });
  expect(pt, 'a point on the map canvas').not.toBeNull();
  await page.mouse.click(pt.x, pt.y, { button: 'right' });
  const entry = page.locator('#ctx-menu button[data-act]', { hasText: 'Report a map error here' });
  await expect(entry).toHaveCount(1);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#ctx-menu button[data-act]')].find((x) => /Report a map error here/.test(x.textContent));
    const sec = b && b.closest('.ctx-sec');
    if (sec && sec.hidden) { const grp = sec.previousElementSibling && sec.previousElementSibling.classList.contains('ctx-grp') ? sec.previousElementSibling : document.querySelector('#ctx-menu .ctx-grp[data-grp="' + sec.getAttribute('data-sec') + '"]'); if (grp) grp.click(); }
  });
  await entry.click();
  const card = page.locator('#mc-popup');
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.locator('select[name="what"]').selectOption('name');
  /* an empty description is refused before the network */
  await card.locator('button[type="submit"]').click();
  await expect(card.locator('.mc-status')).toHaveClass(/is-bad/);
  expect(sent, 'nothing was sent').toBeNull();
  await card.locator('textarea[name="message"]').fill('The name is wrong');
  await card.locator('button[type="submit"]').click();
  await expect(card.locator('.mc-status')).toHaveClass(/is-ok/, { timeout: 15000 });
  expect(sent.kind).toBe('correction');
  expect(sent.what).toBe('name');
  expect(Number.isFinite(sent.lng) && Number.isFinite(sent.lat)).toBe(true);
  expect(String(sent.mapLink || '')).toMatch(/^#v=-?\d/);
  expect(sent.message).toBe('The name is wrong');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('intmap_corrections') || 'null'));
  expect(stored.items[0].receipt).toBe(RECEIPT);
  expect(stored.items[0].hash).toMatch(/^[0-9a-f]{64}$/);
  /* the answer, read back with the receipt */
  await card.locator('button', { hasText: 'My map reports' }).click();
  const mine = page.locator('#mc-mine');
  await expect(mine).toBeVisible();
  await expect(mine.locator('.mc-chip')).toHaveText('Fixed', { timeout: 15000 });
  await expect(mine.locator('.mc-reply')).toContainText('the label now reads correctly');
  expect(asked.p_receipts).toEqual([RECEIPT]);
  const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('intmap_corrections')).items[0].seen);
  expect(seen, 'the answer is marked as seen, so it is told once').toBe('fixed');
});
