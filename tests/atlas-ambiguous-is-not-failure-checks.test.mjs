/* ============================================================================
 *  atlas-ambiguous-is-not-failure — several matches is a question, not a failure
 * ----------------------------------------------------------------------------
 *  js/atlas-controls.js `doControl` refuses to guess between near-equal controls and answers
 *  {ok:false, meta:{code:'ambiguous_target', candidates}} (#R320). The control observer in
 *  js/atlas-capabilities.js tested `raw.ok === false` FIRST, so the branch meant to answer
 *  `needs_input` was unreachable and the kernel reported `failed` — Atlas was told the press had
 *  failed and pressed again (.agents/rules/one-pass-or-a-reason.md §2 ①). The fact is now read by
 *  js/atlas-executor.js for every capability. These checks RUN the real kernel.
 *  See dev-notes/2026-09-29-atlas-ambiguous-is-not-failure.md.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (typeof globalThis.addEventListener !== 'function') globalThis.addEventListener = () => {};

function el(tag, attrs, text) {
  const a = Object.assign({}, attrs || {});
  const e = {
    tagName: tag.toUpperCase(), textContent: text || '', disabled: false, offsetParent: {},
    presses: 0,
    get id() { return a.id || ''; },
    get type() { return a.type || ''; },
    get placeholder() { return ''; },
    value: '',
    getAttribute: (k) => (k in a ? String(a[k]) : null),
    setAttribute: (k, v) => { a[k] = String(v); },
    removeAttribute: (k) => { delete a[k]; },
    closest: () => null,
    previousElementSibling: null,
    click() { e.presses++; },
    focus() {},
    dispatchEvent() { return true; }
  };
  return e;
}
function installDom(els) {
  globalThis.document = {
    querySelectorAll: () => els.slice(),
    querySelector: () => null,
    getElementById: (id) => els.find((x) => x.id === id) || null
  };
  if (typeof globalThis.KeyboardEvent === 'undefined') globalThis.KeyboardEvent = class { constructor(t) { this.type = t; } };
  if (typeof globalThis.Event === 'undefined') globalThis.Event = class { constructor(t) { this.type = t; } };
}
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const { makeAtlasControls } = await import('../js/atlas-controls.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { installAtlasKernel } = await import('../js/atlas-executor.js');

function kernel(dispatch) {
  const caps = makeAtlasCapabilities({});
  caps.bindRuntime({ dispatch });
  return installAtlasKernel({}, {}, { capabilities: caps });
}

test('a dispatch that answers ambiguous_target comes back needs_input with its candidates — not failed', async () => {
  const candidates = [{ id: 'btn-a', label: 'Layers' }, { id: 'btn-b', label: 'Layers panel' }];
  const K = kernel(() => ({ ok: false, html: 'several', meta: { code: 'ambiguous_target', candidates } }));
  const r = await K.exec.execute('system.control', { target: 'layers' }, { source: 'atlas' });
  assert.equal(r.status, 'needs_input', JSON.stringify(r));
  assert.equal(r.code, 'ambiguous_target');
  assert.deepEqual((r.candidates || []).map((c) => c.id), ['btn-a', 'btn-b'], 'the candidates travel back so the reader (or Atlas) can choose');
  assert.equal(r.inputRequest && r.inputRequest.kind, 'choice');
});

test('a real two-way tie in doControl presses nothing and asks', async () => {
  const a = el('button', { id: 'open-layers-a' }, 'Open layers');
  const b = el('button', { id: 'open-layers-b' }, 'Open layers');
  installDom([a, b]);
  const st = globalThis.setTimeout; globalThis.setTimeout = () => 0;
  let C;
  try {
    C = makeAtlasControls({ lang: 'en', user: null }, {
      L: (en) => en, R: (ok, html, extra) => Object.assign({ ok: !!ok, html: html || '' }, extra || null),
      _ctlTogHtml: () => '', esc, note: (s) => s, warn: (s) => s
    });
  } finally { globalThis.setTimeout = st; }
  const raw = C.doControl({ type: 'control', target: 'Open layers' });
  assert.equal(raw.meta && raw.meta.code, 'ambiguous_target', 'the fixture is a genuine tie for doControl: ' + JSON.stringify(raw.meta || null));
  const K = kernel((act) => C.doControl(act));
  const r = await K.exec.execute('system.control', { target: 'Open layers' }, { source: 'atlas' });
  assert.equal(r.status, 'needs_input', JSON.stringify(r));
  assert.equal(a.presses + b.presses, 0, 'neither was pressed');
});

test('a plain failure is still a failure', async () => {
  const K = kernel(() => ({ ok: false, html: 'nope', meta: { code: 'not_found' } }));
  const r = await K.exec.execute('system.control', { target: 'nothing' }, { source: 'atlas' });
  assert.equal(r.status, 'failed', JSON.stringify(r));
});
