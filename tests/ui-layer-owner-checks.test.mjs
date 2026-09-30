/* ui-layer-owner — the two owners of the screen's shape, EVALUATED (no browser):
   ① js/ui-stack.js (window.IntMapStack) — the floating windows' order stays inside the `window`
     layer and under an open sidebar however many there are; the ONE capture listener orders the
     windows a pointerdown lands in and moves `.im-front`; a dialog above the band is never marked
     (#R508); the mark lands on the outermost stacking context, not inside a trapped one (#824);
     the map shell is never a panel (#R255); `clipOf` finds the #823 cut and ignores what overflow
     cannot reach; and every number it compares with is READ from css/intmap.css.
   ② js/ui-device.js (window.IntMapDevice) — one layout boundary (768 is the phone, 769 is not),
     a phone held sideways keeps the desktop layout AND the phone budget, the four device kinds,
     #R499's budget cases, and the classes kept on <body>.
   ③ the gates hold on the real tree: no 767/768 split, the boundary and the safe area written only
     by their owners (or declared), no bare z-index number without a reason, no unknown layer.
   tests/map-a11y-structure.spec.js ⑤⑥ and tests/r668.spec.js carry what needs a page. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { tokens, resolveValue, check as zCheck, layerNamesUsed } from '../scripts/z-layers.mjs';
import { check as uiCheck, countSplit, countBreakpoints, countSafeArea } from '../scripts/ui-owners.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const TOK = tokens(read('css/intmap.css'));
const LV = (name) => TOK['--z-' + name];

/* ── a DOM just large enough for the owner: elements with computed styles, rects and selectors ── */
function fakeDom() {
  const all = [];
  const listeners = {};
  class CL {
    constructor() { this.s = new Set(); }
    add(c) { this.s.add(c); } remove(c) { this.s.delete(c); } contains(c) { return this.s.has(c); }
    toggle(c, on) { if (on === undefined) on = !this.s.has(c); if (on) this.s.add(c); else this.s.delete(c); return on; }
  }
  const one = (el, sel) => {
    sel = sel.trim();
    if (sel.startsWith('#')) return el.id === sel.slice(1);
    if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
    return el.tag === sel;
  };
  function el(tag, opts = {}, parent) {
    const e = {
      tag, id: opts.id || '', classList: new CL(), style: {}, isConnected: true,
      parentElement: parent || null, cs: Object.assign({ position: 'static', zIndex: 'auto', transform: 'none', filter: 'none', opacity: '1', overflowX: 'visible', overflowY: 'visible' }, opts.cs || {}),
      rect: opts.rect || { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 },
      matches(sel) { return sel.split(',').some((s) => one(this, s)); },
      closest(sel) { for (let n = this; n; n = n.parentElement) if (n.matches(sel)) return n; return null; },
      getBoundingClientRect() { return this.rect; },
    };
    (opts.cls || []).forEach((c) => e.classList.add(c));
    all.push(e);
    return e;
  }
  const html = el('html');
  const body = el('body', {}, html);
  const document = {
    documentElement: html, body,
    querySelectorAll(sel) { return { forEach: (fn) => all.filter((e) => e.matches(sel)).forEach(fn) }; },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  };
  const getComputedStyle = (e) => {
    if (e === html) return { getPropertyValue: (k) => (TOK[k] != null ? String(TOK[k]) : '') };
    /* an inline z-index the owner wrote is what the browser would compute — resolved from the layers */
    const z = e.style.zIndex ? String(resolveValue(e.style.zIndex, TOK)) : e.cs.zIndex;
    const front = e.classList.contains('im-front') ? String(LV('front')) : null;
    return Object.assign({}, e.cs, { zIndex: front || z });
  };
  const fire = (type, target) => (listeners[type] || []).forEach((fn) => fn({ target }));
  return { el, html, body, document, getComputedStyle, fire, listeners };
}
function loadStack(dom) {
  const g = { document: dom.document, getComputedStyle: dom.getComputedStyle, Math, Number, Set, parseInt };
  g.window = g;
  vm.createContext(g);
  vm.runInContext(read('js/ui-stack.js'), g, { filename: 'ui-stack.js' });
  return g.IntMapStack;
}

/* ── ① the stacking owner ─────────────────────────────────────────────────────────────────────── */
test('① the layers the owner reads are in the order the band needs, and it reads them from the stylesheet', () => {
  for (const n of ['popup', 'window', 'menu', 'shell-front', 'front', 'toast', 'modal']) assert.ok(Number.isInteger(LV(n)), '--z-' + n + ' is not defined');
  assert.ok(LV('popup') <= LV('window') && LV('window') < LV('shell-front'), 'windows must sit under an open sidebar');
  assert.ok(LV('shell-front') < LV('front'), 'the panel being used must rise above the open sidebar');
  assert.ok(LV('front') < LV('modal') - 1, 'a dialog (9999) must stay above the panel being used');
  /* the stylesheet applies those very tokens — the number exists once */
  const css = read('css/intmap.css');
  assert.match(css, /\.im-front\{\s*z-index:var\(--z-front\)\s*!important/);
  assert.match(css, /body:not\(\.im-float-front\) #layer-sidebar-r\{\s*z-index:var\(--z-shell-front\)/);
  const dom = fakeDom(); const S = loadStack(dom);
  assert.equal(S.level('front'), LV('front'));
  assert.equal(S.z('popup'), 'var(--z-popup)');
  assert.equal(S.z('window', 3), 'calc(var(--z-window) + 3)');
  assert.equal(S.z('modal', -1), 'calc(var(--z-modal) - 1)');
  /* no integer in the owner's code is a level: every z it writes goes through z() */
  const src = codeOnly(read('js/ui-stack.js'), { parser: 'acorn' });
  assert.doesNotMatch(src,/\b(2200|2599|2600|2650)\b/, 'a band edge was copied into the owner instead of read');
});

test('① windows are ordered by touch, inside the window band, under the sidebar however many there are', () => {
  const dom = fakeDom(); const S = loadStack(dom);
  const wins = Array.from({ length: 3 }, (_, i) => dom.el('div', { id: 'w' + i, cs: { position: 'fixed' } }, dom.body));
  wins.forEach((w) => S.register(w));
  const zOf = (w) => resolveValue(w.style.zIndex, TOK);
  S.order(wins[0]); S.order(wins[1]); S.order(wins[2]); S.order(wins[0]);
  assert.ok(zOf(wins[0]) > zOf(wins[2]) && zOf(wins[2]) > zOf(wins[1]), 'the last touched window is on top');
  for (const w of wins) assert.ok(zOf(w) > LV('window') && zOf(w) < LV('shell-front'), `a window left the band: ${zOf(w)}`);
  /* the #R258 shape: a counter that climbs past the sidebar. Five hundred windows still end below it. */
  const many = Array.from({ length: 500 }, () => dom.el('div', { cs: { position: 'fixed' } }, dom.body));
  many.forEach((w) => S.order(w));
  assert.ok(many.every((w) => zOf(w) < LV('shell-front')), 'a window climbed over the open sidebar');
});

test('① one pointerdown orders the windows it is inside (innermost on top) and marks the outermost panel', () => {
  const dom = fakeDom(); const S = loadStack(dom); S.wire();
  const outer = dom.el('div', { id: 'outer', cs: { position: 'fixed', zIndex: '2200' } }, dom.body);
  const inner = dom.el('div', { id: 'inner', cs: { position: 'absolute', zIndex: '5' } }, outer);
  const btn = dom.el('button', {}, inner);
  S.register(outer); S.register(inner);
  dom.fire('pointerdown', btn);
  assert.ok(resolveValue(inner.style.zIndex, TOK) > resolveValue(outer.style.zIndex, TOK), 'the inner window is under the outer one');
  assert.ok(dom.body.classList.contains('im-float-front'), 'the sidebars were not dropped behind the panel in use');
  assert.ok(outer.classList.contains('im-front') && !inner.classList.contains('im-front'),
    'the mark is on the inner element, trapped inside the outer stacking context (#824)');
  /* the pointer goes back to the sidebar: the sidebar is in front again, and nothing is marked */
  const sb = dom.el('div', { id: 'sidebar', cls: ['sidebar'], cs: { position: 'relative', zIndex: '1000' } }, dom.body);
  dom.fire('pointerdown', dom.el('span', {}, sb));
  assert.ok(!dom.body.classList.contains('im-float-front') && !outer.classList.contains('im-front'));
});

test('① #824: a result list inside a fixed, z-indexed pill marks the pill', () => {
  const dom = fakeDom(); const S = loadStack(dom); S.wire();
  const pill = dom.el('div', { id: 'map-search', cs: { position: 'fixed', zIndex: '1002' } }, dom.body);
  const list = dom.el('div', { id: 'ms-results', cs: { position: 'absolute' } }, pill);
  const row = dom.el('div', {}, list);
  assert.equal(S.panelOf(row), pill);
  dom.fire('pointerdown', row);
  assert.ok(pill.classList.contains('im-front'));
});

test('① #R508 / #R255: a dialog above the band is left alone, and the map shell is not a panel', () => {
  const dom = fakeDom(); const S = loadStack(dom); S.wire();
  const settings = dom.el('div', { id: 'settings-modal', cs: { position: 'fixed', zIndex: '9999' } }, dom.body);
  dom.fire('wheel', dom.el('p', {}, settings));
  dom.fire('pointerdown', dom.el('p', {}, settings));
  assert.ok(!settings.classList.contains('im-front'), '.im-front (2650 !important) would sink the 9999 dialog');
  /* inside the map shell: #map-container is positioned, but it is the shell, not a panel */
  const mc = dom.el('div', { id: 'map-container', cs: { position: 'relative' } }, dom.body);
  const card = dom.el('div', { cs: { position: 'absolute', zIndex: '2200' } }, mc);
  dom.fire('pointerdown', dom.el('b', {}, card));
  assert.ok(card.classList.contains('im-front'));
  dom.fire('wheel', dom.el('i', {}, mc));
  assert.ok(card.classList.contains('im-front'), 'a wheel over the map demoted the panel in use');
  dom.fire('pointerdown', dom.el('i', {}, mc));
  assert.ok(!card.classList.contains('im-front') && !mc.classList.contains('im-front'), 'the map shell was marked, or the panel kept the mark');
});

test('① #823: clipOf finds the ancestor that cuts a box, along the containing-block chain', () => {
  const dom = fakeDom(); const S = loadStack(dom);
  const R = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b, width: r - l, height: b - t });
  /* the measured shape: a 35 px pill with overflow:hidden, and a list hanging 300 px below it */
  const pill = dom.el('div', { cs: { position: 'fixed', zIndex: '1002', overflowX: 'hidden', overflowY: 'hidden' }, rect: R(0, 20, 400, 55) }, dom.body);
  const list = dom.el('div', { cs: { position: 'absolute' }, rect: R(0, 63, 400, 345) }, pill);
  const cut = S.clipOf(list);
  assert.ok(cut && cut.el === pill && cut.axis === 'y', 'the #823 cut was not found');
  /* the fix: clip only across — the list is whole again */
  pill.cs.overflowY = 'visible'; pill.cs.overflowX = 'clip';
  assert.equal(S.clipOf(list), null);
  /* an absolute box skips a STATIC overflow ancestor: it is not in its containing-block chain */
  const host = dom.el('div', { cs: { position: 'relative' }, rect: R(0, 0, 800, 800) }, dom.body);
  const scroller = dom.el('div', { cs: { overflowX: 'auto', overflowY: 'auto' }, rect: R(0, 0, 100, 100) }, host);
  const pop = dom.el('div', { cs: { position: 'absolute' }, rect: R(0, 0, 300, 300) }, scroller);
  assert.equal(S.clipOf(pop), null);
  /* …and a fixed box escapes every ancestor unless a transform re-anchors it */
  const fixed = dom.el('div', { cs: { position: 'fixed' }, rect: R(0, 0, 300, 300) }, scroller);
  assert.equal(S.clipOf(fixed), null);
  scroller.cs.transform = 'translateZ(0)';
  assert.ok(S.clipOf(fixed));
});

/* ── ② the device owner ──────────────────────────────────────────────────────────────────────── */
function device({ width, height = 800, coarse = false, fine = true, screen = { width: 1920, height: 1080 } }) {
  const widthQ = (q) => {
    const mx = /\(max-width:(\d+)px\)/.exec(q); if (mx) return width <= +mx[1];
    const mn = /\(min-width:(\d+)px\)/.exec(q); if (mn) return width >= +mn[1];
    return null;
  };
  const answers = (q) => {
    const w = widthQ(q); if (w != null) return w;
    if (q === '(pointer:coarse)') return coarse;
    if (q === '(any-pointer:fine)') return fine;
    if (q === '(orientation:landscape)') return width > height;
    return false;
  };
  const body = { classList: { s: new Set(), toggle(c, on) { if (on) this.s.add(c); else this.s.delete(c); }, contains(c) { return this.s.has(c); } } };
  const g = { Math, Set, Object, screen, document: { body } };
  g.window = g;
  g.matchMedia = (q) => ({ matches: answers(q), addEventListener() { } });
  vm.createContext(g);
  vm.runInContext(read('js/ui-device.js'), g, { filename: 'ui-device.js' });
  return { D: g.IntMapDevice, body };
}

test('② one layout boundary: 768 px is the phone layout, 769 px is not, and injected CSS says the same', () => {
  assert.equal(device({ width: 768 }).D.compact(), true);
  assert.equal(device({ width: 769 }).D.compact(), false);
  assert.equal(device({ width: 390 }).D.media('.x{a:b}'), '@media(max-width:768px){.x{a:b}}');
  assert.equal(device({ width: 390 }).D.media('.x{a:b}', true), '@media(min-width:769px){.x{a:b}}');
  /* the stylesheet draws the same line */
  const css = read('css/intmap.css');
  assert.equal(countSplit(css), 0, 'css/intmap.css still has a 767 / min-width:768 block');
  assert.ok(css.includes('@media(max-width:768px)') && css.includes('@media(min-width:769px)'));
});

test('② the four kinds, and a phone held sideways keeps the desktop layout with the phone budget', () => {
  const IPHONE = { width: 390, height: 844 };
  const up = device({ width: 390, height: 844, coarse: true, fine: false, screen: IPHONE });
  assert.equal(up.D.kind(), 'phone'); assert.equal(up.D.compact(), true); assert.equal(up.D.phoneBudget(), true);
  const side = device({ width: 844, height: 390, coarse: true, fine: false, screen: IPHONE });
  assert.equal(side.D.kind(), 'phone-landscape');
  assert.equal(side.D.compact(), false, 'the layout of a landscape phone changed — CONSTITUTION §4 / #R498 kept it a width question');
  assert.equal(side.D.phoneBudget(), true, 'an iPhone held sideways is still an iPhone (#R232)');
  const tab = device({ width: 820, height: 1180, coarse: true, fine: false, screen: { width: 820, height: 1180 } });
  assert.equal(tab.D.kind(), 'tablet'); assert.equal(tab.D.phoneBudget(), true, 'a touch-only tablet keeps the phone BUDGET (#R499)');
  const laptop = device({ width: 1280, coarse: false, fine: true });
  assert.equal(laptop.D.kind(), 'desktop'); assert.equal(laptop.D.phoneBudget(), false); assert.equal(laptop.D.touchPrimary(), false);
  /* a narrow desktop window still gets the phone LAYOUT — layout is the viewport, not the device */
  const narrow = device({ width: 600, coarse: false, fine: true });
  assert.equal(narrow.D.kind(), 'desktop'); assert.equal(narrow.D.compact(), true);
});

test('② #R499: a phone with a stylus is still a phone; a touchscreen laptop is not', () => {
  const PHONE = { width: 412, height: 915 }, DESK = { width: 2560, height: 1440 };
  assert.equal(device({ width: 412, coarse: true, fine: true, screen: PHONE }).D.phoneBudget(), true);
  assert.equal(device({ width: 915, height: 412, coarse: true, fine: true, screen: { width: 915, height: 412 } }).D.phoneBudget(), true);
  assert.equal(device({ width: 1280, coarse: false, fine: true, screen: DESK }).D.phoneBudget(), false);
  assert.equal(device({ width: 412, coarse: true, fine: false, screen: PHONE }).D.touchPrimary(), true);
  /* js/app-body.js asks the owner, it no longer answers itself */
  const ab = read('js/app-body.js');
  assert.match(ab, /const _imPhoneClass=\(\)=>window\.IntMapDevice\.phoneBudget\(\);/);
  assert.match(ab, /const isMobile=\(\)=>window\.IntMapDevice\.compact\(\);/);
  assert.doesNotMatch(ab, /MOBILE_MQ/);
});

test('② <body> carries the layout, the kind and the orientation', () => {
  const side = device({ width: 844, height: 390, coarse: true, fine: false, screen: { width: 390, height: 844 } });
  const c = side.body.classList;
  assert.ok(c.contains('im-dev-phone-landscape') && c.contains('im-landscape') && !c.contains('im-compact') && !c.contains('im-dev-phone'));
  const up = device({ width: 390, height: 844, coarse: true, fine: false, screen: { width: 390, height: 844 } });
  assert.ok(up.body.classList.contains('im-compact') && up.body.classList.contains('im-dev-phone') && up.body.classList.contains('im-portrait'));
});

/* ── ③ the gates on the real tree ────────────────────────────────────────────────────────────── */
test('③ the counters count what they say, and nothing else', () => {
  assert.equal(countSplit('@media (max-width:767px){} @media (min-width:768px){} @media(max-width:768px){}'), 2);
  assert.equal(countBreakpoints("matchMedia('(max-width:768px)'); if(window.innerWidth<=768){} if(768>innerWidth){} x=7680;"), 3);
  assert.equal(countSafeArea('a{top:env(safe-area-inset-top)} :root{ --safe-top:env(safe-area-inset-top,0px); }'), 1);
});

test('③ the real tree: one boundary, every copy declared, every bare z-index explained, every layer defined', () => {
  const u = uiCheck(); assert.equal(u.ok, true, u.lines.join('\n'));
  const z = zCheck(); assert.equal(z.ok, true, z.lines.join('\n'));
  const names = new Set(layerNamesUsed().map(([, n]) => n));
  assert.ok(names.has('window') && names.has('inset'), 'the scan found no layer reads at all — it is not scanning');
  for (const n of names) assert.ok(TOK['--z-' + n] != null, '--z-' + n + ' is read but not defined');
});

/* the global-surface ratchet counts a publication by the FACT (an assignment to a property of the global
   object), not by the spelling `window.X =`: the two owners this round added publish through an IIFE
   handed the global, and five modules publish through `globalThis.X =` — none of which the register saw. */
test('global-surface sees globalThis.X = and an IIFE handed the global object; a worker shim and a local are not publications', async () => {
  const { aliasedPublications } = await import('../scripts/global-surface.mjs');
  const got = (s) => aliasedPublications(s).sort();
  assert.deepEqual(got('(function (G) { G.IntMapA = 1; })(typeof window !== "undefined" ? window : globalThis);'), ['IntMapA']);
  assert.deepEqual(got('if (typeof globalThis !== "undefined") globalThis.IntMapB = {};'), ['IntMapB']);
  assert.deepEqual(got('(function (G) { function f(G) { G.notGlobal = 1; } f({}); })(window);'), [], 'an inner parameter of the same name shadows the alias');
  assert.deepEqual(got('(function (G) { G.x = 1; })({});'), [], 'a function called with a plain object publishes nothing');
  assert.deepEqual(got('globalThis.window = scope;'), [], 'a worker installing a window shim is not a page global');
  assert.deepEqual(got('const self = this; self.y = 2;'), [], 'a local named self is not the global');
});
