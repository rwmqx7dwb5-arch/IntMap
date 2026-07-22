// R157 regression tests — Atlas NL redesign: the model interprets the MEANING, the code validates & draws.
//
// The commission's failure: "ゲルマン諸国をハイライトして" was resolved code-side (localPlan → regionGroup) BEFORE the
// model saw it, so the concept failed as one unfound place. The general fix: a highlight of a country SET is decided
// by the model (which returns explicit ISO3 "targets"), and the code's only job is to VALIDATE those codes against
// real border data and draw REAL national borders. No concept dictionary / alias table / regionGroup runs on this
// path. Hermetic routing blocks all external hosts; window.countryGeo (bundled path) provides the validation +
// geometry, so these assertions are deterministic. Verified via the dispatch result + IntMapAtlasDebug bookkeeping.
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';

const CRITICAL_GLOBALS = ['IntMapConsole', 'IntMapAtlasDebug', 'IntMapRegionResolver'];

test.describe.configure({ mode: 'serial' });

let page, diag;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  await installHermeticRouting(context);
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(
    (g) => g.every((k) => typeof window[k] !== 'undefined') && !!(window.countryGeo && window.countryGeo.features),
    CRITICAL_GLOBALS, { timeout: 45_000 },
  );
  await page.waitForTimeout(2500);
});

test.afterAll(async () => { await page?.context()?.close(); });

// Dispatch a highlight and return the pipeline output.
async function hl(action) {
  return page.evaluate(async (a) => {
    const r = await window.IntMapConsole.dispatch(a);
    return { ok: r && r.ok, html: (r && r.html) || '', meta: (r && r.meta) || null, poly: window.IntMapAtlasDebug.polyState() };
  }, action);
}

// THE headline regression: the model already expanded "ゲルマン諸国" into explicit ISO3 targets; the code validates
// them and draws REAL national borders — no regionGroup / alias lookup, one coloured group, interpretation stated.
test('GPT targets (concept expanded to ISO3) → real national borders, interpretation stated', async () => {
  const r = await hl({ type: 'highlight', interpretation: 'ゲルマン語圏の国', targets: [
    { name: 'Germany', iso3: 'DEU' }, { name: 'Austria', iso3: 'AUT' }, { name: 'Switzerland', iso3: 'CHE' },
    { name: 'Netherlands', iso3: 'NLD' }, { name: 'Denmark', iso3: 'DNK' }, { name: 'Sweden', iso3: 'SWE' },
    { name: 'Norway', iso3: 'NOR' }, { name: 'Iceland', iso3: 'ISL' }, { name: 'United Kingdom', iso3: 'GBR' },
  ] });
  expect(r.ok).toBe(true);
  // ONE coloured group, built from REAL national borders (MultiPolygon), passing the validity gate
  expect(r.poly.n).toBe(1);
  expect(r.poly.polys[0].geoType).toBe('MultiPolygon');
  expect(r.poly.polys[0].valid).toBe(true);
  // the interpretation IS shown (the work order's "採用した定義を結果に明示")
  expect(/ゲルマン語圏|Interpreted|解釈/.test(r.html)).toBe(true);
  // a legend swatch for the group
  expect((r.html.match(/border-radius:2px;vertical-align/g) || []).length).toBe(1);
  expect(r.meta).toBeNull();   // full success → no partial flag
});

// A totally UNREGISTERED concept works with NO code changes — the model supplies the ISO3 list, the code just draws.
test('unregistered concept ("major oil producers") works via model-supplied ISO3 — no alias table', async () => {
  const r = await hl({ type: 'highlight', interpretation: '主要産油国', targets: [
    { name: 'Saudi Arabia', iso3: 'SAU' }, { name: 'Russia', iso3: 'RUS' }, { name: 'United States', iso3: 'USA' },
    { name: 'Iraq', iso3: 'IRQ' }, { name: 'Canada', iso3: 'CAN' }, { name: 'United Arab Emirates', iso3: 'ARE' },
  ] });
  expect(r.ok).toBe(true);
  expect(r.poly.n).toBe(1);
  expect(r.poly.polys[0].geoType).toBe('MultiPolygon');
  expect(r.poly.polys[0].valid).toBe(true);
});

// Several sets in one command → distinct colours + a legend row per set.
test('groups (Germanic vs Slavic) → 2 distinct colours + a legend per set', async () => {
  const r = await hl({ type: 'highlight', groups: [
    { label: 'Germanic', targets: [{ iso3: 'DEU' }, { iso3: 'AUT' }, { iso3: 'NLD' }] },
    { label: 'Slavic', targets: [{ iso3: 'RUS' }, { iso3: 'POL' }, { iso3: 'CZE' }, { iso3: 'UKR' }] },
  ] });
  expect(r.ok).toBe(true);
  expect(r.poly.n).toBe(2);
  expect(new Set(r.poly.polys.map((p) => p.color)).size).toBe(2);
  expect((r.html.match(/border-radius:2px;vertical-align/g) || []).length).toBe(2);
});

// Invalid ISO codes returned by the model are REJECTED at the execution layer (the work order's item 4).
test('all-invalid ISO3 codes → rejected at the execution layer (ok:false)', async () => {
  await hl({ type: 'highlight', on: false });   // start from a clean slate (a total miss never wipes a prior highlight)
  const r = await hl({ type: 'highlight', targets: [{ name: 'Nowhereland', iso3: 'ZZZ' }, { name: 'Faketopia', iso3: 'QQQ' }] });
  expect(r.ok).toBe(false);
  expect(/Nowhereland|Faketopia|invalid|無効/i.test(r.html)).toBe(true);
  expect(r.poly.n).toBe(0);   // nothing was drawn on a guess
});

// A mix of valid + invalid draws the valid ones and reports the invalid separately (partial).
test('mixed valid + invalid → valid drawn, invalid reported, partial flagged', async () => {
  const r = await hl({ type: 'highlight', interpretation: 'test', targets: [
    { name: 'Germany', iso3: 'DEU' }, { name: 'France', iso3: 'FRA' }, { iso3: 'ZZZ' },
  ] });
  expect(r.ok).toBe(true);
  expect(r.poly.n).toBe(1);   // one group of the two valid countries
  expect(/ZZZ/.test(r.html)).toBe(true);
  expect(/Skipped|無効|omiti|übersprungen|Пропущены/i.test(r.html)).toBe(true);
  expect(r.meta && r.meta.partial).toBe(true);
});

// The pure reader — validates the model's targets deterministically, and correctly declines to treat a NAME array
// or a concept STRING as targets (those fall through to the legacy concrete-place resolver).
test('_hlReadGptGroups: validates codes, recovers a bad ISO3 by name, declines names/concept strings', async () => {
  const v = await page.evaluate(() => {
    const D = window.IntMapAtlasDebug;
    return {
      // wrong ISO3 "XX" but a clear NAME → recovered to DEU via the deterministic country index (not concept guessing)
      recovery: D.hlReadGroups({ targets: [{ name: 'Germany', iso3: 'XX' }, { name: 'France', iso3: '' }] }),
      bareCodes: (D.hlReadGroups({ countries: ['DEU', 'FRA'] }) || []).length,   // bare ISO3 array = targets
      nameArray: D.hlReadGroups({ countries: ['Germany', 'France'] }),           // names → null (legacy path)
      conceptString: D.hlReadGroups({ countries: 'ゲルマン諸国' }),                 // concept string → null (legacy path)
      validHasDEU: D.validCodeSet().includes('DEU'),
      validHasZZZ: D.validCodeSet().includes('ZZZ'),
    };
  });
  expect(v.recovery.length).toBe(1);
  expect(v.recovery[0].codes).toEqual(['DEU', 'FRA']);
  expect(v.recovery[0].invalid).toEqual([]);
  expect(v.bareCodes).toBe(1);
  expect(v.nameArray).toBeNull();
  expect(v.conceptString).toBeNull();
  expect(v.validHasDEU).toBe(true);
  expect(v.validHasZZZ).toBe(false);
});

// No regression: a concept STRING still resolves via the retained legacy resolver (regionGroup fallback), so the
// R143 behaviour is intact for the direct-dispatch code path.
test('legacy concept string ("東西南北欧") still resolves via the retained fallback (no regression)', async () => {
  const r = await hl({ type: 'highlight', countries: '東西南北欧' });
  expect(r.ok).toBe(true);
  expect(r.poly.n).toBe(4);
  expect(r.poly.polys.map((p) => p.name)).toEqual(['western europe', 'eastern europe', 'southern europe', 'northern europe']);
});

// Boot honesty: no uncaught exceptions across all the above.
test('no uncaught page errors during R157 interactions', async () => {
  expect(diag.pageErrors, `pageerror(s):\n${diag.pageErrors.join('\n---\n')}`).toHaveLength(0);
});
