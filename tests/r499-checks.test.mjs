/* ============================================================================
 *  #R499 — 「スマホでの動作が重い」: five copies of one shape, and a predicate that let a phone out
 * ----------------------------------------------------------------------------
 *  #R498 removed a `getBoundingClientRect()` per touchmove from the long-press handler and a
 *  write→read→write sandwich from the crosshair task. Both were instances of ONE shape, and this
 *  branch carried five more of it — every place that turns a finger's CLIENT coordinates into the
 *  map's did it the same way:
 *
 *      const r = canvas.getBoundingClientRect();          // ← on every pointer event
 *      unproject([touch.clientX - r.left, touch.clientY - r.top]);
 *
 *  js/wheel-zoom.js's custom pinch (which ALSO drove `camera.easeTo` straight from the event, so a
 *  120 Hz digitiser ran the renderer's camera update twice per displayed frame), js/map-tools.js's
 *  `touchLL`, js/volume3d.js's two stroke handlers — and, on every CAMERA frame rather than every
 *  finger event, js/tool-panel.js's context menu, whose `place()` read the container, read a
 *  computed style, WROTE `maxHeight`, read the menu's own box — now forced — and wrote `left`/`top`.
 *  js/map-tooltip.js was the fifth: #R311 took the MAP's size off the pointer's path and left the
 *  TOOLTIP's on it, next to thirty-seven unguarded `style.display='block'` writes that made every
 *  one of those reads a forced one.
 *
 *  ⚠ THE ANSWER IS NOT "EVERY SITE SHOULD REMEMBER TO CACHE". #R498 measured what happens to an
 *  optimisation that is merely available: `setMapTooltipHTML` existed for eleven rounds and ONE of
 *  eight files used it. So the cache is in js/runtime.js — §5, `box(el)` — beside the frame loop
 *  whose entire purpose is that a layout is sampled once per frame, and ③/④ below are what keep the
 *  thirty-eighth direct write from being written.
 *
 *  ⑥ IS A DIFFERENT DEFECT WITH THE SAME VICTIM. `_imPhoneClass()` — #R232's predicate for "does
 *  this device have a phone's GPU and RAM budget" — was `(pointer:coarse) && !(any-pointer:fine)`.
 *  The second term was meant to exclude a touchscreen laptop, which the FIRST term already excludes
 *  (its primary pointer is the mouse). What it actually excluded was the phone that ALSO has a fine
 *  pointer: a Galaxy with the S Pen out, any phone with a Bluetooth mouse paired. Those took the
 *  DESKTOP budget — full devicePixelRatio, MSAA, an 8192² canvas, @2x tiles, per-frame marker
 *  occlusion, a 560-tile DEM cache — on phone silicon.
 *
 *  ⚠ EVERYTHING HERE THAT CAN BE RUN IS RUN. ①②③⑤⑥⑦ execute the shipped source — the real
 *  js/runtime.js and js/wheel-zoom.js as modules, js/map-tooltip.js in a vm, and the `place()` /
 *  `touchLL` / `_box` / `_imPhoneClass` regions cut out of their files — against fakes that COUNT
 *  the layout questions. A regex can say a call is gone from a line; only running it can say the
 *  gesture still ends where the finger did. ④ and ⑧ are the two claims no rig can make, and both
 *  read the source through `codeOnly` so this file's own prose can never be what they match (#R345).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { makeRuntime } from '../js/runtime.js';
import { makeWheelZoom } from '../js/wheel-zoom.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));
const CODE = (p) => codeOnly(R(p));

/** the source of the balanced region that starts at `i` (#R498's cutter, reused) */
function balanced(src, i, open, close) {
  let d = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === open) d++;
    else if (c === close) { d--; if (!d) return src.slice(i, j + 1); }
  }
  throw new Error('unbalanced from ' + i);
}

/* ⚠ js/runtime.js and js/wheel-zoom.js reach for `window`, `ResizeObserver` and
   `requestAnimationFrame` as BARE globals, because in the app they are. A node test has none of
   them, so the rig installs fakes on globalThis and takes them off again — a leak here would make
   the NEXT test in the file see another test's listeners. */
function withBrowserGlobals() {
  const prev = {
    window: globalThis.window, ResizeObserver: globalThis.ResizeObserver,
    requestAnimationFrame: globalThis.requestAnimationFrame,
  };
  const listeners = {}, ros = [], raf = [];
  globalThis.window = {
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener() { },
    visualViewport: null,
  };
  globalThis.ResizeObserver = class { constructor(fn) { this.fn = fn; ros.push(this); } observe() { } disconnect() { } };
  globalThis.requestAnimationFrame = (fn) => { raf.push(fn); return raf.length; };
  return {
    win: globalThis.window,
    fire: (t) => { for (const fn of (listeners[t] || []).slice()) fn(); },
    resized: () => { for (const r of ros.slice()) r.fn(); },
    flush: () => { const q = raf.splice(0, raf.length); for (const fn of q) fn(); return q.length; },
    pending: () => raf.length,
    restore() {
      for (const k of Object.keys(prev)) { if (prev[k] === undefined) delete globalThis[k]; else globalThis[k] = prev[k]; }
    },
  };
}

function countingEl(w = 390, h = 844, left = 12, top = 34) {
  const c = { n: 0 };
  return {
    counts: c,
    el: { getBoundingClientRect() { c.n++; return { left, top, width: w, height: h, right: left + w, bottom: top + h }; } },
  };
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ① js/runtime.js §5 — an element's box is measured once per layout, not once per caller
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
test('R499 ① RT.box() answers a thousand callers from one measurement', () => {
  const B = withBrowserGlobals();
  try {
    const RT = makeRuntime({});
    assert.equal(typeof RT.box, 'function', 'js/runtime.js no longer publishes box() — §5 is the register five files ask');
    const { el, counts } = countingEl();

    for (let i = 0; i < 1000; i++) RT.box(el);
    assert.equal(counts.n, 1, `the box was measured ${counts.n} times for 1000 questions`);
    assert.equal(RT.box(el).width, 390, 'the cached answer is the measured answer');
    assert.equal(RT.box(el), RT.box(el), 'two questions inside one layout get the SAME object, not two copies');
    /* a snapshot, not the live DOMRect: a caller that keeps it must not be handed something the
       next layout silently rewrites underneath it. */
    assert.equal(Object.getPrototypeOf(RT.box(el)), Object.prototype, 'box() must hand back a plain snapshot, not the live rect');
    assert.deepEqual(Object.keys(RT.box(el)).sort(), ['bottom', 'height', 'left', 'right', 'top', 'width']);
    assert.equal(RT.box(el).left, 12);
  } finally { B.restore(); }
});

test('R499 ① …and re-measures on every way the answer can change', () => {
  const B = withBrowserGlobals();
  try {
    const RT = makeRuntime({});
    const { el, counts } = countingEl();
    RT.box(el);
    assert.equal(counts.n, 1);

    /* ⚠ THE ONE THAT MAKES THIS EXACT RATHER THAN MERELY CAREFUL: a gesture cannot begin without a
       pointerdown/touchstart, so every drag starts from a fresh measurement and re-uses it. */
    for (const ev of ['pointerdown', 'touchstart', 'scroll', 'resize', 'orientationchange']) {
      const before = counts.n;
      B.fire(ev); RT.box(el); RT.box(el); RT.box(el);
      assert.equal(counts.n, before + 1, `${ev} did not invalidate the cached box (or invalidated it more than once)`);
    }
    /* the observer is the backstop for a size change nothing else announced */
    const before = counts.n;
    B.resized(); RT.box(el); RT.box(el);
    assert.equal(counts.n, before + 1, 'a ResizeObserver delivery did not invalidate the box');

    /* and the caller that changed the layout ITSELF, and cannot wait for the observer */
    const b2 = counts.n;
    RT.remeasure(el); RT.box(el);
    assert.equal(counts.n, b2 + 1, 'remeasure(el) did not force the next box() to measure');
  } finally { B.restore(); }
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ② js/wheel-zoom.js — the custom pinch, RUN
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
function pinchRig(sens) {
  const B = withBrowserGlobals();
  const L = {};
  const cvBox = countingEl(390, 844, 0, 0);
  const cv = Object.assign({}, cvBox.el, { addEventListener(t, fn) { (L[t] = L[t] || []).push(fn); } });
  const counts = { ease: 0, rect: cvBox.counts };
  let zoom = 10, last = null;
  const GEo = {
    hasRenderer: () => true,
    render: { canvasContainer: () => cv },
    input: { set() { }, setZoomRate() { } },
    camera: {
      getZoom: () => zoom, getMinZoom: () => 0, getMaxZoom: () => 22,
      easeTo(o) { counts.ease++; last = o; zoom = o.zoom; },
    },
    coords: { unproject: (p) => ({ lng: p[0], lat: p[1] }) },
    events: { once() { }, on() { } },
  };
  globalThis.window.imNavZoomSens = sens;
  const RT = makeRuntime({});
  globalThis.window.IntMapRuntime = RT;
  makeWheelZoom({}, { GE: () => GEo, i18n: {} });
  const fire = (t, touches) => { for (const fn of (L[t] || []).slice()) fn({ touches, cancelable: true, preventDefault() { } }); };
  return { B, fire, counts, RT, last: () => last, zoom: () => zoom, armed: () => !!L.touchmove };
}

/** two touches `d` pixels apart, centred on (195, 400) */
const spread = (d) => [{ clientX: 195 - d / 2, clientY: 400 }, { clientX: 195 + d / 2, clientY: 400 }];

test('R499 ② the sensitivity pinch measures the canvas once per gesture, not once per touchmove', () => {
  const rig = pinchRig(2);
  try {
    rig.B.fire('touchstart');                                  /* the window-level invalidation a real touch also causes */
    rig.fire('touchstart', spread(60));
    assert.equal(rig.counts.rect.n, 0, 'touchstart measured the canvas for a zoom it has not applied yet');

    for (let i = 1; i <= 36; i++) {
      rig.fire('touchmove', spread(60 + i * 4));
      if (i % 3 === 0) rig.B.flush();                          /* ~one displayed frame per three finger events */
    }
    assert.equal(rig.counts.rect.n, 1,
      `the canvas box was measured ${rig.counts.rect.n} times across one 36-move pinch — the per-event layout read is back`);
    assert.equal(rig.counts.ease, 12,
      `the camera was driven ${rig.counts.ease} times for 12 frames — the zoom is applied per FRAME, not per finger event`);
  } finally { rig.B.restore(); }
});

test('R499 ② …and the gesture still ends where the finger did', () => {
  const rig = pinchRig(2);
  try {
    rig.fire('touchstart', spread(100));
    rig.fire('touchmove', spread(200));
    assert.equal(rig.counts.ease, 0, 'a touchmove drove the camera synchronously again');
    rig.fire('touchend', []);
    assert.equal(rig.counts.ease, 1, 'the last pending zoom was dropped on touchend — the pinch ends on a stale value');
    /* the #R27 arithmetic, unchanged: z0 + log2(d/d0) * sens */
    assert.ok(Math.abs(rig.zoom() - (10 + Math.log2(200 / 100) * 2)) < 1e-9,
      `the pinch produced zoom ${rig.zoom()} — the sensitivity arithmetic moved`);
    /* the anchor is the midpoint, in CANVAS coordinates (the box's left/top subtracted) */
    assert.deepEqual(rig.last().around, { lng: 195, lat: 400 });
    assert.equal(rig.last().duration, 0);
  } finally { rig.B.restore(); }
});

test('R499 ② at the default sensitivity MapLibre still owns the pinch and this path costs nothing', () => {
  const rig = pinchRig(1);
  try {
    rig.fire('touchstart', spread(60));
    for (let i = 1; i <= 20; i++) rig.fire('touchmove', spread(60 + i * 5));
    rig.B.flush();
    assert.equal(rig.counts.ease, 0, 'the custom pinch engaged at sens=1 — #R27 leaves the default feel to the renderer');
    assert.equal(rig.counts.rect.n, 0, 'the custom pinch measured the canvas at sens=1');
  } finally { rig.B.restore(); }
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ③ js/map-tooltip.js — the tooltip's own size, RUN
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
function tooltipRig() {
  const counts = { size: 0, html: 0, disp: 0, mc: 0 };
  const style = new Proxy({}, { set(t, k, v) { if (k === 'display') counts.disp++; t[k] = v; return true; } });
  style.setProperty = () => { };
  const tip = {
    className: '', style, classList: { toggle() { } }, _h: '',
    get offsetWidth() { counts.size++; return 280; },
    get offsetHeight() { counts.size++; return 80; },
    set innerHTML(v) { counts.html++; this._h = v; }, get innerHTML() { return this._h; },
  };
  const container = { appendChild() { }, getBoundingClientRect() { counts.mc++; return { width: 390, height: 844 }; } };
  const g = {
    Math, console, Object,
    document: { createElement: () => tip, getElementById: (id) => (id === 'map-container' ? container : null) },
    ResizeObserver: class { constructor(fn) { this.fn = fn; } observe() { } disconnect() { } },
  };
  g.window = g;
  vm.createContext(g);
  vm.runInContext(R('js/map-tooltip.js'), g, { filename: 'map-tooltip.js' });
  const API = g.window.IntMapModules.mapTooltip();
  return { API, counts, tip, el: API.ensureMapTooltip() };
}

test('R499 ③ hovering one feature asks the tooltip for its size ONCE, not once per pointer event', () => {
  const rig = tooltipRig();
  rig.API.showMapTooltip(rig.el);
  rig.API.setMapTooltipHTML(rig.el, '<b>Tokyo</b>');
  for (let i = 0; i < 60; i++) rig.API.positionTooltip({ x: 100 + i, y: 200 + i });
  assert.equal(rig.counts.size, 2,
    `offsetWidth/offsetHeight were read ${rig.counts.size} times across 60 pointer events — one measurement is two reads`);

  /* the same markup is not a new size, and #R311's setter already refuses to rewrite it */
  rig.API.setMapTooltipHTML(rig.el, '<b>Tokyo</b>');
  for (let i = 0; i < 60; i++) rig.API.positionTooltip({ x: 300, y: 300 });
  assert.equal(rig.counts.size, 2, 'identical markup invalidated the size cache');
  assert.equal(rig.counts.html, 1, 'identical markup was written to the DOM again (#R311)');

  /* NEW markup is exactly what does change it */
  rig.API.setMapTooltipHTML(rig.el, '<b>Ōsaka</b><br>a much taller card');
  rig.API.positionTooltip({ x: 10, y: 10 });
  assert.equal(rig.counts.size, 4, 'new markup did not re-measure the tooltip — it would be placed at the old size');
});

test('R499 ③ the display write happens on the edge, and re-measures when it does', () => {
  const rig = tooltipRig();
  for (let i = 0; i < 40; i++) rig.API.showMapTooltip(rig.el);
  assert.equal(rig.counts.disp, 1, `display was written ${rig.counts.disp} times to say "block" forty times`);
  for (let i = 0; i < 40; i++) rig.API.hideMapTooltip(rig.el);
  assert.equal(rig.counts.disp, 2, 'display was written more than once to say "none" forty times');

  /* an element that was display:none has no size, so becoming visible must re-measure */
  rig.API.setMapTooltipHTML(rig.el, '<i>x</i>');
  rig.API.positionTooltip({ x: 1, y: 1 });
  const at = rig.counts.size;
  rig.API.showMapTooltip(rig.el);
  rig.API.positionTooltip({ x: 1, y: 1 });
  assert.equal(rig.counts.size, at + 2, 'becoming visible did not re-measure — the placement would use the hidden size');

  /* null is the shape every call site passes when the tooltip has never been built */
  assert.doesNotThrow(() => { rig.API.showMapTooltip(null); rig.API.hideMapTooltip(null); });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ④ nobody writes the tooltip's `display` by hand any more — and thirty-seven sites prove adoption
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
test('R499 ④ the map tooltip is shown and hidden through ONE guarded setter', () => {
  const files = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js') && f !== 'map-tooltip.js');
  const offenders = [];
  let adopters = 0, sites = 0;
  for (const f of files) {
    const src = CODE('js/' + f);
    src.split('\n').forEach((line, i) => {
      if (!/(ensureMapTooltip|mapTooltipEl)/.test(line)) return;
      if (/\.style\.display\s*=/.test(line)) offenders.push(`js/${f}:${i + 1}  ${line.trim().slice(0, 120)}`);
    });
    const n = (src.match(/\b(show|hide)MapTooltip\s*\(/g) || []).length;
    if (n) { adopters++; sites += n; }
  }
  assert.deepEqual(offenders, [],
    'a direct display write on the map tooltip is a forced layout on the next positionTooltip — use window.showMapTooltip / hideMapTooltip:\n' + offenders.join('\n'));
  /* ⚠ #R498's lesson stated as a number. `setMapTooltipHTML` was available for eleven rounds and
     ONE file of eight used it, so "the helper exists" is not the claim worth holding — "every site
     that had the defect uses it" is. */
  assert.ok(sites >= 37, `only ${sites} call sites use the guarded setter; the conversion covered 37`);
  assert.ok(adopters >= 7, `only ${adopters} files adopted it; the defect was spread over 7`);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ js/tool-panel.js — the context menu's placement, RUN on repeated camera frames
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
function placeRig() {
  const src = CODE('js/tool-panel.js');
  const h0 = src.indexOf('let _mq, _cover=');
  const h1 = src.indexOf('function showContextMenu');
  assert.ok(h0 > 0 && h1 > h0, 'the #R499 helper block is no longer where this check cuts it out of js/tool-panel.js');
  const helpers = src.slice(h0, h1);
  const p0 = src.indexOf('function place(){');
  assert.ok(p0 > 0, 'place() is no longer a named function in js/tool-panel.js');
  const place = 'function place()' + balanced(src, src.indexOf('{', p0), '{', '}');

  const counts = { rect: 0, style: 0, write: 0 };
  const mkStyle = () => {
    const t = { getPropertyValue: () => '' };
    return new Proxy(t, { set(o, k, v) { counts.write++; o[k] = v; return true; } });
  };
  const menu = { style: mkStyle(), getBoundingClientRect() { counts.rect++; return { left: 0, top: 0, width: 220, height: 300 }; } };
  const mcEl = { style: { getPropertyValue: () => '80px' }, getBoundingClientRect() { counts.rect++; return { left: 0, top: 0, width: 390, height: 844 }; } };
  const g = {
    Math, console, Object, parseFloat,
    document: { getElementById: (id) => (id === 'map-container' ? mcEl : menu), body: { className: '' } },
    getComputedStyle: () => { counts.style++; return { getPropertyValue: () => '80px' }; },
    ResizeObserver: class { constructor(fn) { this.fn = fn; } observe() { } disconnect() { } },
    matchMedia: () => ({ matches: true }),
  };
  g.window = g;
  g.window.matchMedia = g.matchMedia;
  g.window.IntMapGeoEngine = { coords: { project: () => ({ x: 40, y: 60 }) } };
  vm.createContext(g);
  vm.runInContext(`${helpers}
    globalThis.__mkPlace = function(m, mc0, point, lngLat){ let mc = mc0; ${place} return place; };
    globalThis.__rt = _rt;`, g, { filename: 'tool-panel-place.js' });
  const RTB = withBrowserGlobals();
  const RT = makeRuntime({});
  g.window.IntMapRuntime = RT;
  const first = RT.box(mcEl);
  return { counts, RTB, RT, menu, place: g.__mkPlace(menu, first, { x: 40, y: 60 }, { lng: 1, lat: 2 }) };
}

test('R499 ⑤ the open context menu costs the camera nothing per frame', () => {
  const rig = placeRig();
  try {
    rig.place();                                   /* the frame it opens on: it measures */
    const rect0 = rig.counts.rect, style0 = rig.counts.style, write0 = rig.counts.write;
    assert.ok(rect0 >= 1 && style0 === 1, 'the first placement must actually measure and read the sheet cover');

    for (let i = 0; i < 120; i++) rig.place();     /* two seconds of panning with the menu open */

    assert.equal(rig.counts.rect, rect0, `${rig.counts.rect - rect0} layout reads across 120 camera frames`);
    assert.equal(rig.counts.style, style0, `${rig.counts.style - style0} computed-style reads across 120 camera frames`);
    assert.equal(rig.counts.write, write0, `${rig.counts.write - write0} style writes across 120 camera frames that changed nothing`);
  } finally { rig.RTB.restore(); }
});

test('R499 ⑤ …and it still moves when the point it is pinned to moves', () => {
  const rig = placeRig();
  try {
    rig.place();
    assert.equal(rig.menu.style.left, '40px');
    assert.equal(rig.menu.style.top, '60px');
    /* the anchor is re-projected every frame — that is #R210's whole point and it is renderer
       arithmetic, not a DOM question */
    rig.RTB.win.IntMapGeoEngine = null;
    rig.place();
    assert.equal(rig.menu.style.left, '40px', 'the placement stopped following the projected point');
  } finally { rig.RTB.restore(); }
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ js/app-body.js — a phone with a stylus is still a phone
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
function phoneClass() {
  const line = CODE('js/app-body.js').split('\n').find((l) => l.includes('const _imPhoneClass='));
  assert.ok(line, '_imPhoneClass is no longer declared on one line in js/app-body.js');
  const g = { Math, console };
  g.window = g;
  vm.createContext(g);
  vm.runInContext(`function isMobile(){ return 'FELL BACK'; }
    ${line.trim()}
    globalThis.__ask = function(q){
      window.matchMedia = (s) => ({ matches: !!q[s] });
      window.screen = q.screen;
      return _imPhoneClass();
    };`, g, { filename: 'phone-class.js' });
  return g.__ask;
}

test('R499 ⑥ a fine pointer IN ADDITION to a coarse one no longer buys the desktop budget', () => {
  const ask = phoneClass();
  const PHONE = { width: 412, height: 915 }, TABLET = { width: 820, height: 1180 }, DESK = { width: 2560, height: 1440 };

  /* the report: a phone whose stylus or paired mouse makes `any-pointer:fine` true */
  assert.equal(ask({ '(pointer:coarse)': true, '(any-pointer:fine)': true, screen: PHONE }), true,
    'a phone with an S Pen or a Bluetooth mouse still takes the desktop budget');
  /* …in landscape too: the SMALLER dimension is the device's, whichever way it is held */
  assert.equal(ask({ '(pointer:coarse)': true, '(any-pointer:fine)': true, screen: { width: 915, height: 412 } }), true,
    'the same phone held sideways answers differently');

  /* and the two answers that must NOT move */
  assert.equal(ask({ '(pointer:coarse)': true, '(any-pointer:fine)': false, screen: PHONE }), true, 'a plain phone');
  assert.equal(ask({ '(pointer:coarse)': true, '(any-pointer:fine)': false, screen: TABLET }), true,
    'a tablet lost the phone budget — the new clause may only ADD devices, never remove one');
  assert.equal(ask({ '(pointer:coarse)': false, '(any-pointer:fine)': true, screen: DESK }), false,
    'a desktop took the phone budget');
  assert.equal(ask({ '(pointer:coarse)': false, '(any-pointer:coarse)': true, '(any-pointer:fine)': true, screen: DESK }), false,
    'a touchscreen laptop took the phone budget — its PRIMARY pointer is the mouse');
  /* a coarse-primary machine with a fine pointer and a big screen is a desktop in tablet mode */
  assert.equal(ask({ '(pointer:coarse)': true, '(any-pointer:fine)': true, screen: DESK }), false,
    'a 2560 px screen took the phone budget');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ⑦ js/map-tools.js and js/volume3d.js — the two remaining client→canvas converters
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
function cutFn(file, name) {
  const src = CODE(file);
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i > 0, `${name}() is no longer a named function in ${file}`);
  return 'function ' + name + balanced(src, src.indexOf('(', i), '(', ')') + ' ' + balanced(src, src.indexOf('{', src.indexOf('(', i)), '{', '}');
}

test('R499 ⑦ a drawn stroke measures the canvas once per gesture, in both tools', () => {
  const B = withBrowserGlobals();
  try {
    const RT = makeRuntime({});
    globalThis.window.IntMapRuntime = RT;

    for (const [file, name, call] of [
      ['js/map-tools.js', 'touchLL', (f, cv) => f({ clientX: 100, clientY: 200 })],
      ['js/volume3d.js', '_box', (f, cv) => f(cv)],
    ]) {
      const { el: cv, counts } = countingEl(390, 844, 12, 34);
      const g = { Math, console, Object };
      g.window = globalThis.window;
      g.IntMapGeoEngine = { render: { canvas: () => cv }, coords: { unproject: (p) => ({ lng: p[0], lat: p[1] }) } };
      vm.createContext(g);
      vm.runInContext(`const GE=()=>IntMapGeoEngine; function _canvas(){ return IntMapGeoEngine.render.canvas(); }
        ${cutFn(file, name)}
        globalThis.__fn = ${name};`, g, { filename: file });

      for (let i = 0; i < 50; i++) call(g.__fn, cv);
      assert.equal(counts.n, 1, `${file} ${name}() measured the canvas ${counts.n} times across 50 pointer events`);
      B.fire('touchstart');
      call(g.__fn, cv);
      assert.equal(counts.n, 2, `${file} ${name}() did not take a fresh measurement at the start of the next gesture`);
    }
  } finally { B.restore(); }
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ⑨ js/data-layers.js tileLegends() — every height read before the first position written
   ══════════════════════════════════════════════════════════════════════════════════════════════
   THE SITE --attribute NAMED. 5,724 of the 5,852 `getBoundingClientRect` calls in one eight-second
   finger pan (phone profile, weather + warnings on) came from one line of this function's `mobile`
   branch — because it placed a legend and then measured it, N times, and thirty-one sites call it.
   The rig below records the ORDER of reads and writes, which is the only thing that distinguishes
   a forced layout from a cheap one. */
function tilerRig({ mobile = true, n = 4 } = {}) {
  const log = [];
  const mk = (id) => {
    const style = new Proxy({}, {
      set(t, k, v) { log.push('w'); t[k] = v; return true; },
      get(t, k) { return t[k]; },
    });
    return { id, style, dataset: {}, classList: { contains: () => false, add() { }, toggle: () => false },
      querySelector: () => null, appendChild() { }, children: [],
      getBoundingClientRect() { log.push('r'); return { height: 100, width: 178 }; } };
  };
  const boxes = Array.from({ length: n }, (_, i) => { const e = mk('lgd' + i); e.style.display = 'block'; return e; });
  log.length = 0;   /* the `display` writes above are the rig's, not the tiler's */

  const src = CODE('js/data-layers.js');
  const i = src.indexOf('function tileLegends(){');
  assert.ok(i > 0, 'tileLegends() is no longer a named function in js/data-layers.js');
  const fn = 'function tileLegends()' + balanced(src, src.indexOf('{', i), '{', '}');

  const g = { Math, console, Object, Array, parseFloat, isFinite, String, Number };
  g.window = g;
  g.window.innerHeight = 844;
  g.window.matchMedia = (q) => ({ matches: mobile && /max-width:768px/.test(q) });
  g.window.IntMapRuntime = null;
  g.document = {
    body: { classList: { contains: () => false } },
    getElementById: () => null,
    querySelectorAll: () => [],
  };
  vm.createContext(g);
  vm.runInContext(`let lgdHDI,lgdDem,lgdPop,lgdEEZ,lgdThermal,lgdRadar,lgdSST,lgdPopGrid,lgdRelief,lgdSeaLevel,lgdGdppc,lgdTfr,lgdMil,lgdMilGDP,lgdSnow,lgdAod,lgdNightsat;
    function ensureLegendOpacity(){} function ensureContourSwitch(){} function ensureContourDensity(){} function ensureLegendMinimize(){}
    globalThis.__setBoxes = (b) => { [lgdHDI,lgdDem,lgdPop,lgdEEZ]=b; };
    ${fn}
    globalThis.__tile = tileLegends;`, g, { filename: 'data-layers-tile.js' });
  g.__setBoxes(boxes);
  return { log, tile: g.__tile, boxes };
}

test('R499 ⑨ the legend tiler reads every height before it writes the first position', () => {
  const rig = tilerRig({ n: 4 });
  rig.tile();
  const s = rig.log.join('');
  assert.ok(/^r+w+$/.test(s),
    `the tiler interleaved reads and writes — ${s}\n`
    + 'a write between two reads is a forced synchronous layout, once per legend, on every one of the '
    + 'thirty-one call sites');
  assert.equal((s.match(/r/g) || []).length, 4, 'one height per visible legend, and no more');
});

test('R499 ⑨ …and a call that changes nothing writes nothing', () => {
  const rig = tilerRig({ n: 4 });
  rig.tile();
  const writes = rig.log.filter((c) => c === 'w').length;
  assert.ok(writes > 0, 'the first call must actually place the legends');
  rig.log.length = 0;
  for (let i = 0; i < 30; i++) rig.tile();
  assert.equal(rig.log.filter((c) => c === 'w').length, 0,
    'thirty repeat calls rewrote positions that had not moved — a write invalidates layout even when '
    + 'it assigns the string that was already there (#R311), which is what made the reads forced');
  /* …and the stack is still a stack: 64, 64+108, 64+216, 64+324 (#R15d's origin and gap) */
  assert.deepEqual(rig.boxes.map((b) => b.style.top), ['64px', '172px', '280px', '388px']);
  assert.deepEqual(rig.boxes.map((b) => b.style.left), ['6px', '6px', '6px', '6px']);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ⑩ js/world-packs.js — the warning rotation, RUN against a feed that answers nothing
   ══════════════════════════════════════════════════════════════════════════════════════════════
   WHAT --attribute FOUND ONE FRAME DEEPER. The 6,090 calls of ⑨ arrived through `panel.open()`,
   3,045 times in eight seconds, and the reason is here: both rotations order by a clock that only
   a SUCCESSFUL read writes, and the batch's own finaliser calls the pump again. A feed that fails
   therefore never advances anything, the next `maNext()` returns the same countries, and the loop
   turns at microtask speed — with a full panel re-render on every turn, because each `.catch` ends
   with `showPanel()`. This is what a phone in a tunnel does. */
/* ⚠ `failFor` is a HARD CAP, not a scenario knob. Against the pre-#R499 source this rig's feed
   never stops failing and the pump never stops re-firing, so an unbounded fake would hang the test
   runner instead of failing it — and a counter-proof you cannot run is not a counter-proof (#R498).
   After the cap the feed answers, which terminates the old loop and leaves the count as the finding. */
function pumpRig({ nCountries = 30, failFor = 400 } = {}) {
  const src = CODE('js/world-packs.js');
  const cut = (marker, kind) => {
    const i = src.indexOf(marker);
    assert.ok(i > 0, `js/world-packs.js no longer contains ${JSON.stringify(marker)}`);
    return marker.startsWith('function')
      ? src.slice(i, src.indexOf('{', i)) + balanced(src, src.indexOf('{', i), '{', '}')
      : kind;
  };
  const r0 = src.indexOf('const RETRY_MS=');
  const r1 = src.indexOf('let swicMetaBusy', r0);
  assert.ok(r0 > 0 && r1 > r0, 'the #R499 back-off block is no longer where this check cuts it out');
  const backoff = src.slice(r0, r1);

  const calls = [];
  let clock = 1_000_000;
  const g = { Math, console: { warn() { } }, Object, Array, Date: { now: () => clock }, String, Number, isFinite };
  g.window = g;
  vm.createContext(g);
  const ISO = Array.from({ length: nCountries }, (_, i) => 'C' + i);
  vm.runInContext(`
    const MA = {}; ${JSON.stringify(ISO)}.forEach(k => { MA[k] = 1; });
    const maData = {}, maAt = {}, maAsked = [];
    const maPend = Object.create(null), swicPend = Object.create(null);
    const MIN_AGE_MS = 15000, MA_PER_TICK = 6, MA_SLOTS = 6, COLD_CALLS = 10;
    const FEED_STATE = {};
    let on = true, maBusy = 0;
    function inViewISO(){ return false; }
    function viewFirst(list){ const a=[],b=[]; list.forEach(k=>{ (inViewISO(k)?a:b).push(k); }); return a.concat(b); }
    function feedOK(){} function publish(){} function showPanel(){ globalThis.__renders++; }
    const panel = { shown: () => true };
    const maCold = () => Object.keys(MA).some(k => !maData[k]);
    function loadMA(b){
      globalThis.__calls.push(b.slice());
      if (globalThis.__calls.length > globalThis.__failFor || globalThis.__warm) {
        b.forEach(k => { maData[k] = 1; maAt[k] = Date.now(); });
        return Promise.resolve();
      }
      /* ⚠ A FAILING RE-READ LEAVES THE DATA WHERE IT WAS. That is the shape 'does it hold data'
         got wrong: a country read successfully a minute ago still holds data when today's read
         fails, so only its SUCCESS CLOCK can say whether this read arrived. */
      return Promise.reject(new Error('offline'));
    }
    ${backoff}
    ${cut('function maNext(n){')}
    ${cut('function pumpMA(){')}
    globalThis.__pump = pumpMA;
    globalThis.__tick = (ms) => { globalThis.__clock(ms); };
    globalThis.__state = () => ({ busy: maBusy, tries: Object.keys(maTry).length });
  `, g, { filename: 'world-packs-pump.js' });
  g.__calls = calls; g.__failFor = failFor; g.__renders = 0; g.__warm = false;
  g.__clock = (ms) => { clock += ms; };
  return { g, calls, advance: (ms) => { clock += ms; }, renders: () => g.__renders, warm: (v) => { g.__warm = v; } };
}
const drain = async (n = 3000) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

test('R499 ⑩ a warning feed that answers nothing costs ONE round of attempts, not a hot loop', async () => {
  const rig = pumpRig({ nCountries: 30 });
  rig.g.__pump();
  await drain();
  assert.equal(rig.calls.length, 5,
    `the rotation issued ${rig.calls.length} batches for 30 countries that all failed — 5 batches of 6 is one `
    + 'pass; anything more is the pump re-firing from its own finaliser on countries whose clock never moved');
  assert.ok(rig.renders() <= 5, `the panel was re-rendered ${rig.renders()} times by one failed pass`);

  /* nothing more happens while the back-off holds … */
  rig.g.__pump(); await drain();
  assert.equal(rig.calls.length, 5, 'a pump inside the back-off window asked again anyway');
  /* … and the country IS asked again once it expires — a back-off is not a give-up */
  rig.advance(2500);
  rig.g.__pump(); await drain();
  assert.ok(rig.calls.length > 5, 'the rotation never retried after the back-off expired');
});

test('R499 ⑩ a country that answered YESTERDAY and fails TODAY does not spin either', async () => {
  const rig = pumpRig({ nCountries: 12 });
  /* every country warm and read once */
  rig.warm(true);
  rig.g.__pump(); await drain();
  const warmCalls = rig.calls.length;
  assert.ok(warmCalls >= 2, 'the warm pass must have read them');

  /* the feed goes away. `maData` still holds yesterday's answer for all twelve, and the MIN_AGE_MS
     gate has expired — so "does it hold data" would clear every back-off and re-enter the loop. */
  rig.warm(false);
  rig.advance(60_000);
  rig.g.__pump(); await drain();
  const n = rig.calls.length - warmCalls;
  assert.ok(n > 0 && n <= 2, `${n} batches for 12 warm countries whose re-read failed — the loop is back`);
});

test('R499 ⑩ …and a feed that recovers goes straight back to the normal rotation', async () => {
  const rig = pumpRig({ nCountries: 12, failFor: 1 });   /* the first batch fails, the rest answer */
  rig.g.__pump();
  await drain();
  /* 12 countries, 6 per batch: batch 1 fails, batch 2 succeeds; the failed six come back after the
     first back-off step and succeed then. Nothing spins in between. */
  assert.ok(rig.calls.length >= 2 && rig.calls.length <= 4,
    `${rig.calls.length} batches for 12 countries with one failure`);
  rig.advance(2500);
  rig.g.__pump(); await drain();
  const flat = rig.calls.flat();
  assert.equal(new Set(flat).size, 12, 'not every country was read once the feed came back');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ⑪ js/world-packs.js makePanel().open() — the guard skips the layout, never the body
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
function panelRig() {
  const src = CODE('js/world-packs.js');
  const i = src.indexOf('function panelNames(');
  const j = src.indexOf('function makePanel(');
  assert.ok(i > 0 && j > i, 'panelNames / makePanel are no longer where this check cuts them out');
  const fns = src.slice(i, src.indexOf('{', j)) + balanced(src, src.indexOf('{', j), '{', '}');

  const counts = { register: 0, tile: 0, html: 0, minimize: 0 };
  const body = { className: 'wp-body', style: {}, set innerHTML(v) { counts.html++; this._h = v; }, get innerHTML() { return this._h; } };
  const el = {
    id: 'data-legend-x', style: {}, classList: { _s: new Set(), add(c) { this._s.add(c); }, contains(c) { return this._s.has(c); } },
    querySelector: (q) => (q === '.wp-body' ? (el._hasBody ? body : null) : null),
    appendChild() { el._hasBody = true; }, insertBefore() { el._hasBody = true; },
    _hasBody: false,
  };
  const g = { Math, console, Object, Array, String };
  g.window = g;
  g.document = { getElementById: (id) => (id === 'data-legend-x' ? el : null), createElement: () => body };
  g.window._registerLayerOpacity = () => { counts.register++; el.style.display = 'block'; return el; };
  g.window._tileLegends = () => { counts.tile++; };
  g.window._ensureLegendMinimize = () => { counts.minimize++; };
  vm.createContext(g);
  vm.runInContext(`${fns}
    globalThis.__panel = makePanel('x', () => 'X', 'cb-x', { legendId:'x', layers:() => ['a','b'] });`,
  g, { filename: 'world-packs-panel.js' });
  return { P: g.__panel, counts, el, body };
}

test('R499 ⑪ re-rendering the same panel stops moving the legend column', () => {
  const rig = panelRig();
  rig.P.open('<i>one warning in force</i>');
  assert.equal(rig.counts.tile, 1, 'the first open must place the legend');
  assert.equal(rig.counts.register, 1);

  for (let i = 0; i < 200; i++) rig.P.open('<i>one warning in force</i>');
  assert.equal(rig.counts.tile, 1,
    `the legend column was re-laid-out ${rig.counts.tile} times for 201 identical renders — and each one of `
    + 'those is a getBoundingClientRect per legend on the map');
  assert.equal(rig.counts.register, 1, 'identical opacity targets were re-registered');

  /* ⚠ AND THE BODY IS STILL REWRITTEN EVERY TIME. `wireControls` attaches with addEventListener and
     has never leaked only because innerHTML replaced the buttons; handing the same nodes back would
     stack a listener per automatic re-render. */
  assert.equal(rig.counts.html, 201, `the body was written ${rig.counts.html} times for 201 renders`);

  /* a body that really changed still re-places the column */
  rig.P.open('<i>two warnings in force</i>');
  assert.equal(rig.counts.tile, 2, 'new markup did not re-place the legends — a taller box would overlap');
});

test('R499 ⑪ …and closing it forgets that it was showing this', () => {
  const rig = panelRig();
  rig.P.open('<b>x</b>');
  rig.P.hide();
  rig.P.open('<b>x</b>');
  assert.equal(rig.counts.tile, 2, 'a panel re-opened after being closed was treated as already showing');
  assert.equal(rig.counts.register, 2);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ⑧ scripts/mobile-trace.mjs — the counter can now name a caller, and does not by default
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
test('R499 ⑧ --attribute exists, is off by default, and does not change what is counted', () => {
  const src = CODE('scripts/mobile-trace.mjs');
  assert.match(src, /const ATTRIB = has\('--attribute'\)/, 'the flag is gone');
  assert.match(src, /touchMetersOn\(page, ATTRIB\)/, 'the flag never reaches the meter');
  /* ⚠ THE COUNTS MUST NOT DEPEND ON IT. `new Error().stack` per call costs far more than the call
     being measured, so an --attribute run's lat/busy/fps are the instrument's; the rect/style
     totals are the app's either way, and stay outside the `if`. */
  const m = src.match(/Element\.prototype\.getBoundingClientRect = function \(\) \{[^}]*\}/);
  assert.ok(m, 'the rect wrapper is no longer where this check reads it');
  assert.match(m[0], /__imTouch\.rect\+\+/, 'the wrapper stopped counting');
  assert.ok(!/if \(ATTR\)[^\n]*rect\+\+/.test(src), 'the count was made conditional on --attribute');
  /* and the printout says so, rather than leaving a reader to compare an --attribute run with a
     normal one and wonder why the latency doubled */
  assert.match(src, /only the counts transfer/, 'the caveat on an --attribute run is not printed');
});
