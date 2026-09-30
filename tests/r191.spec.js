/* ============================================================================
 *  R191 — the parts that only a real renderer can answer.
 *   ① the lifted aircraft mark renders the flat glyph's colour, and carries its stroke
 *   ② the intensity field reaches the end of the lowest class, on land, without banding
 *   ③ Japanese opens on the JMA scale
 *   ④ the layer sidebar is genuinely opaque in the Solid appearance
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { loadLazyModules } from './helpers/app.js';
import { constFrom } from './app-source.mjs';

const R191_ROOT = new URL('../', import.meta.url);
/* ══ ⚠⚠ (#R304) THE GLYPH'S COLOUR IS A FACT ABOUT js/data-layers.js, SO READ IT FROM THERE ══════
   This said 「the glyph is #1e90ff = (30,144,255)」 with the three numbers typed out, and the civil
   aircraft are `#00D9FF` — a later round changed the colour and the spec went on demanding dodger
   blue, red on the nightly deep run ever since.
   ⚠ AND «every other channel has to be exact» CANNOT BE TRUE OF A CHANNEL AT ZERO. `_feHex` clamps
   `want/dir − AMBIENT` at 0, so a channel the glyph draws below the shader's fixed ambient term is
   ALREADY over-lit at a declared 0 and there is nothing the layer can ask for to bring it down —
   the same shape as the blue ceiling the source already describes at the other end. So the claim is
   stated at both ends: where the layer could reach the glyph's channel it lands on it, and where it
   could not, the reason is the floor or the ceiling rather than a colour that disagrees. */
const GLYPH = String(constFrom(R191_ROOT, 'js/data-layers.js', 'PLANE_CIV'));
const AMBIENT = Number(constFrom(R191_ROOT, 'js/data-layers.js', '_FE_AMBIENT'));
const CIV = [1, 3, 5].map((i) => parseInt(GLYPH.slice(i, i + 2), 16));

async function boot(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.IntMapCanDraw && window.IntMapCanDraw(), null, { timeout: 60000 });
}

/* (#R209) `window.IntMapSeismic` is not in the boot bundle any more — js/lazy-modules.js fetches
   js/seismic.js (and js/tsunami.js with it) when the right-click item is used, which awaits
   `IntMapLazy.need('seismic')` first. ⚠ THAT MATTERS PARTICULARLY HERE, because ② and ③ both open
   with `test.skip(!S, 'the seismic simulator is not installed here')` — after the split that guard
   would have been true on a perfectly healthy app and the two tests would have gone quietly green
   without measuring anything. The boot barrier above is unchanged; the tests that drive the
   simulator ask for it the way a click does. */

/* ── ① the mark ──────────────────────────────────────────────────────────────────────────────── */
/* ⚠ (remove-synthetic-planes) THE AIRCRAFT TEST THAT STOOD HERE BOOTED `?aviation=v1` — the per-browser
   airplanes.live sweep and its two MapLibre renderings (`lyr-planes`, `lyr-planes-3d`), with that
   host stubbed. The sweep is removed with its provider (HTTP 403 to every request since #R341), and
   so are the layers the test read; there is nothing left for it to boot. The aircraft layer is the
   GPU cloud now: the platform is gated by tests/r341.spec.js and tests/r379.spec.js, the card by
   tests/r352.spec.js, what the page does when the feed fails by
   tests/remove-synthetic-planes-checks.test.mjs, and live aircraft by tests/r341-live.spec.js. */

/* ── ② the intensity field ───────────────────────────────────────────────────────────────────── */
test('R191 seismic: the field reaches the end of the lowest class, and only over land', async ({ page }) => {
  test.setTimeout(240000);
  await boot(page);
  await loadLazyModules(page);
  const r = await page.evaluate(async () => {
    const S = window.IntMapSeismic;
    if (!S || !S.open) return { has: false };
    S.open({ lng: 143.05, lat: 38.30, depth: 24, mw: 9.0 });
    await new Promise(res => setTimeout(res, 600));
    S.setScale('jma');
    await new Promise(res => setTimeout(res, 1400));
    await S.rebuildField();
    await new Promise(res => setTimeout(res, 2000));
    const st = S.state();
    const CM = window.IntMapCoastMask;
    return { has: true, field: st.field, far: st.far, tsunami: st.tsunami,
      coast: { ready: !!(CM && CM.ready()), source: (CM && CM.ready()) ? CM.source() : null },
      terrainKm: st.terrainKm, maxKm: st.maxKm,
      layers: { fine: window.IntMapGeoEngine.layers.has('seis-mmi-fill'),
                far: window.IntMapGeoEngine.layers.has('seis-mmi-far') } };
  });
  test.skip(!r.has, 'the seismic simulator is not installed here');
  /* an M9 reaches thousands of kilometres — the whole point of the report.
     ⚠ (#R192) …but not SEVEN thousand. #R191 pinned > 4,000 km, which was 震度1 converted from a PGV
     the 0.02 Hz integration bound was setting: a 50-second swell nobody feels, coloured in across
     Asia. 震度 is the JMA's own computation now, and the lowest class ends where 震度1 was actually
     reported for this earthquake. The claim this line is really about — that the paint is NOT
     clipped at the fine field's 1,500 km — is unchanged and still checked. */
  expect(r.field, 'the fine field was built').toBeTruthy();
  expect(r.field.rEdgeKm, 'an M9 carries 震度1 past the fine field').toBeGreaterThan(r.terrainKm);
  expect(r.field.rEdgeKm, 'and stops where it can be felt, not three continents away').toBeLessThan(3200);
  expect(r.field.rFineKm, 'while the terrain-driven part stays where the DEM can support it').toBe(r.terrainKm);
  expect(r.far, 'so the annulus beyond the terrain is drawn').toBeTruthy();
  expect(r.layers.far, 'as its own layer, under the fine one').toBe(true);
  /* (#R192) …and how much depends on the SCALE and the ground. The annulus is computed for the
     panel's own site class (there is no terrain out there to read), while its outer edge is the
     softest plausible ground — so for 震度 on rock, where the class ends inside the 1,500 km fine
     field, the honest answer is that the band paints nothing at all. What this test is really about
     is that it is CONSIDERED and that whatever it does paint is land, which is checked below. */
  expect(r.far.N, 'the annulus was rasterised').toBeGreaterThan(0);
  /* …on LAND only, exactly like the fine field. Painting the ocean is what punched a rectangle
     through the middle of the rings the first time this was built. */
  expect(r.far.landMask, 'the land mask loaded').toBe(true);
  /* ══ ⚠ (#R304) 'bundled' WAS THE ONLY ANSWER WHEN THIS WAS WRITTEN, AND #R250 ADDED A BETTER ONE ══
     The claim is 「the mask cannot half-arrive」 — a DEM read that lands in pieces draws stripes. #R250
     answered the far field's coastline from js/coast-mask.js at the raster's OWN cell when the country
     outlines are loaded (1.14 km instead of a 19.6 km staircase drawn at 1.17 km), keeping the bundled
     raster as the fallback, and this line went on demanding the fallback. Red on the nightly ever since.
     Both sources are WHOLE — neither is a tile read — so the honest statement is the relation #R250
     actually established: the far field names the mask that answered it, and that is the coast mask
     when the coast mask was ready and the bundled raster when it was not. A source that half-arrived
     would be neither. */
  expect(r.far.landSource, 'the far field names the whole mask that answered it (#R250)')
    .toBe(r.coast.ready ? r.coast.source : 'bundled');
  expect(r.far.sea, 'and most of a whole-world annulus around Japan is sea').toBeGreaterThan(r.far.painted);
  /* the fine field read a frozen DEM — the striping fix */
  expect(r.field.demTiles, 'the field snapshotted its own DEM tiles').toBeGreaterThan(0);
  /* and the tsunami hand-off is offered for a shallow offshore M9 */
  expect(r.tsunami, 'a shallow offshore M9 screens as tsunamigenic').toBeTruthy();
  expect(r.tsunami.waveM).toBeGreaterThan(1);
});

/* ── ③ the Japanese default ──────────────────────────────────────────────────────────────────── */
test('R191 seismic: a Japanese session opens on the JMA scale', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    try { localStorage.setItem('intmap_settings', JSON.stringify({ lang: 'jp' })); } catch (_) { }
  });
  await boot(page);
  await loadLazyModules(page);
  const r = await page.evaluate(() => {
    const S = window.IntMapSeismic;
    return S ? { lang: (window.IntMapI18N && window.IntMapI18N.lang) || document.documentElement.lang || null,
                 scale: S.state().scale, set: S.state().scaleSet } : null;
  });
  test.skip(!r, 'the seismic simulator is not installed here');
  expect(r.scale, '「震度は日本語設定中は気象庁震度をデフォルトに」').toBe('jma');
  expect(r.set, 'and it is a DEFAULT, not a latched choice').toBe(false);
});

/* ── ④ the layer sidebar ─────────────────────────────────────────────────────────────────────── */
test('R191 UI: the layer sidebar is opaque in the Solid appearance', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const r = await page.evaluate(async () => {
    document.body.classList.remove('sidebar-translucent', 'sidebar-glass2', 'sidebar-glass');
    try { window.IntMapLayerSidebar && window.IntMapLayerSidebar.toggle(); } catch (_) { }
    await new Promise(res => setTimeout(res, 600));
    const el = document.getElementById('layer-sidebar-r');
    if (!el) return { has: false };
    const cs = getComputedStyle(el);
    const solid = { bg: cs.backgroundColor, blur: cs.backdropFilter || cs.webkitBackdropFilter };
    document.body.classList.add('sidebar-translucent');
    await new Promise(res => setTimeout(res, 200));
    const cs2 = getComputedStyle(el);
    return { has: true, solid, frosted: { bg: cs2.backgroundColor, blur: cs2.backdropFilter || cs2.webkitBackdropFilter } };
  });
  test.skip(!r.has, 'the right-hand layer sidebar is not installed here');
  /* Solid means an OPAQUE fill (rgb(), or rgba with alpha 1) and no blur behind it */
  const alpha = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return 1; const p = m[1].split(','); return p.length > 3 ? parseFloat(p[3]) : 1; };
  expect(alpha(r.solid.bg), '「レイヤーサイドバーは無条件で透過するな」').toBe(1);
  expect(r.solid.blur === 'none' || !r.solid.blur, 'and no blur behind an opaque fill').toBeTruthy();
  /* …and the frosted modes are still frosted — not unconditionally opaque either */
  expect(alpha(r.frosted.bg), 'the frosted mode keeps its translucency').toBeLessThan(1);
});
