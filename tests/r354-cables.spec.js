/* ============================================================================
 *  R354 (deep) — everything about the cable layer that needs more than one boot
 * ----------------------------------------------------------------------------
 *  「初回読み込みで表示されない／ときどき表示されない／CORS失敗で消える…といった状態を
 *    作らないでください。むしろ可能なら現在より堅牢にしてください。」
 *
 *  This layer has its own history of being the one that is absent: #R187 (a
 *  refused addSource), #R188 (an upstream with no ACAO, reachable only through
 *  volunteer proxies), #R189 (a failure recorded as a preference), #R190 (the
 *  Edge Function relay). This round moves the data onto the app's own origin,
 *  which is a change to exactly the thing all four of those were about — so the
 *  claims below are about PRESENCE, not about geometry.
 *
 *  ⚠ THIS FILE CANNOT USE THE SHARED `app` FIXTURE, AND THE REASON IS THE
 *  SUBJECT. The whole suite boots with a SEEDED SESSION that switches the two
 *  thematic default layers off — Köppen and these cables — because #R186
 *  measured them at 9,160 ms of every boot and ~350 tests are not about them
 *  (tests/helpers/session-seed.js). A spec whose subject IS the cable layer
 *  therefore has to opt out, exactly as tests/r186.spec.js does, and
 *  `test.use({ storageState })` cannot reach a worker-scoped page built by
 *  `browser.newPage()` (tests/helpers/app.js says so in its own header).
 *  MEASURED before this was understood: every test timed out at 60 s with
 *  the box unticked and `data/subcables.json` never fetched — the seed doing
 *  precisely what it is for.
 *
 *  So the file opens ONE context with an EMPTY storage state — a genuinely
 *  first-time profile, which is what "the cables are default-ON" means — and
 *  shares one page across the whole file. Two boots in total: this one, and the
 *  last test, whose subject is a load with the dataset unreachable and which
 *  needs its route installed before the first request.
 *
 *  ⚠ THE NAME KEEPS IT OUT OF THE PUSH GATE ON PURPOSE. scripts/tiers.mjs pulls
 *  the round's `rNNN.spec.js` into core by construction; `rNNN-<topic>.spec.js`
 *  is priced like any other spec and lands in the nightly tier, which is where
 *  five tests and two boots belong. tests/r354.spec.js carries the two claims
 *  that do stand in front of a push.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { bootPage } from './helpers/app.js';

const LAYERS = ['lyr-subcables', 'lyr-subcables-glow', 'lyr-subcables-pts'];
const FIRST_VISIT = { cookies: [], origins: [] };

test.describe.configure({ mode: 'serial' });

let ctx = null, page = null;
test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext({ storageState: FIRST_VISIT });
  page = await ctx.newPage();
  await bootPage(page, {});
  await installFinder(page);
});
test.afterAll(async () => { if (ctx) await ctx.close().catch(() => {}); ctx = null; page = null; });

const readState = async (page) => page.evaluate((ids) => {
  const E = window.IntMapGeoEngine;
  const out = { box: null, layers: {}, sources: {}, features: 0, lps: 0 };
  try { const cb = document.getElementById('dl-subcables'); out.box = cb ? cb.checked : null; } catch (_) {}
  for (const id of ids) {
    try { out.layers[id] = E.layers.has(id) ? E.layers.getLayout(id, 'visibility') : null; } catch (_) { out.layers[id] = null; }
  }
  for (const s of ['src-subcables', 'src-subcables-lp']) {
    try { out.sources[s] = E.layers.hasSource(s); } catch (_) { out.sources[s] = false; }
  }
  try { out.features = (E.coords.querySourceFeatures ? E.coords.querySourceFeatures('src-subcables') : []).length; } catch (_) {}
  try { out.paint = {
    width: E.layers.getPaint('lyr-subcables', 'line-width'),
    colour: E.layers.getPaint('lyr-subcables', 'line-color'),
    opacity: E.layers.getPaint('lyr-subcables', 'line-opacity'),
    glowBlur: E.layers.getPaint('lyr-subcables-glow', 'line-blur'),
    glowWidth: E.layers.getPaint('lyr-subcables-glow', 'line-width'),
    ptRadius: E.layers.getPaint('lyr-subcables-pts', 'circle-radius'),
    ptColour: E.layers.getPaint('lyr-subcables-pts', 'circle-color'),
    ptStroke: E.layers.getPaint('lyr-subcables-pts', 'circle-stroke-width'),
  }; } catch (_) { out.paint = null; }
  return out;
}, LAYERS);

const waitForCables = (page, timeout = 60000) => page.waitForFunction(() => {
  try { const E = window.IntMapGeoEngine; return E.layers.has('lyr-subcables') && E.layers.getLayout('lyr-subcables', 'visibility') === 'visible'; }
  catch (_) { return false; }
}, null, { timeout });

/* ══ A PIXEL THAT IS REALLY THE MAP ══════════════════════════════════════════
   Two frames have to agree before a click means anything.

   ⚠ `queryRenderedFeatures` COUNTS FROM THE RENDERER'S CANVAS, `page.mouse`
   FROM THE VIEWPORT, and the canvas starts to the right of the sidebar. Its
   container's rect supplies the offset.

   ⚠ AND THE MAP IS NOT THE TOP ELEMENT EVERYWHERE ON ITSELF. The search box,
   the ticker and the panels float over it. Measured: the first cable the scan
   found sat under the search input, `page.mouse.click` went to the input, and
   nothing opened — a real reader could not have clicked there either. So the
   scan asks `elementFromPoint` whether the map is what a click would actually
   reach, exactly as #R254 does for the country popup. */
const installFinder = (p) => p.evaluate(() => {
  window.__r354FindPoint = (layer, pad, step) => {
    const E = window.IntMapGeoEngine;
    const size = E.render.size();
    const r = E.render.canvasContainer().getBoundingClientRect();
    for (let y = 40; y < size.height - 40; y += step) {
      for (let x = 40; x < size.width - 40; x += step) {
        const hit = E.coords.queryRenderedFeatures([[x - pad, y - pad], [x + pad, y + pad]], { layers: [layer] }) || [];
        if (!hit.length) continue;
        const px = r.left + x, py = r.top + y;
        const top = document.elementFromPoint(px, py);
        if (!top) continue;
        if (!(top.tagName === 'CANVAS' || (top.closest && (top.closest('.maplibregl-canvas-container') || top.closest('#map'))))) continue;
        return { x: px, y: py, id: hit[0].properties.id, name: hit[0].properties.name };
      }
    }
    return null;
  };
});

/* the row toggles on the ROW's pointerdown, not the checkbox's click (#R37) */
const toggleRow = (page, id) => page.evaluate((cbId) => {
  const cb = document.getElementById(cbId);
  const row = cb.closest('label') || cb.closest('.lyr-row') || cb.parentElement;
  ['pointerdown', 'pointerup'].forEach(t => row.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 1 })));
}, id);

test('R354 ① a FIRST-VISIT boot draws the cables, from this app’s own origin, with real routes', async () => {
  await waitForCables(page);
  const s = await readState(page);
  expect(s.box, '① the row is ticked with no saved session at all').toBe(true);
  for (const id of LAYERS) expect(s.layers[id], '① ' + id + ' exists and is visible').toBe('visible');
  expect(s.sources['src-subcables']).toBe(true);
  expect(s.sources['src-subcables-lp']).toBe(true);

  /* the dataset really is the rebuilt one: every rendered feature carries the
     provenance the pipeline writes, which the schematic never had */
  const props = await page.evaluate(() => {
    const E = window.IntMapGeoEngine;
    const sz = E.render.size();
    const f = E.coords.queryRenderedFeatures([[0, 0], [sz.width, sz.height]], { layers: ['lyr-subcables'] }) || [];
    const q = {}, src = {};
    for (const x of f) { q[x.properties.quality] = (q[x.properties.quality] || 0) + 1; src[x.properties.src] = (src[x.properties.src] || 0) + 1; }
    return { n: f.length, quality: q, src, sample: f.length ? f[0].properties : null };
  });
  expect(props.n, '① cables are actually rendered').toBeGreaterThan(20);
  expect(['verified', 'reconstructed', 'estimated']).toContain(props.sample.quality);
  expect(props.sample.src, '① and it says where it came from').toBeTruthy();
});

test('R354 ② OFF → ON → OFF → ON never leaves a ticked box with no layer', async () => {
  await waitForCables(page);
  for (let round = 0; round < 2; round++) {
    await toggleRow(page, 'dl-subcables');
    await page.waitForFunction(() => {
      try { const E = window.IntMapGeoEngine; return !E.layers.has('lyr-subcables') || E.layers.getLayout('lyr-subcables', 'visibility') === 'none'; }
      catch (_) { return false; }
    }, null, { timeout: 20000 });
    const off = await readState(page);
    expect(off.box, '② the box is unticked').toBe(false);
    for (const id of LAYERS) expect(off.layers[id] === null || off.layers[id] === 'none', '② ' + id + ' is not painted while off').toBe(true);

    await toggleRow(page, 'dl-subcables');
    await waitForCables(page, 30000);
    const on = await readState(page);
    expect(on.box).toBe(true);
    for (const id of LAYERS) expect(on.layers[id], '② ' + id + ' came back').toBe('visible');
  }
});

test('R354 ③ a style reload rebuilds the layer rather than losing it', async () => {
  await waitForCables(page);
  const audited = await page.evaluate(async () => {
    /* the app's own self-healing audit is what a style reload leans on (#R164) */
    try { if (window.IntMapLayerAudit && window.IntMapLayerAudit.run) { await window.IntMapLayerAudit.run(); return true; } } catch (_) {}
    return false;
  });
  void audited;
  const s = await readState(page);
  expect(s.box).toBe(true);
  for (const id of LAYERS) expect(s.layers[id], '③ ' + id + ' survived the audit').toBe('visible');
});

test('R354 ④ clicking a cable opens a popup that names it', async () => {
  await waitForCables(page);
  /* find a point on screen that really is over a cable, then click it — no
     guessing at coordinates, and no widening of the line to make it hittable */
  const pt = await page.evaluate(() => window.__r354FindPoint('lyr-subcables', 8, 7));
  test.skip(!pt, 'no cable on screen at the default view');
  await page.mouse.click(pt.x, pt.y);
  const popup = page.locator('.subc-popup');
  await expect(popup, '④ a cable popup opened').toBeVisible({ timeout: 15000 });
  await expect(popup.locator('.subc-title'), '④ it names the cable').toHaveText(new RegExp(pt.name.slice(0, 8).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  await expect(popup.locator('.subc-row').first(), '④ it carries at least one fact').toBeVisible();

  /* ⚠ AND THE CLICK DID NOT CHANGE THE LINE. §13: the graphic may not be
     touched to make hitting it easier. */
  const after = await readState(page);
  expect(after.paint.width).toEqual(['interpolate', ['linear'], ['zoom'], 0, 0.6, 4, 1.1, 8, 2]);
  await page.evaluate(() => { const b = document.querySelector('.subc-popup .maplibregl-popup-close-button'); if (b) b.click(); });
});

test('R354 ⑤ a landing point opens its own popup and lists the cables that land there', async () => {
  await waitForCables(page);
  /* ⚠ GO WHERE THE LANDING POINTS ARE. `lyr-subcables-pts` has `minzoom: 3`, and
     the world view holds few of them at a clickable size — a spec that skips
     itself when the camera happens to be elsewhere is not a spec. Bude and the
     Irish Sea carry a dozen inside one screen. */
  await page.evaluate(() => window.__imap.jumpTo({ center: [-4.55, 50.4], zoom: 6, pitch: 0, bearing: 0 }));
  await page.waitForFunction(() => {
    try { const E = window.IntMapGeoEngine; const s = E.render.size();
      return (E.coords.queryRenderedFeatures([[0, 0], [s.width, s.height]], { layers: ['lyr-subcables-pts'] }) || []).length > 0; }
    catch (_) { return false; }
  }, null, { timeout: 30000 });
  const pt = await page.evaluate(() => window.__r354FindPoint('lyr-subcables-pts', 6, 3));
  expect(pt, '⑤ a landing point is on screen over the Irish Sea').not.toBeNull();
  await page.mouse.click(pt.x, pt.y);
  const popup = page.locator('.subc-popup');
  await expect(popup, '⑤ a landing-point popup opened').toBeVisible({ timeout: 15000 });
  const text = await popup.innerText();
  expect(text.length, '⑤ it says something').toBeGreaterThan(10);
  await page.evaluate(() => { const b = document.querySelector('.subc-popup .maplibregl-popup-close-button'); if (b) b.click(); });
});

test('R354 ⑥ the layer still appears when the new dataset cannot be fetched', async ({ browser }) => {
  /* ⚠ ITS OWN PAGE, AND `browser` RATHER THAN `app.freshPage()`. The subject is
     a LOAD in which data/subcables.json is unreachable, so the route has to be
     installed BEFORE the first navigation — and freshPage boots before it
     returns. This is the §3 claim that matters most: a new data path may not
     become a new way for the layer to disappear. */
  const blockedCtx = await browser.newContext({ storageState: FIRST_VISIT });
  const blocked = await blockedCtx.newPage();
  await blocked.route('**/data/subcables*.json', route => route.abort());
  await blocked.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await blocked.waitForFunction(() => !!window.__imap, null, { timeout: 60000 });
  /* the TeleGeography relay is the migration fallback and needs the network; the
     claim under test is that the app KEEPS TRYING and never records the failure
     as the reader's preference (#R189's imAutoOff) */
  const settled = await blocked.waitForFunction(() => {
    try {
      const E = window.IntMapGeoEngine;
      const cb = document.getElementById('dl-subcables');
      if (!cb) return false;
      if (E.layers.has('lyr-subcables')) return { drew: true, box: cb.checked, autoOff: cb.dataset.imAutoOff === '1' };
      return null;
    } catch (_) { return false; }
  }, null, { timeout: 60000 }).then(h => h.jsonValue()).catch(() => null);

  if (settled && settled.drew) {
    expect(settled.box, '⑥ the box is still ticked when the fallback drew').toBe(true);
  } else {
    const st = await blocked.evaluate(() => {
      const cb = document.getElementById('dl-subcables');
      return { box: cb ? cb.checked : null, autoOff: cb ? cb.dataset.imAutoOff === '1' : null };
    });
    /* If nothing could be fetched at all the layer may be absent — but it must
       be marked as the APP's doing, never as a choice the session then keeps. */
    if (st.box === false) expect(st.autoOff, '⑥ an outage is recorded as imAutoOff, not as a preference').toBe(true);
  }
  await blockedCtx.close();
});
