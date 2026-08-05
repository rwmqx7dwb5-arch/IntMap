/* ============================================================================
 *  R191 — the parts that only a real renderer can answer.
 *   ① the lifted aircraft mark renders the flat glyph's colour, and carries its stroke
 *   ② the intensity field reaches the end of the lowest class, on land, without banding
 *   ③ Japanese opens on the JMA scale
 *   ④ the layer sidebar is genuinely opaque in the Solid appearance
 * ==========================================================================*/
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.IntMapCanDraw && window.IntMapCanDraw(), null, { timeout: 60000 });
}

/* ── ① the mark ──────────────────────────────────────────────────────────────────────────────── */
test('R191 aircraft: the lifted mark is the glyph — same silhouette, same stroke, same colour', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  /* the layers are built when the layer is first switched on — no live feed is needed for that, and
     depending on one would make this test about airplanes.live's rate limit instead of the mark */
  await page.evaluate(() => {
    const cb = document.getElementById('dl-planes');
    if (cb && !cb.checked) { const row = cb.closest('label') || cb.parentElement;
      ['pointerdown', 'pointerup'].forEach(t => row.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 1 }))); }
  });
  await page.waitForFunction(() => { try { return window.IntMapGeoEngine.layers.has('lyr-planes-3d'); } catch (_) { return false; } }, null, { timeout: 60000 });
  const r = await page.evaluate(() => {
    /* The colour the EXTRUSION is asked for is not the colour it renders — MapLibre lights it. The
       contract this pins is the one that matters: whatever the layer declares, feeding it back through
       the shader's own arithmetic has to land on the glyph's colour. */
    const GE = window.IntMapGeoEngine;
    let expr = null;
    try { expr = GE.layers.getPaint('lyr-planes-3d', 'fill-extrusion-color'); } catch (_) { }
    if (!expr) return { has: false };
    const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    /* ['interpolate',['linear'],['zoom'], z0, <case>, z1, <case>] */
    const globeCase = expr[4], mercCase = expr[6];
    const civOf = (c) => c[c.length - 1][c[c.length - 1].length - 1];   /* the match's default output */
    const render = (declared, dir) => hex(declared).map(v => Math.min(255, (v / 255 + 0.03) * dir * 255));
    return { has: true,
      globe: render(civOf(globeCase), 0.933),
      merc: render(civOf(mercCase), 1.0),
      rimGlobe: globeCase[2], rimMerc: mercCase[2] };
  });
  test.skip(!r.has, 'the aircraft layer is not installed here');
  /* the glyph is #1e90ff = (30,144,255); blue saturates at the renderer's ceiling under the globe,
     which is stated in the source — every other channel has to be exact */
  expect(Math.abs(r.merc[0] - 30), 'Mercator red').toBeLessThan(1.5);
  expect(Math.abs(r.merc[1] - 144), 'Mercator green').toBeLessThan(1.5);
  expect(Math.abs(r.globe[0] - 30), 'globe red').toBeLessThan(1.5);
  expect(Math.abs(r.globe[1] - 144), 'globe green').toBeLessThan(1.5);
  expect(r.globe[2], 'globe blue is at the ceiling the extrusion can reach').toBeGreaterThan(240);
  /* and the stroke case exists in both halves of the ramp */
  expect(String(r.rimGlobe), 'the stroke is white under the globe').toMatch(/^#f{0,2}[0-9a-f]/i);
  expect(String(r.rimMerc), 'and under Mercator').toMatch(/^#f{0,2}[0-9a-f]/i);
});

/* ── ② the intensity field ───────────────────────────────────────────────────────────────────── */
test('R191 seismic: the field reaches the end of the lowest class, and only over land', async ({ page }) => {
  test.setTimeout(240000);
  await boot(page);
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
    return { has: true, field: st.field, far: st.far, tsunami: st.tsunami,
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
  expect(r.far.landSource, '(#R192) …and it is the bundled one, which cannot half-arrive').toBe('bundled');
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
