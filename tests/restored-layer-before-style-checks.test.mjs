/* ============================================================================
 *  IntMap · tests/restored-layer-before-style-checks.test.mjs
 * ----------------------------------------------------------------------------
 *  THE DEFECT, stated as it was (not as it was fixed):
 *    a layer switched on before the basemap style could take layers — a share link or session
 *    restored in a tab opened hidden — either threw «Style is not done loading.» on the spot or
 *    waited on a `whenStyleReady()` that gave up after ~6 s and SAID the style was ready; then it
 *    threw, and nothing asked again. The box stayed ticked and the layer never existed. Only the
 *    submarine cables had a retry of their own.
 *  Everything below is EVALUATED: the engine's wait is run on a fake adapter under a mocked clock,
 *  and the gate in js/layer-rows.js is driven with fake boxes and a fake engine. The browser half
 *  (a real hidden-tab boot, every shareable layer) is tests/restored-layer-before-style.spec.js.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sharedIds, isLayer } from '../js/layer-manifest.js';
import { holdUntilDrawable } from '../js/layer-rows.js';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
await import('../js/geo-engine.js');
const ENGINE = window.IntMapGeoEngine;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

/* an adapter whose style is parsed when the test says so, and which fires what the test fires */
function fakeAdapter(state) {
  const subs = new Map();
  return {
    raw: () => (state.renderer === false ? null : {}),
    canDraw: () => !!state.parsed,
    on: (e, fn) => { if (!subs.has(e)) subs.set(e, new Set()); subs.get(e).add(fn); },
    off: (e, fn) => { if (subs.has(e)) subs.get(e).delete(fn); },
    once: (e, fn) => { const w = (x) => { subs.get(e).delete(w); fn(x); }; if (!subs.has(e)) subs.set(e, new Set()); subs.get(e).add(w); },
    fire: (e) => { for (const fn of Array.from(subs.get(e) || [])) fn({}); },
    count: (e) => (subs.get(e) ? subs.get(e).size : 0),
  };
}

test('① the engine\'s wait never answers «ready» before canDraw() is true — however long it waits', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const state = { parsed: false };
  const A = fakeAdapter(state);
  const f = ENGINE.makeFacade(A);
  let a = false, b = false;
  f.whenCanDraw().then(() => { a = true; });
  f.whenCanDraw().then(() => { b = true; });
  /* the old copies resolved after ~6 s (41 polls × 150 ms) whatever the style said */
  for (let i = 0; i < 600; i++) t.mock.timers.tick(100);
  await flush();
  assert.equal(a || b, false, 'a minute of an unparsed style is still not ready');
  state.parsed = true;
  A.fire('styledata');
  await flush();
  assert.equal(a && b, true, 'both waiters are answered the moment the style can take layers');
  assert.equal(A.count('styledata') + A.count('load') + A.count('idle'), 0, 'and the listeners are gone');
  /* a style that becomes usable with no event this listener saw is still found (the poll) */
  state.parsed = false;
  let c = false;
  f.whenCanDraw().then(() => { c = true; });
  state.parsed = true;
  t.mock.timers.tick(200);
  await flush();
  assert.equal(c, true, 'a missed styledata does not strand the waiter');
  let d = false;
  f.whenCanDraw().then(() => { d = true; });
  await flush();
  assert.equal(d, true, 'already drawable → answered at once');
});

test('① (cont.) no renderer at all is not «ready» either', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = ENGINE.makeFacade(fakeAdapter({ renderer: false, parsed: true }));
  let done = false;
  f.whenCanDraw().then(() => { done = true; });
  for (let i = 0; i < 100; i++) t.mock.timers.tick(150);
  await flush();
  assert.equal(done, false);
});

test('② every private `whenStyleReady` in js/ is the engine\'s wait, not a copy with its own deadline', () => {
  const dir = join(ROOT, 'js');
  const found = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.js')) continue;
    const raw = readFileSync(join(dir, name), 'utf8');
    if (!raw.includes('whenStyleReady')) continue;
    const src = codeOnly(raw);
    const re = /function\s+whenStyleReady\s*\(\s*\)\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(src))) found.push([name, m[1].replace(/\s+/g, ' ').trim()]);
  }
  assert.ok(found.length > 0, 'the declarations were discovered');
  for (const [name, body] of found) assert.equal(body, 'return GE().whenCanDraw();', 'js/' + name + ' waits on the engine');
});

/* ── the gate ─────────────────────────────────────────────────────────────────────────────── */
function fakeEngine(state) {
  const A = fakeAdapter(state);
  const f = ENGINE.makeFacade(A);
  const E = { hasRenderer: () => state.renderer !== false, canDraw: () => !!state.parsed, events: { once: (e, fn) => A.once(e, fn) }, whenCanDraw: () => f.whenCanDraw() };
  return { A, E };
}
function box(id, checked) {
  const b = Object.assign(new EventTarget(), { id, type: 'checkbox', checked });
  b.got = [];
  b.addEventListener('change', () => b.got.push(b.checked));
  return b;
}
function gate(E) {
  const doc = { addEventListener(type, fn, capture) { this.type = type; this.fn = fn; this.capture = capture; } };
  const l = holdUntilDrawable(doc, () => E);
  E.pending = l.pending;
  assert.equal(doc.type, 'change'); assert.equal(doc.capture, true, 'a CAPTURE listener: it must see the event before the box\'s own module');
  return (b) => { const ev = { target: b, stopped: false, stopPropagation() { this.stopped = true; } }; doc.fn(ev); return ev.stopped; };
}
const [ID1, ID2, ID3] = sharedIds();

test('③ while the style cannot take layers, every layer box is held and delivered once, in order, when it can', async () => {
  const state = { parsed: false };
  const { A, E } = fakeEngine(state);
  const send = gate(E);
  const a = box(ID1, true), b = box(ID2, true), c = box(ID3, false);
  assert.equal(send(a), true, 'unparsed style → held');
  assert.equal(send(b), true);
  a.checked = false; assert.equal(send(a), true, 'the same box again is still one entry');
  assert.equal(send(c), true);
  assert.deepEqual(E.pending(), [ID1, ID2, ID3], 'what is held is observable');
  assert.deepEqual([a.got, b.got, c.got], [[], [], []], 'nothing is delivered while the style is unparsed');
  const order = [];
  for (const x of [a, b, c]) x.addEventListener('change', () => order.push(x.id));
  state.parsed = true; A.fire('styledata');
  await flush();
  assert.deepEqual(order, [ID1, ID2, ID3], 'arrival order');
  assert.deepEqual([a.got, b.got, c.got], [[false], [true], [false]], 'each ONCE, with the state it has at delivery');
  assert.deepEqual(E.pending(), [], 'and nothing is left held');
  assert.equal(send(a), false, 'afterwards the event passes untouched');
});

test('③ (cont.) delivery is never keyed to MapLibre\'s `load` — a `load` that never comes does not strand a layer', async () => {
  const state = { parsed: false };
  const { A, E } = fakeEngine(state);
  const send = gate(E);
  const a = box(ID1, true);
  send(a);
  state.parsed = true; A.fire('styledata');   /* no `load` is ever fired */
  await flush();
  assert.deepEqual(a.got, [true]);
});

test('③ (cont.) a parsed style, no renderer, and a box that is not a layer all pass as before', async () => {
  const state = { parsed: true };
  const { E } = fakeEngine(state);
  const send = gate(E);
  assert.equal(send(box(ID1, true)), false, 'drawable → untouched');
  const notLayer = 'not-a-layer-' + Date.now();
  assert.equal(isLayer(notLayer), false);
  state.parsed = false;
  assert.equal(send(box(notLayer, true)), false, 'a box the manifest does not declare is not the gate\'s business');
  const none = fakeEngine({ renderer: false, parsed: false });
  assert.equal(gate(none.E)(box(ID1, true)), false, 'no renderer → nothing to wait for');
});

test('③ (cont.) a style that goes away again holds until canDraw() comes back — not on a clock', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const state = { parsed: true };
  const { A, E } = fakeEngine(state);
  const send = gate(E);
  assert.equal(send(box(ID2, true)), false);
  state.parsed = false;
  const b = box(ID1, true);
  assert.equal(send(b), true, 'a style being replaced → held');
  for (let i = 0; i < 100; i++) t.mock.timers.tick(150);
  await flush();
  assert.deepEqual(b.got, [], 'not delivered on a clock');
  state.parsed = true; A.fire('styledata');
  await flush();
  assert.deepEqual(b.got, [true], 'delivered when the style can take it');
});

test('④ a wait registered before the held changes is answered before they are delivered (the app\'s boot first)', async () => {
  const state = { parsed: false };
  const { A, E } = fakeEngine(state);
  const order = [];
  E.whenCanDraw().then(() => order.push('boot'));   /* js/app-body.js registers its boot at construction */
  const send = gate(E);
  const a = box(ID1, true);
  a.addEventListener('change', () => order.push('layer'));
  send(a);
  state.parsed = true; A.fire('styledata');
  await flush();
  assert.deepEqual(order, ['boot', 'layer']);
});

test('④ (cont.) the boot and the restores wait for the style, not for MapLibre\'s `load`', () => {
  /* the three places the production failure ran through: the app's boot (its first milestone), the
     share-link restore, the saved-session restore — each is found by what it DOES, then its entry asked */
  const entry = (file, marker) => {
    const src = codeOnly(readFileSync(join(ROOT, file), 'utf8'));
    const at = src.indexOf(marker);
    assert.ok(at > 0, file + ': ' + marker + ' is still there');
    return src;
  };
  const AB = entry('js/app-body.js', "__imBoot.set(80,'style')");
  const boot = AB.lastIndexOf('GE().whenCanDraw().then(()=>{', AB.indexOf("__imBoot.set(80,'style')"));
  const load = AB.lastIndexOf("GE().events.on('load',()=>{", AB.indexOf("__imBoot.set(80,'style')"));
  assert.ok(boot > load, 'js/app-body.js: the boot that reports «style» is entered from whenCanDraw()');
  assert.match(entry('js/map-ui.js', 'const _boot=()=>'), /GE\(\)\.whenCanDraw\(\)\.then\(_boot\)/, 'js/map-ui.js: the share-link restore');
  assert.match(entry('js/session-tabs.js', 'setTimeout(_restore,600)'), /GE\(\)\.whenCanDraw\(\)\.then\(\(\)=>setTimeout\(_restore,600\)\)/, 'js/session-tabs.js: the saved-session restore');
});
