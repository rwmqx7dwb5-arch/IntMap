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
import { seededStorageState } from './helpers/session-seed.js';

const CRITICAL_GLOBALS = ['IntMapConsole', 'IntMapAtlasDebug', 'IntMapRegionResolver'];

test.describe.configure({ mode: 'serial' });

let page, diag;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState() });
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
    return { ok: r && r.ok, html: (r && r.html) || '', meta: (r && r.meta) || null, exec: (r && r.exec) || null, poly: window.IntMapAtlasDebug.polyState() };
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

// (#R158) A mix of valid + invalid draws the valid ones and returns a STRUCTURED execution result — the invalid target is
// UNRESOLVED (reported to Terra), NOT silently skipped, and the partial is flagged so IntMap does not finalise it alone.
test('mixed valid + invalid → valid drawn, unresolved reported to Terra, partial flagged + exec result', async () => {
  const r = await hl({ type: 'highlight', interpretation: 'test', targets: [
    { name: 'Germany', iso3: 'DEU' }, { name: 'France', iso3: 'FRA' }, { iso3: 'ZZZ' },
  ] });
  expect(r.ok).toBe(true);
  expect(r.poly.n).toBe(1);   // one group of the two valid countries
  expect(/ZZZ/.test(r.html)).toBe(true);
  expect(/could not be matched|一致させられ|zuordnen|не сопоставлен|no coincidieron/i.test(r.html)).toBe(true);
  expect(r.meta && r.meta.partial).toBe(true);
  // the mechanical execution contract the repair loop feeds back to Terra
  expect(r.exec && r.exec.status).toBe('partial_or_failed');
  expect(r.exec.resolved.map((x) => x.iso3).sort()).toEqual(['DEU', 'FRA']);
  expect(r.exec.unresolved.some((u) => u.iso3 === 'ZZZ')).toBe(true);
  expect(r.exec.renderState.painted).toBe(true);
});

// (#R158) A fully-valid highlight resolves with an 'ok' execution result (no unresolved, verified render).
test('all-valid highlight → exec status ok, everything resolved', async () => {
  const r = await hl({ type: 'highlight', interpretation: 'test', targets: [
    { name: 'Germany', iso3: 'DEU' }, { name: 'France', iso3: 'FRA' },
  ] });
  expect(r.ok).toBe(true);
  expect(r.exec && r.exec.status).toBe('ok');
  expect(r.exec.unresolved.length).toBe(0);
  expect(r.exec.resolved.map((x) => x.iso3).sort()).toEqual(['DEU', 'FRA']);
});

// (#R158) The pure reader — Terra decides, IntMap OBSERVES. A wrong/blank ISO3 is NOT auto-corrected from the name: it is
// returned as UNRESOLVED with the deterministic candidate identifier merely REPORTED (availableIdentifiers), never applied.
// Name arrays and concept strings still decline to targets (legacy concrete-place resolver path).
test('_hlReadGptGroups: no auto-correction — reports unresolved + candidate identifiers, declines names/concept strings', async () => {
  const v = await page.evaluate(() => {
    const D = window.IntMapAtlasDebug;
    return {
      // wrong ISO3 "XX" (blank/invalid) + a clear NAME → NOT rescued; unresolved with a REPORTED candidate (DEU/FRA)
      obs: D.hlReadGroups({ targets: [{ name: 'Germany', iso3: 'XX' }, { name: 'France', iso3: '' }] }),
      bareCodes: (D.hlReadGroups({ countries: ['DEU', 'FRA'] }) || []).length,   // bare ISO3 array = targets
      nameArray: D.hlReadGroups({ countries: ['Germany', 'France'] }),           // names → null (legacy path)
      conceptString: D.hlReadGroups({ countries: 'ゲルマン諸国' }),                 // concept string → null (legacy path)
      validHasDEU: D.validCodeSet().includes('DEU'),
      validHasZZZ: D.validCodeSet().includes('ZZZ'),
    };
  });
  expect(v.obs.length).toBe(1);
  expect(v.obs[0].codes).toEqual([]);                        // nothing auto-applied
  expect(v.obs[0].unresolved.length).toBe(2);                // both returned to Terra
  const avail = v.obs[0].unresolved.reduce((acc, u) => acc.concat(u.availableIdentifiers || []), []);
  expect(avail).toContain('DEU');                            // candidate REPORTED, not applied
  expect(avail).toContain('FRA');
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
