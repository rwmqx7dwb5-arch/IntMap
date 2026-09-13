import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import { asClassicScript } from './app-source.mjs';
const data = JSON.parse(readFileSync(new URL('../data/hist-cities.json', import.meta.url), 'utf8'));
test('a nearby neighborhood history cannot rename Kagoshima in lookup, popup or map label', async () => {
  const ctx = vm.createContext({ URL, console, document: { baseURI: 'https://example.invalid/' }, fetch: async () => ({ ok: true, json: async () => data }) });
  ctx.window = ctx;
  ctx.IntMapTime = { isLive: () => false, when: () => new Date('1800-06-15T12:00:00Z'), on: () => {} };
  vm.runInContext(asClassicScript(readFileSync(new URL('../js/hist-cities.js', import.meta.url), 'utf8')), ctx);
  const api = ctx.IntMapHistCities;
  await api.ensure();
  const lon = 130.55814, lat = 31.56018;
  assert.equal(api.at('Kagoshima', lon, lat, 'jp'), null);
  assert.equal(api.forFeature({ layer: { id: 'ofm-city' }, geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { 'name:en': 'Kagoshima', name: '鹿児島市' } }, 'jp', 'ui'), null);
  const parsed = createExpression(api.textField(['get', 'name'], 'jp', 'ui'), { type: 'string', 'property-type': 'data-driven', expression: { interpolated: false, parameters: ['zoom', 'feature'] } });
  assert.equal(parsed.result, 'success');
  const z = 10, n = 2 ** z, sx = (lon + 180) / 360 * n, r = lat * Math.PI / 180, sy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
  const x = Math.floor(sx), y = Math.floor(sy);
  assert.equal(parsed.value.evaluate({ zoom: z }, { type: 1, properties: { 'name:en': 'Kagoshima', name: '鹿児島市' }, geometry: [[{ x: Math.round((sx - x) * 8192), y: Math.round((sy - y) * 8192) }]] }, {}, { z, x, y }), '鹿児島市');
  const neighborhood = data.cities.find(c => c.id === 'wd-q17226549');
  assert.ok(neighborhood, 'retain the authentic neighborhood record');
  assert.equal(api.at('Hirano-chō', neighborhood.lon, neighborhood.lat, 'jp'), '平之馬場町 [?]');
  for (const [id, wrong, actual, year] of [
    ['pl-383580', 'Pino Torinese', 'Turin', 100],
    ['ohm-2093450534', 'Dearborn Heights', 'Dearborn', 1920],
  ]) {
    const place = data.cities.find(c => c.id === id);
    assert.ok(place, id);
    ctx.IntMapTime.when = () => new Date(`${String(year).padStart(4, '0')}-06-15T12:00:00Z`);
    assert.ok(api.at(actual, place.lon, place.lat, 'en'), id + ': source identity remains reachable');
    assert.equal(api.at(wrong, place.lon, place.lat, 'en'), null, id + ': nearby place must retain its identity');
  }

});


test('identity keys never inherit a containing city solely through its alternate names', async () => {
  const { identityKeys, identityMatchRank } = await import('../scripts/histcities/upstream.mjs');
  const neighborhood = ['Hirano-chō', '平之町'];
  const city = { name: 'Kagoshima', ascii: 'Kagoshima', alts: ['Hirano-chō'] };
  assert.deepEqual(identityKeys(neighborhood, city), neighborhood);
  assert.deepEqual(identityKeys(['São Paulo'], { name: 'São Paulo', ascii: 'Sao Paulo' }), ['São Paulo', 'Sao Paulo']);
  const source = ['Turin'];
  assert.ok(identityMatchRank(source, { name: 'Torino', ascii: 'Torino', alts: ['Turin'] }) < identityMatchRank(source, { name: 'Turino', ascii: 'Turino', alts: [] }));
  assert.deepEqual(identityKeys(['Cambridge'], { name: 'East Cambridge', ascii: 'East Cambridge' }), ['Cambridge']);
});

test('all harvested relabel keys have source-name evidence before build-time merging', async () => {
  const { loadRecord } = await import('../scripts/histcities-record.mjs');
  const { fold } = await import('../scripts/histcities/upstream.mjs');
  const { rows } = await loadRecord();
  for (const row of rows.filter(r => r.derived)) {
    assert.ok(row.ev.n?.length, row.id + ': evidence');
    const names = new Set(row.ev.n.map(fold));
    for (const key of row.keys) assert.ok(names.has(fold(key)), row.id + ': unsupported key ' + key);
  }
});


test('a later source alias bridge preserves identity regardless of enumeration order', async () => {
  const { loadRecord, km, ANCHOR_TOL_KM } = await import('../scripts/histcities-record.mjs');
  const { identityHosts, fold } = await import('../scripts/histcities/upstream.mjs');
  const { rows } = await loadRecord();
  const ids = ['istanbul', 'wd-q16869', 'pl-520998'];
  const subjects = ids.map(id => rows.find(r => r.id === id));
  assert.ok(subjects.every(Boolean));
  const priority = new Map(subjects.map((r, i) => [r, i]));
  const different = { id: 'nearby-neighborhood', keys: ['Hirano-chō'], lon: subjects[0].lon, lat: subjects[0].lat };
  const distant = { id: 'distant-namesake', keys: subjects[0].keys, lon: 0, lat: 0 };
  priority.set(different, 3); priority.set(distant, 4);
  const connected = (a, b) => km(a.lon, a.lat, b.lon, b.lat) <= ANCHOR_TOL_KM && a.keys.some(k => b.keys.some(j => fold(k) === fold(j)));
  const permutations = a => a.length ? a.flatMap((r, i) => permutations(a.filter((_, j) => j !== i)).map(tail => [r, ...tail])) : [[]];
  for (const order of permutations(subjects)) {
    const hosts = identityHosts([...order, different, distant], fold, connected, (a, b) => priority.get(a) - priority.get(b));
    for (const r of subjects) assert.equal(hosts.get(r), subjects[0], r.id + ': source precedence survives bridge order');
    assert.equal(hosts.get(different), different, 'proximity without a source alias is not identity');
    assert.equal(hosts.get(distant), distant, 'a shared spelling at a different place is not identity');
  }
});
