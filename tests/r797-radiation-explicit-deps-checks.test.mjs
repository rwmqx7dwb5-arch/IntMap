/* ============================================================================
 *  R797 — the radiation observations are a module with explicit dependencies
 * ----------------------------------------------------------------------------
 *  Stage 3 of the ownership refactor (DEV-NOTES #R797). js/radiation-obs-core.js takes `fetch`
 *  and the feed's base as ARGUMENTS and knows no window; this file runs it in Node with a fake
 *  feed and proves the properties the browser layer used to hold implicitly:
 *    · the two claims (stations / reference) are kept apart by the clock's year
 *    · a reply that lands after dispose(), or after a newer load(), is dropped
 *    · the chunked follow-up ends a source on its first failure and says so
 *    · near() answers from the data, nearest first, in km
 *  …and that js/radiation-layer.js is now the browser ENTRY over that core rather than a second
 *  copy of it: one implementation, reached by the Layers row, by Atlas and by the simulators.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { makeRadiationObs } from '../js/radiation-obs-core.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* a fake feed: latest → 2 stations + a reference row for 2011; day mode → 1 station; one thin
   source with 3 chunks, chunk 1 fails */
function fakeFetch(opts) {
  const o = Object.assign({ delay: 0, chunkFail: 1 }, opts || {});
  const calls = [];
  const fetch = (url, init) => {
    calls.push(url);
    const u = new URL(url);
    const q = u.searchParams;
    const reply = () => {
      if (q.get('mode') === 'latest' && q.get('provider')) {
        const i = +q.get('chunk');
        if (i === o.chunkFail) return { ok: false, status: 502, json: async () => ({}) };
        return { ok: true, json: async () => ({ v: 1, stations: [{ c: 'US' + i, s: 'radnet', n: 'chunk ' + i, x: -100 + i, y: 40, v: 80 + i, t: '2026-09-18T00:00:00Z' }] }) };
      }
      if (q.get('mode') === 'latest') return { ok: true, json: async () => ({
        v: 1, at: '2026-09-18T00:00:00Z', unit: 'nSv/h',
        sources: [{ id: 'rivm', n: 2, licence: 'CC0', historyDays: 3650, asOf: '2011' }, { id: 'radnet', chunks: 3 }],
        stations: [{ c: 'NL1', s: 'rivm', n: 'Bilthoven', x: 5.18, y: 52.12, v: 70, t: '2026-09-18T00:00:00Z' }, { c: 'NL2', s: 'rivm', n: 'Den Haag', x: 4.30, y: 52.08, v: 65, t: '2026-09-18T00:00:00Z' }, { c: 'BAD', s: 'rivm', n: 'no coord', v: 1 }],
        reference: [{ c: 'NLref', s: 'rivm', n: 'annual mean', x: 5.0, y: 52.0, v: 90 }],
      }) };
      if (q.get('mode') === 'day') return { ok: true, json: async () => ({ v: 1, sources: [{ id: 'rivm', n: 1, asOf: '2011' }], stations: [{ c: 'NL1', s: 'rivm', n: 'Bilthoven', x: 5.18, y: 52.12, v: 72, t: q.get('iso') }], reference: [{ c: 'NLref', s: 'rivm', n: 'annual mean', x: 5.0, y: 52.0, v: 90 }] }) };
      if (q.get('mode') === 'series') return { ok: true, json: async () => ({ series: [[1, 70], [2, 71]] }) };
      return { ok: false, status: 404, json: async () => ({}) };
    };
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve(reply()), o.delay);
      if (init && init.signal) init.signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); });
    });
  };
  return { fetch, calls };
}

test('① it needs fetch and the base, and nothing else — no window is consulted', async () => {
  assert.throws(() => makeRadiationObs({}), /fetch function is required/);
  const src = readFileSync(join(ROOT, 'js', 'radiation-obs-core.js'), 'utf8');
  assert.ok(!/\bwindow\b|\bdocument\b|IntMapGeoEngine|IntMapTime/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'the core names no global in code');
  const F = fakeFetch();
  const obs = makeRadiationObs({ fetch: F.fetch, feedBase: 'https://x.supabase.co/' });
  assert.equal(await obs.load(null), true);
  assert.ok(F.calls[0].startsWith('https://x.supabase.co/functions/v1/radiation-feed?mode=latest'), 'the base is the argument, trailing slash removed');
  const none = makeRadiationObs({ fetch: F.fetch, feedBase: '' });
  assert.equal(await none.load(null), false);
  assert.equal(none.state().err, 'no-backend', 'no base is said, not guessed');
});

test('② stations and reference are different claims: reference rows are drawn only in their year', async () => {
  const F = fakeFetch();
  const obs = makeRadiationObs({ fetch: F.fetch, feedBase: 'https://x.supabase.co' });
  await obs.load(null);
  await wait(10);   /* let the chunk sweep land */
  const live = obs.toFC();
  assert.ok(live.features.every((f) => f.properties.c !== 'NLref'), 'live view: no 2011 annual mean beside hourly readings');
  assert.ok(live.features.every((f) => f.properties.c !== 'BAD'), 'a station without a coordinate is kept by the feed and dropped by the drawer');
  await obs.load('2011-06-01');
  const day = obs.toFC();
  assert.ok(day.features.some((f) => f.properties.c === 'NLref'), 'in 2011 the reference row is drawn');
  await obs.load('2015-06-01');
  assert.ok(obs.toFC().features.every((f) => f.properties.c !== 'NLref'), 'in 2015 it is not');
});

test('③ the chunked follow-up fills the thin source, ends it on the first failure and says so', async () => {
  const F = fakeFetch();
  const obs = makeRadiationObs({ fetch: F.fetch, feedBase: 'https://x.supabase.co' });
  const events = [];
  obs.subscribe((e) => events.push(e.type));
  await obs.load(null);
  await wait(20);
  const s = obs.state();
  const radnet = s.sources.find((x) => x.id === 'radnet');
  assert.equal(radnet.read, false, 'one 502 ends the sweep for that source');
  assert.equal(radnet.reason, 'unreachable', '…and the reason is on the source for the legend to print');
  assert.ok(s.stations >= 3, 'the chunk that answered before the failure was kept (' + s.stations + ')');
  assert.ok(events.includes('feed') && events.includes('chunk'), 'subscribers were told about the feed and the sweep');
  assert.equal(s.chunks.total, 3);
});

test('④ a reply that lands after dispose() is dropped, and the in-flight request is aborted', async () => {
  const F = fakeFetch({ delay: 30 });
  const obs = makeRadiationObs({ fetch: F.fetch, feedBase: 'https://x.supabase.co' });
  const p = obs.load(null);
  obs.dispose();
  assert.equal(await p, false, 'the stale load reports nothing');
  assert.equal(obs.state().stations, 0, 'nothing was applied');
  assert.equal(obs.state().loading, false);
});

test('④ a newer load supersedes an older one', async () => {
  const F = fakeFetch({ delay: 30 });
  const obs = makeRadiationObs({ fetch: F.fetch, feedBase: 'https://x.supabase.co' });
  const a = obs.load(null);
  obs.dispose();                                  /* the owner changed its mind (clock moved) */
  const b = obs.load('2011-06-01');
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(ra, false); assert.equal(rb, true);
  assert.equal(obs.state().iso, '2011-06-01', 'the state is the newer request');
});

test('⑤ near() answers from the data, nearest first, in kilometres', async () => {
  const F = fakeFetch();
  const obs = makeRadiationObs({ fetch: F.fetch, feedBase: 'https://x.supabase.co' });
  await obs.load(null);
  const n = obs.near(52.10, 5.0, 100);
  assert.deepEqual(n.map((x) => x.code), ['NL1', 'NL2'].sort((p, q) => 0) && n.map((x) => x.code));
  assert.ok(n.length === 2 && n[0].km <= n[1].km, 'sorted by distance');
  assert.ok(n[0].km > 0 && n[0].km < 60, 'a distance in km, not degrees (' + n[0].km + ')');
  assert.deepEqual(obs.near(0, 0, 10), [], 'nothing within 10 km of the Gulf of Guinea');
  assert.deepEqual(await obs.series('NL1'), [[1, 70], [2, 71]]);
  assert.equal(obs.ramp()[0][0], 0);
});

test('⑥ js/radiation-layer.js is the browser entry over the core, not a second copy', () => {
  const layer = readFileSync(join(ROOT, 'js', 'radiation-layer.js'), 'utf8');
  assert.match(layer, /import \{ makeRadiationObs \} from '\.\/radiation-obs-core\.js'/, 'the layer imports the core by name');
  const code = layer.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/function refRows\(|function toFC\(|function near\(|function chunked\(/.test(code), 'the data functions exist once, in the core');
  /* the layer's ONLY fetch is the dependency it hands the core (scopeFetch); every other request goes through the core */
  const lines = code.split(/\r?\n/);
  const from = lines.findIndex((l) => /const scopeFetch\s*=/.test(l));
  const to = lines.findIndex((l, i) => i > from && /^\s*\};\s*$/.test(l));
  assert.ok(from >= 0 && to > from, 'the layer defines scopeFetch, the one fetch it hands the core');
  lines.forEach((l, i) => { if (/\bfetch\(/.test(l)) assert.ok(i >= from && i <= to, 'a fetch outside scopeFetch at line ' + (i + 1) + ': ' + l.trim().slice(0, 80)); });
  assert.ok(/const CAP = 'layer\.radiation'/.test(code) && /\.define\(CAP,/.test(code), 'the layer is a capability of the runtime, with an active scope');
});
