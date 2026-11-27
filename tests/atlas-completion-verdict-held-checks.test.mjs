/* ============================================================================
 *  Atlas · «did this turn use the data the map held?» is the operation's own record, not a substring
 *  (js/atlas-held-data.js over js/gis-datasets.js readRecord / lastOpened, js/gis-ops.js run(), js/gis-atlas.js,
 *   js/compute-sandbox.js, js/atlas-cap-data.js `data.gis`, js/atlas-toolsurface.js `details`)
 * ----------------------------------------------------------------------------
 *  WRITTEN AS THE DEFECT ([[intmap-restate-the-defect-not-the-fix]]). An external audit reproduced three lies of the held-data line,
 *  which found «used» by searching the first 400 000 characters of the stringified results for each id:
 *    ① holding ds-1 and ds-10 and reading only ds-10, ds-1 was «used»
 *    ② a read that FAILED with the id in its error was «used»
 *    ③ a real read behind a long earlier result was «unused»
 *  and the line could not say ④ that one operation read two held datasets together. Every case runs the real chain: the registry, the
 *  op kernel, the Atlas door, the capability entry and the tool surface, then the observer the goal verifier is handed.
 * ==========================================================================*/
import test from 'node:test';
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const _saved = { window: globalThis.window };
after(() => { globalThis.window = _saved.window; });

async function boot() {
  const w = {};
  globalThis.window = w;
  new Function('window', readFileSync(join(ROOT, 'js/geodesy.js'), 'utf8'))(w);
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const { makeGisAtlas } = await import('../js/gis-atlas.js');
  const { makeHeldObserver } = await import('../js/atlas-held-data.js');
  const data = makeGisDatasets();
  const geometry = makeGisGeometry();
  const ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
  await geometry.ready();
  const atlas = makeGisAtlas({ data: data, ops: ops, layers: null, draw: () => ({ ok: true, sid: 's1' }) });
  w.IntMapGis = { atlas: atlas };
  w.IntMapLazy = { need: async () => true };
  /* the real `data.gis` entry and the real tool surface: what the model — and the goal verifier — is handed */
  const caps = (await import('../js/atlas-cap-data.js')).default;
  const gisEntry = caps.find((e) => e.row[0] === 'data.gis');
  const K = { R: (ok, html, extra) => Object.assign({ ok: !!ok, html: html || '' }, extra || null), warn: (h) => h, L: (en) => en, esc: (s) => String(s) };
  const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
  const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
  const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
  const { makeAtlasAgent } = await import('../js/atlas-agent.js');
  const surface = makeAtlasToolSurface({ capabilities: makeAtlasCapabilities({}), schemas: makeAtlasSchemas(), runAction: async (a) => gisEntry.run(a, {}, K) });
  const exec = surface.makeExecute(surface.baseTools(), makeAtlasAgent());
  const gis = (args) => exec({ name: 'run_capability', arguments: { id: 'data.gis', args: args } });
  const feat = (m) => ({ type: 'Feature', properties: { m: m, code: 'c' + m }, geometry: { type: 'Point', coordinates: [m, m] } });
  /* held: made before the turn (createdAt 100); the turn begins after every one of them */
  const held = [];
  for (let i = 1; i <= 10; i++) held.push(data.add({ title: 'Held ' + i, features: [feat(1), feat(2), feat(3)], createdAt: 100 }));
  const since = Date.now();
  const observe = (results) => makeHeldObserver(since, w)({ results: results });
  return { w, data, ops, atlas, gis, held, since, observe };
}

const filter = (id) => ({ op: 'filter', inputs: [id], params: { where: [{ field: 'm', op: '>=', value: 2 }] } });
const lineOf = (lines, re) => lines.find((l) => re.test(l)) || '';

test('① ds-1 and ds-10 are held, only ds-10 is read: ds-10 is read and ds-1 is untouched', async () => {
  const { gis, held, observe } = await boot();
  assert.equal(held[0].id, 'ds-1'); assert.equal(held[9].id, 'ds-10');
  const r = await gis(filter('ds-10'));
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  const rec = r.details && r.details.datasetsRead;
  assert.ok(Array.isArray(rec), 'the tool result states what it read, as a structured field');
  assert.deepEqual(rec.map((x) => [x.id, x.op, x.ok]), [['ds-10', 'filter', true]]);
  assert.equal(rec[0].version, '100', 'the version the registry holds of the record that was read');
  const lines = observe([r]);
  assert.match(lineOf(lines, /READ as an input/), /\[ds-10\][^|]*read by filter/);
  assert.doesNotMatch(lineOf(lines, /READ as an input/), /\[ds-1\]/, 'ds-1 is not «read» because ds-10 contains its spelling');
  assert.match(lineOf(lines, /no operation of this turn took/), /\[ds-1\]/);
  assert.doesNotMatch(lineOf(lines, /no operation of this turn took/), /\[ds-10\]/);
});

test('② a read that failed — its error naming the id — is «tried and failed», never «read»', async () => {
  const { gis, data, observe } = await boot();
  /* a stale input is refused after it is resolved by id: the refusal carries the id in its detail */
  data.invalidate('ds-3', 'input-edited');
  const r = await gis(filter('ds-3'));
  assert.equal(r.ok, false);
  assert.match(JSON.stringify(r), /ds-3/, 'the precondition of the old lie: the failure prints the id');
  assert.deepEqual(r.details.datasetsRead.map((x) => [x.id, x.ok, x.why]), [['ds-3', false, 'input-stale']]);
  const lines = observe([r]);
  assert.match(lineOf(lines, /TRIED to take as an input and FAILED/), /\[ds-3\][^|]*filter: input-stale/);
  assert.doesNotMatch(lineOf(lines, /READ as an input/), /ds-3/);
  assert.doesNotMatch(lineOf(lines, /no operation of this turn took/), /\[ds-3\]/, 'it was attempted, so it is not «untouched» either');
});

test('③ a read behind more than 400 000 characters of earlier results is still a read', async () => {
  const { gis, observe } = await boot();
  const long = { ok: true, details: { datasetsRead: [] }, text: 'x'.repeat(450000) };
  const r = await gis(filter('ds-7'));
  const lines = observe([long, r]);
  assert.match(lineOf(lines, /READ as an input/), /\[ds-7\]/);
  assert.doesNotMatch(lineOf(lines, /no operation of this turn took/), /\[ds-7\]/);
});

test('④ one operation reading two held datasets is stated as read together; two separate reads are not', async () => {
  const { gis, observe } = await boot();
  const j = await gis({ op: 'join', inputs: ['ds-2', 'ds-5'], params: { leftField: 'code', rightField: 'code', prefix: 'r_' } });
  assert.equal(j.ok, true, JSON.stringify(j).slice(0, 300));
  const lines = observe([j]);
  assert.match(lineOf(lines, /read together/), /join\(ds-2, ds-5\)/);
  const a = await gis(filter('ds-2')), b = await gis(filter('ds-5'));
  assert.equal(lineOf(observe([a, b]), /read together/), '', 'two calls each reading one dataset did not read them together');
});

test('⑤ a result that states no record is «not observed» unless the registry proves the doors stayed shut', async () => {
  const { w, data, since, observe } = await boot();
  const { makeHeldObserver } = await import('../js/atlas-held-data.js');
  /* an older path: it opened ds-4's contents and said nothing about it */
  data.get('ds-4').features();
  const older = [{ ok: true, capability: 'data.query', text: 'something about ds-4' }];
  const lines = observe(older);
  assert.ok(lineOf(lines, /could NOT BE OBSERVED/).includes('[ds-4]'), 'opened by something that does not report: neither read nor unread');
  assert.doesNotMatch(lineOf(lines, /READ as an input/), /ds-4/);
  assert.ok(!lineOf(lines, /no operation of this turn took/).includes('[ds-4]'));
  assert.ok(lineOf(lines, /no operation of this turn took/).includes('[ds-6]'), 'never opened since the turn began: provably untouched');
  /* a registry that does not state lastOpened proves nothing, so the same turn leaves every dataset unobserved */
  const blind = makeHeldObserver(since, { IntMapData: { list: () => w.IntMapData.list() } })({ results: older });
  assert.ok(lineOf(blind, /could NOT BE OBSERVED/).includes('[ds-6]'));
  assert.equal(lineOf(blind, /no operation of this turn took/), '');
});

test('⑥ the compute sandbox states the inputs its program was handed, and a run that failed read nothing successfully', async () => {
  const { data } = await boot();
  const { makeComputeSandbox } = await import('../js/compute-sandbox.js');
  const worker = (script) => class {
    constructor() { this.dead = false; }
    postMessage(m) { if (m && m.t === 'run') setTimeout(() => script(this), 0); }
    send(m) { if (!this.dead && this.onmessage) this.onmessage({ data: m }); }
    terminate() { this.dead = true; }
  };
  const ok = makeComputeSandbox({ registry: data, publish: false, Worker: worker((w) => { w.send({ t: 'phase', phase: 'run' }); w.send({ t: 'done', ok: true, outputs: { result: JSON.stringify({ v: 1, nf: 0 }) } }); }) });
  const r = await ok.run({ code: 'result = 1', inputs: ['ds-1', 'ds-10'] });
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  assert.deepEqual(r.datasetsRead.map((x) => [x.id, x.op, x.ok]), [['ds-1', 'compute.run', true], ['ds-10', 'compute.run', true]]);
  const bad = makeComputeSandbox({ registry: data, publish: false, Worker: worker((w) => { w.send({ t: 'phase', phase: 'run' }); w.send({ t: 'done', ok: false, why: 'python-exception', detail: { message: 'ds-1 bad' } }); }) });
  const f = await bad.run({ code: 'x = 1', inputs: ['ds-1'] });
  assert.deepEqual(f.datasetsRead.map((x) => [x.id, x.ok, x.why]), [['ds-1', false, 'python-exception']]);
  const refused = await bad.run({ code: 'x = 1', inputs: ['no-such'] });
  assert.deepEqual(refused.datasetsRead, [], 'refused before the program started: nothing was handed over');
});

test('the console still hands the observer the turn start, and the old substring search is gone', () => {
  const src = readFileSync(join(ROOT, 'js/atlas-held-data.js'), 'utf8');
  assert.ok(!src.includes('JSON.stringify(results'), 'the results are not searched as text');
  assert.ok(readFileSync(join(ROOT, 'js/atlas-console.js'), 'utf8').includes('makeHeldObserver(since)'));
});
