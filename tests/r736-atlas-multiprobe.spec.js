// R736 regression — what production actually did when it was asked, and why it said it had failed.
//
// Two measurements taken on the live site (2026-09-15, signed in), driving Atlas by hand:
//
//  ① 「Show me the world in 1914 and highlight the Ottoman Empire」 — the clock moved, and the highlight
//     failed. Twice, with the map fully settled, reporting 「地図読込中。もう一度お試しください」. It was not a
//     race: `resolveHlTarget('Ottoman Empire')` returns the code `OTT` (js/history.js) and
//     `IntMapTimeBorders.geomForCode('OTT')` returns its real MultiPolygon, but `highlight()` rejected the
//     code before consulting the era record, because `valid` is built from the MODERN country geojson and
//     `OTT` is not in it. A polity was unpaintable exactly while it was the thing drawn on the map.
//
//  ② 「日本・韓国・ドイツを…地図上にハイライトして」 — all three painted, and all three came back to Atlas as
//     `ok:false code:'not_rendered'`, because js/atlas-capabilities.js `paintNow()` samples geojson SOURCE
//     feature counts and a country highlight paints with `setFeatureState` — it adds no feature anywhere.
//     Told three times that nothing had been drawn, the turn spent its remaining steps re-drawing and
//     searching, and died at the working limit with the bar chart it had promised never drawn.
//
// Both are measured here through the door the app itself uses (`IntMapConsole.dispatch`), never by reading
// source: ① is an ORDER inside a function and ② is a value that has to MOVE, and neither is visible to a
// check that greps for spellings (memory: intmap-r505-lessons / "ソースを読む検査は順序を見ない").
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

let page;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(context);
  page = await context.newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(() => !!window.IntMapAtlas, null, { timeout: 45_000 });
  await page.evaluate(() => window.IntMapAtlas.ensure());
  await page.waitForFunction(
    () => !!window.IntMapConsole && !!window.IntMapAtlasDebug && !!(window.countryGeo && window.countryGeo.features),
    null, { timeout: 45_000 },
  );
  await page.waitForTimeout(2500);
});

test.afterAll(async () => { await page?.context()?.close(); });

const clear = () => page.evaluate(() => window.IntMapConsole.dispatch({ type: 'highlight', on: false }));

/* ⚠ ORDER IS COST, NOT TASTE: the modern reading runs FIRST, while the map is still at the live
   date it booted at, so the suite pays for ONE era load instead of a trip out and back. */
// ── ② the observer can see a highlight that paints no source features ─────────────────────────────
test('a country highlight MOVES the paint reading the verifier diffs (it adds no source feature)', async () => {
  await clear();

  const m = await page.evaluate(async () => {
    /* the exact reading js/atlas-capabilities.js `paintNow()` takes, sampled the same way */
    const sources = () => {
      const n = (id) => { try { const d = window.IntMapGeoEngine.layers.sourceData(id); return (d && Array.isArray(d.features)) ? d.features.length : -1; } catch (_) { return -1; } };
      return { poly: n('nlq-poly-src'), line: n('nlq-line-src'), pins: n('user-pins'), poi: n('nlq-poi-src'), compose: n('atl-compose-src'), shakemap: n('shk-cont-src'), factions: n('nlq-fac-src') };
    };
    const declared = () => { try { return window._imAtlasPaint.now(); } catch (_) { return null; } };
    const before = { sources: sources(), declared: declared() };
    const res = await window.IntMapConsole.dispatch({ type: 'highlight', country: 'Japan' });
    const after = { sources: sources(), declared: declared() };
    return { ok: !!(res && res.ok), before, after, lit: window.IntMapAtlasDebug.hlState() };
  });

  expect(m.ok).toBe(true);
  expect(m.lit).toContain('JPN');
  // the defect, stated as what it WAS: not one geojson source moved …
  expect(JSON.stringify(m.after.sources)).toBe(JSON.stringify(m.before.sources));
  // … and the reading the verifier diffs moves anyway, because the painter declares what it painted
  expect(m.before.declared).not.toBeNull();
  expect(m.after.declared).not.toBeNull();
  expect(JSON.stringify(m.after.declared)).not.toBe(JSON.stringify(m.before.declared));
  expect(m.after.declared.hlCountries).toBeGreaterThan(m.before.declared.hlCountries);
});

/* ⚠ no page-error assertion here: headless MapLibre fails to compile a fragment shader on this
   runner, so a bare pageErrors check would measure the RUNNER, not IntMap (memory:
   intmap-gate-verdict-must-not-depend-on-the-runner). The two tests above drive the real dispatch and
   assert on its result, which is the same on either machine. */

// ── ① the era record is asked, so a polity that exists only in it can be highlighted ──────────────
test('a polity only the era record holds (Ottoman Empire, 1914) paints instead of reporting a load race', async () => {
  const pre = await page.evaluate(async () => {
    window.IntMapTime.setYear(1914);
    return true;
  });
  expect(pre).toBe(true);
  await page.waitForFunction(
    () => { try { const TB = window.IntMapTimeBorders; return !!(TB && TB.active && TB.active() && TB.currentFC && TB.currentFC()); } catch (_) { return false; } },
    null, { timeout: 45_000 },
  );

  // the two halves the old code failed to connect — stated separately so a failure says WHICH half moved
  const halves = await page.evaluate(async () => ({
    resolved: await window.IntMapAtlasDebug.resolveHl('Ottoman Empire'),
    eraShape: (() => { try { const g = window.IntMapTimeBorders.geomForCode('OTT'); return g ? g.type : null; } catch (_) { return null; } })(),
    modernHasOTT: (() => { try { return window.IntMapAtlasDebug.codesGeo(['OTT']).hit.length > 0; } catch (_) { return null; } })(),
  }));
  expect(halves.resolved.kind).toBe('country');
  expect(halves.resolved.code).toBe('OTT');
  expect(halves.eraShape).toMatch(/Polygon$/);   // the era record HAS the shape
  expect(halves.modernHasOTT).toBe(false);       // …and the modern record does not — which is the whole point

  await clear();
  const r = await page.evaluate(async () => {
    const res = await window.IntMapConsole.dispatch({ type: 'highlight', country: 'Ottoman Empire' });
    return { ok: !!(res && res.ok), html: (res && res.html) || '', lit: window.IntMapAtlasDebug.hlState() };
  });
  expect(r.lit).toContain('OTT');                // the polity is lit
  expect(r.ok).toBe(true);
  expect(r.html).not.toMatch(/map still loading|地図読込中/);   // and no invented race is blamed
});
