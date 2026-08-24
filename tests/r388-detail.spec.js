/* ============================================================================
 *  R388 — World railways: the two claims that need a camera and a click.
 *   ① a click on a real line opens a card built from THAT line's own OpenStreetMap tags
 *   ② the colour axis is a switch — the same lines repaint from a different tag, the legend
 *      follows, and its "not stated" grey is not the colour of any answered bucket
 *
 *  ⚠ WHY THIS FILE HAS THIS NAME. scripts/tiers.mjs pulls the current round's `rNNN.spec.js` into
 *  the gate that runs before every push, whatever it costs, and scripts/test-budget.mjs holds that
 *  gate to 50 s. These two claims need detail cells fetched for a viewport and a real mouse click,
 *  which is most of a minute; the one claim that must be checked on every push is in
 *  tests/r388.spec.js. The «r + digits» rule does not match `r388-detail`, so this runs nightly.
 *  Same split as #R337's r337 / r337-atlas.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';
import { railLayerOn } from './helpers/rail.js';

test('R388 ① a click on a line answers for that line', async ({ app }) => {
  const page = app.page;
  await railLayerOn(page);

  const pick = await page.evaluate(() => {
    const fc = window.IntMapRailways.world();
    const f = (fc ? fc.features : []).find((x) => x.properties.g === 1435
      && x.geometry.coordinates.some((p) => p[1] >= 36 && p[1] <= 44 && p[0] >= -10 && p[0] <= 3));
    return f ? f.geometry.coordinates[Math.floor(f.geometry.coordinates.length / 2)] : null;
  });
  expect(pick).toBeTruthy();

  /* ⚠ THROUGH THE RENDERER, NOT THROUGH A GUESS. #R352 measured two false "still broken" reports
     from a harness that clicked where it BELIEVED a feature was: `project()` is canvas-relative
     while `page.mouse.click` is viewport-relative, so with the sidebar open every click landed 400
     px off. The point is found by asking the renderer what it actually drew, and the canvas offset
     is added back before the mouse is told anything. */
  await page.evaluate(([lng, lat]) => window.IntMapGeoEngine.camera.jumpTo({ center: { lng, lat }, zoom: 11 }), pick);
  await page.waitForFunction(() => {
    try {
      const c = window.IntMapGeoEngine.render.canvas();
      const box = [[c.clientWidth / 2 - 60, c.clientHeight / 2 - 60], [c.clientWidth / 2 + 60, c.clientHeight / 2 + 60]];
      return window.IntMapGeoEngine.coords.queryRenderedFeatures(box, { layers: ['rail-det-ln', 'rail-ln'] }).length > 0;
    } catch (_) { return false; }
  }, null, { timeout: 60000 });

  const hit = await page.evaluate(() => {
    const c = window.IntMapGeoEngine.render.canvas();
    const cx = c.clientWidth / 2, cy = c.clientHeight / 2;
    for (let r = 0; r <= 60; r += 4) {
      for (const [dx, dy] of [[r, 0], [0, r], [-r, 0], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
        const p = [cx + dx, cy + dy];
        const f = window.IntMapGeoEngine.coords.queryRenderedFeatures(p, { layers: ['rail-det-ln', 'rail-ln'] });
        if (f && f.length) {
          const rect = c.getBoundingClientRect();
          return { x: Math.round(rect.left + p[0]), y: Math.round(rect.top + p[1]) };
        }
      }
    }
    return null;
  });
  expect(hit).toBeTruthy();
  await page.mouse.click(hit.x, hit.y);
  await page.waitForSelector('#rail-detail', { timeout: 15000 });
  const card = await page.locator('#rail-detail').innerText();

  expect(card).toMatch(/\d{3,4}\s*mm/);
  /* ⚠ AND IT MUST NOT CLAIM WHAT OSM DID NOT SAY. The card prints a field only when the tag is
     there, so an absent value must be ABSENT — never «—», never 0 (#R354). */
  expect(card).not.toMatch(/\b0\s*(km\/h|mm)\b/);
  expect(card).not.toMatch(/—\s*$/m);
  /* ⚠ AND IT MUST NOT SAY THE SAME THING TWICE. Production verification read «1.5 kV DC · 1.5 kV DC»
     off the electrification row and «Under construction · Under construction» off the subtitle: the
     bucket LABEL and the READING are the same sentence for the four named systems, and the line
     class already carries the status for a line under construction. Two true halves that repeat one
     another read as a bug in the data, which is the one thing this layer must not look like. */
  /* ⚠ WEAK HERE, AND SAID SO. Production read «1.5 kV DC · 1.5 kV DC» off the electrification row,
     but this spec's own line is a Spanish high-speed line — 25 kV AC 50 Hz — where the reading and
     the bucket label differ by the frequency and the defect cannot appear. MEASURED: with the join
     deliberately put back and the build redone, this assertion still passed. It stays because it is
     free and would catch a future case; the check that ACTUALLY bites is the source one in
     tests/r388-checks.test.mjs ⑭, and that is where the guarantee lives. */
  const repeat = /(\S[^·\n]{2,}?)\s·\s\1(?=\s|$)/.exec(card);
  expect(repeat && repeat[0], 'the card says the same thing twice: ' + (repeat && repeat[0])).toBeFalsy();
});

test('R388 ② the axis is a switch, and grey means "OSM does not say"', async ({ app }) => {
  const page = app.page;
  await railLayerOn(page);

  const before = await page.evaluate(() => ({
    axis: window.IntMapRailways.axis(),
    colour: JSON.stringify(window.IntMapRailways.colour()),
    key: window.IntMapRailways.key().map((r) => r[1]),
  }));
  expect(before.axis).toBe('gauge');

  await page.evaluate(() => window.IntMapRailways.setAxis('electrification'));

  const after = await page.evaluate(() => ({
    axis: window.IntMapRailways.axis(),
    colour: JSON.stringify(window.IntMapRailways.colour()),
    key: window.IntMapRailways.key(),
    /* the question is what the RENDERER holds, not what the module intended (#R353) */
    painted: JSON.stringify(window.IntMapGeoEngine.layers.getPaint('rail-ln', 'line-color') || null),
  }));
  expect(after.axis).toBe('electrification');
  expect(after.colour).not.toBe(before.colour);
  expect(after.key.map((r) => r[1])).not.toEqual(before.key);
  /* ⚠ and the paint the renderer is holding really changed — #R353 shipped a layer the renderer had
     silently dropped while every local check stayed green */
  expect(after.painted).toBe(after.colour);

  /* every legend row is named — a bucket the map can paint but the key cannot name ships as an
     unexplained colour (#R353) */
  for (const [, label] of after.key) expect(String(label).length).toBeGreaterThan(0);

  /* ── the honest bucket is present, and it is not the colour of an answer ──────
     ⚠ MATCHED BY ITS ID, NOT BY ITS WORDS. The first version looked for /not stated/ in the label
     and found TWO rows, because «Electrified, system not stated» is a real answer whose English
     happens to contain the phrase. The bucket id is what the paint expression switches on, so it
     is what the test must ask about — and it keeps working in the other eight languages. */
  const greys = after.key.filter((r) => r[2] === 'na');
  expect(greys.length).toBe(1);
  expect(greys[0][1].length).toBeGreaterThan(0);
  const greyColour = greys[0][0].toLowerCase();
  const answered = after.key.filter((r) => r[2] !== 'na').map((r) => r[0].toLowerCase());
  expect(answered).not.toContain(greyColour);
});
