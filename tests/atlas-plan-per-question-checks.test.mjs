/* ============================================================================
 *  atlas-plan-per-question — a checklist is drawn in the trace of the question that wrote it, never in the next question's
 * ----------------------------------------------------------------------------
 *  Measured on production 2026-11-28: a five-country GDP question declared a plan (2/2); the next question in the same conversation
 *  («G7 per-capita CO2 as a table») declared none, and its trace showed the GDP checklist. js/atlas-live.js opens the new reply and asks
 *  the plan view to draw BEFORE the loop tells the ledger a new turn has begun, so at that instant the ledger still called the old list
 *  «declared this turn». The order is reproduced here exactly as the page runs it: open the reply (render), then beginTurn.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';

/* the few DOM calls makePlanView makes, and nothing else */
class El {
  constructor(cls) { this.className = cls || ''; this.children = []; this.dataset = {}; this.attrs = {}; this.textContent = ''; this.classList = { toggle: () => {} }; }
  get firstChild() { return this.children[0] || null; }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {}
  set innerHTML(html) {
    this.children = [];
    if (/atl-plan/.test(String(html))) {
      const card = new El('atl-plan'); const head = new El('atl-plan-head');
      head.appendChild(new El('atl-plan-goal')); head.appendChild(new El('atl-plan-count'));
      card.appendChild(head); card.appendChild(new El('atl-plan-steps')); this.children.push(card);
    }
  }
  querySelector(sel) {
    const cls = sel.replace(/^\./, '');
    for (const c of this.children) { if (c.className.split(' ').includes(cls)) return c; const d = c.querySelector(sel); if (d) return d; }
    return null;
  }
}
globalThis.document = { createElement: () => new El('') };
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasPlan, makePlanView } = await import('../js/atlas-plan.js');

const goalOf = (slot) => { const g = slot.querySelector('.atl-plan-goal'); return g ? g.textContent : null; };

test('the next question\'s trace does not take over a plan it did not write; the plan stays where it was written', () => {
  const P = makeAtlasPlan({ geoProbe: {} });
  let slot = null;
  const V = makePlanView(P, { L: (en) => en, GE: () => null, objects: () => null, slot: () => slot, mark: () => null });
  /* question 1 writes a plan */
  const a = new El('atl-trace-plan'); slot = a;
  P.beginTurn();
  P.declare({ goal: 'compare five countries', steps: ['fetch', 'draw'], current: 1 });
  V.render();
  P.endTurn('answered');
  assert.equal(goalOf(a), 'compare five countries');
  /* question 2 opens its reply (the view is asked to draw) BEFORE the loop begins the ledger's turn — the page's order */
  const b = new El('atl-trace-plan'); slot = b;
  V.render();
  P.beginTurn();
  V.render();
  P.endTurn('answered');
  V.render();
  assert.equal(goalOf(b), null, 'question 2 wrote no plan, so its trace shows none');
  assert.equal(goalOf(a), 'compare five countries', 'question 1 keeps the plan it wrote');
});

test('a question that writes its own plan shows its own, and the earlier trace keeps the earlier one', () => {
  const P = makeAtlasPlan({ geoProbe: {} });
  let slot = null;
  const V = makePlanView(P, { L: (en) => en, GE: () => null, objects: () => null, slot: () => slot, mark: () => null });
  const a = new El('atl-trace-plan'); slot = a;
  P.beginTurn(); P.declare({ goal: 'first', steps: ['x'], current: 1 }); V.render(); P.endTurn('answered');
  const b = new El('atl-trace-plan'); slot = b;
  V.render(); P.beginTurn(); P.declare({ goal: 'second', steps: ['y', 'z'], current: 1 }); V.render(); P.endTurn('answered');
  assert.equal(goalOf(b), 'second');
  assert.equal(goalOf(a), 'first');
});

test('within one question, every redraw goes to that question\'s trace', () => {
  const P = makeAtlasPlan({ geoProbe: {} });
  let slot = null;
  const V = makePlanView(P, { L: (en) => en, GE: () => null, objects: () => null, slot: () => slot, mark: () => null });
  const a = new El('atl-trace-plan'); slot = a;
  P.beginTurn(); P.declare({ goal: 'g', steps: ['s1', 's2'], current: 1 }); V.render();
  P.declare({ current: 2 }); V.render();
  assert.equal(goalOf(a), 'g');
  assert.equal(a.querySelector('.atl-plan-steps').children.length, 2);
});
