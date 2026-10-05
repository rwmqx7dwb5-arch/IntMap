/* layer-ownership-by-declaration — js/layer-ownership.js, evaluated (not read).
 *
 * The defect (production 2026-10-05, build 076f908): the learner gave a Layers box every layer that APPEARED in the
 * seconds after it was ticked — the era borders of a clock that travelled in those seconds included — and the audit
 * then hid them whenever the box was off. These checks restate that defect as properties of the new learner:
 * a write is a box's only when that box's own OFF dispatch made it, and only when it took a drawn layer off.
 * The mechanism is the DOM's `eventPhase`: non-zero while an event is being dispatched, 0 once dispatch returned.
 * ⚠ Node's own EventTarget does NOT keep it — MEASURED (Node 24): it reads 2 in the first listener and 0 in the
 * second, mid-dispatch. So these checks dispatch with `fire` below, which does what the DOM specifies and nothing
 * else; the browser itself is exercised by tests/hist-urban-population.spec.js (the reported sequence, in the app). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ownershipLearner } from '../js/layer-ownership.js';

/* a Layers box: the two fields the learner reads, and its change listeners */
function box(id, checked) {
  const ls = [];
  return { id, checked, ls, addEventListener: (_type, fn) => ls.push(fn), dispatchEvent: (e) => fire(e, ls) };
}
/* dispatch as the DOM specifies for eventPhase: AT_TARGET (2) for every listener, NONE (0) once dispatch has returned */
function fire(e, ls) { e.eventPhase = 2; try { for (const fn of ls.slice()) fn(e); } finally { e.eventPhase = 0; } return true; }
function Event_(type) { return { type, target: null, eventPhase: 0 }; }
function rig() {
  const store = {}, own = ownershipLearner(store);
  /* the capture listener of js/data-layers.js, reduced to what it does — registered first, as a capture listener runs first */
  const watch = (b) => b.addEventListener('change', (e) => own.dispatching(e));
  return { store, own, watch };
}
const owned = (store, id) => [...(store[id] || [])].sort();

test('what a box\'s own OFF handler takes off the map is that box\'s', () => {
  const { store, own, watch } = rig();
  const b = box('dl-x', false); watch(b);
  b.addEventListener('change', () => { own.wrote('x-fill', false, true); own.wrote('x-line', false, true); });
  b.dispatchEvent(Object.assign(Event_('change'), { target: b }));
  assert.deepEqual(owned(store, 'dl-x'), ['x-fill', 'x-line']);
});

test('a layer added or hidden by someone else in the same seconds is nobody\'s — the reported defect', async () => {
  const { store, own, watch } = rig();
  const b = box('dl-histurban', true); watch(b);
  b.addEventListener('change', () => { /* an ON handler that starts async work */ });
  b.dispatchEvent(Object.assign(Event_('change'), { target: b }));
  /* the clock travels / the pane becomes drawable: the era borders are added, and later hidden again — outside any dispatch */
  await new Promise((r) => setTimeout(r, 0));
  own.wrote('imtb-line', true, false);
  own.wrote('imtb-line', false, true);
  b.checked = false; b.dispatchEvent(Object.assign(Event_('change'), { target: b }));   /* an OFF whose handler wrote nothing */
  own.wrote('imta-line', false, true);                         /* …and a write right after it returned */
  assert.deepEqual(store, {});
});

test('the ON side states nothing, nor does re-hiding what is already hidden', () => {
  const { store, own, watch } = rig();
  const on = box('dl-on', true); watch(on);
  on.addEventListener('change', () => { own.wrote('shared-era-borders', false, true); own.wrote('mine', true, false); });
  on.dispatchEvent(Object.assign(Event_('change'), { target: on }));
  const off = box('dl-off', false); watch(off);
  off.addEventListener('change', () => { own.wrote('already-hidden', false, false); });
  off.dispatchEvent(Object.assign(Event_('change'), { target: off }));
  assert.deepEqual(store, {});
});

test('a box whose OFF handler dispatches another box\'s change: each write goes to the innermost dispatch', () => {
  const { store, own, watch } = rig();
  const inner = box('dl-inner', false); watch(inner);
  inner.addEventListener('change', () => own.wrote('inner-layer', false, true));
  const outer = box('dl-outer', false); watch(outer);
  outer.addEventListener('change', () => { inner.dispatchEvent(Object.assign(Event_('change'), { target: inner })); own.wrote('outer-layer', false, true); });
  outer.dispatchEvent(Object.assign(Event_('change'), { target: outer }));
  assert.deepEqual(owned(store, 'dl-inner'), ['inner-layer']);
  assert.deepEqual(owned(store, 'dl-outer'), ['outer-layer']);
});
