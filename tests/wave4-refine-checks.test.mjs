/* wave4-refine — the regressions of the round that refined the fourth wave, for the pieces no product's own file holds.
 *   ① Atlas data.companyTies words a reading with the card's own sentence: a reading of nothing says so (it said
 *     «0 of 0 published sites (null%)»), and `top` cuts the list while the counts stay those of the whole reading. */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || globalThis;
const { companyTies } = await import('../js/company-ties.js');
const rows = (await import('../js/atlas-cap-data.js')).default;
const row = rows.find((r) => r.row && r.row[0] === 'data.companyTies');

function kit(q) {
  const T = companyTies({ lang: () => 'en' });
  window.IntMapLazy = { need: async () => true };
  window.IntMapCompanyTies = { query: async () => q, open: async () => {}, close() {}, summary: T.summary };
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return { R: (ok, html, extra) => ({ ok, html, ...(extra || {}) }), warn: (x) => x, note: (x) => x, L: (en) => en, esc,
    ensureData: async () => {}, resolveCountry: async () => null, nm: (s) => s.name, countryStats: {} };
}
const of = { companies: 3, generatedAt: '2026-11-01' };

test('wave4-refine ① a world reading of nothing says so, not «0 of 0 (null%)»', async () => {
  const q = { kind: 'world', sites: 0, cross: { sites: 0, share: null }, pairs: [], listed: { shown: 0, of: 0 }, of };
  const r = await row.run({}, {}, kit(q));
  assert.ok(r.ok);
  assert.doesNotMatch(r.html, /null%|0 of 0/, r.html);
  assert.match(r.html, /No published site in this reading/);
});

test('wave4-refine ① top cuts the list, the headline keeps the whole reading, and says how many there were', async () => {
  const pairs = [{ from: 'JPN', to: 'USA', nCompanies: 5, sites: 9 }, { from: 'DEU', to: 'FRA', nCompanies: 2, sites: 3 }];
  const q = { kind: 'world', sites: 40, cross: { sites: 12, share: 30 }, pairs: pairs.slice(0, 1), listed: { shown: 1, of: 2 }, of };
  const r = await row.run({ top: 1 }, {}, kit(q));
  assert.match(r.html, /12 of 40 published sites \(30%\)/);
  assert.match(r.html, /first 1 of 2/);
  assert.deepEqual(r.meta.companyTies.listed, { shown: 1, of: 2 });
  assert.equal(r.meta.companyTies.pairs.length, 1);
});
