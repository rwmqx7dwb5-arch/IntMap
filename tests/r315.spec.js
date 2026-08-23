/* ============================================================================
 *  #R315 — the browser half: the split kept every door, and the skip kept every pixel
 * ----------------------------------------------------------------------------
 *  Two claims this round makes that no source-level check can settle:
 *
 *    ① js/analysis-panels.js was split into an eager shell that still builds its two Layers buttons
 *       at boot and five implementations that are NOT downloaded until something asks.
 *       tests/r209.spec.js already proves every lazy module loads and publishes — it reads the
 *       loader's own tables, so the five new ones joined it without this file saying so. What r209
 *       cannot see is the other side: that they are not part of the BOOT, that the buttons are there
 *       anyway, and that asking twice does not mount twice.
 *
 *    ② the renderer's semantic diff is live in a production build and the map still draws. A skip
 *       that removed a real update would be invisible to every byte-counting gate in this
 *       repository, so a payload that DIFFERS is applied here and watched.
 *
 *  ⚠ IT COSTS NO BOOT OF ITS OWN, and that is a design decision rather than a saving. The obvious
 *  way to prove 「not fetched at boot」 is `app.freshPage()` — a whole extra start-up — and the gate
 *  charges one second per spec (scripts/tiers.mjs). But a virgin page proves the WEAKER thing:
 *  「nobody has asked yet」, which stops being true the moment any other spec on this worker calls
 *  loadLazyModules(). Reading the resource timeline instead proves 「no analysis chunk was requested
 *  on the way to the first map」, which stays true however many specs share the page — and needs no
 *  boot at all. The cheaper test is the stronger one.
 *
 *  ⚠ THE ASSERTIONS READ THE APP'S OWN RECORDS. `IntMapLazy.pending()` is written by the load path,
 *  `render.commands()` by the adapter, and the milestones by index.html's own boot screen. A test
 *  that kept its own tally would be measuring itself.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

test.describe.configure({ mode: 'serial' });

/* the five keys — matched against the loader's own table below rather than trusted from here */
const ANALYSIS = ['analysisTimeSeries', 'analysisResearch', 'analysisCorrelate', 'analysisEvents', 'analysisEdu'];
const GLOBALS = {
  analysisTimeSeries: '__imAnalysisTimeSeries', analysisResearch: '__imAnalysisResearch',
  analysisCorrelate: '__imAnalysisCorrelate', analysisEvents: '__imAnalysisEvents',
  analysisEdu: '__imAnalysisEdu',
};

test('R315 ①: the analysis buttons are built at boot and their implementations are not fetched by it', async ({ app }) => {
  const s = await app.page.evaluate(({ keys, globals }) => {
    const marks = (window.__imBoot && window.__imBoot.marks()) || {};
    /* ⚠ THE BOUNDARY IS `renderer`, NOT `idle`, AND THE TEST HARNESS IS WHY. `__imBoot.isDone()` is
       false on the shared test page — MEASURED: the marks it carries are html / dom / renderer and
       nothing later, because the fixture drives the app rather than waiting out its launch screen.
       Asking for a milestone that does not exist here would have made this assertion pass on zero,
       i.e. assert nothing. `renderer` is the milestone that IS here and it is the one the claim is
       about: getting a map on screen must not fetch an analysis panel. */
    const bootEnd = marks.renderer || marks.dom || marks.html || 0;
    const chunks = performance.getEntriesByType('resource')
      .filter((r) => /\/analysis-(timeseries|research|correlate|world-events|edu)[-.]/.test(r.name))
      .map((r) => ({ name: r.name.split('/').pop(), at: Math.round(r.startTime) }));
    return {
      bootEnd: Math.round(bootEnd),
      duringBoot: chunks.filter((c) => c.at <= bootEnd),
      /* the two doors #R311 named as the reason this file could not simply be deferred whole */
      correlate: !!document.getElementById('btn-correlate'),
      correlateText: ((document.getElementById('btn-correlate') || {}).textContent || '').trim(),
      edu: !!document.getElementById('btn-edu'),
      eduMount: !!document.getElementById('edu-mount'),
      /* the loader knows all five, by its own table */
      known: keys.filter((k) => (window.IntMapLazy.names() || []).indexOf(k) >= 0),
      /* the façades the rest of the app calls are published EAGERLY, or every door breaks */
      facades: ['IntMapTimeSeries', 'IntMapAIResearch', 'IntMapCorrelate', 'IntMapEdu'].map((g) => typeof window[g]),
      /* …and the shell owns the events view's entry state, which js/companies-ui.js reads */
      dashView: typeof window._dashView,
      failed: (window.__imLazyCheck || { failed: [] }).failed,
      globalsNow: keys.map((k) => typeof window[globals[k]]),
    };
  }, { keys: ANALYSIS, globals: GLOBALS });

  expect(s.bootEnd, 'the boot milestones must exist, or "before the renderer" means nothing').toBeGreaterThan(0);
  expect(s.duringBoot, 'no analysis implementation may be on the path to the first map').toEqual([]);
  expect(s.correlate, 'the Correlation button must exist — deferring must not delete a Layers button').toBe(true);
  expect(s.correlateText.length, 'the Correlation button must carry its translated label').toBeGreaterThan(0);
  expect(s.edu, 'the Education button must exist').toBe(true);
  expect(s.eduMount, '#edu-mount is what js/data-layers.js re-appends into the Tools section').toBe(true);
  expect(s.known.sort(), 'all five implementations must be registered with the loader').toEqual([...ANALYSIS].sort());
  expect(s.facades, 'the four façades the rest of the app calls must be published eagerly').toEqual(['object', 'object', 'object', 'object']);
  expect(s.dashView, 'the shell owns _dashView so js/companies-ui.js can read it before anything loads').toBe('string');
  expect(s.failed, 'nothing may have failed to load').toEqual([]);
});

test('R315 ②: a passive close does not fetch, and asking twice mounts once', async ({ app }) => {
  const page = app.page;

  /* ⚠ CLOSING SOMETHING THAT WAS NEVER OPENED MUST NOT DOWNLOAD IT. An Atlas 「close everything」
     sweep runs over every panel; if close() awaited the loader, the sweep would fetch the whole
     analysis set in order to close panels that are not open. */
  const closeFetched = await page.evaluate(() => {
    const before = window.IntMapLazy.pending().filter((k) => k.indexOf('analysisEdu') === 0).length;
    try { window.IntMapEdu.close(); } catch (_) { }
    const after = window.IntMapLazy.pending().filter((k) => k.indexOf('analysisEdu') === 0).length;
    return after - before;
  });
  expect(closeFetched, 'close() on an unloaded module must not start a fetch').toBe(0);

  /* two clicks in the same tick: one in-flight promise, one mount.
     ⚠ WAIT FOR THE CONDITION, NOT FOR A CLOCK — a fixed sleep is both slower than it needs to be on
     a fast machine and too short on a slow one, which are the two ways a timing test lies. */
  const twice = await page.evaluate(async () => {
    const b = document.getElementById('btn-correlate');
    b.click(); b.click();
    const pendingRightAfter = window.IntMapLazy.pending().filter((k) => k === 'analysisCorrelate').length;
    const t0 = Date.now();
    while (Date.now() - t0 < 15000 && typeof window.__imAnalysisCorrelate === 'undefined') {
      await new Promise((r) => setTimeout(r, 40));
    }
    await new Promise((r) => setTimeout(r, 200));   /* let the mount's own DOM settle */
    return {
      pendingRightAfter,
      loadedOnce: (window.__imLazyCheck.loaded || []).filter((k) => k === 'analysisCorrelate').length,
      published: typeof window.__imAnalysisCorrelate,
      failed: (window.__imLazyCheck.failed || []).filter((f) => f.indexOf('analysis') === 0),
      overlays: document.querySelectorAll('#corr-overlay').length,
    };
  });
  expect(twice.pendingRightAfter, 'two clicks must share ONE in-flight promise').toBe(1);
  expect(twice.loadedOnce, 'the loader must record one load, not two').toBe(1);
  expect(twice.published, 'the implementation must have published its global').toBe('object');
  expect(twice.failed, 'no analysis module may be recorded as failed').toEqual([]);
  expect(twice.overlays, 'a double click must not mount the panel twice').toBeLessThanOrEqual(1);
});

test('R315 ③: the renderer skip is live, and nothing it skipped was needed', async ({ app }) => {
  const page = app.page;
  const s = await page.evaluate(() => {
    const E = window.IntMapGeoEngine;
    const st = E.render.sceneStats();
    return { cfg: E.render.commandConfig(), layers: st && st.layers, visible: st && st.visible, sources: st && st.sources };
  });

  expect(s.cfg.skip.sourceData, 'the one operation MapLibre does not deduplicate must be skipped').toBe(true);
  for (const op of ['paint', 'layout', 'filter']) {
    expect(s.cfg.skip[op], `${op} is deduplicated by the renderer already — a second cache in front of it is not on`).toBe(false);
  }
  expect(s.cfg.on, 'the census must be OFF in a page that did not ask for it').toBe(false);

  /* the map drew: layers exist, some are visible, sources are attached. The numbers are not pinned —
     a round that adds a layer must not have to edit this file — but zero of any of them means the
     style did not survive, which is the failure this test exists for. */
  expect(s.layers, 'the style has layers').toBeGreaterThan(20);
  expect(s.visible, 'some of them are visible').toBeGreaterThan(5);
  expect(s.sources, 'the sources are attached').toBeGreaterThan(3);

  /* …and with the census switched on for one page, the skip has to actually skip something, and
     the half that keeps the map correct has to still apply a payload that differs */
  const measured = await page.evaluate(async () => {
    const E = window.IntMapGeoEngine;
    E.render.commandConfig({ on: true });
    E.render.commandsReset();
    const id = 'r315-probe-src';
    const fc = () => ({ type: 'FeatureCollection', features: [{ type: 'Feature', id: 1, properties: { a: 1 }, geometry: { type: 'Point', coordinates: [0, 0] } }] });
    E.layers.addSource(id, { type: 'geojson', data: fc() });
    E.layers.setSourceData(id, fc());          /* same content, a FRESH object → skippable */
    E.layers.setSourceData(id, fc());
    const same = E.render.commands().totals.sourceData;
    E.render.commandsReset();
    E.layers.setSourceData(id, { type: 'FeatureCollection', features: [] });
    const changed = E.render.commands().totals.sourceData;
    E.layers.removeSource(id);
    E.render.commandConfig({ on: false });
    return { same, changed };
  });
  expect(measured.same.same, 'a payload the source already holds must be recognised as redundant').toBeGreaterThan(0);
  expect(measured.same.sent, 'and it must not be sent to the renderer').toBe(0);
  expect(measured.changed.sent, 'a payload that differs must still be applied — this is the half that keeps the map correct').toBe(1);
  expect(measured.changed.same, 'a changed payload is never "already there"').toBe(0);
});
