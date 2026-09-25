/* ============================================================================
 *  restored-layer-before-style — a layer restored before the style can take it
 * ----------------------------------------------------------------------------
 *  Observed on production (2026-09-26): a link carrying `&l=dl-planes,dl-radar`
 *  opened in a tab that was HIDDEN while it booted. The restore ticked both boxes
 *  and dispatched their `change` before the basemap style was parsed:
 *    · `Uncaught Error: Style is not done loading.` from the aircraft handler
 *      (startTraffic adds its layer synchronously), and
 *    · `Uncaught (in promise) Error: Style is not done loading.` ×2 from the radar
 *      branch, whose `whenStyleReady()` had HARD-RESOLVED after ~6 s and said
 *      「ready」 to a style that was not.
 *  Nothing retried. The tab became visible, the style loaded, and twenty seconds
 *  later neither `lyr-planes` nor `lyr-radar` existed while both boxes stayed
 *  ticked. Unticking and re-ticking drew them.
 *
 *  ── HOW THE HIDDEN TAB IS REPRODUCED ────────────────────────────────────────
 *  A hidden tab runs no animation frames. MapLibre parses a style inside a frame
 *  (`browser.frame` → requestAnimationFrame), so in a hidden tab the style stays
 *  unparsed while timers — and therefore every restore — keep running. The init
 *  script below holds requestAnimationFrame callbacks (and reports the document
 *  as hidden) until the test releases them, which is that condition and nothing
 *  more: no response is delayed and no module of the app is patched.
 *
 *  ── WHAT IS ASSERTED ────────────────────────────────────────────────────────
 *  ① the reported pair: after release both layers exist, nothing threw, and the
 *     app's own `load` work ran.
 *  ② EVERY layer a share link can carry (js/layer-manifest.js `sharedIds()`, read
 *     here, not typed): the same link is opened normally and then with the style
 *     held back, and every map layer the normal boot has must also appear after
 *     the held one. The claim is 「holding the style back costs no layer」, measured
 *     against the app itself rather than against a list of layer ids somebody
 *     would have to keep in step. MEASURED on the code before the fix: 23 layers
 *     missing (the aircraft, the ships, the volcano overlays, the base roads/rail/
 *     admin lines …), not only the two that were reported.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';
import { sharedIds } from '../js/layer-manifest.js';

/* how long the style is held back. The clocks that decided the failure were the share-link
   restore's own fallback (js/map-ui.js boots it at 8 s when the renderer has not said `load`) and
   whenStyleReady's old ~6 s hard resolve counted from the restore; the hold has to outlast both
   for the old defect to be reachable at all. */
const HOLD_MS = 16000;
/* how long the normal boot is given before its layer set is taken as the reference */
const SETTLE_MS = 12000;

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
   frame to point at, and the suite's routing blocks the real host. Tiles stay blocked — a raster
   layer exists whether or not its tiles arrive, and existence is the claim. */
const RV_INDEX = () => ({ version: '2.0', generated: Math.floor(Date.now() / 1000), host: 'https://tilecache.rainviewer.com',
  radar: { past: [{ time: Math.floor(Date.now() / 1000) - 600, path: '/v2/radar/fixture' }], nowcast: [] }, satellite: { infrared: [] } });

async function openLink(browser, ids, { hold }) {
  const ctx = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(ctx);
  await ctx.route('https://api.rainviewer.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RV_INDEX()) }));
  if (hold) await ctx.addInitScript(HOLD_FRAMES);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html#v=139.7000,35.7000,4.00,0,0,f&l=' + ids.join(','), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 60000 });
  let drawableWhileHeld = null;
  if (hold) {
    await page.waitForTimeout(HOLD_MS);
    drawableWhileHeld = await page.evaluate(() => { try { return !!window.IntMapGeoEngine.canDraw(); } catch (_) { return null; } });
    await page.evaluate(() => window.__styleHeldRelease());
  }
  await page.waitForFunction(() => { try { return window.IntMapGeoEngine.canDraw(); } catch (_) { return false; } }, null, { timeout: 60000 });
  return { ctx, page, errors, drawableWhileHeld };
}

const mapLayers = (page) => page.evaluate(() => { try { return (window.__imap.getStyle().layers || []).map((l) => l.id); } catch (_) { return []; } });
/* js/app-body.js reports 88 ('layers-fired') from inside the renderer's `load` handler */
const bootProgress = (page) => page.evaluate(() => { try { return window.__imBoot.progress(); } catch (_) { return null; } });
const styleErrors = (errs) => errs.filter((e) => /Style is not done loading/i.test(e));

test.describe.configure({ mode: 'parallel' });

test('the reported pair: aircraft and radar restored before the style are drawn once it is', async ({ browser }) => {
  test.setTimeout(150000);
  const ids = ['dl-planes', 'dl-radar'];
  const r = await openLink(browser, ids, { hold: true });
  try {
    /* the condition itself — without it this test proves nothing */
    expect(r.drawableWhileHeld, 'the style must still be unparsed while the restore runs').toBe(false);
    await expect.poll(() => mapLayers(r.page), { timeout: 30000, message: 'the restored layers are on the map' })
      .toEqual(expect.arrayContaining(['lyr-planes', 'lyr-radar']));
    expect(await r.page.evaluate((w) => w.map((id) => document.getElementById(id).checked), ids)).toEqual([true, true]);
    await expect.poll(() => bootProgress(r.page), { timeout: 30000, message: "the app's own load work ran" }).toBeGreaterThanOrEqual(88);
    expect(styleErrors(r.errors), 'no add may reach a style that cannot take it').toEqual([]);
  } finally { await r.ctx.close(); }
});

test('every layer a link can carry: holding the style back costs no layer', async ({ browser }) => {
  test.setTimeout(420000);
  const ids = sharedIds();
  expect(ids.length).toBeGreaterThan(0);
  /* both boots at once: the reference is whatever the NORMAL boot has drawn after SETTLE_MS, and the
     held boot must end up with at least that. A busier machine only makes the reference smaller
     (fewer slow layers in it), never wrong. */
  const heldP = openLink(browser, ids, { hold: true });
  const plain = await openLink(browser, ids, { hold: false });
  let reference;
  try { await plain.page.waitForTimeout(SETTLE_MS); reference = await mapLayers(plain.page); }
  finally { await plain.ctx.close(); }
  const held = await heldP;
  try {
    expect(held.drawableWhileHeld, 'the style must still be unparsed while the restore runs').toBe(false);
    await expect.poll(async () => { const have = new Set(await mapLayers(held.page)); return reference.filter((id) => !have.has(id)); },
      { timeout: 180000, intervals: [5000], message: 'layers the normal boot drew and the held boot did not' }).toEqual([]);
    expect(await bootProgress(held.page), "the app's own load work ran").toBeGreaterThanOrEqual(88);
    expect(styleErrors(held.errors), 'no add may reach a style that cannot take it').toEqual([]);
  } finally { await held.ctx.close(); }
});
