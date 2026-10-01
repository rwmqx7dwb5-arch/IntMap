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
  let reference, plainOwned = {};
  try { await plain.page.waitForTimeout(SETTLE_MS); reference = await mapLayers(plain.page);
    /* which layers each box owns, read where they DREW (the held boot may never draw a box the time hold met first) */
    plainOwned = await plain.page.evaluate(() => { const o = {}; document.querySelectorAll('#layer-dropdown input[type=checkbox]').forEach((c) => { try { o[c.id] = window.IntMapLayerAudit.owned(c.id); } catch (_) { } }); return o; }); }
  finally { await plain.ctx.close(); }
  const held = await heldP;
  try {
    expect(held.drawableWhileHeld, 'the style must still be unparsed while the restore runs').toBe(false);
    expect((held.heldAtRelease || []).length, "the restore's changes were held by the gate").toBeGreaterThan(0);
    /* everything has been delivered (openLink waited for that state); what is left is the layers whose
       handlers fetch their data first — the same wait the normal boot's reference already had */
    /* (world-at-time) a layer whose box the TIME hold keeps back (the link's war rows move the clock into the past) may
       exist in one boot and not the other — whether it drew before the hold is a race between the clock and the
       style, not a cost of the style hold. Its layers are set aside — the reconciler's own ownership, read in the boot that drew them. */
    const timeHeldLayers = async () => (await held.page.evaluate(() => window.IntMapLayerTime.heldIds())).flatMap((id) => plainOwned[id] || []);
    await expect.poll(async () => { const have = new Set(await mapLayers(held.page)); const aside = new Set(await timeHeldLayers()); return reference.filter((id) => !have.has(id) && !aside.has(id)); },
      { timeout: 60000, intervals: [2000], message: 'layers the normal boot drew and the held boot did not' }).toEqual([]);
    /* the reported pair, by name: held by the gate, then on the map with their boxes still ticked */
    expect(held.heldAtRelease, 'both reported changes were held by the gate').toEqual(expect.arrayContaining(REPORTED.map(([box]) => box)));
    /* (world-at-time) the map at an instant is measured in tests/history-prefetch-on-demand.spec.js (the same journey to
       1900, a first-time reader's layers) — this page carries every layer and costs most of its 240 s booting, so it
       asks only what the time hold changes about ITS claim: below. */
    /* A pair the TIME hold met before it ever drew is not a cost of the STYLE hold — it is held for the instant, with its
       row saying why, in both boots alike (the comparison above holds either way). So each reported box is on the map
       or held for the instant; returning to the present to watch ~90 layers re-draw is what took this test past 240 s
       in CI (4.1 min), and the delivery back is not this test's claim. */
    const have = new Set(await mapLayers(held.page));
    const pair = await held.page.evaluate((r) => r.map(([box]) => ({ box, held: window.IntMapLayerTime.held(box),
      mark: (window.IntMapLayerState.get(box) || {}).state })), REPORTED);
    REPORTED.forEach(([box, layer], i) => {
      expect(have.has(layer) || (pair[i].held && pair[i].mark === 'nodata'), box + ': on the map, or held for the instant with its reason').toBe(true);
    });
    expect(await held.page.evaluate((w) => w.map((id) => document.getElementById(id).checked), REPORTED.map(([box]) => box))).toEqual([true, true]);
    expect(styleErrors(held.errors), 'no add may reach a style that cannot take it').toEqual([]);
  } finally { await held.ctx.close(); }
});

/* ══ (share-embed-distribution) THE SAME LINK, OPENED IN A FRAME — AND RESTORED COMPLETELY ═════════════
 *  Folded into this file rather than a spec of its own (docs/TESTING.md: a new file is charged an
 *  unmeasured price against both test-budget ceilings, which have no room). Its subject is the one this
 *  file has — what a share link restores — seen from the embed (`?embed=1`, js/embed-mode.js), which is
 *  that link in another site's <iframe>. ONE app boot; the frames are the share panel's own preview,
 *  i.e. exactly the code a reader copies, booted and read back:
 *    ① the panel's embed tab and Atlas `share` hand over the link / the code themselves
 *    ② the frame shows only the map, its legends, the instant and the credits (elementFromPoint over the
 *       whole frame — «visible» is not «on top»), the credits wholly inside a 480×320 frame and uncut,
 *       the link's camera / layer / instant, no Atlas kernel, and a camera padding of 0 (the phone sheet
 *       is not drawn in a frame — before the fix 171 px put the shared place 85 px above the middle)
 *    ③ read-only: a click on the frame's map reaches no renderer `click`, a drag still pans; with
 *       interactive=0 a drag does nothing
 *    ④ a shared link naming a layer that flies to its home (NATO, js/layer-home.js) opens at `v=`
 *       (measured before the fix: `#v=15,50,3…&l=dl-nato` settled at `#v=-48.1019,54.7064,1.20`)
 *    ⑤ the share-link restorer itself: a link with no `tt` returns the clock to «now» (it used to leave
 *       1990 on); a second link pasted during a restore is applied, not dropped (the map used to stay on
 *       the first while the address showed the second); the forecast hour is not written into the link
 *       while no weather layer is on (it used to be, after any move of the hour)
 *  ⚠ NOT installHermeticRouting: it reaches for the Atlas kernel in every frame (ensureAtlasOnDemand),
 *  and whether an embed starts Atlas is one of the things asked. The parent reaches for it itself. */
const EMBED_STATE = '#v=15.0000,50.0000,3.00,0,0,f&l=dl-nato&tt=1990-06-15';
async function embedHermetic(ctx) {
  await ctx.route('**/*', (route) => {
    let h = ''; try { h = new URL(route.request().url()).hostname; } catch (_) { }
    if (h === '127.0.0.1' || h === 'localhost' || h === '' || /(^|\.)unpkg\.com$|(^|\.)cdn\.jsdelivr\.net$/.test(h)) return route.continue();
    return route.abort('blockedbyclient');
  });
}
/* the share-link restore has applied the layer and the instant (the layer pass ends at 3.2 s and a
   move is saved 400 ms later — wait those out so a later move cannot be read as the restore) */
async function stateRestored(frame, timeout = 120000) {
  await frame.waitForFunction(() => {
    try { const cb = document.getElementById('dl-nato'); const l = window.IntMapBookmark && window.IntMapBookmark.link();
      return !!(window.__imap && cb && cb.checked && l && /[#&]tt=1990-06-15/.test(l)); } catch (_) { return false; }
  }, null, { timeout });
  await frame.waitForTimeout(3800);
}
const camOf = (frame) => frame.evaluate(() => { const c = window.__imap.getCenter(); return { lng: c.lng, lat: c.lat, z: window.__imap.getZoom(), pad: window.__imap.getPadding() }; });
/* boot the panel's preview for the given options and hand back the frame */
async function preview(page, opts) {
  await page.evaluate(async (o) => { if ((await window.IntMapShare.open(Object.assign({ tab: 'embed' }, o))) !== true) throw new Error('the Embed tab was not built'); }, opts);
  await page.locator('#share-panel .sh-pvbtn').evaluate((b) => b.click());
  const el = page.locator('#share-panel .sh-pv iframe');
  await expect(el).toHaveCount(1);
  const frame = await (await el.elementHandle()).contentFrame();
  await stateRestored(frame);
  return { el, frame, src: await el.getAttribute('src') };
}

test('share-embed-distribution: the share link in a frame shows only the map, read-only, exactly as linked — and the restorer applies a link completely', async ({ browser }) => {
  test.setTimeout(300000);
  const ctx = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 1280, height: 800 } });
  await embedHermetic(ctx);
  const page = await ctx.newPage();
  await page.goto('/' + EMBED_STATE, { waitUntil: 'domcontentloaded' });
  await stateRestored(page);

  /* ④ the shared view, not the NATO layer's home */
  const c0 = await camOf(page);
  expect(c0.lng).toBeCloseTo(15, 3); expect(c0.lat).toBeCloseTo(50, 3); expect(c0.z).toBeCloseTo(3, 2);

  /* ③'s control: the same kind of click IS seen by the renderer in the app, so the frame's zero is not a dead counter */
  await page.evaluate(() => { window.__appClicks = 0; window.IntMapGeoEngine.events.on('click', () => { window.__appClicks++; }); });
  const mb = await page.locator('#map').boundingBox();
  await page.mouse.click(mb.x + mb.width * 0.55, mb.y + mb.height * 0.6);
  await expect.poll(() => page.evaluate(() => window.__appClicks)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');

  /* ① Atlas and the panel hand over the values themselves */
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const atl = await page.evaluate(async () => {
    const a = await window.IntMapAtlas.call('dispatch', { type: 'share' });
    const b = await window.IntMapAtlas.call('dispatch', { type: 'share', embed: true, size: 'small' });
    const p = document.getElementById('share-panel');
    return { a: { ok: !!a.ok, html: String(a.html || '') }, b: { ok: !!b.ok, html: String(b.html || '') },
      link: window.IntMapBookmark.link(), code: p.querySelector('.sh-code').value, size: p.querySelector('.sh-size').value,
      tab: p.querySelector('.sh-tab[aria-selected="true"]').dataset.tab };
  });
  expect(atl.a.ok).toBe(true);
  expect(atl.a.html).toContain(esc(atl.link));
  expect(atl.b.ok).toBe(true);
  expect(atl.tab, 'the panel shows the tab Atlas answered from').toBe('embed');
  expect(atl.size).toBe('small');
  expect(atl.b.html).toContain(esc(atl.code));
  expect(atl.code).toMatch(/width="480" height="320"/);
  const src = new URL(/src="([^"]+)"/.exec(atl.code)[1].replace(/&amp;/g, '&'));
  expect(src.searchParams.get('embed')).toBe('1');
  expect(src.hash, 'the code carries exactly the hash the address bar holds').toBe(new URL(atl.link).hash);

  /* ② the frame, booted from that code */
  const { el, frame, src: fsrc } = await preview(page, { size: 'small', interactive: true });
  expect(new URL(fsrc).hash).toBe(new URL(atl.link).hash);
  expect(await frame.evaluate(() => document.documentElement.dataset.embed)).toBe('1');
  await frame.waitForFunction(() => { const s = document.getElementById('boot-splash'); return !s || !s.isConnected || getComputedStyle(s).display === 'none' || getComputedStyle(s).opacity === '0'; }, null, { timeout: 60000 }).catch(() => { });
  const seen = await frame.evaluate(() => {
    const KEEP = '#map, .data-legend, .koppen-legend, #map-credit, #im-embed-bar, #boot-splash';
    const stray = new Set();
    for (let x = 4; x < innerWidth; x += 16) for (let y = 4; y < innerHeight; y += 16) {
      const e = document.elementFromPoint(x, y); if (e && !e.closest(KEEP)) stray.add(e.tagName + '#' + e.id + '.' + String(e.className).slice(0, 40));
    }
    const cr = document.getElementById('map-credit'), r = cr.getBoundingClientRect();
    const bar = document.getElementById('im-embed-bar');
    return { w: innerWidth, h: innerHeight, stray: [...stray], credit: { text: cr.innerText, top: r.top, bottom: r.bottom, right: r.right, cut: cr.scrollWidth > cr.clientWidth + 1 },
      bar: bar.innerText, open: bar.querySelector('a').href, atlas: typeof window.IntMapConsole };
  });
  expect([seen.w, seen.h]).toEqual([480, 320]);
  expect(seen.stray, 'nothing but the map, legends, credits and the embed bar is on screen').toEqual([]);
  expect(seen.credit.text).toContain('©');
  expect(seen.credit.top).toBeGreaterThanOrEqual(0);
  expect(seen.credit.bottom).toBeLessThanOrEqual(seen.h + 0.5);
  expect(seen.credit.right).toBeLessThanOrEqual(seen.w + 0.5);
  expect(seen.credit.cut, 'the credit line wraps instead of being clipped').toBe(false);
  expect(seen.bar).toMatch(/1990/);
  expect(new URL(seen.open).searchParams.get('embed'), '「Open in IntMap」 opens the app').toBeNull();
  expect(new URL(seen.open).hash).toContain('l=dl-nato');
  expect(seen.atlas, 'no Atlas kernel in a frame').toBe('undefined');
  const f0 = await camOf(frame);
  expect(f0.lng).toBeCloseTo(15, 3); expect(f0.lat).toBeCloseTo(50, 3); expect(f0.z).toBeCloseTo(3, 2);
  expect(f0.pad.bottom, 'the hidden phone sheet pads nothing').toBe(0);

  /* ③ read-only, with the reader's own (trusted) pointer: the frame is scaled into the panel, so frame
     coordinates are mapped through its box */
  const box = await el.boundingBox(), k = box.width / seen.w;
  const pt = await frame.evaluate(() => { const cv = window.IntMapGeoEngine.render.canvas();
    for (let fy = 0.5; fy < 0.95; fy += 0.05) for (let fx = 0.9; fx > 0.3; fx -= 0.05) { const x = innerWidth * fx, y = innerHeight * fy; if (document.elementFromPoint(x, y) === cv) return { x, y }; }
    return null; });
  expect(pt, 'some of the frame is bare map').not.toBeNull();
  const px = box.x + pt.x * k, py = box.y + pt.y * k;
  await frame.evaluate(() => { window.__embClicks = 0; window.IntMapGeoEngine.events.on('click', () => { window.__embClicks++; }); });
  await page.mouse.click(px, py);
  await page.mouse.click(px, py, { button: 'right' });
  await page.waitForTimeout(600);
  expect(await frame.evaluate(() => window.__embClicks)).toBe(0);
  expect(await frame.locator('.maplibregl-popup').count()).toBe(0);
  await page.mouse.move(px, py); await page.mouse.down(); await page.mouse.move(px - 90, py, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(800);
  expect(Math.abs((await camOf(frame)).lng - f0.lng), 'an interactive embed still pans').toBeGreaterThan(0.5);

  /* ③ a still picture */
  const still = await preview(page, { size: 'small', interactive: false });
  expect(await still.frame.evaluate(() => document.documentElement.dataset.embed)).toBe('static');
  const s0 = await camOf(still.frame);
  const sb = await still.el.boundingBox();
  await page.mouse.move(sb.x + sb.width * 0.7, sb.y + sb.height * 0.6); await page.mouse.down();
  await page.mouse.move(sb.x + sb.width * 0.3, sb.y + sb.height * 0.6, { steps: 8 }); await page.mouse.up();
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(800);
  const s1 = await camOf(still.frame);
  expect(s1.lng).toBeCloseTo(s0.lng, 6); expect(s1.z).toBeCloseTo(s0.z, 6);
  await page.locator('#share-panel .sh-x').evaluate((b) => b.click());
  await expect(page.locator('#share-panel .sh-pv iframe'), 'closing the panel unloads the second map').toHaveCount(0);

  /* ⑤ the forecast hour is not written while no weather layer is on */
  const wx = await page.evaluate(() => { const E = window.IntMapECMWF; E.setIndex(E.nowIndex() + 3);
    const on = [...document.querySelectorAll('input[id^="dl-ec-"]')].some((x) => x.checked);
    const c = window.IntMapShareState.collect(); return { on, weather: !!(c && c.weatherEC && c.weatherEC.t) }; });
  expect(wx.on).toBe(false);
  expect(wx.weather, 'no weather layer, no forecast hour in the link').toBe(false);

  /* ⑤ a link with no `tt` is a link at «now» */
  await page.evaluate(() => { location.hash = '#v=20.0000,40.0000,4.00,0,0,f'; });
  await expect.poll(() => page.evaluate(() => window.IntMapBookmark.link()), { timeout: 15000 }).not.toMatch(/tt=/);
  expect((await camOf(page)).lng).toBeCloseTo(20, 3);

  /* ⑤ two links 0.8 s apart: the second is applied once the first has finished, not dropped */
  await page.waitForTimeout(3800);
  await page.evaluate(() => { location.hash = '#v=30.0000,10.0000,4.00,0,0,f'; });
  await page.waitForTimeout(800);
  await page.evaluate(() => { location.hash = '#v=-60.0000,-10.0000,4.00,0,0,f'; });
  await expect.poll(async () => Math.round((await camOf(page)).lng), { timeout: 15000 }).toBe(-60);

  /* ⑥ (restore-clock-and-elam) THE RESTORE OWNS THE CLOCK. A war row moves the clock to its record's first day
     when the READER ticks it (js/war-layer.js), and decides that only after data/wars.json (954 kB) has arrived.
     (a) the record is held back until well after the restore has set the clock: the link's instant stays.
     (b) a second restore called while the first is still staged (IntMapBookmark.restore — Atlas's showcase door):
     the first one's layer passes used to re-tick the war row at the SECOND link's instant, and the war then moved
     the clock — MEASURED before the fix: `l=dl-ww2&tt=1942-11-01`, then `tt=1985-07-01`, ended on 1939-08-23. */
  const restoreTo = (h) => page.evaluate((h) => { history.replaceState(null, '', location.pathname + location.search + h); window.IntMapBookmark.restore({ shared: true }); }, h);
  const clockIs = (d) => page.waitForFunction((d) => window.IntMapTime.iso() === d, d, { timeout: 20000 });
  const WW2 = '#v=100.0000,30.0000,3.00,0,0,f&l=dl-ww2&tt=1942-11-01', Y1985 = '#v=16.0000,52.0000,3.20,0,0,f&tt=1985-07-01';
  await page.waitForTimeout(3800);
  let releaseWars; const warsHeld = new Promise((r) => { releaseWars = r; });
  await page.route('**/wars.json*', async (route) => { await warsHeld; await route.continue(); });
  await restoreTo(WW2);
  await clockIs('1942-11-01');
  await page.waitForTimeout(1500);   /* past the restore's clock step: the record is still held */
  releaseWars();
  await expect.poll(() => page.evaluate(() => window.__imWarFronts && window.__imWarFronts.date('ww2')), { timeout: 60000, message: "the war layer draws the link's day" }).toBe('1942-11-01');
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.IntMapTime.iso()), "(a) the link's instant, not the war record's first day").toBe('1942-11-01');
  /* (b) */
  await restoreTo(Y1985); await clockIs('1985-07-01'); await page.waitForTimeout(3800);
  await restoreTo(WW2); await clockIs('1942-11-01');
  await restoreTo(Y1985);
  await page.waitForTimeout(5000);   /* past every staged step of both restores (the last layer pass is at +3.2 s) */
  expect(await page.evaluate(() => [window.IntMapTime.iso(), document.getElementById('dl-ww2').checked]), '(b) the newer link, whole').toEqual(['1985-07-01', false]);
  /* the reader's own tick still opens a war on its record */
  await page.evaluate(() => { const cb = document.getElementById('dl-ww2'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
  const first = await page.evaluate(() => window.__imWarFronts.span('ww2')[0]);
  await expect.poll(() => page.evaluate(() => window.IntMapTime.iso()), { timeout: 15000, message: "a reader's tick still moves the clock into the war" }).toBe(first);
  await ctx.close();
});
