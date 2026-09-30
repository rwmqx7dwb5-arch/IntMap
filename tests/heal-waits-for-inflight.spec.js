/* ============================================================================
 *  heal-waits-for-inflight — a row whose request is still arriving is not pulsed
 * ----------------------------------------------------------------------------
 *  Production, 2026-09-27, a normal boot: the radar row was ticked and waited for
 *  RainViewer's frame index before it could add its layer. The #R109 look, 2.8 s
 *  after the tick, found no layer yet and pulsed the box off→on — one
 *  `toggle-heal` for dl-radar in IntMapLayerAudit.log() — and 34 radar tiles the
 *  first request had started ended ERR_ABORTED. The box ended ticked and drawn:
 *  the pulse had only re-asked for the index that was already on its way.
 *
 *  Here the same boot, the same tick, and the index answered later than the look
 *  (the only thing this spec controls is WHEN the index arrives — its content is
 *  the fixture the held-heal spec uses, and the tiles are a 1-px PNG). The claim:
 *  the look waits for the request, the box is drawn, nothing is pulsed, and no
 *  radar tile is aborted. (The logic itself — look once after the request settles,
 *  fulfilled or rejected — is run in tests/heal-waits-for-inflight-checks.test.mjs.)
 *
 *  (layer-failure-state) …and the other end of the same request: when it settles as a REFUSAL, the
 *  registry forgets it (that is right for «in flight») and js/layer-state.js keeps it — the row and its
 *  sidebar tile say «Couldn't load», the owner holds { failed, http, 503 } for Atlas, and the one live
 *  region (js/notify.js) spoke once. The logic is run in tests/layer-failure-state-checks.test.mjs.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

/* later than the look (2.8 s after the tick), with room: the look must have come and gone */
const INDEX_DELAY_MS = 4500;
const RV_INDEX = () => ({ version: '2.0', generated: Math.floor(Date.now() / 1000), host: 'https://tilecache.rainviewer.com',
  radar: { past: [{ time: Math.floor(Date.now() / 1000) - 600, path: '/v2/radar/fixture' }], nowcast: [] }, satellite: { infrared: [] } });
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('the look after a tick waits for the radar index instead of pulsing the box', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, storageState: seededStorageState([]) });
  await installHermeticRouting(ctx);
  await ctx.route('https://api.rainviewer.com/**', (r) => setTimeout(() => {
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RV_INDEX()) }).catch(() => {});
  }, INDEX_DELAY_MS));
  await ctx.route('https://tilecache.rainviewer.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX }));
  const page = await ctx.newPage();
  const aborted = [];
  page.on('requestfailed', (req) => {
    if (/tilecache\.rainviewer\.com/.test(req.url()) && /ABORTED/i.test((req.failure() || {}).errorText || '')) aborted.push(req.url());
  });
  try {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      try { return !!window.__imap && window.IntMapGeoEngine.canDraw() && !!document.getElementById('dl-radar') && !!window.IntMapLayerAudit; } catch (_) { return false; }
    }, null, { timeout: 60_000 });

    /* a reader's tick on a map that can draw — nothing is held, the row starts its request */
    const t0 = await page.evaluate(() => {
      const c = document.getElementById('dl-radar'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
      return { held: window.IntMapLayerHold.pending(), at: Date.now() };
    });
    expect(t0.held, 'nothing was held — this is the delivered case').toEqual([]);

    /* the box is drawn once the index arrives … */
    await expect.poll(() => page.evaluate(() => ({
      checked: document.getElementById('dl-radar').checked,
      drawn: (window.__imap.getStyle().layers || []).some((l) => l.id === 'lyr-radar'),
    })), { timeout: 30_000, message: 'the radar box stays ticked and its layer is drawn' }).toEqual({ checked: true, drawn: true });
    /* … and the look that was waiting has had its turn (it looks right after the request settles) */
    await page.waitForFunction((at) => Date.now() - at > 2800 + 1000, t0.at, { timeout: 10_000 });
    const healed = await page.evaluate(() => (window.IntMapLayerAudit.log() || []).filter((e) => e.id === 'dl-radar'));
    expect(healed, 'the look pulsed a box whose request was still being answered').toEqual([]);
    expect(aborted, 'radar tiles were aborted by a pulse').toEqual([]);
  } finally { await ctx.close(); }
});

test('(layer-failure-state) a refused radar index is KEPT: marked on the row and its tile, held by the owner, announced once, cleared by the next tick', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, storageState: seededStorageState([]) });
  await installHermeticRouting(ctx);
  await ctx.route('https://api.rainviewer.com/**', (r) => r.fulfill({ status: 503, contentType: 'text/plain', body: 'unavailable' }));
  const page = await ctx.newPage();
  try {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      try { return !!window.__imap && window.IntMapGeoEngine.canDraw() && !!document.getElementById('dl-radar') && !!window.IntMapLayerState && !!window.IntMapNotify; } catch (_) { return false; }
    }, null, { timeout: 60_000 });
    const before = await page.evaluate(() => window.IntMapNotify.log().length);
    await page.evaluate(() => { const c = document.getElementById('dl-radar'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });

    await expect.poll(() => page.evaluate(() => { const s = window.IntMapLayerState.get('dl-radar'); return s && [s.state, s.reason, s.status]; }),
      { timeout: 30_000, message: 'the owner does not hold the refusal' }).toEqual(['failed', 'http', 503]);
    const row = await page.evaluate(() => {
      const cb = document.getElementById('dl-radar');
      const m = cb.closest('label').querySelector(':scope > .lyr-state');
      return { checked: cb.checked, mark: m && m.textContent, state: m && m.dataset.state, onBox: cb.dataset.imState };
    });
    expect(row).toEqual({ checked: false, mark: "Couldn't load", state: 'failed', onBox: 'failed' });
    /* …and on every tile that stands for the box — the face the desktop sidebar actually shows. The tile
       grid is (re)built after the failure here, so this is also the «a rebuilt tile gets its mark» case. */
    const tiles = await page.evaluate(async () => {
      const S = window.IntMapLayerSidebar;
      if (!document.querySelector('.lst-tile[data-lid]')) { try { S.toggle(); } catch (_) {} }
      for (let i = 0; i < 100 && !document.querySelector('.lst-tile[data-lid="dl-radar"]'); i++) await new Promise((r) => requestAnimationFrame(r));
      /* the mark is written by a MutationObserver callback — a microtask after the tile is inserted */
      await new Promise((r) => requestAnimationFrame(r));
      return Array.from(document.querySelectorAll('.lst-tile[data-lid="dl-radar"]')).map((t) => {
        const m = t.querySelector(':scope > .lyr-state');
        return { state: t.dataset.imState, mark: m && m.textContent, visible: !!(m && m.getClientRects().length && getComputedStyle(m).display !== 'none') };
      });
    });
    expect(tiles.length, "no tile stands for the radar box — the tile case was not exercised").toBeGreaterThan(0);
    for (const t of tiles) expect(t).toEqual({ state: 'failed', mark: "Couldn't load", visible: true });

    /* ONE region, and the failure spoken into it once */
    const told = await page.evaluate((n) => {
      const R = window.IntMapNotify.region();
      return { log: window.IntMapNotify.log().slice(n).filter((e) => /weather/i.test(e.text)),
        boxes: document.querySelectorAll('.sat-toast').length,
        role: R.querySelector('.im-toast-polite').getAttribute('role'), live: R.querySelector('.im-toast-polite').getAttribute('aria-live'),
        text: R.querySelector('.im-toast-polite').textContent };
    }, before);
    expect(told.log.filter((e) => !e.folded).length, 'the failure was announced other than once').toBe(1);
    expect(told.boxes, 'more than one toast element').toBe(1);
    expect([told.role, told.live]).toEqual(['status', 'polite']);
    expect(told.text).toBe('Live weather data unavailable');

    /* Atlas's read — plain data */
    const snap = await page.evaluate(() => window.IntMapLayerState.snapshot().find((r) => r.id === 'dl-radar'));
    expect(snap).toMatchObject({ state: 'failed', reason: 'http', status: 503 });

    /* the reader tries again: the old outcome no longer describes the row */
    await page.evaluate(() => { const c = document.getElementById('dl-radar'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
    const again = await page.evaluate(() => document.getElementById('dl-radar').closest('label').querySelector(':scope > .lyr-state'));
    expect(again, 'the mark survived a fresh attempt').toBeNull();
  } finally { await ctx.close(); }
});
