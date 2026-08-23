/* ============================================================================
 *  R353 (deep) — Volcano Intelligence against the REAL upstreams
 * ----------------------------------------------------------------------------
 *  The half of the round that cannot stand in the gate, and the reason is written at the top of
 *  tests/r353.spec.js: these claims need USGS, JMA, the Smithsonian relay and an ArcGIS service to
 *  answer this minute, and a gate that goes red because volcano.si.edu had a bad afternoon is a
 *  gate people learn to ignore. Deep tier: nightly, and after every merge.
 *
 *  ⚠ WHAT IS ASSERTED IS THE SHAPE OF THE ANSWER, NEVER ITS CONTENT. Most hours there is no
 *  volcanic-ash SIGMET anywhere on Earth and no US volcano above GREEN; a test that required either
 *  would be asserting the weather. What must hold is that the feed was READ, that the three states
 *  ("data" / "nothing in force" / "did not answer") are told apart, and that when the feed does
 *  carry something the map draws it.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

/* ⚠ the same shard-safety note as tests/r353.spec.js: a shard that gets only one of these tests must
   not be relying on another one having switched the layer on. Idempotent. */
async function volcanoLayerOn(page) {
  await page.waitForFunction(() => document.querySelectorAll('.lyr-row').length > 100, null, { timeout: 60000 });
  await page.evaluate(() => {
    const cb = document.getElementById('beta-dl-volc2');
    if (cb && !cb.checked) {
      const row = cb.closest('label') || cb.closest('.lyr-row') || cb.parentElement;
      ['pointerdown', 'pointerup'].forEach((t) =>
        row.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 1 })));
    }
  });
  await page.waitForFunction(
    () => { try { return (window.__imVolcLayer && window.__imVolcLayer.count()) > 1000; } catch (_) { return false; } },
    null, { timeout: 60000 },
  );
}

test('R353-live ① every rung of the status ladder is reachable, and each says which it is', async ({ app }) => {
  const page = app.page;
  await volcanoLayerOn(page);

  const feeds = await page.evaluate(async () => {
    const ok = await window.IntMapLazy.need('volcanoIntel');
    if (!ok) return { error: 'module did not load' };
    await window.IntMapVolcano.warm();
    return window.IntMapVolcano.feeds();
  });
  expect(feeds.error).toBeUndefined();

  /* ⚠ EVERY FEED MUST HAVE REACHED A VERDICT. `loading` here means a request was started and never
     settled — which is the state the card would sit in for ever, saying "reading…". */
  for (const k of ['usgs', 'vona', 'jma', 'weekly']) {
    expect(['ok', 'failed'], k + ' never settled: ' + feeds[k].state).toContain(feeds[k].state);
  }
  /* USGS HANS and the Smithsonian relay are the two that must answer for the ladder to mean
     anything; JMA's file is only present while Japan has a warning in force, and the VONA feed is a
     year's archive that is never empty. */
  expect(feeds.usgs.state).toBe('ok');
  expect(feeds.weekly.state).toBe('ok');
  expect(feeds.weekly.rows).toBeGreaterThan(0);
  expect(feeds.vona.state).toBe('ok');
  expect(feeds.vona.rows).toBeGreaterThan(0);

  /* the weekly report joins by GVP NUMBER, so every row it returned must resolve to a volcano in
     the bundled catalog — a row that resolves to nothing is a report this map cannot place */
  const joined = await page.evaluate(() => {
    const fc = window.__imVolcLayer && window.__imVolcLayer.data();
    if (!fc) return null;
    const have = new Set(fc.features.map((f) => f.properties.v));
    const idx = window.IntMapVolcano.statusIndex();
    let placed = 0, unplaced = 0;
    for (const v of idx.keys()) (have.has(v) ? placed++ : unplaced++);
    return { placed, unplaced, total: idx.size };
  });
  expect(joined, 'the layer file never arrived').not.toBeNull();
  expect(joined.total).toBeGreaterThan(0);
  expect(joined.unplaced, 'a feed named a volcano the bundled catalog does not have').toBe(0);

  /* …and every status the ladder produced names the agency that produced it */
  const sample = await page.evaluate(() => {
    const idx = window.IntMapVolcano.statusIndex();
    return [...idx.values()].slice(0, 12).map((s) => ({ tier: s.tier, source: s.source, label: s.label }));
  });
  expect(sample.length).toBeGreaterThan(0);
  for (const s of sample) {
    expect(s.tier).toBeGreaterThan(0);
    expect(s.source, 'a rung reported without naming its source').toBeTruthy();
    expect(s.label, 'a rung reported with no words of its own').toBeTruthy();
  }
});

test('R353-live ② the ash layer draws the SIGMETs that are in force, and says so when there are none', async ({ app }) => {
  const page = app.page;
  await volcanoLayerOn(page);

  const ash = await page.evaluate(async () => {
    const ok = await window.IntMapLazy.need('volcanoLayers');
    if (!ok) return { error: 'module did not load' };
    window.IntMapVolcanoLayers.ash(true);
    /* the layer fetches on switch-on; wait for the feed to settle rather than for a fixed time */
    for (let i = 0; i < 60; i++) {
      const s = window.IntMapVolcanoLayers.state();
      if (s.ashState === 'ok' || s.ashState === 'failed') break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const s = window.IntMapVolcanoLayers.state();
    const fc = window.IntMapVolcanoLayers.ashData();
    return {
      state: s.ashState, count: s.ashCount, read: s.ashRead,
      drawn: window.IntMapGeoEngine.layers.has('volc-ash-fill'),
      visible: window.IntMapGeoEngine.layers.getLayout('volc-ash-fill', 'visibility'),
      first: fc && fc.features[0] ? fc.features[0].properties : null,
      rings: fc ? fc.features.map((f) => f.geometry.coordinates[0].length) : [],
    };
  });
  expect(ash.error).toBeUndefined();
  expect(ash.state).toBe('ok');
  expect(ash.drawn).toBe(true);
  expect(ash.visible).toBe('visible');

  /* ⚠ `read` is what separates "no ash anywhere right now" from "the feed did not answer". It must
     be a real count whether or not any of them were volcanic ash. */
  expect(ash.read).toBeGreaterThan(0);

  if (ash.count > 0) {
    /* when the world does have ash in force, the areas carry the altitude band they were
       promulgated with — that band is the whole reason this feed is used instead of a circle */
    expect(ash.first.label).toBeTruthy();
    expect(ash.first.band).toMatch(/SFC|FL\d{3}/);
    for (const n of ash.rings) expect(n).toBeGreaterThanOrEqual(4);   /* closed ring */
  }

  /* the legend tells the reader which of the three states this is */
  const legend = await page.evaluate(() => {
    const el = document.querySelector('.volc-ash-note');
    return el ? el.textContent : '';
  });
  expect(legend).toBeTruthy();
  expect(legend).toMatch(ash.count > 0 ? /\d/ : /SIGMET|火山灰|ceniza|Asche|пепл/i);
});

test('R353-live ③ the USGS hazard zones are the seven centres the survey publishes, and they draw', async ({ app }) => {
  const page = app.page;
  await volcanoLayerOn(page);

  const haz = await page.evaluate(async () => {
    const ok = await window.IntMapLazy.need('volcanoLayers');
    if (!ok) return { error: 'module did not load' };
    window.IntMapVolcanoLayers.hazard(true);
    for (let i = 0; i < 60; i++) {
      const s = window.IntMapVolcanoLayers.state();
      if (s.hazState === 'ok' || s.hazState === 'failed') break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const fc = window.IntMapVolcanoLayers.hazardData();
    return {
      state: window.IntMapVolcanoLayers.state().hazState,
      features: fc ? fc.features.length : 0,
      volcanoes: fc ? [...new Set(fc.features.map((f) => f.properties.Volcano))].sort() : [],
      hazards: fc ? [...new Set(fc.features.map((f) => f.properties.Hazard))].sort() : [],
      drawn: window.IntMapGeoEngine.layers.has('volc-haz-fill'),
      /* Mount Shasta must resolve to a GVP volcano; every other volcano must resolve to nothing,
         which is the claim js/volcano-intel.js prints as an explicit absence */
      shasta: window.IntMapVolcanoLayers.hazardFor(323010),
      fuji: window.IntMapVolcanoLayers.hazardFor(283030),
    };
  });
  expect(haz.error).toBeUndefined();
  expect(haz.state).toBe('ok');
  expect(haz.drawn).toBe(true);
  expect(haz.features).toBeGreaterThanOrEqual(20);
  expect(haz.volcanoes.length).toBe(7);
  expect(haz.hazards).toContain('Lahars');
  expect(haz.shasta.length).toBeGreaterThan(0);
  expect(haz.fuji).toEqual([]);        /* ⚠ nothing is published for Fuji, and the card must say so */
});
