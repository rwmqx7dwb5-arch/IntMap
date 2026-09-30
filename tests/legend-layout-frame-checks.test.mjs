/* ============================================================================
 *  legend-layout-frame · node checks — placing the legend stack is asked for, and done once a frame
 * ----------------------------------------------------------------------------
 *  MEASURED 2026-09-30 on the page tests/restored-layer-before-style.spec.js opens (the share link
 *  that carries every layer, 1280×720, headless Chromium): the legend placer ran 910 times in a
 *  20-second window — 45 a second, 2.95 s inside it, of which 0.95 s was getBoundingClientRect and
 *  0.47 s querySelectorAll — and the main thread had no idle time left. 364 of those calls were
 *  `_registerLayerOpacity` re-registering a legend, 257 the wind legend re-rendering its body, 116
 *  the wave legend: all but the last pass of each frame placed a stack that was re-placed before
 *  it could be painted. #R499 had made one pass cost one layout flush; nothing bounded how many
 *  passes a frame paid for.
 *
 *  js/data-layers.js now splits the name the fifty-odd call sites use from the work:
 *    tileLegends()     — a REQUEST: marks the stack stale, asks js/runtime.js's frame register once
 *    placeLegends()    — the pass (the arithmetic every other legend check evaluates)
 *    discoverLegends() — what a legend is, from the page's live class collections
 *    watchLegendSize() — the observer, told the size the pass read, so its own report is not a change
 *
 *  ⚠ EVALUATED, NOT READ (#R505). Every function below is lifted out of the shipped file and run.
 *    ① N requests in one frame are ONE pass, and a request made during the pass is the next frame's
 *    ② the same, end to end: a fake page of legends, fifty requests, one frame → each legend measured once
 *    ③ the observer: a report that agrees with the size the pass read asks nothing; any other asks once
 *    ④ discovery walks no document: the live collections, and a box added later is still found (#R284)
 *    ⑤ no call site uses what the request returns (it returns nothing — the placement has not happened)
 *    ⑥ a box stopped at the container's edge is held by that edge, so its width cannot depend on its
 *       place — the loop the size observer and an auto-width card made (measured: 8 px a frame, to full width)
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { installDevice } from './helpers/ui-device.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DL = codeOnly(readLF(join(ROOT, 'js/data-layers.js')));
const lift = (...names) => names.map((n) => liftFunction(DL, n)).join('\n');
const decl = (re, what) => { const m = DL.match(re); assert.ok(m, what + ' is not declared in js/data-layers.js'); return m[0]; };
const QDECL = () => decl(/let _legQueued=false;/, 'the request flag');
const RODECL = () => decl(/let _legRO=null; const _legWatched=new WeakSet\(\); const _legSize=new WeakMap\(\);/, 'the observer state');
/* the named boxes the discovery closes over, found in its own body rather than listed here */
const LGD = [...new Set(liftFunction(DL, 'discoverLegends').match(/\blgd[A-Z]\w*/g) || [])];

/* a frame register with the semantics of js/runtime.js `frame(key, fn)`: keyed, one run per key per
   frame, and work enqueued while a frame runs belongs to the NEXT frame (the runtime drains first) */
function frameRegister() {
  let once = new Map();
  return {
    frame: (k, fn) => { once.set(k, fn); },
    pending: () => once.size,
    tick() { const run = once; once = new Map(); for (const fn of run.values()) fn(); },
  };
}

/* ── ① the request ─────────────────────────────────────────────────────────────────────────── */
function requester(placeLegends, runtime, raf) {
  /* eslint-disable no-new-func */
  return new Function('window', 'placeLegends', 'requestAnimationFrame',
    QDECL() + '\n' + lift('_legRun', 'tileLegends') + '\nreturn tileLegends;')({ IntMapRuntime: runtime }, placeLegends, raf);
}

test('① fifty requests in one frame are one placement, and none of them places inline', () => {
  const R = frameRegister(); let placed = 0;
  const tileLegends = requester(() => { placed++; }, R, () => assert.fail('the frame register was bypassed'));
  for (let i = 0; i < 50; i++) assert.equal(tileLegends(), undefined, 'the request returned something — a caller could mistake it for a placement');
  assert.equal(placed, 0, 'a request placed the stack synchronously');
  assert.equal(R.pending(), 1, 'fifty requests queued more than one task');
  R.tick();
  assert.equal(placed, 1, 'one frame of requests did not become exactly one placement');
  R.tick();
  assert.equal(placed, 1, 'a frame with no request placed again');
  tileLegends(); R.tick();
  assert.equal(placed, 2, 'a request after the placement was lost');
});

test('① a request made DURING the placement is the next frame\'s, not lost and not re-entered', () => {
  const R = frameRegister(); let placed = 0; let tileLegends = null;
  tileLegends = requester(() => { placed++; if (placed === 1) tileLegends(); }, R, () => assert.fail('bypassed'));
  tileLegends(); R.tick();
  assert.equal(placed, 1, 'the pass re-entered itself through its own request');
  assert.equal(R.pending(), 1, 'a request made while placing was dropped');
  R.tick();
  assert.equal(placed, 2);
});

test('① without the runtime (a page before js/runtime.js, a test DOM) the request still waits for a frame', () => {
  const rafs = []; let placed = 0;
  const tileLegends = requester(() => { placed++; }, null, (fn) => rafs.push(fn));
  tileLegends(); tileLegends(); tileLegends();
  assert.equal(rafs.length, 1, 'three requests asked for three animation frames');
  assert.equal(placed, 0);
  rafs[0]();
  assert.equal(placed, 1);
});

/* ── ② end to end: the fake page ────────────────────────────────────────────────────────────── */
test('② fifty requests against a page of six legends: one frame, each legend measured once, placed', () => {
  const reads = new Map();
  const mk = (id, h) => {
    const el = { id, dataset: {}, style: { display: 'block' }, hidden: false, children: [],
      classList: { contains: (c) => c === 'generic-legend' },
      appendChild() {}, querySelector: () => null, scrollHeight: h,
      getBoundingClientRect() { reads.set(id, (reads.get(id) || 0) + 1); return { height: h, width: 180 }; } };
    return el;
  };
  const legends = [mk('data-legend-a', 60), mk('data-legend-b', 50), mk('data-legend-c', 80),
    mk('data-legend-d', 40), mk('data-legend-e', 70), mk('data-legend-f', 55)];   /* they fit one column, so no fold re-enters the pass */
  const document = {
    getElementById: (id) => (id === 'map-container' ? { getBoundingClientRect: () => ({ height: 900, width: 1440 }) } : null),
    getElementsByClassName: (c) => (c === 'data-legend generic-legend' ? legends : []),
    querySelectorAll: () => assert.fail('the discovery walked the document with querySelectorAll'),
    querySelector: () => null,
    body: { classList: { contains: () => false } },
  };
  const R = frameRegister();
  const window = { IntMapRuntime: R, innerHeight: 900, innerWidth: 1440, matchMedia: () => ({ matches: false }) };
  installDevice(window);   /* (ui-layer-owner) js/ asks window.IntMapDevice now — the real owner, wired to this fake */
  const watched = [];
  const make = new Function('document', 'window', 'getComputedStyle', 'requestAnimationFrame', 'watchLegendSize',
    'ensureLegendOpacity', 'ensureContourSwitch', 'ensureContourDensity', 'ensureLegendMinimize', ...LGD,
    QDECL() + '\n' + lift('legendShown', 'discoverLegends', 'placeLegends', '_legRun', 'tileLegends') + '\nreturn tileLegends;');
  const tileLegends = make(document, window, () => ({ display: 'block', getPropertyValue: () => '' }),
    () => assert.fail('bypassed'), (el, size) => watched.push([el.id, size]), () => {}, () => {}, () => {}, () => {}, ...LGD.map(() => null));
  for (let i = 0; i < 50; i++) tileLegends();
  assert.equal(reads.size, 0, 'a request measured a legend before the frame');
  R.tick();
  assert.deepEqual([...reads.values()], legends.map(() => 1), 'fifty requests did not become one read of each legend');
  for (const el of legends) assert.ok(el.style.bottom && el.style.left, '#' + el.id + ' was not placed by the one pass');
  /* the size the pass read is what the observer is told (③) */
  assert.deepEqual(watched.map(([id, s]) => [id, s && s.h]), legends.map((el) => [el.id, el.scrollHeight]));
});

/* ── ③ the observer ─────────────────────────────────────────────────────────────────────────── */
function observerRig() {
  let cb = null; const observed = [];
  class RO { constructor(f) { cb = f; } observe(el) { observed.push(el); } }
  const R = frameRegister(); let placed = 0;
  const make = new Function('window', 'ResizeObserver', 'placeLegends', 'requestAnimationFrame',
    RODECL() + '\n' + QDECL() + '\n' + lift('watchLegendSize', '_legRun', 'tileLegends') + '\nreturn watchLegendSize;');
  const watch = make({ IntMapRuntime: R }, RO, () => { placed++; }, () => assert.fail('bypassed'));
  return { watch, report: (entries) => cb(entries), observed, R, placed: () => placed };
}
const box = (w, h) => [{ inlineSize: w, blockSize: h }];

test('③ the report every observe() makes, at the size the pass just read, asks for nothing', () => {
  const o = observerRig(); const a = { id: 'a' }, b = { id: 'b' };
  o.watch(a, { w: 180, h: 120 }); o.watch(b, { w: 0, h: 0 });
  o.report([{ target: a, borderBoxSize: box(180, 120) }, { target: b, borderBoxSize: box(0, 0) }]);
  o.report([{ target: a, borderBoxSize: box(180.3, 119.8) }]);   /* sub-pixel: the same box */
  assert.equal(o.R.pending(), 0, 'the observer\'s initial report of a size the pass already placed asked for another pass');
});

test('③ a size that changed since the pass — a fold, a late body, the pass\'s own cap — asks, once a frame', () => {
  const o = observerRig(); const a = { id: 'a' }, b = { id: 'b' };
  o.watch(a, { w: 180, h: 120 }); o.watch(b, { w: 180, h: 90 });
  o.report([{ target: a, borderBoxSize: box(180, 34) }]);
  o.report([{ target: b, borderBoxSize: box(180, 300) }, { target: a, borderBoxSize: box(180, 34) }]);
  assert.equal(o.R.pending(), 1);
  assert.equal(o.placed(), 0, 'the observer placed inside its own callback (a ResizeObserver loop error)');
  o.R.tick();
  assert.equal(o.placed(), 1);
});

test('③ what the observer cannot compare is a change, never a match', () => {
  for (const [what, entry, size] of [
    ['a card the pass did not measure (dragged)', { borderBoxSize: box(180, 120) }, undefined],
    ['an engine with no borderBoxSize', { contentRect: { width: 180, height: 120 } }, { w: 180, h: 120 }],
  ]) {
    const o = observerRig(); const a = { id: 'a' };
    o.watch(a, size);
    o.report([{ target: a, ...entry }]);
    assert.equal(o.R.pending(), 1, what + ' was taken as unchanged');
  }
});

test('③ a legend is observed once however many passes hand it a size, and the newest size is the one compared', () => {
  const o = observerRig(); const a = { id: 'a' };
  for (let h = 100; h < 130; h++) o.watch(a, { w: 180, h });
  assert.deepEqual(o.observed, [a]);
  o.report([{ target: a, borderBoxSize: box(180, 129) }]);
  assert.equal(o.R.pending(), 0, 'the observer compared against a stale size');
});

/* ── ④ discovery ────────────────────────────────────────────────────────────────────────────── */
test('④ the population comes from the page\'s live collections, and a box added later is found (#R284)', () => {
  const live = { 'data-legend': [], 'data-legend generic-legend': [] };
  const document = {
    getElementById: (id) => (id === 'koppen-legend' ? { id } : null),
    getElementsByClassName: (c) => live[c] || [],
    querySelectorAll: () => assert.fail('the discovery walked the document with querySelectorAll'),
  };
  const discover = new Function('document', ...LGD, lift('discoverLegends') + '\nreturn discoverLegends;')(document, ...LGD.map(() => null));
  const ids = () => discover().filter(Boolean).map((el) => el.id);
  assert.deepEqual(ids(), ['koppen-legend']);
  const ec = { id: 'data-legend-ec-slp' }, gen = { id: 'data-legend-eq' }, plain = { id: 'data-legend-nightsat' };
  live['data-legend'].push(plain, ec, gen); live['data-legend generic-legend'].push(gen);
  assert.deepEqual(ids(), ['koppen-legend', 'data-legend-ec-slp', 'data-legend-eq'],
    'boxes added after the first pass were not discovered, or the order (named, ECMWF, generic) changed');
});

/* ── ⑥ the edge-held box settles ────────────────────────────────────────────────────────────────
   MEASURED 2026-09-30 (every layer on, 1280×720): the folded webcams card (`width:auto`, a long note
   line) sat in the column stopped at the map's edge. It was written `left = edge − w − 8`; an
   auto-width box is as wide as the room right of its `left`, so each pass made it 8 px wider and
   moved it 8 px further left, and the size observer asked for the next pass — 374 → 382 → 390 …,
   24 passes in 6 s, one every frame the page could give it. The fake below lays boxes out the way a
   browser lays out `position:absolute; width:auto`: as wide as its content, or as the room its
   anchor leaves, whichever is less. */
test('⑥ a box stopped at the container\'s edge settles in a few passes, however its width depends on its place', () => {
  const mcW = 600, mcH = 500;
  const px = (v) => (v === undefined || v === '' || v === 'auto' ? null : parseFloat(v));
  const mk = (id, { h = 300, fixed = 178, content = 0, left = null } = {}) => {
    const el = { id, dataset: {}, hidden: false, children: [], classList: { contains: (c) => c === 'generic-legend' },
      appendChild() {}, querySelector: () => null,
      style: new Proxy({ display: 'block', ...(left != null ? { left: left + 'px' } : {}) }, {
        set(t, k, v) { if (t[k] !== v) writes++; t[k] = v; return true; } }),
      get width() {
        if (!content) return fixed;
        const r = px(el.style.right), l = px(el.style.left);
        return Math.min(content, mcW - (r != null ? r : (l != null ? l : 24)));
      },
      get scrollHeight() { return h; },
      getBoundingClientRect() { return { height: h, width: el.width }; } };
    return el;
  };
  let writes = 0;
  /* four one-column-tall legends in a 600 px map: the fourth runs out of room sideways and is held at
     the edge; it is the auto-width one, starting where a previous pass had left it */
  const legends = [mk('data-legend-a'), mk('data-legend-b'), mk('data-legend-c'), mk('data-legend-webcams', { content: 1000, left: 400 })];
  const document = {
    getElementById: (id) => (id === 'map-container' ? { getBoundingClientRect: () => ({ height: mcH, width: mcW }) } : null),
    getElementsByClassName: (c) => (c === 'data-legend generic-legend' ? legends : []),
    querySelector: () => null, body: { classList: { contains: () => false } },
  };
  const window = { innerHeight: mcH, innerWidth: mcW, matchMedia: () => ({ matches: false }) };
  installDevice(window);   /* (ui-layer-owner) js/ asks window.IntMapDevice now — the real owner, wired to this fake */
  const place = new Function('document', 'window', 'getComputedStyle', 'watchLegendSize',
    'ensureLegendOpacity', 'ensureContourSwitch', 'ensureContourDensity', 'ensureLegendMinimize', ...LGD,
    lift('legendShown', 'discoverLegends', 'placeLegends') + '\nreturn placeLegends;')(
    document, window, () => ({ display: 'block', getPropertyValue: () => '' }), () => {}, () => {}, () => {}, () => {}, () => {}, ...LGD.map(() => null));
  /* each pass is what the size observer asks for after the last one changed a size */
  const widths = []; let passes = 0;
  for (; passes < 40; passes++) { writes = 0; widths.push(legends[3].width); place(); if (!writes) break; }
  assert.ok(passes <= 3, `the edge-held box took ${passes} passes to settle (widths ${widths.join(' → ')}) — each pass moved it, and a move resized it`);
  const w = legends[3].width, r = px(legends[3].style.right), l = px(legends[3].style.left);
  const x0 = r != null ? mcW - r - w : l;
  assert.ok(x0 >= 0 && x0 + w <= mcW, `the edge-held box ended outside the map: ${x0}…${x0 + w} of ${mcW}`);
});

/* ── ⑤ no caller uses what the request returns ─────────────────────────────────────────────── */
test('⑤ no call site in js/ reads a value from tileLegends() — there is no placement to return yet', () => {
  const dir = join(ROOT, 'js');
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 50, 'js/ was not read');
  const bad = [];
  /* a call whose result flows somewhere: assigned, returned, passed, tested, or member-accessed.
     (`window._tileLegends&&window._tileLegends()` is the guard BEFORE the call, not a use of it.) */
  const CALL = String.raw`(?:window\._tileLegends|\btileLegends)\s*\(\s*\)`;
  const USE = new RegExp(String.raw`(?:(?:[^=!<>]=|\breturn|[(,?:]|\|\|)\s*${CALL})|(?:${CALL}\s*(?:\|\||&&|\.|\[|\?))`, 'g');
  let sites = 0;
  for (const f of files) {
    const src = codeOnly(readLF(join(dir, f)));
    sites += (src.match(new RegExp(CALL, 'g')) || []).length;
    for (const m of src.matchAll(USE)) bad.push(f + ':' + src.slice(0, m.index).split('\n').length + '  ' + m[0].trim());
  }
  assert.ok(sites > 40, `only ${sites} call sites were found — the scan is looking at nothing`);
  assert.deepEqual(bad, [], 'a caller reads what the request returns; ask discoverLegends() for the population instead');
});
