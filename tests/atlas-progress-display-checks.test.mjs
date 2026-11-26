/* atlas-progress-display — what Atlas shows of its own work: one line per purpose, no 「考え中」 history, no developer text by default,
   no technical toast over the map, no checklist from an earlier question. Behaviour where a module can be driven, source only for "is this removed". */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

/* the same small DOM tests/atlas-progress-checks.test.mjs drives the trace with */
function makeNode(tag) {
  const n = {
    tagName: String(tag || 'div').toUpperCase(), children: [], parentNode: null, _cls: '', _attrs: Object.create(null), _text: '', _html: '',
    get className() { return this._cls; }, set className(v) { this._cls = String(v || ''); },
    get classList() {
      const self = this; const set = () => new Set(self._cls.split(/\s+/).filter(Boolean));
      return { add: (c) => { const s = set(); s.add(c); self._cls = [...s].join(' '); }, remove: (c) => { const s = set(); s.delete(c); self._cls = [...s].join(' '); },
        contains: (c) => set().has(c), toggle: (c) => { const s = set(); if (s.has(c)) s.delete(c); else s.add(c); self._cls = [...s].join(' '); return s.has(c); } };
    },
    get textContent() { return this._text; }, set textContent(v) { this._text = String(v == null ? '' : v); if (this._text === '') { this.children.forEach((c) => { c.parentNode = null; }); this.children = []; } },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v == null ? '' : v); this.children.forEach((c) => { c.parentNode = null; }); this.children = []; this._fromHtml(); },
    _fromHtml() { const re = /<(\w+)[^>]*class="([^"]+)"[^>]*>/g; let m; while ((m = re.exec(this._html))) { const c = makeNode(m[1]); c.className = m[2]; c.parentNode = this; this.children.push(c); } },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    insertAdjacentElement(where, el) { const p = this.parentNode; if (!p) return null; const i = p.children.indexOf(this); p.children.splice(where === 'beforebegin' ? i : i + 1, 0, el); el.parentNode = p; return el; },
    setAttribute(k, v) { this._attrs[k] = String(v); }, getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
    addEventListener() { },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) { const want = String(sel).replace(/^\./, ''); const out = []; (function walk(node) { node.children.forEach((c) => { if (c._cls.split(/\s+/).includes(want)) out.push(c); walk(c); }); })(this); return out; }
  };
  return n;
}
function withDom(fn) {
  const prev = { document: globalThis.document };
  globalThis.document = { createElement: (t) => makeNode(t) };
  try { return fn(makeNode('div')); } finally { globalThis.document = prev.document; }
}
const ev = (operationId, capabilityId, phase) => ({ kernel: 'atlas', operationId, capabilityId, phase, source: 'atlas' });
function fakeExec() { const subs = []; return { on: (f) => { subs.push(f); return () => { }; }, fire: (e) => subs.forEach((f) => f(e)) }; }

test('① consecutive operations of one purpose are ONE line, the calls stay under it, and waiting for the planner leaves no row', async () => {
  const mod = await import('../js/atlas-progress.js');
  const caps = (await import('../js/atlas-capabilities.js')).makeAtlasCapabilities({});
  withDom((root) => {
    const P = mod.makeAtlasProgress({}, { L: (en) => en, esc: (s) => String(s), capabilities: () => caps });
    const EXEC = fakeExec(); const b = makeNode('div'); b.className = 'atl-b a'; root.appendChild(b);
    P.open(b); P.watch(EXEC);
    P.phase(b, 'think');
    EXEC.fire(ev('o1', 'view.flyTo', 'planned')); EXEC.fire(ev('o1', 'view.flyTo', 'completed'));
    P.phase(b, 'think');
    EXEC.fire(ev('o2', 'view.flyTo', 'planned')); EXEC.fire(ev('o2', 'view.flyTo', 'completed'));
    P.phase(b, 'think');
    EXEC.fire(ev('o3', 'view.flyTo', 'planned')); EXEC.fire(ev('o3', 'view.flyTo', 'completed'));
    P.phase(b, 'write');
    const heads = root.querySelectorAll('atl-trace-row').filter((r) => r.className.includes('group'));
    assert.equal(heads.length, 1, 'three view moves are three lines');
    const all = root.querySelectorAll('atl-trace-row');
    assert.equal(all.length, 4, 'one line for the purpose and the three calls behind it — and no 「考え中」 row (' + all.length + ')');
    assert.equal(root.querySelectorAll('atl-trace-group')[0].className.includes('multi'), true, 'a line with several calls can be opened');
    assert.ok(!all.some((r) => /think|考え/i.test((r.querySelector('.atl-trace-word') || { textContent: '' }).textContent)), 'a thinking row is in the history');
    P.done(b);
    assert.equal(root.querySelectorAll('atl-trace')[0].className.includes('open'), false, 'a finished trace is folded');
  });
});

test('② a trace starts folded, so neither its steps nor its plan are on the page until the reader opens it', () => {
  const p = read('js/atlas-progress.js');
  assert.match(p, /el\.className = 'atl-trace';/, 'the trace opens by itself');
  assert.match(p, /\.atl-trace:not\(\.open\) \.atl-trace-plan\{display:none;\}/, 'the plan stands in a folded trace');
});

test('③ a plan is drawn only in the turn that WROTE its steps — moving `current` of an earlier plan does not make it this turn\'s list', async () => {
  const { makeAtlasPlan } = await import('../js/atlas-plan.js');
  const L = makeAtlasPlan({});
  L.beginTurn();
  L.declare({ goal: 'earlier question', steps: ['one', 'two'] });
  assert.equal(L.snapshot().declaredThisTurn, true);
  L.beginTurn();                                    /* the next question */
  L.declare({ current: 2 });                        /* the model only moves the pointer of the old plan */
  const s = L.snapshot();
  assert.equal(s.thisTurn, true, 'the ledger still knows the plan was touched');
  assert.equal(s.declaredThisTurn, false, 'the earlier question\'s checklist counts as this question\'s');
  L.beginTurn(); L.declare({ goal: 'new', steps: ['a'] });
  assert.equal(L.snapshot().declaredThisTurn, true);
});

test('④ the map carries no Atlas pill and no technical toast while a turn runs', async () => {
  assert.doesNotMatch(read('js/atlas-live.js'), /atl-hud|hudBegin/, 'the map pill is back');
  const { makeNotify } = await import('../js/notify.js');
  const N = makeNotify(null);
  N.quiet(true);
  assert.equal(N.show('Could not load the layer'), false, 'a non-urgent message was drawn during an Atlas turn');
  assert.equal(N.log().pop().quiet, true, 'and it was not even recorded as shown');
  N.quiet(false);
  assert.equal(N.show('Could not load the layer'), true, 'the reader\'s own actions lost their toast');
  N.quiet(true);
  assert.equal(N.show('Route lost', { urgent: true }), true, 'an urgent navigation message was silenced');
  assert.match(read('js/atlas-console.js'), /function _setGoBusy\(busy\)\{ try\{ notify\.quiet\(/, 'the console does not set the quiet window');
});

test('⑤ what only a developer needs is a devNote — console always, the trace\'s expanded detail in the developer view, nothing under the reply', async () => {
  const mod = await import('../js/atlas-progress.js');
  withDom((root) => {
    const mk = (dev) => mod.makeAtlasProgress({}, { L: (en) => en, esc: (s) => String(s), dev: () => dev });
    const calm = mk(false), dev = mk(true);
    const info = console.info; console.info = () => { };
    try {
      [calm, dev].forEach((P, i) => {
        const b = makeNode('div'); b.className = 'atl-b a'; root.appendChild(b);
        P.open(b); P.phase(b, 'verify'); P.devNote(b, '$0.311 · 147 s · gpt ×8'); P.done(b);
        const notes = root.querySelectorAll('atl-trace-devline').length;
        if (i === 0) assert.equal(notes, 0, 'a reader\'s trace carries the cost line');
        else assert.equal(notes, 1, 'the developer view lost it');
      });
    } finally { console.info = info; }
  });
});

test('⑥ a step nobody filed a call under, and a step whose only other calls failed beside a completed one, are not "not done"', () => {
  const a = read('js/atlas-agent.js');
  assert.match(a, /st\.state === 'pending'\) return;/, 'a step with no attributed call is reported as unfinished');
  assert.match(a, /st\.state === 'partial' && ops\.some\(\(o\) => o && o\.state === 'completed'\)/, 'a completed step with a failed look-up beside it is reported as unfinished');
});

test('⑦ the coverage list a date change appends is for the model, not the page', () => {
  const t = read('js/atlas-cap-time.js');
  assert.match(t, /class=\"atl-model-only\" hidden>/, 'the "Not drawn — no source states this date" list is printed under the reply');
});
