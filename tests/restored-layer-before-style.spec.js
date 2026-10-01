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
/* (remove-synthetic-planes) `lyr-planes`, which the report named, was the removed airplanes.live
   sweep's symbol layer — since #R341 created hidden and never drawn, and now not created at all. What
   the aircraft row still adds SYNCHRONOUSLY — the add the report was about («Style is not done
   loading») — is the observed track's source and layers (js/data-layers.js setupPlanes), so
   `lyr-plane-track` is the witness. The aircraft themselves are the GPU cloud, a MapLibre CUSTOM layer,
   which `getStyle()` does not serialise — measured: `lyr-aircraft-cloud` is absent from that list on a
   normal boot too, while `IntMapGeoEngine.layers.hasAircraftCloud()` answers true. */
const REPORTED = [['dl-planes', 'lyr-plane-track'], ['dl-radar', 'lyr-radar']];

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
    /* ══ (world-at-time) THE SAME PAGE, MOVED TO 1960 — the map at an instant, measured here rather than in a boot
       of its own (scripts/test-budget.mjs: the suite's total has no room for one). Every layer a link carries is
       ticked, so this is the widest case the time hold meets: ① the present-only layers (aircraft, radar) and
       today's snapshots (the cables) are held — boxes ticked, nothing of theirs drawn, their rows saying why;
       NATO (1949–) is not held; ② the reconciler does not re-arm a held box; ③ Atlas's `time.coverage` answers
       about another instant without moving the clock; ④ back to now, everything held is delivered and the
       reported pair (a STYLE-hold claim, asked on the present) draws.
       ⚠ THE INSTANT IS WHEREVER THE BOOT LEFT IT, if that is the past. Where the war records arrive (CI) the link's war
       rows move the clock to their own first day during the boot; where they do not (this suite's routing on a
       workstation) the clock is still live and is moved to 1960. Every transition re-draws or withdraws ~90 layers
       in software GL — measured: one extra transition each way took the test past its 240 s (CI, 4.0 min) — so the
       page makes only the moves the claims need. */
    await held.page.evaluate(() => { if (window.IntMapTime.isLive()) window.IntMapTime.setYear(1960, { source: 'test' }); });
    const atClock = await held.page.evaluate(async () => {
      await window.IntMapLayerTime.ready();
      /* from here the holds are decided — a look the reconciler scheduled before (the restore's own changes) is not this claim */
      return { live: window.IntMapTime.isLive(), iso: window.IntMapTime.iso(), from: Date.now() };
    });
    expect(atClock.live).toBe(false);
    /* ① THE INVARIANT, over every ticked box: unstated and not answering for itself ⇒ held, its row says why, and
       (where the reconciler knows its layers) nothing of it is drawn; NATO (1949–) states 1960 and is not held */
    const sweep = () => held.page.evaluate(() => Array.from(document.querySelectorAll('#layer-dropdown input[type=checkbox]'))
      .filter((c) => c.checked).map((c) => { const v = window.IntMapLayerTime.verdict(c.id) || {}; const r = window.IntMapLayerState.get(c.id);
        return { id: c.id, status: v.status, self: v.self, held: window.IntMapLayerTime.held(c.id), painted: window.__imLayerPainted(c.id), mark: r && r.state, why: r && r.message, iso: window.IntMapTime.iso() }; }));
    await expect.poll(async () => (await sweep()).filter((x) => x.status === 'unstated' && !x.self && !x.held).map((x) => x.id),
      { timeout: 20000, message: 'every ticked layer that states nothing about the instant is held' }).toEqual([]);
    const rows = await sweep();
    const heldRows = rows.filter((x) => x.held);
    expect(heldRows.map((x) => x.id)).toEqual(expect.arrayContaining(['dl-planes', 'dl-radar']));
    expect(heldRows.filter((x) => x.painted === true).map((x) => x.id), 'a held layer draws nothing').toEqual([]);
    expect(heldRows.filter((x) => x.mark !== 'nodata' || !(x.why || '').includes(x.iso)).map((x) => x.id), 'each held row says why, naming the date').toEqual([]);
    expect(rows.find((x) => x.id === 'dl-nato'), 'NATO is ticked by the link').toBeTruthy();
    expect(rows.find((x) => x.id === 'dl-nato').held, 'NATO is held exactly when the instant is before 1949-08-24').toBe(atClock.iso < '1949-08-24');
    await held.page.evaluate(() => { window.IntMapLayerAudit.run(); window.IntMapLayerAudit.run(); });
    expect(await held.page.evaluate((t0) => window.IntMapLayerAudit.log().filter((e) => e.t >= t0 && window.IntMapLayerTime.held(e.id)).map((e) => e.id + ':' + e.fix), atClock.from),
      'a held box is not a «ticked but blank» finding').toEqual([]);
    /* ③ asked about 1600, Atlas moves nothing: no clock change is made by the call (the link's war rows may still
       move the clock on their own when their record arrives late — that is their entry, measured: 1960 → 1991) */
    const cov = await held.page.evaluate(async () => {
      const moves = []; const off = window.IntMapTime.on((e) => moves.push(e.source));
      const r = await window.IntMapOS.execute('time.coverage', { year: 1600 });
      off();
      const c = (r && (r.coverage || (r.result && r.result.coverage))) || await window.IntMapLayerTime.coverage(1600);
      return { unstated: c.unstated.map((x) => x.id), stated: c.stated.map((x) => x.id), moves };
    });
    expect(cov.moves.filter((m) => m === 'atlas' || m === 'os'), 'asking about 1600 does not move the clock').toEqual([]);
    expect(cov.unstated).toEqual(expect.arrayContaining(['dl-climate', 'dl-subcables', 'dl-nato', 'dl-planes', 'cb-roads']));
    expect(cov.stated).toEqual(expect.arrayContaining(['cb-borders', 'dl-nightside', 'cb-grid']));
    /* ④ the reported pair is a STYLE-hold claim about EXISTENCE (`mapLayers` lists layers, not their visibility): a
       pair drawn before the clock left the present still exists, withdrawn. Only if the time hold met them before
       they ever drew is the present needed — and then it is the present that must deliver them. */
    const want = REPORTED.map(([, layer]) => layer);
    const have = new Set(await mapLayers(held.page));
    if (!want.every((id) => have.has(id))) {
      await held.page.evaluate(() => window.IntMapTime.setNow({ source: 'test' }));
      expect(await held.page.evaluate(() => window.IntMapLayerTime.heldIds().filter((id) => !/^dl-(ww1|ww2|korea|vietnam|mideast|yugoslavia)$/.test(id))),
        'on the present only the war rows (their records ended) stay held').toEqual([]);
      await expect.poll(() => mapLayers(held.page), { timeout: 30000, message: 'the reported layers are on the map' }).toEqual(expect.arrayContaining(want));
    }
    expect(await held.page.evaluate((w) => w.map((id) => document.getElementById(id).checked), REPORTED.map(([box]) => box))).toEqual([true, true]);
    expect(styleErrors(held.errors), 'no add may reach a style that cannot take it').toEqual([]);
  } finally { await held.ctx.close(); }
});
