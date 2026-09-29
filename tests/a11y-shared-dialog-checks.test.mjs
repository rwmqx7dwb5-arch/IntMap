/* a11y-shared-dialog — the ONE dialog contract (js/dialog.js) evaluated, the two «is a modal open?»
   lists gone, and the keyboard-reach ratchet (scripts/keyboard-reach.mjs) shown to catch what it says.
   js/dialog.js is EVALUATED against a small DOM stand-in (no jsdom in this repository): elements with
   attributes, a style object that notifies MutationObservers, focus, and document key listeners run
   in capture-then-bubble order — enough to watch Escape close, focus come back and Tab stay inside. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unreachable, check } from '../scripts/keyboard-reach.mjs';

const ROOT = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── a DOM stand-in ─────────────────────────────────────────────────────────────────────────── */
function makeDom() {
  const observers = [];
  const notify = (target, kind) => { for (const o of observers) if (o.targets.some((t) => t.node === target && t[kind])) o.cb([]); };
  class El {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.nodeType = 1; this.children = []; this.parentNode = null; this.attrs = {};
      this.hidden = false; this.clicks = 0; this.listeners = {}; this.isContentEditable = false;
      const self = this;
      this.style = new Proxy({ display: '', visibility: '' }, { set(o, k, v) { o[k] = v; notify(self, 'attributes'); return true; } });
      this.classList = { _s: new Set(),
        add(c) { this._s.add(c); notify(self, 'attributes'); }, remove(c) { this._s.delete(c); notify(self, 'attributes'); },
        contains(c) { return this._s.has(c); }, toggle(c, on) { if (on === undefined ? !this._s.has(c) : on) this._s.add(c); else this._s.delete(c); notify(self, 'attributes'); } };
    }
    get id() { return this.attrs.id || ''; } set id(v) { this.attrs.id = v; }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === doc.body; }
    setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    hasAttribute(k) { return k in this.attrs; } removeAttribute(k) { delete this.attrs[k]; }
    appendChild(c) { if (c.parentNode) c.remove(); c.parentNode = this; this.children.push(c); notify(this, 'childList'); return c; }
    remove() { const p = this.parentNode; if (!p) return; p.children.splice(p.children.indexOf(this), 1); this.parentNode = null; notify(p, 'childList'); }
    contains(n) { while (n) { if (n === this) return true; n = n.parentNode; } return false; }
    all() { return this.children.flatMap((c) => [c, ...c.all()]); }
    /* only the two selectors js/dialog.js asks: its FOCUSABLE list, and the heading lookup */
    querySelectorAll(sel) {
      if (/^h1/.test(sel)) return this.all().filter((e) => /^H[1-4]$/.test(e.tagName));
      return this.all().filter((e) => (/^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(e.tagName) && !e.hasAttribute('disabled'))
        || (e.hasAttribute('tabindex') && e.getAttribute('tabindex') !== '-1'));
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    closest() { let n = this; while (n) { if (n.hidden || n.hasAttribute && n.hasAttribute('inert')) return n; n = n.parentNode; } return null; }
    getClientRects() { return [1]; }
    focus() { doc.activeElement = this; }
    click() { this.clicks++; (this.listeners.click || []).forEach((f) => f({ target: this })); }
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  }
  const doc = { listeners: [], activeElement: null, createElement: (t) => new El(t),
    addEventListener(t, f, cap) { this.listeners.push({ t, f, cap: !!cap }); } };
  doc.body = new El('body');
  doc.activeElement = doc.body;
  function key(k, opts = {}) {
    const e = { key: k, shiftKey: !!opts.shift, target: doc.activeElement, defaultPrevented: false, stopped: false, altKey: false, ctrlKey: false, metaKey: false,
      preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }, stopPropagation() { this.stopped = true; } };
    for (const phase of [true, false]) for (const l of doc.listeners) { if (e.stopped) return e; if (l.t === 'keydown' && l.cap === phase) l.f(e); }
    return e;
  }
  class MO { constructor(cb) { this.cb = cb; this.targets = []; observers.push(this); }
    observe(node, o) { this.targets.push({ node, attributes: !!o.attributes, childList: !!o.childList }); }
    disconnect() { const i = observers.indexOf(this); if (i >= 0) observers.splice(i, 1); } }
  const gcs = (el) => ({ display: el.style.display || (el.classList.contains('hidden-by-class') ? 'none' : 'block'), visibility: el.style.visibility || 'visible' });
  const win = {};
  const D = new Function('window', 'document', 'getComputedStyle', 'MutationObserver', read('js/dialog.js') + '\n;return window.IntMapDialog;')(win, doc, gcs, MO);
  return { D, doc, El, key };
}
function overlay(dom, withButtons = 2) {
  const ov = dom.doc.createElement('div'), panel = dom.doc.createElement('div'), h = dom.doc.createElement('h3');
  h.id = 'ttl'; panel.appendChild(h); ov.appendChild(panel);
  const btns = []; for (let i = 0; i < withButtons; i++) btns.push(panel.appendChild(dom.doc.createElement('button')));
  ov.style.display = 'none'; dom.doc.body.appendChild(ov);
  return { ov, panel, btns };
}

test('adopt(): names the panel, moves focus in, Escape closes through the owner, focus comes back', () => {
  const dom = makeDom(), { D, doc, key } = dom;
  const opener = doc.body.appendChild(doc.createElement('button')); opener.focus();
  const { ov, panel, btns } = overlay(dom);
  let closedWith = null;
  D.adopt(ov, { panel, labelledby: 'ttl', close: (why) => { closedWith = why; ov.style.display = 'none'; } });
  assert.equal(panel.getAttribute('role'), 'dialog');
  assert.equal(panel.getAttribute('aria-modal'), 'true');
  assert.equal(panel.getAttribute('aria-labelledby'), 'ttl');
  assert.equal(D.anyOpen(), false, 'hidden overlay is not open');
  ov.style.display = 'flex';                      /* the owner shows it the way the app does */
  assert.equal(D.anyOpen(), true, 'the registry sees it open');
  assert.equal(doc.activeElement, btns[0], 'focus moved to the first control');
  const e = key('Escape');
  assert.equal(closedWith, 'escape', 'Escape went through the owner’s own close (a dirty guard would ask)');
  assert.ok(e.defaultPrevented && e.stopped, 'and was consumed — no other Escape owner sees it');
  assert.equal(D.anyOpen(), false);
  assert.equal(doc.activeElement, opener, 'focus returned to what opened it');
});

test('a dialog that refuses to close (the owner said no) stays registered as open', () => {
  const dom = makeDom(), { D, key } = dom;
  const { ov, panel } = overlay(dom);
  D.adopt(ov, { panel, close: () => {} });        /* confirm() answered «keep editing» */
  ov.style.display = 'flex';
  key('Escape');
  assert.equal(D.anyOpen(), true);
});

test('Tab and Shift+Tab stay inside the topmost dialog', () => {
  const dom = makeDom(), { D, doc, key } = dom;
  const outside = doc.body.appendChild(doc.createElement('button'));
  const { ov, panel, btns } = overlay(dom, 3);
  D.adopt(ov, { panel }); ov.style.display = 'flex';
  btns[2].focus(); let e = key('Tab');
  assert.ok(e.defaultPrevented); assert.equal(doc.activeElement, btns[0], 'Tab on the last wraps to the first');
  e = key('Tab', { shift: true });
  assert.equal(doc.activeElement, btns[2], 'Shift+Tab on the first wraps to the last');
  btns[1].focus(); e = key('Tab');
  assert.equal(e.defaultPrevented, false, 'Tab in the middle is left to the browser');
  outside.focus(); key('Tab');
  assert.equal(doc.activeElement, btns[0], 'focus that escaped is brought back in');
});

test('stacked dialogs: Escape closes the topmost only; escape:false leaves the key alone', () => {
  const dom = makeDom(), { D, key } = dom;
  const a = overlay(dom), b = overlay(dom);
  D.adopt(a.ov, { panel: a.panel }); D.adopt(b.ov, { panel: b.panel });
  a.ov.style.display = 'flex'; b.ov.style.display = 'flex';
  assert.equal(D.openCount(), 2);
  key('Escape');
  assert.equal(b.ov.style.display, 'none', 'the one opened last closed');
  assert.equal(a.ov.style.display, 'flex', 'the one beneath it did not');
  const c = overlay(dom); D.adopt(c.ov, { panel: c.panel, escape: false }); c.ov.style.display = 'flex';
  const e = key('Escape');
  assert.equal(c.ov.style.display, 'flex'); assert.equal(e.defaultPrevented, false);
});

test('open(): appends, is removed on close, and a removed dialog leaves the registry', () => {
  const dom = makeDom(), { D, doc, key } = dom;
  const ov = doc.createElement('div'); ov.appendChild(doc.createElement('button'));
  const n0 = D._entries();
  D.open(ov, { label: 'X' });
  assert.ok(ov.isConnected); assert.equal(ov.getAttribute('aria-label'), 'X'); assert.equal(D.anyOpen(), true);
  key('Escape');
  assert.equal(ov.isConnected, false, 'default close removes it');
  assert.equal(D._entries(), n0, 'transient entry forgotten');
});

test('backdrop: true → only the backdrop itself; "any" → anywhere; an Element → that element', () => {
  const dom = makeDom(), { D, doc } = dom;
  const s = overlay(dom); D.adopt(s.ov, { panel: s.panel, backdrop: true }); s.ov.style.display = 'flex';
  s.ov.listeners.click[0]({ target: s.panel }); assert.equal(s.ov.style.display, 'flex', 'a press on the content does not close');
  s.ov.listeners.click[0]({ target: s.ov }); assert.equal(s.ov.style.display, 'none');
  const lb = doc.createElement('div'); lb.appendChild(doc.createElement('img'));
  D.open(lb, { backdrop: 'any' }); lb.listeners.click[0]({ target: lb.children[0] }); assert.equal(lb.isConnected, false);
  const sh = overlay(dom), scrim = doc.body.appendChild(doc.createElement('div'));
  D.adopt(sh.ov, { panel: sh.panel, backdrop: scrim }); sh.ov.style.display = 'flex'; scrim.click(); assert.equal(sh.ov.style.display, 'none');
});

test('isOpen: a sheet parked off-screen is closed although it is laid out', () => {
  const dom = makeDom(), { D } = dom;
  const { ov, panel } = overlay(dom); ov.style.display = 'flex';
  D.adopt(ov, { panel, isOpen: () => ov.classList.contains('show'), focus: false });
  assert.equal(D.anyOpen(), false);
  ov.classList.add('show'); assert.equal(D.anyOpen(), true);
});

test('with no name given, a dialog is named by its own first heading', () => {
  const dom = makeDom(), { D } = dom;
  const { ov, panel } = overlay(dom);
  D.adopt(ov, { panel });
  assert.equal(panel.getAttribute('aria-labelledby'), 'ttl');
});

test('Enter/Space press a focusable role=button (once), a sortable header, and nothing native', () => {
  const dom = makeDom(), { D, doc, key } = dom;
  const row = doc.body.appendChild(doc.createElement('div'));
  D.makeActionable(row);
  assert.equal(row.getAttribute('tabindex'), '0'); assert.equal(row.getAttribute('role'), 'button');
  row.focus(); key('Enter'); key(' ');
  assert.equal(row.clicks, 2);
  const sw = doc.body.appendChild(doc.createElement('div')); sw.setAttribute('role', 'switch'); D.makeActionable(sw);
  assert.equal(sw.getAttribute('role'), 'switch', 'an existing role is kept');
  const th = doc.body.appendChild(doc.createElement('th')); th.setAttribute('tabindex', '0'); th.setAttribute('aria-sort', 'none');
  th.focus(); key('Enter'); assert.equal(th.clicks, 1, 'a column header that states aria-sort is the sort control');
  const b = doc.body.appendChild(doc.createElement('button')); b.focus(); key('Enter'); assert.equal(b.clicks, 0, 'the browser already presses a button');
  const lnk = doc.body.appendChild(doc.createElement('span')); lnk.setAttribute('role', 'link'); lnk.setAttribute('tabindex', '0');
  lnk.focus(); key(' '); assert.equal(lnk.clicks, 0, 'Space does not follow a link');
  const own = doc.body.appendChild(doc.createElement('div')); D.makeActionable(own); own.focus();
  doc.listeners.unshift({ t: 'keydown', cap: false, f: (e) => e.preventDefault() });   /* its own handler already acted */
  key('Enter'); assert.equal(own.clicks, 0, 'a key already handled is not pressed a second time');
});

test('listbox(): arrows move the active option, Enter picks it, the field keeps focus', () => {
  const dom = makeDom(), { D, doc } = dom;
  const input = doc.body.appendChild(doc.createElement('input')), list = doc.body.appendChild(doc.createElement('div'));
  const opts = [0, 1, 2].map(() => list.appendChild(doc.createElement('div')));
  let picked = null;
  const lb = D.listbox(input, list, { options: () => opts, pick: (el) => { picked = el; } });
  assert.equal(input.getAttribute('role'), 'combobox'); assert.equal(list.getAttribute('role'), 'listbox');
  const fire = (k) => { const e = { key: k, preventDefault() { this.dp = true; }, stopPropagation() {} }; input.listeners.keydown.forEach((f) => f(e)); return e; };
  fire('ArrowDown'); fire('ArrowDown');
  assert.equal(input.getAttribute('aria-activedescendant'), opts[1].id);
  assert.equal(opts[1].getAttribute('aria-selected'), 'true');
  fire('ArrowUp'); fire('ArrowUp');
  assert.equal(input.getAttribute('aria-activedescendant'), opts[2].id, 'ArrowUp from the first wraps to the last');
  const e = fire('Enter'); assert.ok(e.dp); assert.equal(picked, opts[2]);
  assert.equal(input.getAttribute('aria-activedescendant'), null, 'nothing is active after a pick — Enter searches again');
  lb.reset(); assert.equal(lb.active(), -1);
});

test('«is a modal open?» is asked of the registry — the two hand-written selector lists are gone', () => {
  for (const f of ['js/app-body.js', 'js/workspace.js']) {
    const s = read(f);
    assert.doesNotMatch(s, /querySelectorAll\('[^']*(?:\.modal-overlay|\.lightbox|#compose-modal)[^']*'\)\]\.some/, f + ' still carries its own list');
    assert.match(s, /window\.IntMapDialog\.anyOpen\(\)/, f + ' asks the registry');
  }
  /* and the dialogs those lists named — plus the ones they missed — are registered */
  const body = read('js/app-body.js');
  for (const id of ['labelledby:\'modal-title\'', 'labelledby:\'blueberry-title\'', 'labelledby:\'sources-title\'', 'labelledby:\'compose-title\''])
    assert.ok(body.includes(id), 'app-body registers ' + id);
  assert.match(body, /adopt\(modal,\{[^}]*close:closeSettings/, 'Settings closes through closeSettings, so the dirty guard still asks on Escape');
  assert.match(read('js/legal.js'), /IntMapDialog\.adopt\(lm/, 'Terms/Privacy');
  assert.match(read('js/feedback.js'), /IntMapDialog\.adopt\(modal[\s\S]*IntMapDialog\.adopt\(modal/, 'feedback and bug report');
  assert.match(read('js/keyboard-shortcuts.js'), /IntMapDialog\.adopt\(m,/, 'the shortcut help');
  assert.match(read('js/widget-gallery.js'), /IntMapDialog\.open\(sheet/, 'the widget gallery uses the shared contract, not its own copy');
  assert.doesNotMatch(read('js/widget-gallery.js'), /function onKey\(/, '…and its private key handler is gone');
  assert.match(read('src/main.js'), /import '\.\.\/js\/dialog\.js';[\s\S]*import '\.\.\/js\/app-body\.js';/, 'imported before the app body');
});

test('keyboard-reach: the shapes it counts and the ones it lets through', () => {
  const n = (src, ctx) => unreachable(src, 't.js', ctx).length;
  assert.equal(n("function f(){ const d=document.createElement('div'); d.onclick=()=>go(); }"), 1, 'a created div with a click');
  assert.equal(n("function f(){ const d=document.createElement('div'); window.IntMapDialog.makeActionable(d); d.onclick=()=>go(); }"), 0, 'made actionable');
  assert.equal(n("function f(){ const d=document.createElement('div'); d.tabIndex=0; d.addEventListener('click',()=>go()); }"), 0, 'given a tabindex');
  assert.equal(n("function f(){ const b=document.createElement('button'); b.onclick=()=>go(); }"), 0, 'a real button');
  assert.equal(n("function f(el){ el.innerHTML='<div class=\"r\">x</div>'; el.querySelectorAll('.r').forEach(r=>{ r.onclick=()=>go(); }); }"), 1, 'markup row wired by class');
  assert.equal(n("function f(el){ el.innerHTML='<div class=\"r\" role=\"button\" tabindex=\"0\">x</div>'; el.querySelectorAll('.r').forEach(r=>{ r.onclick=()=>go(); }); }"), 0, 'the same row with role+tabindex');
  assert.equal(n("function f(){ const ov=document.createElement('div'); ov.addEventListener('click',e=>{ if(e.target===ov) ov.remove(); }); }"), 0, 'a backdrop (Escape is its twin)');
  assert.equal(n("function f(){ const p=document.createElement('div'); p.addEventListener('click',e=>e.stopPropagation()); }"), 0, 'a handler that only stops the event');
  assert.equal(n("function f(p){ p.innerHTML='<span class=\"c\">x</span>'; p.addEventListener('click',e=>{ const c=e.target.closest('.c'); if(c) go(c); }); }"), 1, 'delegation names its target');
  assert.equal(n("function f(p){ p.innerHTML='<span class=\"c\">x</span>'; p.addEventListener('click',e=>{ if(e.target.closest('button')) return; go(); }); }"), 0, 'a closest() that only leaves is a guard');
  assert.equal(n("el('div',{class:'s','aria-hidden':'true',onclick:()=>x()}); el('div',{class:'t',onclick:()=>x()});"), 1, 'hyperscript: a presentational scrim is not counted, a div is');
  assert.equal(n("function f(i){ const o=document.createElement('div'); o.setAttribute('role','option'); o.onclick=()=>go(); i.setAttribute('aria-activedescendant',o.id); }"), 0, 'an option of a combobox is reached from its field');
  /* the markup of ANOTHER file answers for a row this file wires */
  const shared = [{ tag: 'span', attrs: ' class="far" role="button" tabindex="0"', combo: false }];
  assert.equal(n("function f(c){ c.querySelectorAll('.far').forEach(x=>x.onclick=()=>go()); }", { shared }), 0);
});

test('keyboard-reach ledger fails in BOTH directions (a new unreachable press / a ledger that stopped asserting)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kr-'));
  try {
    mkdirSync(join(dir, 'js'));
    writeFileSync(join(dir, 'index.html'), '<div></div>');
    writeFileSync(join(dir, 'js', 'a.js'), "function f(){ const d=document.createElement('div'); d.onclick=()=>go(); }");
    const ledger = join(dir, 'ledger.json');
    writeFileSync(ledger, JSON.stringify({ files: { 'js/a.js': 1 } }));
    assert.equal(check(dir, ledger).ok, true, 'as the ledger says');
    writeFileSync(join(dir, 'js', 'b.js'), "function g(){ const s=document.createElement('span'); s.addEventListener('click',()=>go()); }");
    const up = check(dir, ledger);
    assert.equal(up.ok, false); assert.match(up.lines.join('\n'), /js\/b\.js: 1 click receiver/);
    rmSync(join(dir, 'js', 'b.js'));
    writeFileSync(join(dir, 'js', 'a.js'), "function f(){ const d=document.createElement('div'); d.tabIndex=0; d.onclick=()=>go(); }");
    const down = check(dir, ledger);
    assert.equal(down.ok, false); assert.match(down.lines.join('\n'), /lower the ledger/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  /* and the real tree is at its ledger (the check:static rule) */
  assert.equal(check().ok, true, check().lines.join('\n'));
});

test('reduced motion: one global block stops the endless pulses and the screenshot flash; the camera door honours it', () => {
  const css = read('css/intmap.css');
  const blk = css.slice(css.lastIndexOf('@media (prefers-reduced-motion:reduce){'));
  for (const sel of ['.intel-dot::after', '.search-pin .sp-pulse', '.screenshot-flash.go']) assert.ok(blk.includes(sel), sel);
  assert.match(blk, /animation:none !important/);
  const ge = read('js/geo-engine.js');
  assert.match(ge, /const _calm=\(o\)=>\{[^\n]*prefers-reduced-motion: reduce[^\n]*duration:0/);
  assert.match(ge, /flyTo:o=>A\(\)\.flyTo\(_calm\(o\)\), easeTo:o=>A\(\)\.easeTo\(_calm\(o\)\), jumpTo:o=>A\(\)\.jumpTo\(o\)/,
    'the move itself is unchanged — only its duration (jumpTo was never animated)');
});
