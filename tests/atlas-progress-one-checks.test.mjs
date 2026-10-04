/* ============================================================================
 *  atlas-progress-one — ONE place says what Atlas is doing
 * ----------------------------------------------------------------------------
 *  利用者（2026-10-04、PC・サイドバーで Atlas に質問中のスクリーンショットに）:
 *  「この表示、煩雑過ぎない？なんでこんなくそ仕様に？」
 *
 *  ⚠ THE DEFECT, RESTATED — not the fix ([[intmap-restate-the-defect-not-the-fix]]). For one turn the
 *  reader was shown FOUR progress indicators at once: the work trace in the sidebar (js/atlas-progress.js),
 *  a pill on the map and a row of operation chips above it (js/atlas-live.js), and the plan as a card of
 *  its own on the map (js/atlas-plan.js). 「Researching」 was written in three of them. So:
 *
 *    ① while the trace can be seen, the map carries no progress at all;
 *    ② when it cannot be seen (closed, lowered, minimised, scrolled away, or lying under another
 *       surface), the map carries exactly ONE pill — and the pill says the trace's word, not its own;
 *    ③ the plan is inside the trace, with the states the ledger derived from the executor's verdicts,
 *       wearing the trace's own marks;
 *    ④ the live word is written by one element while the trace can be seen.
 *
 *  ⚠ 「CAN BE SEEN」 IS ASKED THE WAY THE PAGE ASKS IT: a rectangle in the viewport, nothing transparent
 *  above it, and elementsFromPoint answering to the trace ([[intmap-visible-is-not-unoccluded]]). The
 *  DOM below is the smallest one those questions need — it is not a DOM, and the module is EVALUATED
 *  against it (a check that reads source cannot see evaluation order — [[intmap-r505-lessons]]).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── the DOM the size of the question ───────────────────────────────────────────────────────── */
function makeNode(tag) {
  const n = {
    tagName: String(tag || 'div').toUpperCase(), nodeType: 1, children: [], parentNode: null,
    _cls: '', _attrs: Object.create(null), _text: '', _html: '', dataset: {}, style: {}, _on: Object.create(null),
    rect: null, css: null,
    get parentElement() { return this.parentNode; },
    get isConnected() { let p = this; while (p.parentNode) p = p.parentNode; return p === DOC_ROOT; },
    get firstChild() { return this.children[0] || null; },
    get className() { return this._cls; },
    set className(v) { this._cls = String(v || ''); },
    get classList() {
      const self = this;
      const set = () => new Set(self._cls.split(/\s+/).filter(Boolean));
      return {
        add: (...cs) => { const s = set(); cs.forEach((c) => s.add(c)); self._cls = [...s].join(' '); },
        remove: (...cs) => { const s = set(); cs.forEach((c) => s.delete(c)); self._cls = [...s].join(' '); },
        contains: (c) => set().has(c),
        toggle: (c, force) => { const s = set(); const on = force === undefined ? !s.has(c) : !!force; if (on) s.add(c); else s.delete(c); self._cls = [...s].join(' '); return on; }
      };
    },
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); },
    set textContent(v) { this._text = String(v == null ? '' : v); this.children.forEach((c) => { c.parentNode = null; }); this.children = []; },
    get innerHTML() { return this._html; },
    set innerHTML(v) {
      this._html = String(v == null ? '' : v); this._text = '';
      this.children.forEach((c) => { c.parentNode = null; }); this.children = [];
      /* nested, as the markup nests it — the plan's goal must be found INSIDE the trace */
      const stack = [this]; const re = /<(\/?)(\w+)([^>]*)>/g; let m;
      while ((m = re.exec(this._html))) {
        const [, close, t, attrs] = m;
        if (/^(svg|path|br)$/i.test(t)) continue;   /* drawing, not structure */
        if (close) { if (stack.length > 1) stack.pop(); continue; }
        const c = makeNode(t); const cm = /class="([^"]*)"/.exec(attrs); if (cm) c.className = cm[1];
        stack[stack.length - 1].appendChild(c); stack.push(c);
      }
    },
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    contains(o) { for (let p = o; p; p = p.parentNode) if (p === this) return true; return false; },
    insertAdjacentElement(where, el) {
      const p = this.parentNode; if (!p) return null;
      const i = p.children.indexOf(this);
      p.children.splice(where === 'beforebegin' ? i : i + 1, 0, el); el.parentNode = p; return el;
    },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
    addEventListener(t, f) { (this._on[t] = this._on[t] || []).push(f); },
    getBoundingClientRect() { return this.rect || (this.parentNode ? this.parentNode.getBoundingClientRect() : { left: 0, top: 0, right: 0, bottom: 0 }); },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) {
      const want = String(sel).split('.').filter(Boolean); const out = [];
      (function walk(node) { node.children.forEach((c) => { const cl = c._cls.split(/\s+/); if (want.every((w) => cl.includes(w))) out.push(c); walk(c); }); })(this);
      return out;
    }
  };
  return n;
}
let DOC_ROOT = null;
let HITS = () => [];
function env() {
  DOC_ROOT = makeNode('html');
  const mapWrap = makeNode('div'); DOC_ROOT.appendChild(mapWrap);
  const map = makeNode('div'); map.id = 'map'; mapWrap.appendChild(map);
  const panel = makeNode('div'); panel.className = 'atl-msgs'; DOC_ROOT.appendChild(panel);
  globalThis.window = globalThis;
  globalThis.innerWidth = 1280; globalThis.innerHeight = 800;
  globalThis.getComputedStyle = (n) => Object.assign({ display: 'block', visibility: 'visible', opacity: '1' }, n.css || {});
  /* the runtime's wheel, keyed as the real one is — the trace's clock and the pill's question are two keys */
  const wheel = new Map();
  globalThis.IntMapRuntime = { every: (k, ms, fn) => { wheel.set(k, fn); return () => { wheel.delete(k); }; }, clearEvery: (k) => { wheel.delete(k); } };
  globalThis.document = {
    body: { classList: { contains: () => false } },
    createElement: (t) => makeNode(t),
    getElementById: (id) => (id === 'map' ? map : null),
    elementsFromPoint: (x, y) => HITS(x, y)
  };
  return { panel, mapWrap, tick: () => { const f = wheel.get('atl-hud-seen'); if (f) f(); }, ticking: () => wheel.has('atl-hud-seen') };
}

async function mount() {
  const E = env();
  const { makeAtlasProgress } = await import('../js/atlas-progress.js');
  const { makeAtlasLive } = await import('../js/atlas-live.js');
  const { makeAtlasPlan } = await import('../js/atlas-plan.js');
  const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
  const caps = makeAtlasCapabilities({});
  const PROG = makeAtlasProgress({}, { L: (en) => en, esc: (s) => String(s == null ? '' : s), capabilities: () => caps });
  const PLAN = makeAtlasPlan();
  const opened = [];
  const LIVE = makeAtlasLive({}, { L: (en) => en, progress: PROG, plan: PLAN, GE: () => null, objects: () => null, openPanel: () => opened.push(1) });
  const bubble = makeNode('div'); bubble.className = 'atl-b a'; E.panel.appendChild(bubble);
  PROG.open(bubble); PROG.phase(bubble, 'think');
  const trace = PROG.traceEl(bubble);
  trace.rect = { left: 20, top: 100, right: 360, bottom: 220 };
  /* the trace answers the point the reader looks at — unless a test lays something over it */
  HITS = () => [trace.querySelector('.atl-trace-head'), trace, E.panel];
  return { E, PROG, PLAN, LIVE, bubble, trace, opened, hud: () => E.mapWrap.querySelector('.atl-hud') };
}
const isOn = (h) => !!(h && h.classList.contains('on'));

test('atlas-progress-one ① while the trace can be seen, the map carries no progress at all', async () => {
  const { E, LIVE, bubble, hud } = await mount();
  LIVE.begin(bubble);
  E.tick();
  assert.equal(isOn(hud()), false, 'a pill stood on the map while the trace it repeats was on screen');
  assert.equal(E.mapWrap.querySelectorAll('.atl-hud-op').length, 0, 'operation chips on the map');
  assert.equal(E.mapWrap.querySelectorAll('.atl-plan').length, 0, 'a plan card on the map');
  LIVE.end(bubble, 'answered');
});

test('atlas-progress-one ② when the trace cannot be seen, ONE pill says the trace\'s word — and it goes when the trace comes back', async () => {
  const { E, PROG, LIVE, bubble, trace, hud, opened } = await mount();
  LIVE.begin(bubble);
  /* the sidebar closed: the trace is outside the viewport */
  trace.rect = { left: -400, top: 100, right: -60, bottom: 220 };
  E.tick();
  assert.equal(isOn(hud()), true, 'nothing on the map said Atlas was working while its trace was out of sight');
  assert.equal(E.mapWrap.querySelectorAll('.atl-hud').length, 1, 'more than one pill');
  assert.equal(hud().querySelector('.atl-hud-word').textContent, PROG.liveWord(bubble), 'the pill kept a word of its own');
  /* in the viewport, but another surface lies on it */
  trace.rect = { left: 20, top: 100, right: 360, bottom: 220 };
  const sheet = makeNode('div'); E.panel.parentNode.appendChild(sheet);
  HITS = () => [sheet, trace];
  E.tick();
  assert.equal(isOn(hud()), true, 'a trace under another surface was counted as seen');
  /* in the viewport but transparent (a minimised workspace window fading out) */
  HITS = () => [trace.querySelector('.atl-trace-head'), trace];
  E.panel.css = { opacity: '0' };
  E.tick();
  assert.equal(isOn(hud()), true, 'a transparent trace was counted as seen');
  E.panel.css = null;
  /* the pill itself standing over the trace does not hide the trace (it is looked through) */
  HITS = () => [hud(), trace.querySelector('.atl-trace-head'), trace];
  E.tick();
  assert.equal(isOn(hud()), false, 'the pill kept itself alive by covering the trace');
  /* pressing it opens Atlas through the console's own door */
  trace.rect = { left: -400, top: 100, right: -60, bottom: 220 }; E.tick();
  (hud()._on.click || []).forEach((f) => f());
  assert.equal(opened.length, 1, 'the pill did not open Atlas');
  /* the turn ends out of sight: the ending word, then nothing */
  const real = Date.now;
  try {
    /* the console ends the stream a moment before the trace (js/atlas-console.js): the ending word is
       already the pill's in that moment, not a stale 「Thinking」 */
    LIVE.end(bubble, 'answered');
    assert.equal(hud().querySelector('.atl-hud-word').textContent, PROG.endWord('answered'), 'the pill said the turn was still thinking after it ended');
    PROG.done(bubble);
    E.tick();
    assert.equal(isOn(hud()), true);
    assert.equal(hud().querySelector('.atl-hud-word').textContent, PROG.endWord('answered'));
    const t = real(); Date.now = () => t + 60_000;
    E.tick();
    assert.equal(isOn(hud()), false, 'the pill outlived its turn');
    assert.equal(E.ticking(), false, 'the visibility question kept being asked after the pill went');
  } finally { Date.now = real; }
});

test('atlas-progress-one ③ the plan is inside the trace, its states are the ledger\'s, its marks are the trace\'s', async () => {
  const { E, PROG, PLAN, LIVE, bubble, trace } = await mount();
  LIVE.begin(bubble);
  PLAN.beginTurn();
  PLAN.declare({ goal: 'Show Tokyo', steps: ['Find Tokyo', 'Draw it'], current: 1 });
  PLAN.started('c1', { step: 0, capability: 'view.flyTo' });
  PLAN.settled('c1', { capability: 'view.flyTo', ok: true, status: 'completed' });
  const slot = trace.querySelector('.atl-trace-plan');
  assert.ok(slot && trace.contains(slot), 'the trace has no place for the plan');
  assert.equal(slot.querySelector('.atl-plan-goal').textContent, 'Show Tokyo');
  assert.equal(slot.querySelector('.atl-plan-count').textContent, '1/2');
  const steps = slot.querySelectorAll('.atl-plan-step');
  assert.equal(steps.length, 2);
  const snap = PLAN.snapshot();
  assert.equal(snap.steps[0].state, 'completed');
  assert.ok(steps[0].classList.contains('atl-trace-row') && steps[0].classList.contains('ok'), 'a completed step does not wear the trace\'s tick');
  assert.ok(steps[0].querySelector('.atl-trace-mark'), 'the step has no mark');
  assert.ok(steps[1].classList.contains('s-' + snap.steps[1].state), 'the step\'s state is not the ledger\'s');
  assert.ok(!steps[1].classList.contains('ok'), 'a step nothing ran under wears a tick');
  /* an unobserved effect is a ring, never a tick */
  PLAN.declare({ current: 2 });
  PLAN.started('c2', { step: 1, capability: 'map.compose' });
  PLAN.settled('c2', { capability: 'map.compose', ok: true, status: 'unobserved' });
  const s2 = slot.querySelectorAll('.atl-plan-step')[1];
  assert.ok(s2.classList.contains('warn') && !s2.classList.contains('ok'), 'an unobserved step was shown as done');
  assert.equal(E.mapWrap.querySelectorAll('.atl-plan').length, 0, 'the plan also stood on the map');
  /* the next turn's trace takes the plan over — one plan, one place */
  PLAN.endTurn('answered'); LIVE.end(bubble, 'answered'); PROG.done(bubble);
  assert.ok(PROG.traceEl(bubble), 'a finished trace holding the plan removed itself');
  const b2 = makeNode('div'); b2.className = 'atl-b a'; E.panel.appendChild(b2);
  PROG.open(b2); PROG.phase(b2, 'think'); LIVE.begin(b2);
  assert.equal(E.panel.querySelectorAll('.atl-plan').length, 1, 'the plan stood in two traces');
  assert.ok(PROG.traceEl(b2).querySelector('.atl-plan'), 'the plan did not move to the latest turn');
  LIVE.end(b2, 'answered'); PROG.done(b2);
});

test('atlas-progress-one ④ the live word is drawn by one element, and the trace head says how the turn ended', async () => {
  const { E, PROG, LIVE, bubble, trace, hud } = await mount();
  LIVE.begin(bubble);
  PROG.setLive(bubble, PROG.wordFor('research.brief'));
  E.tick();
  const word = PROG.wordFor('research.brief');
  const writes = (r) => r.querySelectorAll('').filter((n) => n.children.length === 0 && n._text === word).length;
  const drawn = writes(trace) + (isOn(hud()) ? writes(hud()) : 0);
  assert.equal(drawn, 1, 'the live word is written by ' + drawn + ' visible elements');
  LIVE.end(bubble, 'cancelled'); PROG.done(bubble);
  assert.match(trace.querySelector('.atl-trace-sum').textContent, new RegExp('^' + PROG.endWord('cancelled')), 'the head does not say the turn stopped');
});

test('atlas-progress-one ⑤ no module puts operation chips or a plan card on the map any more', () => {
  const live = read('js/atlas-live.js');
  assert.doesNotMatch(live, /atl-hud-ops|atl-hud-op\b|atl-hud-plan/, 'the map HUD still builds chips or a plan slot');
  assert.doesNotMatch(read('js/atlas-plan.js'), /ATLAS_PLAN_CSS|atl-plan-x/, 'the plan still carries a map card');
  /* the pill keeps no words of its own for what Atlas is doing — it reads the trace's */
  assert.match(live, /PROG\.liveWord\(/);
  assert.doesNotMatch(live, /L\('Thinking'|L\('Researching'|L\('Answered'/, 'the pill wrote its own copy of the trace\'s words');
});
