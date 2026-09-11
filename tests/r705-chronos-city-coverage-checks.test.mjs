import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import { asClassicScript } from './app-source.mjs';

const data = JSON.parse(readFileSync(new URL('../data/hist-cities.json', import.meta.url), 'utf8'));
const source = asClassicScript(readFileSync(new URL('../js/hist-cities.js', import.meta.url), 'utf8'));
const byKey = new Map();
for (const c of data.cities) for (const k of c.k) byKey.set(k, [...(byKey.get(k) || []), c]);
const shared = [...byKey].filter(([, cities]) => cities.length > 1);
const base = ['coalesce', ['get', 'name:en'], ['get', 'name']];

function feature(spelling, lon, lat, local) {
  const z = 10, n = 2 ** z;
  const sx = (lon + 180) / 360 * n, r = lat * Math.PI / 180;
  const sy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
  const x = Math.floor(sx), y = Math.floor(sy);
  return [{ type: 1, properties: local ? { name: spelling } : { 'name:en': spelling },
    geometry: [[{ x: Math.round((sx - x) * 8192), y: Math.round((sy - y) * 8192) }]] }, { z, x, y }];
}

for (const year of [1500, 1900, 1930]) test(`homonyms: MapLibre and lookup preserve each place's ${year} name`, async () => {
  const date = new Date(`${year}-06-15T12:00:00Z`), stamp = year * 10000 + 615;
  const ctx = vm.createContext({ URL, console, document: { baseURI: 'https://example.invalid/' },
    fetch: async () => ({ ok: true, json: async () => data }) });
  ctx.window = ctx;
  ctx.IntMapTime = { isLive: () => false, when: () => date, on: () => {} };
  vm.runInContext(source, ctx);
  const api = ctx.IntMapHistCities;
  await api.ensure();
  const expression = api.textField(base, 'en', 'ui');
  const parsed = createExpression(expression, { type: 'string', 'property-type': 'data-driven',
    expression: { interpolated: false, parameters: ['zoom', 'feature'] } });
  if (parsed.result !== 'success') assert.fail(parsed.value.map(e => e.message).join('\n'));
  let checked = 0;
  for (const [spelling, cities] of shared) for (const c of cities) {
    const era = c.e.find(e => (!e.f || stamp >= e.f) && (!e.t || stamp <= e.t));
    const expected = era ? era.n.en + (era.f ? '' : ' [?]') : null;
    assert.equal(api.at(spelling, c.lon, c.lat, 'en'), expected, `${c.id}: lookup`);
    for (const local of [false, true]) {
      const [f, canonical] = feature(spelling, c.lon, c.lat, local);
      assert.equal(parsed.value.evaluate({ zoom: 10 }, f, {}, canonical), expected || spelling, `${c.id}: tile name field ${local}`);
    }
    checked++;
  }
  assert.ok(checked > 100, 'exercise actual shared-key places, including restored upstream rows');
  const [f, canonical] = feature('Kirov', 0, 0, false);
  assert.equal(parsed.value.evaluate({ zoom: 10 }, f, {}, canonical), 'Kirov');
  assert.equal(api.at('Kirov', 0, 0, 'en'), null);
});

test('Kirov in Kaluga retains the dated source record previously lost to its namesake', () => {
  const c = data.cities.find(c => c.id === 'wd-q153490');
  assert.ok(c);
  assert.ok(c.k.includes('Kirov'));
  assert.equal(c.e.find(e => e.f <= 19300615 && e.t >= 19300615).n.ru, 'Песочня');
  assert.ok(data.cities.find(c => c.id === 'kirov-vyatka').k.includes('Kirov'));
});

test('Chronos reserves measured attribution space and updates only changed geometry', () => {
  const code = readFileSync(new URL('../js/news-timeline.js', import.meta.url), 'utf8');
  const start = code.indexOf('    function measureCreditSpace(){');
  const end = code.indexOf('    function queueCreditSpace()', start);
  assert.ok(start >= 0 && end > start);
  const values = new Map(); let writes = 0;
  let creditTop = 613;
  const ctx = vm.createContext({ Math, parseFloat, creditFrame: 1,
    getComputedStyle: () => ({ paddingBottom: '8px' }),
    tl: { offsetParent: { getBoundingClientRect: () => ({ top: 0, bottom: 844 }) },
      getBoundingClientRect: () => ({ left: 62, right: 378 }),
      style: { getPropertyValue: k => values.get(k), setProperty: (k,v) => { writes++; values.set(k,v); } } },
    mapCredit: { getBoundingClientRect: () => ({ top: creditTop, bottom: creditTop + 23, left: 6, right: 276, width: 270, height: 23 }) } });
  vm.runInContext(code.slice(start, end) + '\nmeasureCreditSpace();', ctx);
  assert.equal(values.get('--ntl-credit-floor'), '239px');
  assert.equal(values.get('--ntl-available-height'), '597px');
  vm.runInContext('measureCreditSpace();', ctx);
  assert.equal(writes, 2, 'stable geometry does not trigger a resize/style feedback loop');
  creditTop = 500;
  vm.runInContext('measureCreditSpace();', ctx);
  assert.equal(values.get('--ntl-credit-floor'), '352px', 'sheet/credit motion changes the reserved space');
});
