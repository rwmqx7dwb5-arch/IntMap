/* ============================================================================
 *  R388 — World railways: the ONE claim that must hold on every push.
 *
 *  Over Iberia the layer draws BOTH 1668 mm and 1435 mm. That one sentence is the whole round: the
 *  layer this replaced could not have drawn it, because its gauge was a lookup on a country code —
 *  `_rail_convert.py` found which country a line's MIDPOINT fell in and painted the whole line with
 *  that country's "predominant gauge". Spain's entry was 1668, so the entire Spanish high-speed
 *  network — which is standard gauge, and which OpenStreetMap states as 1435 mm on 169 ways — was
 *  painted Iberian broad gauge, under a legend that said «by gauge».
 *
 *  ⚠ WHY ONLY THIS ONE, AND WHY IT IS CHEAP. scripts/tiers.mjs puts the CURRENT ROUND's
 *  `rNNN.spec.js` in front of every push whatever it costs, and scripts/test-budget.mjs holds that
 *  gate to 50 s across six files. So the expensive half of this round — the click-through card, the
 *  colour-axis switch, the legend — is in tests/r388-detail.spec.js, whose name the «r + digits»
 *  rule does not pull into the gate. Same split as #R337's r337 / r337-atlas.
 *
 *  ⚠ AND NOTHING HERE TOUCHES THE NETWORK. The claim is served entirely from data/railways/, built
 *  offline by scripts/rail/*. Overpass is a build-time dependency, never a runtime one — a gate
 *  that goes red because a mirror had a bad afternoon is a gate people learn to ignore (#R341).
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';
import { railLayerOn } from './helpers/rail.js';

test('R388 Iberia is not one gauge', async ({ app }) => {
  const page = app.page;
  await railLayerOn(page);

  /* ⚠ ASK THE DATA, NOT THE PIXELS. The claim is about what the layer HOLDS for Iberia; whether a
     1435 mm line happens to be under the cursor at this window size is a different question and a
     flaky one. #R352 measured two separate false "still broken" reports from a harness that clicked
     where it believed a feature was. */
  const iberia = await page.evaluate(() => {
    const fc = window.IntMapRailways.world();
    const feats = fc ? fc.features : [];
    const g = new Set();
    let stated = 0;
    for (const f of feats) {
      if (f.properties.g == null) continue;
      if (!f.geometry.coordinates.some((p) => p[1] >= 36 && p[1] <= 44 && p[0] >= -10 && p[0] <= 3)) continue;
      g.add(f.properties.g); stated++;
    }
    return { gauges: [...g].sort((a, b) => a - b), stated, total: feats.length };
  });
  expect(iberia.total).toBeGreaterThan(20000);
  expect(iberia.stated).toBeGreaterThan(100);
  expect(iberia.gauges).toContain(1668);
  /* the whole point */
  expect(iberia.gauges).toContain(1435);
});
