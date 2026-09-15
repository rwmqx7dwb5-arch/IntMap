/* R742 — the identity of a call is the fields that carry a request, at every depth

   ⚠⚠⚠ MEASURED ON PRODUCTION 2026-09-15 with the shipped IntMapAtlasTurnResults.callKey:

       callKey('map_view',       {place:'Kazakhstan'})                        === +{zoom:''}
       callKey('run_capability', {id:'map.pin', args:{place:'36.5585, 21.1286'}}) !== +{title:''}

   The rule that an empty field carries no request lived in the loops of `callKey` and `opKey`,
   which walk the TOP level only. The ten CORE tools (js/atlas-toolsurface.js) put their arguments
   at the top level, so for them it worked. The other ~120 capabilities are reached through
   `run_capability`, whose shape is `{id, args:{…}}` — one level down — so for all of them the rule
   was inert. `map.pin` declares eight free-text fields (js/atlas-schemas.js), so a single blank
   title made a new call.

   What that cost, measured: "What is the deepest point in the Mediterranean Sea? Fly there and mark
   it." drew the SAME pin at the SAME coordinates seven times — 22 steps, 2m14s, six duplicate map
   objects — with every actionOutcome reading `ok`. The ISS question re-ran `layers.satellites` five
   times; the Trans-Siberian question re-ran `railAxis` five times. js/atlas-agent.js's repeat guard
   could not stop any of it either: it counts a step only when EVERY call in it was a reuse, and with
   keys that never matched, none ever was.

   These measure the property, not the spelling: two calls that ask for the same thing have the same
   identity, whichever depth the asking sits at. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAtlasTurnResults } from '../js/atlas-turn-results.js';

const TR = makeAtlasTurnResults();
const key = (n, a) => TR.callKey(n, a);

test('R742 ⑩ a blank field adds nothing to a call, at the top level AND inside args', () => {
  /* the CORE shape, which already worked — kept so the fix cannot be a swap */
  assert.equal(key('map_view', { place: 'Kazakhstan' }), key('map_view', { place: 'Kazakhstan', zoom: '' }),
    'an empty field at the top carries no request');

  /* the run_capability shape, where ~120 of the ~130 capabilities actually live */
  const pin = { id: 'map.pin', args: { place: '36.5585, 21.1286' } };
  assert.equal(key('run_capability', pin),
    key('run_capability', { id: 'map.pin', args: { place: '36.5585, 21.1286', title: '' } }),
    'a blank title one level down is the production defect: it made a seventh identical pin');
  assert.equal(key('run_capability', pin),
    key('run_capability', { id: 'map.pin', args: { place: '36.5585, 21.1286', title: '', description: '', url: '', country: '' } }),
    'four of map.pin\'s eight free-text fields left blank are still the same request');
  assert.equal(key('run_capability', pin),
    key('run_capability', { id: 'map.pin', args: { place: '36.5585, 21.1286', tags: [], extra: {} } }),
    'an empty array and an empty object carry no request either — the same rule isEmpty already states');
});

test('R742 ⑪ a field that DOES carry a request still separates two calls', () => {
  const base = { id: 'map.pin', args: { place: '36.5585, 21.1286' } };
  assert.notEqual(key('run_capability', base),
    key('run_capability', { id: 'map.pin', args: { place: '36.5585, 21.1286', title: 'Calypso Deep' } }),
    'a title someone wrote is part of what was asked for');
  assert.notEqual(key('run_capability', base),
    key('run_capability', { id: 'map.pin', args: { place: '36.558478, 21.128561' } }),
    'a different place is a different call, however close the two points are');
  assert.notEqual(key('run_capability', base),
    key('run_capability', { id: 'map.circle', args: { place: '36.5585, 21.1286' } }),
    'the capability being run is part of the identity');
});

test('R742 ⑫ the ordering and whitespace rules reach every depth too', () => {
  assert.equal(key('run_capability', { id: 'x', args: { a: 1, b: 2 } }),
    key('run_capability', { args: { b: 2, a: 1 }, id: 'x' }),
    'the same options spelled in another order are the same call, nested as well as flat');
  assert.equal(key('run_capability', { id: 'x', args: { place: '大阪駅' } }),
    key('run_capability', { id: 'x', args: { place: ' 大阪駅 ' } }),
    'norm() reaches nested strings — the reason it exists does not stop at the first level');
});

test('R742 ⑬ deeper nesting obeys the same rule, so no depth is a special case', () => {
  assert.equal(key('run_capability', { id: 'x', args: { filter: { kind: 'port', note: '' } } }),
    key('run_capability', { id: 'x', args: { filter: { kind: 'port' } } }),
    'two levels down is not a new rule');
  assert.equal(key('run_capability', { id: 'x', args: { rows: [{ a: 1, b: '' }] } }),
    key('run_capability', { id: 'x', args: { rows: [{ a: 1 }] } }),
    'inside an array, too');
});

test('R742 ⑭ opKey is built from the same rendering, so an action is deduped the same way', () => {
  /* opKey decides what the READER is shown; callKey decides what is RUN. They disagreeing about
     what counts as the same request is how one of them ends up doing the work twice. */
  assert.equal(TR.opKey({ type: 'pin', opts: { place: 'x', title: '' } }),
    TR.opKey({ type: 'pin', opts: { place: 'x' } }),
    'a nested blank does not make a second operation either');
});
