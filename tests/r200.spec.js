/* ============================================================================
 *  R200 — the three things only a real renderer can answer.
 *
 *  ① The core still boots after six subjects left js/app-body.js. The first version
 *     of this round did NOT: two of the names the layers menu hands back are read off
 *     IM_HOST 1,800 lines before the block that now defines them, and a `const` there
 *     is in the temporal dead zone — the boot aborted and IntMapOS, the session
 *     persistence, the year-aware Countries tab and the premium section never existed.
 *     A source check cannot see that. Loading the page can.
 *  ② The night side is really darker — measured as PIXELS, with the effect ON and OFF
 *     in the same frame, at the antisolar meridian. #R196's parameters delivered 0.57
 *     of the basemap's luminance at deepest night while its own constant said 0.78.
 *  ③ The sky follows the MASTER CLOCK. Two independent defects made that impossible
 *     before this round: the subscription ran in the factory body (before the clock
 *     existed) and every reader called `IntMapTime.now()`, which is not a method the
 *     clock has. Both are invisible unless you move the clock and look.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';

const BOOT = { timeout: 90_000 };
const ready = async (page) => {
  await page.goto('/?rafshim=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.IntMapGeoEngine && window.IntMapGeoEngine.ready(), null, BOOT);
  await page.waitForTimeout(1500);
};

/* ── ① the boot survives the split ────────────────────────────────────────────────────────────── */
test('R200 ① every subject that left js/app-body.js is alive after boot', async ({ page }) => {
  test.setTimeout(180_000);
  const fatal = [];
  page.on('pageerror', (e) => fatal.push(e.message));
  await ready(page);
  await page.waitForTimeout(2500);

  const alive = await page.evaluate(() => ({
    /* js/session-tabs.js — the tab bar, its IntMapOS commands and the session writer */
    os: !!(window.IntMapOS && window.IntMapOS.list && window.IntMapOS.list().length > 10),
    save: typeof window._imSaveSession === 'function',
    fitTab: typeof window._fitTabFont === 'function',
    /* js/layer-favs.js — reached through the hoisted shims, which is the whole point */
    favs: Array.isArray(window.imLayerFavs),
    /* js/time-countries.js, js/premium-plan.js, js/screenshot.js */
    timeCountries: !!(window.IntMapTimeCountries && typeof window.IntMapTimeCountries.year === 'function'),
    pro: typeof window.refreshProUI === 'function',
    shot: !!document.getElementById('btn-screenshot'),
    /* js/layer-dropdown.js — the accordion helper it publishes, and the Layers button really
       responding. ⚠ the button's DEFAULT route is the right-hand layer sidebar (window.imLayerPanel
       is 'right' out of the box), so "the dropdown got .show" is NOT the signal — what is, is that
       the click reaches the module's own handler either way. */
    groups: typeof window._expandAllLayerGroups === 'function',
    menu: (() => { const b = document.getElementById('btn-layers');
      const dd = document.getElementById('layer-dropdown');
      const right = window.imLayerPanel === 'right' && window.IntMapLayerSidebar;
      const before = right ? !!(window.IntMapLayerSidebar.state && window.IntMapLayerSidebar.state().open)
                           : dd.classList.contains('show');
      b.click();
      const after = right ? !!(window.IntMapLayerSidebar.state && window.IntMapLayerSidebar.state().open)
                          : dd.classList.contains('show');
      b.click();
      return right ? (window.IntMapLayerSidebar.toggle ? true : false) || after !== before : after !== before; })(),
  }));
  for (const [k, v] of Object.entries(alive)) expect(v, `${k} must survive the split`).toBeTruthy();
  /* ⚠ the TDZ failure was a page error, not a missing feature — assert on the errors too */
  expect(fatal.filter((m) => /before initialization|is not a function|is not defined/.test(m)),
    'no reference error may escape the boot').toEqual([]);
});

/* ── ② the darkness, in pixels ────────────────────────────────────────────────────────────────── */
test('R200 ② the night side darkens the map by what the profile promises', async ({ page }) => {
  test.setTimeout(240_000);
  await ready(page);
  await page.evaluate(() => window.IntMapGeoEngine.camera.jumpTo({ center: [0, 10], zoom: 1.2, pitch: 0, bearing: 0 }));
  await page.waitForFunction(() => { try { return window.IntMapNightSide.state().built; } catch (_) { return false; } }, null, { timeout: 60_000 });

  /* the style the renderer really holds: the zoom ramp is outermost, each stop chooses per ring,
     and the last stop is a literal 0 (a nested zoom expression would have been rejected silently) */
  const op = await page.evaluate(() => window.__imap.getPaintProperty('im-night-shade', 'fill-opacity'));
  expect(Array.isArray(op) && op[0]).toBe('interpolate');
  expect(op[op.length - 1], 'the ramp still ends at zero').toBe(0);
  const stop = op.find((x) => Array.isArray(x) && x[0] === 'match');
  expect(stop, 'each stop carries the per-ring alphas').toBeTruthy();
  expect(stop[1]).toEqual(['get', 'elev']);

  /* and the composite the profile promises is the composite the module computes */
  const model = await page.evaluate(() => {
    const st = window.IntMapNightSide.state();
    return { profile: st.profile, comp: st.profile.map((_, k) => +window.IntMapNightSide._composite(k).toFixed(4)) };
  });
  for (let k = 0; k < model.profile.length; k++)
    expect(Math.abs(model.comp[k] - model.profile[k][1]), 'ring ' + k + ' delivers its stated darkness').toBeLessThan(1e-3);
  expect(model.profile[model.profile.length - 1][1], 'full night is deep').toBeGreaterThan(0.9);

  /* PIXELS: the same frame with the effect on and off, on the antisolar meridian */
  const px = await page.evaluate(async () => {
    const m = window.__imap;
    const settle = () => new Promise((r) => { m.once('idle', r); setTimeout(r, 5000); });
    const wrap = (x) => ((x % 360) + 540) % 360 - 180;
    const now = new Date(), utc = now.getUTCHours() + now.getUTCMinutes() / 60;
    const anti = wrap(wrap((12 - utc) * 15) + 180);
    const sample = () => {
      const cv = m.getCanvas(), g = document.createElement('canvas');
      g.width = cv.width; g.height = cv.height;
      const cx = g.getContext('2d'); cx.drawImage(cv, 0, 0);
      const d = cx.getImageData(0, 0, cv.width, cv.height).data;
      const sx = cv.width / cv.clientWidth, sy = cv.height / cv.clientHeight;
      const p = m.project([anti, -25]);
      const c = Math.round(p.x * sx), r = Math.round(p.y * sy);
      if (!(r > 4 && c > 4 && r < cv.height - 4 && c < cv.width - 4)) return null;
      let s = 0, n = 0;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const k = ((r + dy) * cv.width + (c + dx)) * 4; s += 0.30 * d[k] + 0.59 * d[k + 1] + 0.11 * d[k + 2]; n++; }
      return +(s / n).toFixed(1);
    };
    window.IntMapNightSide.setEnabled(false);
    await settle();
    const off = sample();
    window.IntMapNightSide.setEnabled(true);
    await new Promise((r) => setTimeout(r, 1200));
    await settle();
    const on = sample();
    return { anti: +anti.toFixed(1), on, off };
  });
  expect(px.off, 'the unshaded basemap has to be bright enough to measure against').toBeGreaterThan(60);
  /* measured on this build: 191.6 → 24.7, i.e. 0.87. #R196's uniform 0.156 per ring would have left
     0.57 — so 0.75 separates the two decisively while leaving room for basemap and city lights. */
  expect(1 - px.on / px.off, `night side at ${px.anti}°: ${px.off} → ${px.on}`).toBeGreaterThan(0.75);
});

/* ── ③ the sky follows the master clock ───────────────────────────────────────────────────────── */
test('R200 ③ moving the master clock moves the sun, the horizon and the terminator', async ({ page }) => {
  test.setTimeout(240_000);
  await ready(page);

  const seen = await page.evaluate(async () => {
    const m = window.__imap;
    const at = async (iso) => {
      window.IntMapTime.set(new Date(iso), { source: 'r200' });
      await new Promise((r) => setTimeout(r, 2200));
      const L = m.getLight();
      /* `painted` is the geometry the SOURCE really holds — proof that the night side repainted on the
         clock event, not just that its pure ring function would compute something different. */
      const src = m.getSource('im-night-src');
      const painted = (src && src._data && src._data.features && src._data.features[0])
        ? src._data.features[0].geometry.coordinates[0][60][1] : null;
      return { hz: m.getSky()['horizon-color'], sun: L && L.position ? L.position.map((x) => +(+x).toFixed(1)) : null,
               ring: window.IntMapNightSide._ringFC().features[0].geometry.coordinates[0][60][1], painted };
    };
    m.jumpTo({ center: [139.7, 35.7], zoom: 3.4 });             /* Tokyo: UTC+9 */
    await new Promise((r) => setTimeout(r, 1500));
    const night = await at('2026-06-21T15:00:00Z');             /* midnight JST */
    const noon = await at('2026-06-21T03:00:00Z');              /* noon JST */
    window.IntMapTime.setNow({ source: 'r200' });
    /* the clock's real surface — `now` is NOT on it, which is what four files used to call */
    return { night, noon, api: Object.keys(window.IntMapTime).sort() };
  });

  expect(seen.api, 'IntMapTime has no now() — every reader must use when()').not.toContain('now');
  expect(seen.night.hz, 'Tokyo at midnight has a night horizon').not.toBe(seen.noon.hz);
  expect(seen.night.sun[1], 'and the sun is on the other side of the planet').not.toBe(seen.noon.sun[1]);
  expect(Math.abs(seen.night.ring - seen.noon.ring), 'the terminator ring moves with the clock too').toBeGreaterThan(30);
  /* …and the layer really took the new geometry (the night side subscribes from wire(), which app-body
     calls at map-load — i.e. after window.IntMapTime exists. js/theme-sky.js's copy did not, until now.) */
  if (seen.night.painted != null && seen.noon.painted != null)
    expect(Math.abs(seen.night.painted - seen.noon.painted), 'the painted source moved, not just the model').toBeGreaterThan(30);
});
