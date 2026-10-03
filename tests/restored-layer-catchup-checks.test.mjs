/* ============================================================================
 *  IntMap · tests/restored-layer-catchup-checks.test.mjs
 * ----------------------------------------------------------------------------
 *  THE DEFECT, stated as it was (not as it was fixed):
 *    the Time zones row read its 5 MB boundaries with a bare `fetch(...).then(r=>r.json())` — no clock,
 *    not handed to js/layer-rows.js `layerInflight` — and when that read failed its catch UNTICKED the
 *    box and wrote nothing anywhere but a 4-second toast. MEASURED (tests/restored-layer-before-style.spec.js,
 *    the share link carrying every layer, held style, four cores beside a second spec, 3 runs of 3): the read
 *    started at 32 s, Chromium gave up on it at 158 s («Failed to fetch»), and the box ended `checked:false`
 *    with no js/layer-state.js record — indistinguishable from a box the reader had switched off, while
 *    nothing on the page had known for 126 s that the row was still being answered. Its draw also waited
 *    60 × 150 ms and then on MapLibre's `idle`, which a page that busy does not reach.
 *  Everything below is EVALUATED: the row's own closure (from `const TZURL` to its toggle) is lifted out of
 *  js/layer-packs.js and driven with fakes for the reader, the renderer and the box; ⑤ runs the result
 *  through the real js/layer-rows.js `inFlight` and js/layer-state.js `makeLayerState`.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { inFlight } from '../js/layer-rows.js';
import { makeLayerState } from '../js/layer-state.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/layer-packs.js'), 'utf8');

/* the statements of the Time-zones closure that hold the read and the switch — found by the closure that
   declares TZURL, not by a line number, so the lift follows the code */
function liftTZ(env) {
  let body = null;
  walk.full(acorn.parse(SRC, { ecmaVersion: 'latest', sourceType: 'module' }), (n) => {
    if (body || (n.type !== 'FunctionExpression' && n.type !== 'ArrowFunctionExpression') || !n.body || n.body.type !== 'BlockStatement') return;
    const has = n.body.body.some((s) => s.type === 'VariableDeclaration' && s.declarations.some((d) => d.id && d.id.name === 'TZURL'));
    if (has) body = n.body.body;
  });
  assert.ok(body, 'js/layer-packs.js has the closure that declares TZURL');
  const want = new Set(['TZURL', 'on', 'tzRead', 'readTZ', 'toggle']);
  const picked = body.filter((s) => (s.type === 'FunctionDeclaration' && want.has(s.id.name))
    || (s.type === 'VariableDeclaration' && s.declarations.some((d) => want.has(d.id && d.id.name))));
  const names = new Set(); for (const s of picked) { if (s.id) names.add(s.id.name); else s.declarations.forEach((d) => names.add(d.id.name)); }
  for (const n of want) assert.ok(names.has(n), 'the Time-zones closure declares ' + n);
  const P = ['jsonWithin', 'clockFor', 'satToast', 'T', 'document', 'layerState', 'layerInflight', 'GE', '_imCanDraw', 'addLayers', 'setVis',
    'lbl', 'window', 'everyTick', 'stopTick', 'refreshTimes', 'setTimeout'];
  return new Function(...P, picked.map((s) => SRC.slice(s.start, s.end)).join('\n')
    + '\nreturn { toggle, readTZ, state: () => ({ on, geo }) };')(...P.map((k) => env[k]));
}

const deferred = () => { let res, rej; const p = new Promise((a, b) => { res = a; rej = b; }); return { p, res, rej }; };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

/* a world of fakes the closure reads; `reads` is one deferred per jsonWithin call */
function world(opts = {}) {
  const w = {
    reads: [], tracked: [], reports: [], toasts: [], adds: 0, timers: 0, can: opts.can !== false, gate: deferred(),
    box: { id: 'dl-tz', checked: true, closest: () => ({ classList: { remove() {} } }) },
  };
  const env = {
    jsonWithin: (u, ms, init, o) => { const d = deferred(); w.reads.push({ u, ms, o, d }); return d.p; },
    clockFor: () => 30000,
    satToast: (m) => w.toasts.push(m), T: (en) => en,
    document: { getElementById: (id) => (id === 'dl-tz' ? w.box : null) },
    layerState: { report: (id, e, info) => w.reports.push({ id, e, info }) },
    layerInflight: { track: (id, p) => w.tracked.push({ id, p }) },
    GE: () => ({ whenCanDraw: () => w.gate.p, events: { once() { throw new Error('the draw must not wait on `idle`'); } } }),
    _imCanDraw: () => w.can, addLayers: () => { w.adds++; }, setVis() {}, lbl: () => 'Time zones',
    window: {}, everyTick: () => 1, stopTick() {}, refreshTimes() {},
    /* a timer that NEVER fires: whatever the row does must not depend on one */
    setTimeout: () => { w.timers++; return 0; },
  };
  w.row = liftTZ(env);
  return w;
}
const fc = { type: 'FeatureCollection', features: [] };

test('① the read is the shared reader under the host clock (idle), and it is handed to layerInflight while it runs', async () => {
  const w = world();
  w.row.toggle(true);
  assert.equal(w.reads.length, 1, 'one read');
  assert.equal(w.reads[0].o && w.reads[0].o.idle, true, 'the clock bounds a silence, not the 5 MB file');
  assert.equal(w.tracked.length, 1, 'the row is in flight while the read runs');
  assert.equal(w.tracked[0].id, 'dl-tz');
  assert.equal(typeof w.tracked[0].p.then, 'function');
  /* a second ask while the first is out does not start a second download */
  w.row.readTZ();
  assert.equal(w.reads.length, 1, 'the read is shared');
});

test('② a read the host failed is KEPT on the row, then the box is unticked — and the tracked request settles', async () => {
  const w = world();
  w.row.toggle(true);
  const err = Object.assign(new Error('Failed to fetch'), { reason: 'network' });
  w.reads[0].d.rej(err);
  let settled = false; w.tracked[0].p.then(() => { settled = true; }, () => { settled = true; });
  await flush();
  assert.equal(w.reports.length, 1, 'one record');
  assert.equal(w.reports[0].id, 'dl-tz');
  assert.equal(w.reports[0].e, err, 'the reader\'s own error, so js/layer-state.js classifies it (failed / unobserved)');
  assert.equal(w.reports[0].info && w.reports[0].info.told, true, 'the row already said it — the record does not toast twice');
  assert.equal(w.box.checked, false);
  assert.equal(settled, true, 'the in-flight entry ends with the read');
});

test('③ switched off before the read failed: the reader\'s untick owns the row — nothing is reported or touched', async () => {
  const w = world();
  w.row.toggle(true);
  w.row.toggle(false); w.box.checked = false;
  w.reads[0].d.rej(Object.assign(new Error('x'), { reason: 'network' }));
  await flush();
  assert.deepEqual(w.reports, []);
  assert.equal(w.toasts.filter((t) => /unavailable/i.test(t)).length, 0);
});

test('④ boundaries that arrive while the style cannot take layers are drawn when the renderer says it can — with no timer firing', async () => {
  const w = world({ can: false });
  w.row.toggle(true);
  w.reads[0].d.res(fc);
  await flush();
  assert.equal(w.adds, 0, 'nothing is added to a style that cannot take it');
  w.can = true; w.gate.res();
  await flush();
  assert.ok(w.adds >= 1, 'drawn on the renderer\'s own event');
  assert.equal(w.row.state().geo, fc);
});

test('⑤ through the real registries: the row ends «failed» with the host\'s reason, not «ok», and is no longer in flight', async () => {
  const st = makeLayerState({ doc: null });
  const reg = inFlight(st);
  const w = world();
  /* the row's two collaborators, real */
  const real = liftTZ({
    jsonWithin: () => Promise.reject(Object.assign(new Error('Failed to fetch'), { reason: 'network' })),
    clockFor: () => 30000, satToast() {}, T: (en) => en,
    document: { getElementById: () => w.box },
    layerState: st, layerInflight: reg,
    GE: () => ({ whenCanDraw: () => new Promise(() => {}) }), _imCanDraw: () => true, addLayers() {}, setVis() {}, lbl: () => '',
    window: {}, everyTick: () => 1, stopTick() {}, refreshTimes() {}, setTimeout: () => 0,
  });
  real.toggle(true);
  assert.deepEqual(reg.pending(), ['dl-tz'], 'in flight while the read runs');
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(reg.pending(), [], 'settled');
  const rec = st.get('dl-tz');
  assert.ok(rec, 'a record exists');
  assert.equal(rec.state, 'failed');
  assert.equal(rec.reason, 'network');

  /* a read whose host's clock ran out is «no reply», not «could not load» (one-pass-or-a-reason.md §5) */
  const st2 = makeLayerState({ doc: null }); const reg2 = inFlight(st2);
  const w2 = world();
  const real2 = liftTZ({
    jsonWithin: () => Promise.reject(Object.assign(new Error('timed out'), { reason: 'timeout' })),
    clockFor: () => 30000, satToast() {}, T: (en) => en, document: { getElementById: () => w2.box },
    layerState: st2, layerInflight: reg2, GE: () => ({ whenCanDraw: () => new Promise(() => {}) }), _imCanDraw: () => true,
    addLayers() {}, setVis() {}, lbl: () => '', window: {}, everyTick: () => 1, stopTick() {}, refreshTimes() {}, setTimeout: () => 0,
  });
  real2.toggle(true);
  await new Promise((r) => setImmediate(r));
  assert.equal(st2.get('dl-tz').state, 'unobserved');
});

test('⑥ the page door says both halves of «answered»: held changes and changes still being answered', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/layer-rows.js'), 'utf8');
  /* evaluated where it can be (⑤ drives inFlight); this asserts only that the door publishes it */
  assert.match(src, /window\.IntMapLayerHold\s*=\s*\{\s*pending:\s*l\.pending,\s*inflight:\s*layerInflight\.pending\s*\}/);
});

/* ── the same shape in the other rows that give up: a lazily-loaded body that did not arrive ──────────────────
   js/lazy-modules.js `lazyRowFailed` (every world-packs row) and js/beta-overlays.js `radobsToggle` (measured
   radiation) unticked their box with a toast and no record — the same «indistinguishable from switched off» as
   the Time-zones row. Both are EVALUATED: lazyRowFailed is the real export, radobsToggle is lifted out. */
test('⑦ lazyRowFailed keeps the failure on js/layer-state.js before it unticks the box', async () => {
  const { lazyRowFailed } = await import('../js/lazy-modules.js');
  const { layerState } = await import('../js/layer-state.js');
  const toasts = []; const order = [];
  const box = { id: 'dl-catchup-lazy', closest: () => ({ classList: { remove() {} } }) };
  let checked = true;
  Object.defineProperty(box, 'checked', { get: () => checked, set: (v) => { order.push(['untick', layerState.get(box.id)]); checked = v; } });
  lazyRowFailed({ lang: 'en', imToast: (m) => toasts.push(m) }, box);
  assert.equal(checked, false, 'the box is unticked');
  assert.equal(toasts.length, 1, 'the reader is told once');
  const rec = layerState.get(box.id);
  assert.equal(rec && rec.state, 'failed', 'the row keeps «failed», not nothing');
  assert.ok(order[0][1] && order[0][1].state === 'failed', 'the record exists BEFORE the untick');
  /* a box the reader already switched off is not touched and gets no record */
  const off = { id: 'dl-catchup-lazy-off', checked: false, closest: () => null };
  lazyRowFailed({ lang: 'en', imToast() {} }, off);
  assert.equal(layerState.get(off.id), null);
});

test('⑧ measured radiation: a module that did not arrive is kept on the row before the box is unticked', async () => {
  const BSRC = fs.readFileSync(path.join(ROOT, 'js/beta-overlays.js'), 'utf8');
  let fn = null;
  walk.full(acorn.parse(BSRC, { ecmaVersion: 'latest', sourceType: 'module' }), (n) => {
    if (!fn && n.type === 'FunctionDeclaration' && n.id && n.id.name === 'radobsToggle') fn = n;
  });
  assert.ok(fn, 'js/beta-overlays.js declares radobsToggle');
  const reports = []; const order = [];
  const box = { closest: () => ({ classList: { remove() {} } }) };
  let checked = true;
  Object.defineProperty(box, 'checked', { get: () => checked, set: (v) => { order.push(reports.length); checked = v; } });
  const env = {
    state: {}, imToast() {}, L: (en) => en,
    document: { getElementById: (id) => (id === 'beta-dl-radobs' ? box : null) },
    layerState: { report: (id, what, info) => reports.push({ id, what, info }) },
    window: { IntMapLazy: { need: () => Promise.resolve(false) } },
  };
  const K = Object.keys(env);
  const radobsToggle = new Function(...K, BSRC.slice(fn.start, fn.end) + '\nreturn radobsToggle;')(...K.map((k) => env[k]));
  assert.equal(await radobsToggle(true), false);
  assert.equal(checked, false, 'the box is unticked');
  assert.equal(reports.length, 1);
  assert.equal(reports[0].id, 'beta-dl-radobs');
  assert.equal(reports[0].what, 'failed', 'an observed failure, not «no reply»');
  assert.equal(order[0], 1, 'the record is made BEFORE the untick');
});
