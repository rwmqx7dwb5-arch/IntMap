import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/hist-cities.js', import.meta.url), 'utf8');
const payload = { cities: [{ id: 'source-city', k: ['Modern'], lon: 10, lat: 20, g: 1000,
  e: [{ f: 18000101, t: 18991231, n: { en: 'Historical' } }] }] };
const ok = () => ({ ok: true, json: async () => payload });
function runtime(fetcher) {
  let clock, calls = 0, redraws = 0;
  const context = { URL, document: { baseURI: 'https://example.invalid/' },
    fetch: (...args) => { calls++; return fetcher(...args); },
    IntMapTime: { isLive: () => false, when: () => new Date('1850-06-15T12:00:00Z'), on: fn => { clock = fn; } },
  };
  context.window = context;
  vm.runInNewContext(source, context);
  const api = context.IntMapHistCities;
  context.applyLabelLang = () => { redraws++; api.textField(['get', 'name'], 'en', 'ui'); api.ensure(); };
  return { api, calls: () => calls, redraws: () => redraws, tick: () => clock({ isLive: false }) };
}

for (const [name, fail] of [
  ['HTTP failure', () => Promise.resolve({ ok: false })],
  ['network rejection', () => Promise.reject(new Error('offline'))],
  ['invalid JSON', () => Promise.resolve({ ok: true, json: async () => { throw new SyntaxError('partial'); } })],
  ['empty record', () => Promise.resolve({ ok: true, json: async () => ({ cities: [] }) })],
  ['synchronous fetch exception', () => { throw new Error('unavailable'); }],
]) {
  test(`historical city names recover after ${name} on the next clock request`, async () => {
    let attempt = 0;
    const h = runtime(() => ++attempt === 1 ? fail() : Promise.resolve(ok()));
    assert.equal(await h.api.ensure(), null);
    assert.equal(h.api.ready(), false);
    h.tick();
    await h.api.ensure();
    assert.equal(h.calls(), 2);
    assert.equal(h.api.at('Modern', 10, 20, 'en'), 'Historical');
    assert.equal(h.api.count(), 1);
    assert.equal(await h.api.ensure(), payload);
    assert.equal(h.calls(), 2);
  });
}

test('concurrent requests and redraw re-entry share one load; explicit retries recover', async () => {
  let resolveFetch;
  const h = runtime(() => new Promise(resolve => { resolveFetch = resolve; }));
  const first = h.api.ensure();
  assert.equal(first, h.api.ensure());
  h.tick();
  await Promise.resolve();
  assert.equal(h.calls(), 1);
  resolveFetch({ ok: false });
  await first;
  const second = h.api.ensure();
  assert.equal(second, h.api.ensure());
  await Promise.resolve();
  resolveFetch(ok());
  await second;
  assert.equal(h.calls(), 2);
  assert.equal(h.redraws(), 2); // clock redraw plus the successful load redraw
  assert.equal(h.api.ready(), true);
});
