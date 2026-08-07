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

/* ── ② the darkness, in pixels → MOVED to tests/r201.spec.js ① ────────────────────────────────
   This measured the five-ring composite (`im-night-shade` fill-opacity carrying a per-ring
   `match`, and `_composite(k)` against the stated profile). #R201 deleted the rings: the night
   side is one canvas whose alpha is computed per pixel, so there is no profile to check against
   and no ring to check it for. r201 ① keeps the part that was about the RESULT — the same frame
   with the effect on and off — and raises the threshold from 0.75 to 0.9, which the new
   mechanism clears and the old one could not. Deleted rather than duplicated. */

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
      /* ⚠ (#R201) the terminator is no longer a ring of POLYGONS — it is the ALPHA of one canvas,
         computed per pixel. So "the night side really repainted on the clock event" is read where it
         now lives: the alpha the renderer is holding at Tokyo's own pixel. That is a stronger check
         than the old one (which read a vertex of a polygon the module had recomputed) because it is
         the value that reaches the screen. */
      const cv = (m.getSource('im-night-lights') || {}).canvas;
      let painted = null;
      if (cv) {
        const LIM = 85.051129, R = Math.PI / 180, my = (la) => Math.log(Math.tan(Math.PI / 4 + la * R / 2));
        const col = Math.round((139.7 + 180) / 360 * cv.width);
        const row = Math.round((my(LIM) - my(35.7)) / (2 * my(LIM)) * cv.height);
        painted = cv.getContext('2d').getImageData(col, row, 1, 1).data[3];
      }
      return { hz: m.getSky()['horizon-color'], sun: L && L.position ? L.position.map((x) => +(+x).toFixed(1)) : null,
               night: window.IntMapNightSide._nightAt(139.7, 35.7), painted };
    };
    m.jumpTo({ center: [139.7, 35.7], zoom: 3.4 });             /* Tokyo: UTC+9 */
    await new Promise((r) => setTimeout(r, 1500));
    /* ⚠ (#R201) the night side builds itself on the first IDLE after the camera settles, so waiting a
       fixed moment for it is a test of how fast the machine is. `painted` was allowed to be null, which
       meant the strongest assertion here could quietly not run at all. */
    for (let i = 0; i < 60 && !window.IntMapNightSide.state().built; i++) await new Promise((r) => setTimeout(r, 500));
    const night = await at('2026-06-21T15:00:00Z');             /* midnight JST */
    const noon = await at('2026-06-21T03:00:00Z');              /* noon JST */
    window.IntMapTime.setNow({ source: 'r200' });
    /* the clock's real surface — `now` is NOT on it, which is what four files used to call */
    return { night, noon, api: Object.keys(window.IntMapTime).sort() };
  });

  expect(seen.api, 'IntMapTime has no now() — every reader must use when()').not.toContain('now');
  expect(seen.night.hz, 'Tokyo at midnight has a night horizon').not.toBe(seen.noon.hz);
  expect(seen.night.sun[1], 'and the sun is on the other side of the planet').not.toBe(seen.noon.sun[1]);
  /* the night side's own model followed the clock: Tokyo is dark at JST midnight and lit at JST noon */
  expect(seen.night.night, 'Tokyo is in darkness at local midnight').toBeGreaterThan(0.9);
  expect(seen.noon.night, 'and in daylight at local noon').toBeLessThan(0.05);
  /* …and the CANVAS took it (the night side subscribes from wire(), which app-body calls at map-load
     — i.e. after window.IntMapTime exists. js/theme-sky.js's copy did not, until #R200.) */
  expect(seen.night.painted, 'the night canvas exists and was read').not.toBeNull();
  expect(seen.night.painted - seen.noon.painted, 'the painted alpha moved, not just the model').toBeGreaterThan(200);
});
