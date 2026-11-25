/* The reading of a call is started when its reply is parsed; only the writing takes turns.
   Drives js/atlas-agent.js runTurn (what the browser runs) over the real registry and tool surface, with a scripted model. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { swappable, importModule } from './helpers/import-module.mjs';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const engineSeat = swappable();
const { makeAtlasCapabilities } = await importModule('js/atlas-capabilities.js', { mocks: { 'js/geo-engine.js': { IntMapGeoEngine: engineSeat.value } } });
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { registerPrefetch, takePrefetch, startPrefetch } = await import('../js/atlas-prefetch.js');

const AGENT = makeAtlasAgent();
const CAPS = makeAtlasCapabilities({});
const SCHEMAS = makeAtlasSchemas();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('① eight model.run calls in one reply: the eight readings overlap, the eight writes keep their order', async () => {
  let running = 0, peak = 0, started = 0, firstWriteAt = Infinity, lastReadStart = 0;
  registerPrefetch('model.run', async (a) => {
    started++; lastReadStart = performance.now();
    running++; peak = Math.max(peak, running);
    await sleep(40);
    running--;
    return { read: a.place };
  });
  const writes = [];
  const surface = makeAtlasToolSurface({
    capabilities: CAPS, schemas: SCHEMAS,
    runAction: async (action) => {
      firstWriteAt = Math.min(firstWriteAt, performance.now());
      const plain = Object.fromEntries(Object.entries(action).filter(([k]) => k !== 'type'));
      const got = await takePrefetch('model.run', plain);
      const rec = { t0: performance.now(), got };
      await sleep(2);                         /* the pin and the camera */
      rec.t1 = performance.now();
      writes.push(rec);
      return { ok: true, html: '<div>pin</div>', meta: { status: 'completed', produced: ['map'] } };
    },
  });
  const tools = surface.baseTools();
  const places = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const script = [
    { text: '', turnState: 'continuing', toolCalls: places.map((p, k) => ({ id: 'c' + k, name: 'run_capability', arguments: { id: 'model.run', args: { model: 'flood.glofas', place: p } } })) },
    { text: 'done', toolCalls: [] },
  ];
  let i = 0;
  const t0 = performance.now();
  const out = await AGENT.runTurn({
    model: async () => script[Math.min(i++, script.length - 1)],
    tools, execute: surface.makeExecute(tools, AGENT),
    footprint: (c) => surface.footprintOf(c, tools),
    prefetch: (c) => surface.prefetchOf(c, tools, {}),
    promote: surface.promotionsOf, system: 's', messages: [{ role: 'user', content: 'q' }],
  });
  const elapsed = performance.now() - t0;
  assert.equal(out.calls, 8);
  assert.equal(started, 8, 'every call of the reply had its reading started');
  assert.equal(peak, 8, 'at the same time — they used to run one after another');
  assert.ok(lastReadStart <= firstWriteAt + 5, 'all readings began before the first write took its turn');
  assert.equal(writes.length, 8);
  writes.slice(1).forEach((w, k) => assert.ok(writes[k].t1 <= w.t0, 'writes did not overlap'));
  assert.deepEqual(writes.map((w) => w.got.read), places, 'each write got ITS reading, in call order');
  assert.ok(elapsed < 8 * 40, 'the turn took less than eight readings end to end: ' + elapsed.toFixed(0) + ' ms');
});

test('② the same call twice shares one reading; a failed reading is the capability\'s to report, not an unhandled rejection', async () => {
  let n = 0;
  registerPrefetch('x.cap', async () => { n++; throw new Error('upstream'); });
  assert.equal(startPrefetch('x.cap', { a: 1 }, {}), true);
  assert.equal(startPrefetch('x.cap', { a: 1 }, {}), true);
  assert.equal(n, 1);
  await assert.rejects(takePrefetch('x.cap', { a: 1 }), /upstream/);
  assert.equal(takePrefetch('x.cap', { a: 1 }), null, 'taken once');
  assert.equal(startPrefetch('no.reader', {}, {}), false);
});
