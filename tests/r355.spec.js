/* ============================================================================
 *  R355 — the cable graphic did not change, and the layer still draws
 * ----------------------------------------------------------------------------
 *  「経路精度を上げるために、見た目を勝手に作り直さないでください。」
 *  「初回読み込みで表示されない…といった状態を作らないでください。」
 *
 *  The two claims that must stand in front of EVERY push, and nothing else.
 *  scripts/tiers.mjs puts the round's own `rNNN.spec.js` in the gate by
 *  construction and scripts/test-budget.mjs gives the gate a ceiling that only
 *  ever goes down — so this file is written to be cheap, and everything that
 *  needs a first-visit boot, a second boot or a camera move lives in
 *  tests/r355-cables.spec.js, which runs nightly.
 *
 *  ⚠ IT SWITCHES THE LAYER ON RATHER THAN BOOTING WITH IT. The whole suite boots
 *  with a seeded session that turns the two thematic default layers OFF, because
 *  #R186 measured them at 9,160 ms of every boot against 3,192 ms without them
 *  (tests/helpers/session-seed.js). Opting out of that seed here would spend
 *  those six seconds on every push: MEASURED, the first-visit version of this
 *  file cost 9–19 s marginal and put the core tier over its ceiling. Asking the
 *  row to switch on costs a fraction of that and reads the same paint off the
 *  same renderer. The DEFAULT-ON boot is asserted where it belongs —
 *  tests/r186.spec.js pins that default, and tests/r355-cables.spec.js ① checks
 *  it again on the rebuilt routes.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';

const LAYERS = ['lyr-subcables', 'lyr-subcables-glow', 'lyr-subcables-pts'];

/* the row toggles on the ROW's pointerdown, not the checkbox's click (#R37) */
const toggleRow = (page, id) => page.evaluate((cbId) => {
  const cb = document.getElementById(cbId);
  const row = cb.closest('label') || cb.closest('.lyr-row') || cb.parentElement;
  ['pointerdown', 'pointerup'].forEach(t => row.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 1 })));
}, id);

/* ⚠ CI HAS NO GPU AND THIS LAYER IS THE EXPENSIVE ONE. #R186 measured a boot at
   9.2 s on a runner against 2.4 s on the development machine, and switching the
   cables on adds a 2.1 MB source that the worker has to tile. MEASURED: 7.7 s
   locally and a 60 s timeout on the runner — so the budget is the runner's, and
   each wait says which stage it is, because "page.waitForFunction timed out" on
   its own does not name one. */
test('R355 the cable layer draws real routes, with the graphic it always had', async ({ page }) => {
  test.setTimeout(180000);
  const local = [];
  page.on('response', (r) => { const u = r.url(); if (/subcables.*\.json|submarinecablemap\.com/.test(u)) local.push({ url: u, status: r.status() }); });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 90000 })
    .catch(() => { throw new Error('stage 1: window.__imap never appeared'); });
  await page.waitForFunction(() => document.querySelectorAll('.lyr-row').length > 100, null, { timeout: 90000 })
    .catch(() => { throw new Error('stage 2: the layer rows were never built'); });

  await toggleRow(page, 'dl-subcables');
  await page.waitForFunction(() => {
    try { const E = window.IntMapGeoEngine; return E.layers.has('lyr-subcables') && E.layers.getLayout('lyr-subcables', 'visibility') === 'visible'; }
    catch (_) { return false; }
  }, null, { timeout: 90000 }).catch(async () => {
    const st = await page.evaluate(() => { const cb = document.getElementById('dl-subcables'); return { box: cb && cb.checked, autoOff: cb && cb.dataset ? cb.dataset.imAutoOff : null }; });
    throw new Error('stage 3: the layer never became visible — ' + JSON.stringify(st));
  });
  /* ⚠ AND THE "IT REALLY IS THE REBUILT DATASET" CLAIM IS READ OFF THE NETWORK,
     NOT OFF THE SCREEN. `queryRenderedFeatures` needs the renderer to have
     PAINTED, and a headless worker that is sharing a machine with a second one
     does not always get frames: MEASURED, this test passes alone in 7.3 s and
     failed inside `npm test` with `querySourceFeatures` returning 0 at 90 s.
     A gate that depends on the compositor is a gate that goes red for reasons
     that are not about the code. What is actually being claimed — the routes
     came from THIS app's origin and reached the renderer — is two observations
     that need no frame at all: the request, and the source.
     tests/r355-cables.spec.js ① makes the rendered-feature claim, where it has
     a machine to itself. */
  expect(local.filter(r => /subcables\.json$/.test(r.url) && r.status === 200).length,
    "data/subcables.json was fetched from this app’s own origin").toBeGreaterThan(0);
  expect(local.filter(r => /subcables-lp\.json$/.test(r.url) && r.status === 200).length,
    'and so were the landing points').toBeGreaterThan(0);
  expect(local.some(r => /submarinecablemap\.com/.test(r.url)),
    'and nothing was asked of TeleGeography').toBe(false);

  const s = await page.evaluate((ids) => {
    const E = window.IntMapGeoEngine;
    const out = { layers: {}, sources: {}, order: null };
    for (const id of ids) out.layers[id] = E.layers.has(id) ? E.layers.getLayout(id, 'visibility') : null;
    for (const src of ['src-subcables', 'src-subcables-lp']) out.sources[src] = E.layers.hasSource(src);
    try { out.order = (E.scene.getStyle().layers || []).map(l => l.id).filter(i => i.indexOf('lyr-subcables') === 0); } catch (_) {}
    out.paint = {
      colour: E.layers.getPaint('lyr-subcables', 'line-color'),
      width: E.layers.getPaint('lyr-subcables', 'line-width'),
      opacity: E.layers.getPaint('lyr-subcables', 'line-opacity'),
      glowWidth: E.layers.getPaint('lyr-subcables-glow', 'line-width'),
      glowOpacity: E.layers.getPaint('lyr-subcables-glow', 'line-opacity'),
      glowBlur: E.layers.getPaint('lyr-subcables-glow', 'line-blur'),
      ptRadius: E.layers.getPaint('lyr-subcables-pts', 'circle-radius'),
      ptColour: E.layers.getPaint('lyr-subcables-pts', 'circle-color'),
      ptStrokeColour: E.layers.getPaint('lyr-subcables-pts', 'circle-stroke-color'),
      ptStrokeWidth: E.layers.getPaint('lyr-subcables-pts', 'circle-stroke-width'),
      ptOpacity: E.layers.getPaint('lyr-subcables-pts', 'circle-opacity'),
    };
    out.layout = { cap: E.layers.getLayout('lyr-subcables', 'line-cap'), join: E.layers.getLayout('lyr-subcables', 'line-join') };
    return out;
  }, LAYERS);

  /* ── it is there ────────────────────────────────────────────────────────── */
  for (const id of LAYERS) expect(s.layers[id], id + ' exists and is visible').toBe('visible');
  expect(s.sources['src-subcables']).toBe(true);
  expect(s.sources['src-subcables-lp']).toBe(true);

  /* ══ THE RECORDED BASELINE — §2 lists every one of these by name as forbidden
     to change. tests/r355-checks.test.mjs holds the other half of §17: the same
     values, read from the source text rather than from the renderer. ═══════ */
  expect(s.paint.colour, 'line-color').toEqual(['coalesce', ['get', 'color'], '#30b0c7']);
  expect(s.paint.width, 'line-width').toEqual(['interpolate', ['linear'], ['zoom'], 0, 0.6, 4, 1.1, 8, 2]);
  expect(s.paint.opacity, 'line-opacity').toBeCloseTo(0.95, 5);
  expect(s.paint.glowWidth, 'glow line-width').toBeCloseTo(3.2, 5);
  expect(s.paint.glowOpacity, 'glow line-opacity').toBeCloseTo(0.2, 5);
  expect(s.paint.glowBlur, 'glow line-blur').toBeCloseTo(3, 5);
  expect(s.paint.ptRadius, 'landing-point circle-radius').toEqual(['interpolate', ['linear'], ['zoom'], 3, 1.6, 8, 3.5]);
  expect(s.paint.ptColour, 'landing-point circle-color').toBe('#ffd23f');
  expect(s.paint.ptStrokeColour, 'landing-point circle-stroke-color').toBe('#1a1a1a');
  expect(s.paint.ptStrokeWidth, 'landing-point circle-stroke-width').toBeCloseTo(0.6, 5);
  expect(s.paint.ptOpacity, 'landing-point circle-opacity').toBeCloseTo(0.9, 5);
  expect(s.layout, 'line-cap / line-join').toEqual({ cap: 'round', join: 'round' });
  expect(s.order, 'z-order: glow under the line, both under the landing points')
    .toEqual(['lyr-subcables-glow', 'lyr-subcables', 'lyr-subcables-pts']);
});
