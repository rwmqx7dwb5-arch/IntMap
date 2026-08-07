// R143 regression tests — Atlas geographic-target resolution + multi-region highlight pipeline.
//
// The commission's failure ("東西南北欧をハイライトして" → West undrawn, 4 regions one colour, South Europe a
// giant triangle, crude non-border shapes, false "done", ambiguity wall-of-text). The general fix: region names
// that ARE country sets resolve to REAL national borders (UN M49 standard), several regions in one command get
// distinct colours + a legend, every shape is validated before drawing, and the reply is composed from what
// actually painted. Hermetic routing blocks all external hosts → the M49/country-set path (no network) is what
// runs, so these assertions are deterministic. The map's WebGL never fully paints headlessly, so we verify the
// PIPELINE OUTPUT (resolved groups, real-border geometry, distinct colours, legend, honest partials) via the
// dispatch result + IntMapAtlasDebug bookkeeping rather than pixels.
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

// Dispatch a highlight and return the pipeline output (dispatch result + the drawn poly groups).
async function hl(countries) {
  return page.evaluate(async (c) => {
    const r = await window.IntMapConsole.dispatch({ type: 'highlight', countries: c });
    return { ok: r && r.ok, html: (r && r.html) || '', meta: (r && r.meta) || null, poly: window.IntMapAtlasDebug.polyState() };
  }, countries);
}

// THE headline regression: "東西南北欧をハイライトして" as a single compound token expands to the four UN M49
// European sub-regions, each drawn from real national borders in its own colour, with a legend — no giant triangle,
// no missing West, no shared colour.
test('東西南北欧 (compound) → 4 M49 regions, real borders, distinct colours, legend', async () => {
  const r = await hl('東西南北欧');
  expect(r.ok).toBe(true);
  const names = r.poly.polys.map((p) => p.name);
  expect(names).toEqual(['western europe', 'eastern europe', 'southern europe', 'northern europe']);
  // 4 distinct colours (the "4地域が同色" bug)
  const colours = r.poly.polys.map((p) => p.color);
  expect(new Set(colours).size).toBe(4);
  // every shape is a real MultiPolygon built from country borders (not a bbox/AI blob) AND passes the validity gate
  for (const p of r.poly.polys) {
    expect(p.geoType).toBe('MultiPolygon');   // real national borders, not a soft box (Polygon)
    expect(p.valid).toBe(true);               // no giant triangle / self-intersection / unclosed ring
  }
  // West Europe is actually present and spans western Europe (the "西欧が未描画" bug)
  const west = r.poly.polys[0];
  expect(west.bbox[0]).toBeLessThan(10);   // reaches the Atlantic side
  expect(west.bbox[2]).toBeGreaterThan(10);
  // legend with a colour swatch per region
  expect(/background:#e6550d/i.test(r.html)).toBe(true);
  expect((r.html.match(/border-radius:2px;vertical-align/g) || []).length).toBe(4);
  expect(r.meta).toBeNull();   // full success → no partial flag → the honest body leads (no over-claim to suppress)
});

// The AI-split form ["西欧","東欧","南欧","北欧"] resolves identically (北欧 canonicalises to M49 Northern Europe
// inside the directional-Europe set → a gap-free 4-way partition).
test('["西欧","東欧","南欧","北欧"] (AI-split) → same 4 M49 regions', async () => {
  const r = await hl(['西欧', '東欧', '南欧', '北欧']);
  expect(r.ok).toBe(true);
  expect(r.poly.polys.map((p) => p.name)).toEqual(['western europe', 'eastern europe', 'southern europe', 'northern europe']);
  expect(new Set(r.poly.polys.map((p) => p.color)).size).toBe(4);
  expect(r.poly.polys.every((p) => p.geoType === 'MultiPolygon' && p.valid)).toBe(true);
});

// English input.
test('English "Western/Eastern/Southern/Northern Europe" → 4 M49 regions', async () => {
  const r = await hl(['Western Europe', 'Eastern Europe', 'Southern Europe', 'Northern Europe']);
  expect(r.ok).toBe(true);
  expect(r.poly.n).toBe(4);
  expect(new Set(r.poly.polys.map((p) => p.color)).size).toBe(4);
  expect(r.poly.polys.every((p) => p.valid)).toBe(true);
});

// German input.
test('German "Westeuropa/Osteuropa/Südeuropa/Nordeuropa" → 4 M49 regions', async () => {
  const r = await hl(['Westeuropa', 'Osteuropa', 'Südeuropa', 'Nordeuropa']);
  expect(r.ok).toBe(true);
  expect(r.poly.n).toBe(4);
  expect(new Set(r.poly.polys.map((p) => p.color)).size).toBe(4);
});

// Russian input.
test('Russian "западную/восточную/южную/северную европу" → 4 M49 regions', async () => {
  const r = await hl(['западная европа', 'восточная европа', 'южная европа', 'северная европа']);
  expect(r.ok).toBe(true);
  expect(r.poly.n).toBe(4);
  expect(new Set(r.poly.polys.map((p) => p.color)).size).toBe(4);
});

// Partial failure: a real region + a nonexistent one → the real region draws, the failure is reported
// separately, and meta.partial is set so the planner's "…をハイライトしました" is suppressed.
test('partial failure: real region drawn, unknown reported, partial flagged', async () => {
  const r = await hl(['西欧', '南欧', 'Zzyzxland']);
  expect(r.ok).toBe(true);
  expect(r.poly.n).toBe(2);   // only the two real regions painted
  expect(r.poly.polys.map((p) => p.name)).toEqual(['western europe', 'southern europe']);
  expect(/Zzyzxland/.test(r.html)).toBe(true);        // the unknown is named in the reply
  expect(/Not found|見つから/i.test(r.html)).toBe(true);
  expect(r.meta && r.meta.partial).toBe(true);        // → runActions suppresses the over-claiming "say"
});

// The validity gate (pure) — rejects exactly the degenerate shapes the commission called out.
test('validGeo rejects giant triangle / unclosed / self-intersecting / whole-world; trusts real borders', async () => {
  const v = await page.evaluate(() => {
    const D = window.IntMapAtlasDebug;
    return {
      triangle: D.validGeo({ type: 'Polygon', coordinates: [[[0, 0], [20, 0], [10, 20], [0, 0]]] }, {}),
      unclosed: D.validGeo({ type: 'Polygon', coordinates: [[[0, 0], [0, 5], [5, 5], [5, 0]]] }, {}),
      bowtie: D.validGeo({ type: 'Polygon', coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] }, {}),
      world: D.validGeo({ type: 'Polygon', coordinates: [[[-179, -85], [-179, 85], [179, 85], [179, -85], [-179, -85]]] }, {}),
      realWE: (() => { const g = window.countryGeo; if (!g) return { ok: true }; const cg = D.codesGeo(D.regionGroup('western europe').codes); return D.validGeo(cg.geo, { trusted: true }); })(),
    };
  });
  expect(v.triangle.ok).toBe(false);
  expect(v.triangle.reason).toBe('degenerate-triangle');
  expect(v.unclosed.ok).toBe(false);
  expect(v.bowtie.ok).toBe(false);
  expect(v.world.ok).toBe(false);
  expect(v.realWE.ok).toBe(true);   // real national borders always pass
});

// Consecutive commands: a new highlight fully replaces the previous one (no stale groups/colours left over).
test('consecutive highlights replace cleanly (no leftover groups)', async () => {
  await hl(['西欧', '東欧', '南欧', '北欧']);   // 4 groups
  const r2 = await hl(['north america', 'south america']);   // 2 groups
  expect(r2.ok).toBe(true);
  expect(r2.poly.n).toBe(2);
  expect(r2.poly.polys.map((p) => p.name)).toEqual(['north america', 'south america']);
  // colours restart from the palette head → first group is the palette's first colour again
  expect(r2.poly.polys[0].color).toBe(await page.evaluate(() => window.IntMapAtlasDebug.paletteColor(0)));
});

// A single region stays single-colour (no spurious multi-colour path for one target).
test('single region → single-colour path (not multi-group)', async () => {
  const r = await page.evaluate(async () => {
    const res = await window.IntMapConsole.dispatch({ type: 'highlight', countries: 'former ussr' });
    return { ok: res && res.ok, poly: window.IntMapAtlasDebug.polyState() };
  });
  expect(r.ok).toBe(true);
  // former USSR is ONE group of 15 countries → painted via the single-colour feature-state path, not as 15 poly groups
  expect(r.poly.n).toBe(0);
});

// Boot honesty: no uncaught exceptions across all the above interactions.
test('no uncaught page errors during R143 interactions', async () => {
  expect(diag.pageErrors, `pageerror(s):\n${diag.pageErrors.join('\n---\n')}`).toHaveLength(0);
});
