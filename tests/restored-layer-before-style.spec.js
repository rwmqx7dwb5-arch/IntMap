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
 *  ① the reported pair: both changes were HELD while the style was unparsed, and
 *     after release both layers exist and nothing threw.
 *  ② EVERY layer a share link can carry (js/layer-manifest.js `sharedIds()`, read
 *     here, not typed): the same link is opened normally and then with the style
 *     held back, and every map layer the normal boot has must also appear after
 *     the held one. The claim is 「holding the style back costs no layer」, measured
 *     against the app itself rather than against a list of layer ids somebody
 *     would have to keep in step. MEASURED on the code before the fix: 23 layers
 *     missing (the aircraft, the ships, the volcano overlays, the base roads/rail/
 *     admin lines …), not only the two that were reported.
 *
 *  ── WHAT IS WAITED FOR, AND WHAT IS NOT ─────────────────────────────────────
 *  After release the spec waits for the STATE «nothing is held any more»
 *  (window.IntMapLayerHold.pending() empty — js/layer-rows.js), not for a
 *  duration; only the layers whose handlers fetch data before adding them are
 *  then polled for. ⚠ It does NOT read the launch screen's progress: that number
 *  stops moving when the screen's own 20 s escape fires, so a boot that finished
 *  a moment after the escape read as a boot that never ran (measured locally
 *  under 6x CPU throttling: `load` at 20.6 s, progress frozen at 58).
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';
import { sharedIds } from '../js/layer-manifest.js';

/* how long the tab stays «hidden». This is the scenario, not a wait: the share-link restore runs on
   its own backstop clock when the style has not been parsed — js/map-ui.js `setTimeout(_boot,8000)`,
   then its passes at +700 / +1800 / +3200 ms — so a hold shorter than ~11.2 s would not put the
   restore inside it. Each test ASSERTS at release that the gate is holding what it should, so a
   hold that stopped reaching the restore fails instead of passing vacuously. */
const HOLD_MS = 12000;
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
  let drawableWhileHeld = null, heldAtRelease = null;
  if (hold) {
    await page.waitForTimeout(HOLD_MS);
    ({ drawableWhileHeld, heldAtRelease } = await page.evaluate(() => {
      let d = null, h = null;
      try { d = !!window.IntMapGeoEngine.canDraw(); } catch (_) {}
      try { h = window.IntMapLayerHold.pending(); } catch (_) {}
      return { drawableWhileHeld: d, heldAtRelease: h };
    }));
    await page.evaluate(() => window.__styleHeldRelease());
  }
  /* the state, not a duration: the style can take layers AND the gate has delivered everything */
  await page.waitForFunction(() => {
    try { return window.IntMapGeoEngine.canDraw() && window.IntMapLayerHold.pending().length === 0; } catch (_) { return false; }
  }, null, { timeout: 60000 });
  return { ctx, page, errors, drawableWhileHeld, heldAtRelease };
}

const mapLayers = (page) => page.evaluate(() => { try { return (window.__imap.getStyle().layers || []).map((l) => l.id); } catch (_) { return []; } });
const styleErrors = (errs) => errs.filter((e) => /Style is not done loading/i.test(e));

test.describe.configure({ mode: 'parallel' });

/* The reported pair (aircraft and radar, the two production showed failing) is asserted INSIDE the
   whole-link test rather than in a test of its own: both are layers a link carries, so a separate test
   paid a second pair of boots to re-prove a subset of what the one below proves — and the suite's time
   ceiling is a total (scripts/test-budget.mjs). */
const REPORTED = [['dl-planes', 'lyr-planes'], ['dl-radar', 'lyr-radar']];

test('every layer a link can carry: holding the style back costs no layer', async ({ browser }) => {
  test.setTimeout(240000);
  const ids = sharedIds();
  expect(ids.length).toBeGreaterThan(0);
  for (const [box] of REPORTED) expect(ids, 'the reported layers are among those a link carries').toContain(box);
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
    expect((held.heldAtRelease || []).length, "the restore's changes were held by the gate").toBeGreaterThan(0);
    /* everything has been delivered (openLink waited for that state); what is left is the layers whose
       handlers fetch their data first — the same wait the normal boot's reference already had */
    await expect.poll(async () => { const have = new Set(await mapLayers(held.page)); return reference.filter((id) => !have.has(id)); },
      { timeout: 60000, intervals: [2000], message: 'layers the normal boot drew and the held boot did not' }).toEqual([]);
    /* the reported pair, by name: held by the gate, then on the map with their boxes still ticked */
    expect(held.heldAtRelease, 'both reported changes were held by the gate').toEqual(expect.arrayContaining(REPORTED.map(([box]) => box)));
    await expect.poll(() => mapLayers(held.page), { timeout: 30000, message: 'the reported layers are on the map' })
      .toEqual(expect.arrayContaining(REPORTED.map(([, layer]) => layer)));
    expect(await held.page.evaluate((w) => w.map((id) => document.getElementById(id).checked), REPORTED.map(([box]) => box))).toEqual([true, true]);
    expect(styleErrors(held.errors), 'no add may reach a style that cannot take it').toEqual([]);
  } finally { await held.ctx.close(); }
});
