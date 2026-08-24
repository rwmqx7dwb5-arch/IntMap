/* ============================================================================
 *  R353 — Volcano Intelligence: the two claims that must hold on EVERY push.
 *   ① a click on a volcano opens the intelligence card, and the card is built from the BUNDLED
 *      record — the eruption history, the VEI histogram, the magma and the population radii are all
 *      there with no network answering
 *   ② the colour modes are four different questions about the same dots, and the "Now" mode's grey
 *      says "nothing is published", which is not the same colour as "an observatory says normal"
 *
 *  ⚠ WHY ONLY TWO, AND WHY THESE. This file is the round's own spec, so scripts/tiers.mjs puts it
 *  in front of every push — everything in it must therefore be true whether or not USGS, JMA, the
 *  Smithsonian or the SIGMET relay answered this minute. The live rungs of the status ladder, the
 *  ash areas and the hazard-zone service need those upstreams, so they live in
 *  tests/r353-live.spec.js and run nightly. A gate that goes red because volcano.si.edu had a bad
 *  afternoon is a gate people learn to ignore (the #R341 rule, same shape).
 *
 *  Both claims below were UNTRUE before this round and neither needs a feed:
 *    · the click produced a four-line popup — name, country, elevation, type, last eruption year —
 *      because that was the whole of what data/volcanoes_gvp.json knew;
 *    · there was one colour scheme and no way to ask a different question of the same map.
 *
 *  ⚠ THE SHARED FIXTURE, NOT A BOOT OF ITS OWN — see the note at the top of tests/r341.spec.js.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

/* Aira (Sakurajima's caldera): 48 confirmed eruptions, max VEI 6, 905,254 people within 30 km, and
   an eruption that is still running. A volcano with every field populated is the one to open. */
const AIRA = 282080;

/* ⚠ BOTH TESTS DO THIS, AND THE SECOND ONE MUST NOT ASSUME THE FIRST ONE RAN. The `app` fixture is
   worker-scoped, so locally the two share a page and the layer switched on by ① is still on when ②
   starts — but CI SHARDS the suite, and a shard that gets only ② was waiting 60 s for a layer nobody
   had asked for and then failing with «Target page has been closed». Measured on the first CI run of
   this file. It is idempotent, so calling it twice in one page costs one `if`. */
async function volcanoLayerOn(page) {
  await page.waitForFunction(() => document.querySelectorAll('.lyr-row').length > 100, null, { timeout: 60000 });
  /* ⚠ THE ROW TOGGLES ON pointerdown, NOT ON THE CHECKBOX'S click (#R37) — see tests/r341.spec.js. */
  await page.evaluate(() => {
    const cb = document.getElementById('beta-dl-volc2');
    if (cb && !cb.checked) {
      const row = cb.closest('label') || cb.closest('.lyr-row') || cb.parentElement;
      ['pointerdown', 'pointerup'].forEach((t) =>
        row.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 1 })));
    }
  });
  /* the layer's own file has to arrive before anything here can be about a volcano */
  await page.waitForFunction(
    () => { try { return (window.__imVolcLayer && window.__imVolcLayer.count()) > 1000; } catch (_) { return false; } },
    null, { timeout: 60000 },
  );
}

test('R353 ① a volcano opens an intelligence card built from the bundled record', async ({ app }) => {
  const page = app.page;
  await volcanoLayerOn(page);

  /* the join key is the whole point of the rebuild — assert it is in the SHIPPED file, not just in
     the build script's intention */
  const layer = await page.evaluate(() => {
    const fc = window.__imVolcLayer.data();
    const f = fc.features.find((x) => x.properties.v === 282080);
    return {
      count: fc.features.length,
      rocks: fc.rocks && fc.rocks.length,
      aira: f && { v: f.properties.v, n: f.properties.n, x: f.properties.x, q: f.properties.q, p: f.properties.p },
    };
  });
  expect(layer.count).toBeGreaterThan(1000);
  expect(layer.rocks).toBeGreaterThan(5);
  expect(layer.aira).toBeTruthy();
  expect(layer.aira.n).toBe('Aira');
  expect(layer.aira.x).toBe(6);                       /* largest VEI in its own record */
  expect(layer.aira.q).toBeGreaterThan(30);           /* confirmed eruptions */
  expect(layer.aira.p).toBeGreaterThan(500000);       /* people within 30 km */

  /* open the card through the KERNEL COMMAND, which is the path Atlas uses. If the button and Atlas
     did not share it, this would be testing a second mechanism. */
  const opened = await page.evaluate(async (v) => {
    const r = await window.IntMapOS.exec('volcano.open', { source: 'test', params: { v } });
    return r && r.ok !== false;
  }, AIRA);
  expect(opened).toBe(true);

  await page.waitForSelector('#volc-popup', { state: 'visible', timeout: 30000 });
  await expect(page.locator('#volcp-title')).toContainText('Aira');

  /* ⚠ THE HISTORY COMES FROM data/volcano-detail.json.gz AND IS UN-GZIPPED IN THE BROWSER. If
     DecompressionStream or the fetch failed, the tab renders its "could not be loaded" line — so
     asserting the numbers is what proves the file really arrived. */
  await page.evaluate(() => document.querySelector('[data-tab="history"]').click());
  await page.waitForSelector('.volc-vei-row', { timeout: 30000 });

  const history = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.volc-er-row')];
    const bars = [...document.querySelectorAll('.volc-vei-row')];
    return {
      eruptions: rows.length,
      veiBuckets: bars.length,
      /* the newest row first — the card promises "most recent first" */
      newest: rows.length ? rows[0].querySelector('.volc-er-d').textContent.trim() : '',
      body: document.getElementById('volcp-body').textContent,
    };
  });
  expect(history.eruptions).toBeGreaterThan(30);
  expect(history.veiBuckets).toBe(8);                 /* VEI 0…7 */
  expect(history.newest).toMatch(/20\d\d/);
  /* the eruption STYLE disclaimer — the round's honesty rule, on screen and not only in a comment */
  expect(history.body).toMatch(/Strombolian|ストロンボリ/);

  /* ⚠ (#R395) THE «The volcano» TAB IS ASSERTED IN tests/r395.spec.js NOW, AND HARDER. The three
     lines that stood here read the same three rows with an `English|日本語|中文` alternation, so they
     passed whichever language the value came out in — which is exactly the defect #R395 was reported
     for (every label translated, every value English). That file opens the same card in Japanese and
     asserts both halves: the Japanese IS there and the English is GONE. Two files sweeping one
     invariant is what the test budget exists to stop (#R197), so this one gives the tab up. */

  /* exposure: the four population radii GVP publishes */
  await page.evaluate(() => document.querySelector('[data-tab="impact"]').click());
  const impact = await page.evaluate(() => document.getElementById('volcp-body').textContent);
  expect(impact).toMatch(/905,254|905254/);
  /* …and the hazard-zone absence is SAID rather than drawn as a modelled circle */
  expect(impact).toMatch(/hazard-zone GIS is published|ハザード域の GIS|ハザード域/);
});

test('R353 ② four colour modes, and "nothing published" is its own colour', async ({ app }) => {
  const page = app.page;
  await volcanoLayerOn(page);

  /* ⚠⚠⚠ ALL THREE OF THE LAYER'S RENDERINGS MUST BE ON THE RENDERER, AND THIS IS WHY.
     `volc2-halo` had `['*', 2.6, <zoom interpolate>]` as its radius. MapLibre requires a `zoom`
     expression to be the OUTERMOST expression of a paint property — and it does not throw when it is
     not: addLayer validates, fires an ErrorEvent, and SKIPS THE LAYER. So the layer file loaded, the
     points drew, all four colour modes worked, every test here passed, and the one rendering that
     marks the volcanoes an observatory is speaking about today was simply not on the map. It was
     found by reading the console in production. Asking the renderer which layers it HAS is the
     question that catches it; asking the source what it MEANT is not (#R353 追記). */
  const present = await page.evaluate(() => ['volc2-halo', 'volc2-pt', 'volc2-lbl']
    .map((id) => [id, window.IntMapGeoEngine.layers.has(id)]));
  for (const [id, has] of present) expect(has, id + ' was rejected by the renderer').toBe(true);

  const modes = await page.evaluate(() => window.__imVolcLayer.modes());
  expect(modes).toEqual(['recency', 'vei', 'status', 'people']);

  /* switching the mode must change the PAINT, not only a variable. Reading the paint property back
     off the renderer is the only way to tell those two apart. */
  const paints = await page.evaluate(async () => {
    const out = {};
    for (const m of window.__imVolcLayer.modes()) {
      window.__imVolcLayer.setMode(m);
      out[m] = JSON.stringify(window.IntMapGeoEngine.layers.getPaint('volc2-pt', 'circle-color'));
    }
    return out;
  });
  expect(new Set(Object.values(paints)).size).toBe(4);   /* four questions, four expressions */

  /* ⚠ THE GREY IS A DIFFERENT COLOUR FROM "NORMAL", AND THAT IS THE WHOLE CLAIM OF THE STATUS MODE.
     `st` is ABSENT for a volcano no observatory has spoken about, so the step expression's BASE is
     what "nothing published" gets; rank 0 (an observatory saying normal) is the first stop. If those
     two ever became the same colour, 1,150 volcanoes would read as "checked and calm". */
  const status = JSON.parse(paints.status);
  expect(status[0]).toBe('step');
  const base = status[2], normal = status[4];
  expect(base).not.toBe(normal);

  /* the legend follows the mode, and the count in it is READ from the file (it said 1,215 while the
     catalog held 1,214 — see tests/r353-checks ⑧) */
  await page.evaluate(() => window.__imVolcLayer.setMode('vei'));
  const legend = await page.evaluate(() => {
    const el = document.querySelector('.volc-key');
    return { text: el ? el.textContent : '', on: !!(el && el.querySelector('.volc-mode.on')) };
  });
  expect(legend.on).toBe(true);
  expect(legend.text).toMatch(/VEI 7/);
  const shown = /([\d,]{3,})\s*(Holocene volcanoes|座|holozäne|вулканов|volcanes|volcans|화산|全新世)/.exec(legend.text);
  expect(shown).toBeTruthy();
  const real = await page.evaluate(() => window.__imVolcLayer.count());
  expect(Number(shown[1].replace(/[,.]/g, ''))).toBe(real);

  /* the three overlay rows exist in the Layers panel — a feature reachable only from a popup is a
     feature most readers never learn exists */
  for (const id of ['beta-dl-volcash', 'beta-dl-volchaz', 'beta-dl-volcso2']) {
    expect(await page.evaluate((x) => !!document.getElementById(x), id)).toBe(true);
  }
  /* …and the kernel knows every one of the commands, so Atlas can drive them. ⚠ (#R395) THIS IS AN
     EXACT SET on purpose — it is what caught the two this round added (volcano.filter, volcano.time)
     and made sure they were registered where the button and Atlas reach the same code, rather than
     wired only to the legend. Adding a command means adding it here. */
  const cmds = await page.evaluate(() => window.IntMapOS.list().filter((c) => c.startsWith('volcano.')));
  expect(cmds.sort()).toEqual(['volcano.ash', 'volcano.filter', 'volcano.hazard', 'volcano.mode',
    'volcano.open', 'volcano.so2', 'volcano.time']);
});
