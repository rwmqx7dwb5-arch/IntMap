/* (atlas-ui-parts) map.shadeAreas — a table the caller holds, joined to the shipped first-level outlines and shaded.
   Node-only: the boundary index and the layer door are faked at their two seams (window.IntMapAtlasAdmin1, window.GeoJSONUpload);
   what is asserted is the JOIN and the honesty of the answer, not the renderer. */
import test from 'node:test';
import assert from 'node:assert/strict';

const geo = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
const UNITS = { Aomori: { stableId: 'JP-02', canonicalName: 'Aomori', iso3: 'JPN' }, Akita: { stableId: 'JP-05', canonicalName: 'Akita', iso3: 'JPN' },
  Georgia: { stableId: 'GE-X', canonicalName: 'Georgia', iso3: 'GEO', ambiguousCountries: ['GEO', 'USA'] } };
const calls = { add: [], style: [] };
globalThis.window = {
  IntMapAtlasAdmin1: { resolveMany: async (names) => ({ hits: names.filter((n) => UNITS[n.name]).map((n) => Object.assign({ asked: n.name, geo, aliases: [], ambiguousCountries: [], countryCode: 'JP' }, UNITS[n.name])), misses: [], requests: 0 }) },
  GeoJSONUpload: { add: (fc, title) => { calls.add.push({ fc, title }); return { n: 7 }; }, style: async (n, spec) => { calls.style.push({ n, spec }); return { ok: true }; } },
};
const caps = (await import('../js/atlas-cap-geo.js')).default;
const entry = caps.find((c) => c.row[0] === 'geo.shadeAreas');
const K = { R: (ok, html, extra) => ({ ok, html, ...(extra || {}) }), warn: (h) => h, esc: (s) => String(s), L: (en) => en, ensureData: async () => {}, resolveCountry: async () => ({ code: 'JPN' }) };
const run = (a) => entry.run(a, {}, K);

test('a numeric table becomes a graduated ladder on the real outlines, and says what it could not place', async () => {
  const r = await run({ title: 'Share 65+', source: 'Statistics Bureau, 2025 census', unit: '%', country: 'Japan', rows: [{ area: 'Aomori', value: 36.1 }, { area: 'Akita', value: 40 }, { area: 'Atlantis', value: 1 }] });
  assert.equal(r.ok, true);
  assert.equal(calls.add.at(-1).fc.features.length, 2);
  assert.deepEqual(calls.style.at(-1).spec, { field: 'value', mode: 'graduated', method: 'quantile', classes: 5 });
  assert.match(r.html, /Atlantis/, 'a name that is not a unit is listed, not painted');
  assert.equal(r.meta.shadeAreas.unplaced, 1);
});

test('a grouped table is categorical; a mixture, or no source, or a name two countries share without a country is refused or left unpainted', async () => {
  const g = await run({ source: 's', country: 'Japan', rows: [{ area: 'Aomori', group: 'north' }, { area: 'Akita', group: 'north' }] });
  assert.deepEqual(calls.style.at(-1).spec, { field: 'group', mode: 'categorical' });
  assert.equal(g.ok, true);
  assert.equal((await run({ source: 's', rows: [{ area: 'Aomori', value: 1 }, { area: 'Akita', group: 'x' }] })).meta.code, 'ROWS_SHAPE');
  assert.equal((await run({ source: '', rows: [{ area: 'Aomori', value: 1 }] })).meta.code, 'NO_SOURCE');
  const before = calls.add.length;
  const amb = await run({ source: 's', rows: [{ area: 'Georgia', value: 1 }] });
  assert.equal(amb.ok, false, 'an ambiguous name with no country is not guessed');
  assert.equal(calls.add.length, before, 'and nothing is drawn for it');
});
