/* ============================================================================
 *  legend-reflow-and-label-writes · node checks (the browser half rides tests/form-control-names.spec.js ②)
 * ----------------------------------------------------------------------------
 *  ① js/geo-engine.js `layers.witness()` — «is any layer this pass looked at not the one it last
 *     found?». Runs a pass, records every id the pass asked `has` / `get` about (whoever asked), and
 *     answers `unchanged()` only while every one still names the same layer object.
 *  ② the two `ofm` tile heartbeats in js/app-body.js run under it. MEASURED in production 2026-09-26:
 *     the heartbeat came every 0.1–1.2 s with the clock and camera still, and each one re-ran the
 *     place-label pass (49 writes to `ofm-city` alone in twelve seconds) and the #R38 re-assert of
 *     the reference lines, borders and coast. Evaluated here: the REAL js/place-labels.js pass, run
 *     through the REAL facade under a witness, twenty heartbeats → zero writes; a recreated, added or
 *     removed layer → the pass again. And no `ofm` sourcedata subscriber in js/ runs ungated.
 *  ③ js/data-layers.js `watchLegendSize` — a legend that changes size asks for ONE re-placement on
 *     the next frame, is watched once however often the tiler discovers it, and a press of the
 *     reader's own – / ▢ button pins or un-pins the card it opened or shut.
 *
 *  ⚠ EVALUATED, NOT READ (#R505): the facade is lifted out of js/geo-engine.js and bound to an
 *  adapter stub whose layers are OBJECTS with an identity, as MapLibre's StyleLayer are.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asClassicScript } from './app-source.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── the shipped facade, bound to an adapter stub that counts what reaches the renderer ────── */
const FACADE = liftFunction(codeOnly(rd('js/geo-engine.js')), 'engineFacade');
function renderer() {
  const store = new Map();            /* id → the style layer object, as the renderer holds it */
  let writes = [];
  const adapter = {
    raw: () => ({}), hasLayer: (id) => store.has(id), getLayer: (id) => store.get(id) || null,
    hasSource: () => true, addLayer: (d) => { if (!store.has(d.id)) store.set(d.id, { id: d.id }); },
    setLayout: (id, p) => { writes.push(id + ' ' + p); }, setPaint: (id, p) => { writes.push(id + ' ' + p); },
    setSourceData: (id) => { writes.push(id + ' data'); }, getLayout: () => 'visible',
  };
  /* eslint-disable no-new-func */
  const GE = new Function('window', FACADE + '\nreturn engineFacade;')({})(() => adapter);
  return { GE, store, take: () => { const w = writes; writes = []; return w; } };
}

test('① the witness: nothing recorded is «changed»; a completed pass is «unchanged» until a layer it looked at moves', () => {
  const { GE, store } = renderer();
  store.set('a', { id: 'a' });
  const w = GE.layers.witness();
  assert.equal(w.unchanged(), false, 'a witness that has never run a pass claimed nothing changed');
  w.run(() => { GE.layers.has('a'); GE.layers.get('b'); });
  assert.equal(w.unchanged(), true);
  store.set('b', { id: 'b' });
  assert.equal(w.unchanged(), false, 'a layer that APPEARED under a looked-at id was not noticed');
  w.run(() => { GE.layers.has('a'); GE.layers.has('b'); });
  store.set('a', { id: 'a' });
  assert.equal(w.unchanged(), false, 'a RECREATED layer (same id, another object) was not noticed');
  w.run(() => { GE.layers.has('a'); GE.layers.has('b'); });
  store.delete('b');
  assert.equal(w.unchanged(), false, 'a REMOVED layer was not noticed');
  /* ids the pass never asked about are not its business */
  w.run(() => { GE.layers.has('a'); });
  store.set('z', { id: 'z' });
  assert.equal(w.unchanged(), true, 'a layer the pass never looked at re-ran it');
});

test('① a layer the pass itself creates counts as seen; a pass that throws records nothing; passes nest', () => {
  const { GE, store } = renderer();
  const w = GE.layers.witness();
  w.run(() => { if (!GE.layers.has('x')) store.set('x', { id: 'x' }); });
  assert.equal(w.unchanged(), true, 'the layer the pass created made the next heartbeat run it again');
  const t = GE.layers.witness();
  assert.throws(() => t.run(() => { GE.layers.has('x'); throw new Error('boom'); }));
  assert.equal(t.unchanged(), false, 'a pass that threw was recorded as done');
  /* a witnessed pass inside another: both see what the inner one asked */
  const outer = GE.layers.witness(), inner = GE.layers.witness();
  outer.run(() => { inner.run(() => { GE.layers.has('x'); }); });
  store.set('x', { id: 'x' });
  assert.equal(inner.unchanged(), false);
  assert.equal(outer.unchanged(), false, 'the outer pass did not see what the inner one asked');
  /* and after a pass, `has` / `get` stop recording */
  const u = GE.layers.witness(); u.run(() => {}); GE.layers.has('x');
  store.set('x', { id: 'x' });
  assert.equal(u.unchanged(), true, 'a lookup made after the pass returned was charged to it');
});

/* ── ② the real label pass, under the witness, through the real facade ───────────────────── */
function labels() {
  const R = renderer();
  const noop = () => { };
  const ctx = vm.createContext({});
  ctx.window = ctx; ctx.console = console; ctx.setTimeout = noop;
  ctx.document = { baseURI: 'https://example.invalid/' };
  ctx.matchMedia = () => ({ matches: false });
  ctx.imLabelLang = 'ui+local';
  ctx.IntMapGeoEngine = Object.assign(R.GE, { camera: { getZoom: () => 6 }, coords: { querySourceFeatures: () => [] }, events: { on: noop } });
  ctx.IntMapMapTypography = { placeFont: () => ['literal', ['Inter']], readerFont: () => ['literal', ['Inter']], cjkFamily: () => '', glyphRewrite: noop };
  ctx.IntMapLang = { pick: () => ({ arr: (a) => a[0] }) };
  /* the text sizes are js/label-scale.js's; a size is not what this file is about */
  ctx.IntMapLabelScale = { place: () => 12, sub: () => 11, subCase: () => 11 };
  ctx.SEA_LABELS = [];
  vm.runInContext(asClassicScript(rd('js/place-labels.js')), ctx);
  const HOST = { lang: 'en', mapType: 'std', namesOn: true, geoLabelsOn: true, poiOn: true, userTheme: 'dark',
    mapLabelsViaVector: () => true, canDraw: () => true, _stabIdx: { water: new Map() } };
  const api = ctx.window.IntMapModules.placeLabels(HOST);
  /* the heartbeat exactly as js/app-body.js writes it */
  const beat = R.GE.layers.witness();
  const heartbeat = () => { if (!beat.unchanged()) beat.run(() => { api.ensurePlaceLabels(); api.applyLabelLang(); }); };
  return { ...R, api, heartbeat };
}

test('② twenty ofm heartbeats over unchanged label layers write nothing; the first one applies them all', () => {
  const { heartbeat, take, store, api } = labels();
  heartbeat();
  const first = take();
  assert.ok(store.has('ofm-city'), 'the first heartbeat did not create the label layers');
  assert.ok(first.includes('ofm-city text-field') && first.includes('ofm-city visibility'), 'the first heartbeat did not apply the labels');
  for (let i = 0; i < 20; i++) heartbeat();
  assert.deepEqual(take(), [], 'twenty heartbeats over unchanged layers rewrote the labels');
  /* a caller outside the heartbeat (language, theme, a toggle, the clock) is never second-guessed */
  api.applyLabelLang();
  assert.ok(take().includes('ofm-city text-field'), 'a direct call was skipped');
});

test('② a label layer that is recreated, added later or removed is a new answer — the next heartbeat applies the pass', () => {
  const { heartbeat, take, store } = labels();
  heartbeat(); take();
  store.set('ofm-city', { id: 'ofm-city' });                       /* recreated (#R72's self-heal, a style swap) */
  heartbeat();
  const re = take();
  assert.ok(re.includes('ofm-city text-field') && re.includes('ofm-city visibility'), 'a recreated ofm-city was not given the language');
  heartbeat();
  assert.deepEqual(take(), [], 'the pass after the heal was repeated');
  assert.ok(!store.has('imtb-lbl'));
  store.set('imtb-lbl', { id: 'imtb-lbl' });                       /* born later in another module (js/time-borders.js) */
  heartbeat();
  assert.ok(take().includes('imtb-lbl text-font'), 'a label layer born after the last pass was not given its face');
  store.delete('ofm-other');                                       /* removed: the pass re-creates it */
  heartbeat();
  assert.ok(store.has('ofm-other') && take().includes('ofm-other visibility'), 'a removed label layer was not put back');
  heartbeat();
  assert.deepEqual(take(), []);
});

test('② no `ofm` sourcedata subscriber in js/ re-asserts on every tile — each one is gated by a witness', () => {
  const found = [];
  for (const f of readdirSync(join(ROOT, 'js')).filter((n) => n.endsWith('.js'))) {
    const src = codeOnly(rd('js/' + f));
    /* every subscription to the event: `.on(` / `.once(` whose first argument is 'sourcedata' */
    for (const m of src.matchAll(/\.(?:on|once)\(\s*'sourcedata'/g)) {
      /* the handler is the balanced (...) that call opens — the whole subscription */
      const open = m.index + m[0].indexOf('('); let i = open, depth = 0, q = null;
      for (; i < src.length; i++) { const c = src[i];
        if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
        if (c === '"' || c === "'" || c === '`') { q = c; continue; }
        if (c === '(') depth++; else if (c === ')' && !--depth) break; }
      const body = src.slice(open, i + 1);
      if (/sourceId\s*===\s*'ofm'/.test(body)) found.push({ f, line: src.slice(0, m.index).split('\n').length, gated: /\.unchanged\(\)/.test(body) && /\.run\(/.test(body) });
    }
  }
  assert.ok(found.length >= 2, 'fewer than the two ofm heartbeats were found — the check is looking at nothing');
  assert.deepEqual(found.filter((x) => !x.gated), [], 'an ofm sourcedata subscriber re-runs its pass on every tile');
});

/* ── ③ the legend observer and the reader's own button ─────────────────────────────────────── */
const DL = codeOnly(rd('js/data-layers.js'));
const DECL = DL.match(/let _legRO=null; const _legWatched=new WeakSet\(\);/);
test('③ a legend that changes size asks for one re-placement on the next frame, and is watched once', () => {
  assert.ok(DECL, 'the observer state is not declared beside watchLegendSize');
  const observed = []; let cb = null;
  class RO { constructor(f) { cb = f; } observe(el) { observed.push(el); } }
  const frames = new Map();
  const window = { IntMapRuntime: { frame: (k, fn) => frames.set(k, fn) } };
  let tiled = 0;
  /* eslint-disable no-new-func */
  const make = new Function('window', 'ResizeObserver', 'tileLegends', 'requestAnimationFrame',
    DECL[0] + '\n' + liftFunction(DL, 'watchLegendSize') + '\nreturn watchLegendSize;');
  const watch = make(window, RO, () => { tiled++; }, () => assert.fail('the frame register was bypassed'));
  const a = { id: 'a' }, b = { id: 'b' };
  for (let i = 0; i < 31; i++) { watch(a); watch(b); watch(null); }   /* the tiler's thirty-one call sites */
  assert.deepEqual(observed, [a, b], 'a legend was observed more than once, or a null was observed');
  cb([{ target: a }]); cb([{ target: b }]); cb([{ target: a }, { target: b }]);
  assert.equal(frames.size, 1, 'a burst of size changes queued more than one re-placement');
  assert.equal(tiled, 0, 'the re-placement ran inside the observer callback (a ResizeObserver loop)');
  [...frames.values()][0]();
  assert.equal(tiled, 1);
});

test('③ no ResizeObserver (a test DOM, an old engine) is not an error', () => {
  const make = new Function('window', 'ResizeObserver', 'tileLegends', 'requestAnimationFrame',
    DECL[0] + '\n' + liftFunction(DL, 'watchLegendSize') + '\nreturn watchLegendSize;');
  const watch = make({}, undefined, () => {}, () => {});
  assert.doesNotThrow(() => watch({ id: 'a' }));
});

test('③ the reader opening a legend pins it open; shutting it gives the pin up', () => {
  const body = ['toggleLegendMin', 'ensureLegendMinimize'].map((n) => liftFunction(DL, n)).join('\n');
  const cls = new Set(['legend-collapsed']);
  const kids = [{ tagName: 'H4', classList: { contains: () => false }, style: {} }, { tagName: 'DIV', classList: { contains: () => false }, style: {} }];
  const el = { dataset: { minInit: '1' }, children: kids,
    classList: { contains: (c) => cls.has(c), toggle: (c) => { if (cls.has(c)) { cls.delete(c); return false; } cls.add(c); return true; } },
    appendChild: (c) => kids.push(c), querySelector: (s) => kids.find((c) => c.classList.contains(s.slice(1))) || null };
  const document = { createElement: () => { const e = { className: '', style: {} }; e.classList = { contains: (c) => e.className === c }; return e; } };
  const window = { matchMedia: () => ({ matches: true }), IntMapLang: { t: (_l, en) => en } };
  const make = new Function('document', 'window', 'HOST', body + '\nreturn ensureLegendMinimize;');
  make(document, window, { lang: 'en' })(el);
  const btn = el.querySelector('.legend-min');
  btn.onclick({ stopPropagation() {} });
  assert.ok(!cls.has('legend-collapsed') && el.dataset.legPinOpen === '1', 'opened by the reader and not pinned — the tiler may fold it straight back');
  btn.onclick({ stopPropagation() {} });
  assert.ok(cls.has('legend-collapsed') && !('legPinOpen' in el.dataset), 'shut by the reader and still pinned open');
});
