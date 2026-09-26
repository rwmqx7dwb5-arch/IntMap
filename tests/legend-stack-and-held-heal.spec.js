/* ============================================================================
 *  legend-stack-and-held-heal — two defects production showed on 2026-09-27
 * ----------------------------------------------------------------------------
 *  ① A NEW READER'S DESKTOP DREW ONE LEGEND OVER ANOTHER.
 *     A fresh profile at 1440×900 starts with Köppen and the submarine cables on.
 *     Measured before the fix (this harness, the same pair): the Köppen card at
 *     y 74…559 and the cables card at y 546…737 — 13 px on top of each other; at
 *     1280×720 the cables card (366…557) sat wholly on Köppen's lower half.
 *     tileLegends() took its population from `el.style.display === 'block'`; the
 *     desktop Köppen card is shown as `flex`, so the stack was built as if it were
 *     not there. The claim is about the SCREEN — no two legend cards on it overlap —
 *     so it holds for whichever legends are on, not for a pair. (Both window sizes,
 *     and a busier stack, are driven through the shipped tiler in
 *     tests/legend-stack-and-held-heal-checks.test.mjs.)
 *
 *  ② THE POST-TOGGLE HEAL SWITCHED OFF A LAYER WHOSE CHANGE WAS BEING HELD.
 *     A box ticked while the renderer cannot take layers is held by
 *     js/layer-rows.js (holdUntilDrawable) until it can. The #R109 heal looked
 *     2.8 s later, found nothing painted — nothing CAN be painted yet — and pulsed
 *     the box off→on. The pulse's «off» was held too; when the renderer came back
 *     inside the 420 ms between the two halves, the gate delivered that «off» as a
 *     change with no mark of being the heal's own, the reconciler read it as the
 *     reader unticking, and the second half stood down: box unticked, no layer.
 *     Reproduced deterministically: tick the radar while the style is held, and if
 *     the heal pulses it, release the style ON the pulse. Measured before the fix:
 *     2 runs of 2 ended `{ checked: false, drawn: false }`.
 *
 *  ⚠ ONE BOOT FOR BOTH, on purpose: the suite's total time has no headroom
 *  (scripts/test-budget.mjs), and the held boot at 1440×900 with the first-time
 *  reader's pair restored IS the production scenario of both reports — a new
 *  reader's legends, in a tab that booted hidden. The radar ② ticks is the third
 *  legend ① is asked about.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { sessionWith, seededStorageState } from './helpers/session-seed.js';

/* every legend card on screen that the reader has not dragged, and every pair of them that overlaps */
const OVERLAPS = () => {
  const cards = [...document.querySelectorAll('.data-legend, .koppen-legend')].filter((el) => {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 1 && r.height > 1 && !el.dataset.dragged;
  }).map((el) => ({ id: el.id, r: el.getBoundingClientRect() }));
  const out = [];
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i].r, b = cards[j].r;
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > 0.5 && h > 0.5) out.push(`#${cards[i].id} [${Math.round(a.left)},${Math.round(a.top)}…${Math.round(a.right)},${Math.round(a.bottom)}] × #${cards[j].id} [${Math.round(b.left)},${Math.round(b.top)}…${Math.round(b.right)},${Math.round(b.bottom)}]: ${Math.round(w)}×${Math.round(h)} px`);
  }
  return { ids: cards.map((c) => c.id), out };
};

/* A hidden tab runs no animation frames and MapLibre parses its style inside one — the same hold
   tests/restored-layer-before-style.spec.js uses: frames are queued (and the document reports
   hidden) until the test releases them. No response is delayed and no module is patched. */
const HOLD_FRAMES = () => {
  const q = [];
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  let held = true, seq = 0;
  const map = new Map();
  window.requestAnimationFrame = (cb) => {
    if (!held) return raf(cb);
    const id = -(++seq); map.set(id, cb); q.push(id); return id;
  };
  window.cancelAnimationFrame = (id) => { if (id < 0) map.delete(id); else caf(id); };
  try {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (held ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => held });
  } catch (_) {}
  window.__styleHeldRelease = () => {
    held = false;
    for (const id of q.splice(0)) { const cb = map.get(id); map.delete(id); if (cb) raf(cb); }
    try { document.dispatchEvent(new Event('visibilitychange')); } catch (_) {}
  };
};
/* RainViewer's frame index, answered locally: the radar branch builds its layer only once it has a
   frame to point at, and the suite's routing blocks the real host. */
const RV_INDEX = () => ({ version: '2.0', generated: Math.floor(Date.now() / 1000), host: 'https://tilecache.rainviewer.com',
  radar: { past: [{ time: Math.floor(Date.now() / 1000) - 600, path: '/v2/radar/fixture' }], nowcast: [] }, satellite: { infrared: [] } });

test('a tick held while the style loads is not pulsed off by the heal, and the first-time reader\'s legends never overlap', async ({ browser }) => {
  test.setTimeout(120_000);
  /* the default-on thematic pair a fresh profile starts with (js/layer-manifest.js `on: true`) */
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 },
    storageState: seededStorageState([], sessionWith(['dl-climate', 'dl-subcables'])) });
  await installHermeticRouting(ctx);
  await ctx.route('https://api.rainviewer.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RV_INDEX()) }));
  await ctx.addInitScript(HOLD_FRAMES);
  const page = await ctx.newPage();
  try {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      try { return !!window.__imap && window.IntMapGeoEngine.hasRenderer() && !!document.getElementById('dl-radar') && !!window.IntMapLayerAudit; } catch (_) { return false; }
    }, null, { timeout: 60_000 });

    /* ② a reader's tick while the style cannot take layers */
    const at = await page.evaluate(() => {
      const c = document.getElementById('dl-radar'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
      return { canDraw: !!window.IntMapGeoEngine.canDraw(), held: window.IntMapLayerHold.pending() };
    });
    expect(at.canDraw, 'the style is still unparsed when the box is ticked').toBe(false);
    expect(at.held, 'the tick was held by the gate').toContain('dl-radar');
    /* the heal looks 2.8 s after the tick. If it pulses the held box, release the style ON the pulse —
       inside the 420 ms between its halves, which is the production race made deterministic. */
    const pulsed = await page.waitForFunction(() => {
      const hit = (window.IntMapLayerAudit.log() || []).some((e) => e.id === 'dl-radar');
      if (hit) window.__styleHeldRelease();
      return hit;
    }, null, { timeout: 4_500, polling: 20 }).then(() => true, () => false);
    if (!pulsed) await page.evaluate(() => window.__styleHeldRelease());
    await page.waitForFunction(() => {
      try { return window.IntMapGeoEngine.canDraw() && window.IntMapLayerHold.pending().length === 0; } catch (_) { return false; }
    }, null, { timeout: 60_000 });
    /* the reader's outcome first … */
    await expect.poll(() => page.evaluate(() => ({
      checked: document.getElementById('dl-radar').checked,
      drawn: (window.__imap.getStyle().layers || []).some((l) => l.id === 'lyr-radar'),
    })), { timeout: 30_000, message: 'the radar box stays ticked and its layer is drawn' }).toEqual({ checked: true, drawn: true });
    /* …and the observer's half on its own: nothing can be drawn while a change is held, so «not drawn»
       then is not a failure to heal (.agents/rules/one-pass-or-a-reason.md §5) */
    expect(pulsed, 'the heal judged a box whose change had not been delivered yet').toBe(false);

    /* ① the three legend cards now on screen: the first-time reader's pair and the radar's */
    const want = ['koppen-legend', 'data-legend-subcables', 'data-legend-radar'];
    await page.waitForFunction((ids) => ids.every((id) => {
      const el = document.getElementById(id); return el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 30;
    }), want, { timeout: 30_000 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
    const L = await page.evaluate(OVERLAPS);
    expect(L.ids, 'the legend cards are on screen').toEqual(expect.arrayContaining(want));
    expect(L.out, `legend cards overlap (${L.ids.join(', ')})`).toEqual([]);
    /* the Köppen card is still where its stylesheet put it: anchored by its top, so its resize grip
       stretches it downward (#R150). The fix moved the OTHERS clear of it; it did not move it. */
    const kTop = await page.evaluate(() => Math.round(document.getElementById('koppen-legend').getBoundingClientRect().top));
    expect(kTop, 'the Köppen card keeps its top-anchored place').toBeLessThan(120);
  } finally { await ctx.close(); }
});
