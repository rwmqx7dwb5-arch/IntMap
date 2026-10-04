/* ============================================================================
 *  IntMap · place-dossier — the card opened from the right-click menu, in a browser
 * ----------------------------------------------------------------------------
 *  What a node check cannot see: the menu entry exists in the shipped menu, the module is fetched by that
 *  click, the card is on screen with every section answered (a value or a reason — never a blank), the
 *  layer that is on appears as a row, and the × closes it. One page, one load.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { BASE } from './helpers/session-seed.js';

test('place dossier: right-click → Live info → About the place opens a card that answers every section', async ({ page }) => {
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
  const entry = page.locator('#ctx-menu button[data-act]', { hasText: 'About the place' });
  await expect(entry).toHaveCount(1);
  /* (place-card-unify) ONE entry for the one card — «Right now» opened a second card for the same point */
  await expect(page.locator('#ctx-menu button[data-act]', { hasText: 'Right now' })).toHaveCount(0);
  /* the entry lives in a collapsed group — open the group that holds it, as a reader would */
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#ctx-menu button[data-act]')].find((x) => /About the place/.test(x.textContent));
    const sec = b && b.closest('.ctx-sec');
    if (sec && sec.hidden) { const grp = sec.previousElementSibling && sec.previousElementSibling.classList.contains('ctx-grp') ? sec.previousElementSibling : document.querySelector('#ctx-menu .ctx-grp[data-grp="' + sec.getAttribute('data-sec') + '"]'); if (grp) grp.click(); }
  });
  await entry.click();
  const card = page.locator('#pd-popup');
  await expect(card).toBeVisible({ timeout: 15000 });
  /* every section settles to a value or a reason — the «Reading…» placeholder is gone */
  await expect(card.locator('[data-pending]')).toHaveCount(0, { timeout: 30000 });
  const got = await page.evaluate(() => {
    const c = document.getElementById('pd-popup');
    const rows = [...c.querySelectorAll('.acp-row')].map((r) => ({ k: (r.querySelector('.acp-k') || {}).textContent || '', v: (r.querySelector('.acp-v') || r).textContent.trim() }));
    const box = c.getBoundingClientRect();
    return { rows, secs: [...c.querySelectorAll('.acp-sec')].map((s) => s.textContent), title: c.querySelector('#pd-title').textContent.trim(),
      inView: box.top >= 0 && box.left >= 0 && box.right <= innerWidth + 1, emptyValues: rows.filter((r) => !r.v).length,
      /* the «now» and «past» sections of the same card: each says a value or a reason */
      now: [...c.querySelectorAll('.hn-sec')].map((s) => ({ h: s.querySelector('.hn-h').textContent, empty: !s.textContent.replace(s.querySelector('.hn-h').textContent, '').trim() })) };
  });
  expect(got.title.length, 'the card names the point (a place name or its coordinates)').toBeGreaterThan(0);
  expect(got.secs.join('|')).toMatch(/This point.*Time and sun.*Layers on the map/);
  for (const k of ['Coordinates', 'Country', 'Local time']) expect(got.rows.some((r) => r.k === k), k).toBe(true);
  expect(got.rows.some((r) => r.k === 'Elevation' || r.k === 'Sea depth'), 'elevation or depth').toBe(true);
  expect(got.emptyValues, 'no row is blank — a hole carries its reason: ' + JSON.stringify(got.rows)).toBe(0);
  expect(got.now.map((s) => s.h).join('|')).toMatch(/Weather now.*Earthquakes nearby.*News nearby.*This place in the past/i);
  for (const s of got.now) expect(s.empty, s.h + ' says a value or a reason').toBe(false);
  expect(got.inView).toBe(true);
  await card.locator('#pd-close').click();
  await expect(card).toBeHidden();
});
