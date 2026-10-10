/* map-layer-system-chronos — what an operation OPENS stands in front of the panel the operation was made in.
 *
 * MEASURED (2026-10-10, the built app at 1280×720): «Read this year» in the Chronos panel marked `#news-timeline`
 * as the panel being used (`.im-front`, the `front` layer, 2650) and the year book it opened (`#yb-sheet`, the
 * `sheet` layer, 1650) lay beneath it — `elementFromPoint` at the sheet's «next year» button returned `#ntl-zone`
 * and only a 48 px strip of the sheet showed. «Rise and fall of a polity» (`#pa-sheet`) and «Then & now»
 * (`#compare-window`, the `window` layer) opened under the same panel. The nightly's
 * tests/map-layer-system.spec.js ② had been red since #1034 made the panel 59 px taller and the cover reached the
 * sheet's header. The record is dev-notes/2026-10-10-map-layer-system-chronos.md.
 *
 *   ① js/ui-stack.js `opened`, EVALUATED: the mark moves from the panel the gesture was in to what it opened;
 *     a surface inside a trapped stacking context marks the context; a dialog above the band is never marked
 *   ② every level compared here is READ from css/intmap.css, so the check moves with the stylesheet
 *   ③ the three surfaces the Chronos panel opens are each opened through `opened` — EVALUATED for the two sheets
 *     (the module's own open path runs against a recording stack); the page itself is
 *     tests/map-layer-system.spec.js ② / ③ (the hit test over each surface's whole box)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { tokens, resolveValue } from '../scripts/z-layers.mjs';

const ROOT = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const TOK = tokens(read('css/intmap.css'));
const LV = (name) => TOK['--z-' + name];

/* a DOM just large enough for the owner: elements with computed styles and selectors */
function fakeDom() {
  const all = [], listeners = {};
  const one = (e, sel) => { sel = sel.trim(); return sel.startsWith('#') ? e.id === sel.slice(1) : sel.startsWith('.') ? e.cls.has(sel.slice(1)) : e.tag === sel; };
  function el(tag, opts = {}, parent) {
    const cls = new Set(opts.cls || []);
    const e = {
      tag, id: opts.id || '', cls, style: {}, isConnected: true, parentElement: parent || null,
      classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
      cs: Object.assign({ position: 'static', zIndex: 'auto', transform: 'none', filter: 'none', opacity: '1' }, opts.cs || {}),
      matches(sel) { return sel.split(',').some((s) => one(this, s)); },
      closest(sel) { for (let n = this; n; n = n.parentElement) if (n.matches(sel)) return n; return null; },
    };
    all.push(e);
    return e;
  }
  const html = el('html'), body = el('body', {}, html);
  const document = {
    documentElement: html, body,
    querySelectorAll(sel) { return { forEach: (fn) => all.filter((e) => e.matches(sel)).forEach(fn) }; },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  };
  const getComputedStyle = (e) => {
    if (e === html) return { getPropertyValue: (k) => (TOK[k] != null ? String(TOK[k]) : '') };
    const z = e.style.zIndex ? String(resolveValue(e.style.zIndex, TOK)) : e.cs.zIndex;
    return Object.assign({}, e.cs, { zIndex: e.cls.has('im-front') ? String(LV('front')) : z });
  };
  const fire = (type, target) => (listeners[type] || []).forEach((fn) => fn({ target }));
  return { el, body, document, getComputedStyle, fire };
}
function loadStack(dom) {
  const g = { document: dom.document, getComputedStyle: dom.getComputedStyle, Math, Number, Set, parseInt };
  g.window = g;
  vm.createContext(g);
  vm.runInContext(read('js/ui-stack.js'), g, { filename: 'ui-stack.js' });
  return g.IntMapStack;
}
/* the shape measured: a docked panel at its own level, its button, and a sheet appended to <body> */
function chronosAndSheet() {
  const dom = fakeDom(), S = loadStack(dom);
  S.wire();
  const room = dom.el('div', { cls: ['operation-room'], cs: { position: 'relative' } }, dom.body);
  const panel = dom.el('div', { id: 'news-timeline', cs: { position: 'absolute', zIndex: String(LV('controls') + 100) } }, room);
  const button = dom.el('button', { id: 'ntl-yearbook' }, panel);
  const sheet = dom.el('section', { id: 'yb-sheet', cs: { position: 'fixed', zIndex: String(LV('sheet')) } }, dom.body);
  return { dom, S, panel, button, sheet };
}
const z = (dom, e) => +dom.getComputedStyle(e).zIndex;

test('① the gesture that opens a sheet raises the panel it was made in — and the sheet lies beneath it (the measured defect)', () => {
  const { dom, panel, button, sheet } = chronosAndSheet();
  dom.fire('pointerdown', button);
  assert.ok(panel.cls.has('im-front'), 'the press in the Chronos panel marks it');
  assert.ok(z(dom, sheet) < z(dom, panel), 'this is the order the reader met: ' + z(dom, sheet) + ' under ' + z(dom, panel));
});

test('① `opened` moves the mark to what the operation opened, so it stands in front of the panel that opened it', () => {
  const { dom, S, panel, button, sheet } = chronosAndSheet();
  dom.fire('pointerdown', button);
  assert.equal(S.opened(sheet), true);
  assert.ok(sheet.cls.has('im-front') && !panel.cls.has('im-front'), 'one mark, on the opened sheet');
  assert.ok(dom.body.cls.has('im-float-front'), 'the opened surface is the one being used — above an open sidebar too');
  assert.ok(z(dom, sheet) > z(dom, panel), z(dom, sheet) + ' over ' + z(dom, panel));
  /* and the reader going back to the panel takes it back — the mark still follows the gesture */
  dom.fire('pointerdown', button);
  assert.ok(panel.cls.has('im-front') && !sheet.cls.has('im-front'));
});

test('① a surface inside a trapped stacking context marks the context that competes (#824), not itself', () => {
  const { dom, S, button } = chronosAndSheet();
  const host = dom.el('div', { id: 'host', cs: { position: 'fixed', zIndex: String(LV('popup')) } }, dom.body);
  const inner = dom.el('div', { id: 'inner', cs: { position: 'absolute', zIndex: '1' } }, host);
  dom.fire('pointerdown', button);
  S.opened(inner);
  assert.ok(host.cls.has('im-front') && !inner.cls.has('im-front'));
});

test('① a dialog above the band is never marked — the mark would sink it (#R508)', () => {
  const { dom, S, panel, button } = chronosAndSheet();
  const modal = dom.el('div', { id: 'legal-modal', cs: { position: 'fixed', zIndex: String(LV('modal')) } }, dom.body);
  dom.fire('pointerdown', button);
  assert.equal(S.opened(modal), false);
  assert.ok(!modal.cls.has('im-front') && panel.cls.has('im-front'), 'the modal keeps its own level; nothing moved');
  assert.equal(S.opened(null), false);
});

test('② the levels compared are the stylesheet\'s: sheet and window both sit under `front`', () => {
  for (const k of ['sheet', 'window', 'front', 'modal', 'controls']) assert.ok(Number.isFinite(LV(k)), '--z-' + k + ' is read from css/intmap.css');
  assert.ok(LV('sheet') < LV('front') && LV('window') < LV('front'), 'if this ever stops holding, the defect cannot occur and ① is about nothing');
});

/* ③ — the module's own open path, run against a recording stack */
test('③ the year book and the polity-arc sheet are opened through `opened`', async () => {
  const calls = [];
  const made = [];
  const fakeEl = (tag) => { const e = { tag, hidden: true, attrs: {}, children: [], innerHTML: '', id: '', className: '',
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, appendChild(c) { this.children.push(c); return c; },
    querySelector() { return null; }, classList: { contains: () => false } }; made.push(e); return e; };
  const saved = { document: globalThis.document, window: globalThis.window, IntMapStack: globalThis.IntMapStack };
  globalThis.window = globalThis.window || globalThis;
  globalThis.document = { head: fakeEl('head'), body: fakeEl('body'), getElementById: () => null, createElement: fakeEl };
  globalThis.IntMapStack = { opened: (e) => { calls.push({ id: e.id, shown: e.hidden === false }); return true; } };
  try {
    const YB = await import('../js/year-book.js');
    const h = YB.openFromPage({ lang: () => 'en', countryStats: () => ({}), escape: (s) => String(s) });
    h.close();
    const PA = await import('../js/polity-arc.js');
    const p = PA.openArc({ lang: () => 'en' });
    const sheet = made.find((e) => e.id === 'pa-sheet');
    if (sheet) sheet.hidden = true;   /* stop the paint after the index read; the call under test has happened */
    await p.catch(() => {});
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
  }
  assert.deepEqual(calls.map((c) => c.id), ['yb-sheet', 'pa-sheet'], 'each sheet announces that it was opened');
  assert.ok(calls.every((c) => c.shown), 'announced once it is shown — the stack measures a visible surface');
});
