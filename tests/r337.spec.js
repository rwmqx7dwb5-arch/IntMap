/* ============================================================================
 *  #R337 — the browser half: what no source-level check can settle
 * ----------------------------------------------------------------------------
 *    ① the Temperature legend really carries the wind-particle switch, and ticking it draws the
 *       streaks WITHOUT adding the wind layer's colour raster to the map.
 *    ④ the Chronos Time slider really has graduations, and 12:00 really sits on the middle of the
 *       rail rather than at 50 % of a box the thumb cannot reach.
 *
 *    ② (the starter chips) and ③ (NATO moving the camera) are in tests/r337-atlas.spec.js. They
 *       cost an Atlas chunk and a country table between them, which is more than the price of
 *       standing in front of a push (scripts/tiers.mjs, CORE_MAX_S) — so they run on the nightly
 *       schedule and on the dispatch button (never on the merge, #R207), which is where this
 *       project puts the expensive half of a round's evidence.
 *
 *  ⚠ #R318 IS WHY THIS FILE EXISTS AT ALL. A cross-chunk TDZ made Atlas fail to mount in the
 *  production build while `node --check`, 1,900 node assertions and a twenty-item audit all passed;
 *  one real browser spec is what found it. Every claim here is about what the built page DOES.
 *
 *  ⚠ THE CHECKBOXES ARE SET AND DISPATCHED, NOT CLICKED. js/app-body.js toggles a layer row from a
 *  delegated pointerdown (#R242), so a programmatic `.click()` on the input is undone again before
 *  anything reads it — MEASURED here first: the row stayed unchecked for 44 s while this spec
 *  waited for a legend that was never going to open. `checked = true` + a bubbling `change` is the
 *  door the rest of the suite already uses (tests/smoke.spec.js).
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(90000);   /* the temperature layer is a real network read */

test('R337 ①: the temperature legend draws the wind streaks without the wind layer’s colours', async ({ app }) => {
  const page = app.page;

  /* the preference is pushed as an EFFECTIVE value — the box AND the layer — so ticking it while
     the temperature layer is off must change nothing on the map */
  const off = await page.evaluate(() => {
    window._imWxTempParts(true);
    return { pref: !!window._imWxTempParts(), solo: !!(window.Wind && window.Wind.solo && window.Wind.solo()) };
  });
  expect(off.pref, 'the preference remembers what it was told').toBe(true);
  expect(off.solo, '…and nothing is drawn while the layer it belongs to is off').toBe(false);
  await page.evaluate(() => window._imWxTempParts(false));

  /* now the layer, and the row inside its legend */
  await page.evaluate(() => { const cb = document.getElementById('dl-ec-temp');
    if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); } });
  await page.waitForFunction(() => {
    const el = document.getElementById('data-legend-ec-temp');
    return !!(el && el.style.display !== 'none' && el.querySelector('.ec-wind-parts'));
  }, null, { timeout: 60000 });

  const tick = () => page.evaluate(() => { const b = document.querySelector('#data-legend-ec-temp .ec-wind-parts');
    b.checked = !b.checked; b.dispatchEvent(new Event('change', { bubbles: true })); });

  expect(await page.evaluate(() => document.querySelector('#data-legend-ec-temp .ec-wind-parts').checked),
    'the row is OFF by default — nothing changes for a reader who ignores it').toBe(false);

  await tick();
  await page.waitForTimeout(400);
  const on = await page.evaluate(() => ({
    solo: !!window.Wind.solo(),
    layerOn: !!window.Wind.on(),
    canvas: getComputedStyle(document.getElementById('wind-canvas')).display,
    /* ⚠ THE COLOUR RASTER MUST NOT COME WITH THEM. A reader who asked for the wind over the
       temperature field did not ask for the wind's own colours on top of it. */
    raster: ['wind-field-a', 'wind-field-b'].filter((l) => window.IntMapGeoEngine.layers.has(l)),
    windRow: !!(document.getElementById('dl-wind') || {}).checked
  }));
  expect(on.solo, 'the wind module is told the streaks are wanted').toBe(true);
  expect(on.layerOn, 'and the wind LAYER is still off').toBe(false);
  expect(on.windRow, 'its row in the panel is still unchecked').toBe(false);
  expect(on.canvas, 'the particle canvas is showing').not.toBe('none');
  expect(on.raster, 'and no wind colour raster was added to the map').toEqual([]);

  await tick();
  await page.waitForTimeout(300);
  const back = await page.evaluate(() => ({ solo: !!window.Wind.solo(),
    canvas: getComputedStyle(document.getElementById('wind-canvas')).display }));
  expect(back.solo).toBe(false);
  expect(back.canvas, 'the canvas goes back down').toBe('none');

  /* …and switching the temperature layer off takes the overlay with it, box ticked or not */
  await tick();
  await page.evaluate(() => { const cb = document.getElementById('dl-ec-temp');
    if (cb && cb.checked) { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); } });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => !!window.Wind.solo()),
    'the streaks belong to that layer — they go when it does').toBe(false);
  await page.evaluate(() => window._imWxTempParts(false));
});

test('R337 ④: the Chronos Time slider carries graduations, and 12:00 sits on the middle of the rail', async ({ app }) => {
  const page = app.page;
  await page.evaluate(() => {
    const tl = document.getElementById('news-timeline');
    if (tl && tl.classList.contains('collapsed')) document.getElementById('ntl-toggle').click();
    document.getElementById('ntl-mode-time').click();
  });
  await page.waitForFunction(() => {
    const t = document.getElementById('ntl-ticks');
    return !!(t && t.style.display !== 'none' && t.querySelectorAll('.ntl-tk').length > 0);
  }, null, { timeout: 15000 });

  const m = await page.evaluate(() => {
    const t = document.getElementById('ntl-ticks');
    const all = Array.from(t.querySelectorAll('.ntl-tk'));
    const labelled = all.filter((x) => x.querySelector('b'));
    const sl = document.getElementById('ntl-slider').getBoundingClientRect();
    const noon = all[12].getBoundingClientRect();
    const first = all[0].getBoundingClientRect(), last = all[24].getBoundingClientRect();
    const pl = document.getElementById('ntl-player');
    return {
      marks: all.length, labels: labelled.map((x) => x.querySelector('b').textContent),
      /* the mark's own x against the rail the thumb travels — half a thumb in at each end */
      noonOffset: (noon.left + noon.width / 2) - (sl.left + sl.width / 2),
      firstIn: first.left - sl.left, lastIn: sl.right - last.right,
      scaleShown: getComputedStyle(document.getElementById('ntl-scale')).display,
      ticksTop: t.getBoundingClientRect().top, sliderBottom: sl.bottom,
      playerTop: (pl && pl.style.display !== 'none') ? pl.getBoundingClientRect().top : 1e9
    };
  });
  expect(m.marks, 'one mark per hour, and the end of the day').toBe(25);
  expect(m.labels, 'every sixth mark is labelled').toEqual(['00:00', '06:00', '12:00', '18:00', '24:00']);
  expect(Math.abs(m.noonOffset), 'noon is on the middle of the rail, not half a thumb off it').toBeLessThan(2);
  expect(m.firstIn, 'the first mark is half a thumb in from the left edge').toBeGreaterThan(4);
  expect(m.lastIn, '…and the last one from the right').toBeGreaterThan(4);
  expect(m.scaleShown, 'the old label row is not shown as well — that would be two of them').toBe('none');
  /* ⚠ IT IS UNDER THE SLIDER, not on the far side of the forecast transport */
  expect(m.ticksTop, 'the ruler sits directly below the slider').toBeGreaterThanOrEqual(m.sliderBottom - 4);
  expect(m.ticksTop, '…and above the player, when the player is up').toBeLessThan(m.playerTop + 1);

  /* the other two tabs are untouched: they keep the label row they have always had */
  const year = await page.evaluate(() => {
    document.getElementById('ntl-mode-year').click();
    return { ticks: document.getElementById('ntl-ticks').querySelectorAll('.ntl-tk').length,
             scale: getComputedStyle(document.getElementById('ntl-scale')).display };
  });
  expect(year.ticks, 'the Year tab has no ruler').toBe(0);
  expect(year.scale, '…and its own label row is back').not.toBe('none');
  await page.evaluate(() => { const tl = document.getElementById('news-timeline');
    if (tl && !tl.classList.contains('collapsed')) document.getElementById('ntl-x').click(); });
});
