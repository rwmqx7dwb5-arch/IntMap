/* fact-comparability — two numbers about one object may be set side by side only if they measure the same thing.
   Evaluates the code (mergeFacts with fake semantic layer / unit kernel / graph); nothing here reads source text.
   What is held: ① a differing value whose SCOPE differs says so, and its status stays `conflict`; ② a silent facet is
   `unstated`/`partial` and never `same`; ③ a facet the worker left out is taken from the semantic layer through the column
   it names, marked as derived — and the layer's own comparable() verdict rides along; ④ the unit kernel decides spellings,
   and without it the facet says it was not observed; ⑤ ties that begin or end inside the span are returned verbatim, and a
   graph that cannot be read is `checked:false`, not "no change". */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGisUnits } from '../js/gis-units.js';
import { mergeFacts, normalizeFact } from '../js/atlas-orchestrate.js';

const done = (id, facts) => ({ id, state: 'done', facts, findings: [], gaps: [], sources: [] });
const subj = { ref: 'admin:jp-13' };
const fact = (over) => Object.assign({ subject: subj, attribute: 'population', value: 13.9, unit: 'M', at: '2020' }, over);
const row = (m) => m.objects[0].attributes[0];

test('① a different value measured over a different scope is a conflict AND says the scopes differ', async () => {
  const m = await mergeFacts([
    done('a', [fact({ value: 13.9, scope: 'admin-area' })]),
    done('b', [fact({ value: 37.4, scope: 'metro-area' })]),
  ]);
  const r = row(m);
  assert.equal(r.status, 'conflict', 'the status is still the merge\'s own — comparability changes nothing');
  assert.equal(r.comparability.state, 'differs');
  assert.deepEqual(r.comparability.differing, ['scope']);
  assert.deepEqual(r.comparability.facets.scope.values.map((v) => v.value).sort(), ['admin-area', 'metro-area']);
});

test('② nobody stating a facet is `unstated`, one worker stating it is `partial` with the silent one named — never `same`', async () => {
  const m = await mergeFacts([
    done('a', [fact({ value: 5, scope: 'admin-area', basis: 'present-day' })]),
    done('b', [fact({ value: 6 })]),
  ]);
  const c = row(m).comparability;
  assert.equal(c.facets.scope.state, 'partial');
  assert.deepEqual(c.facets.scope.silent, ['b']);
  assert.equal(c.facets.aggregation.state, 'unstated');
  assert.equal(c.state, 'unknown');
  assert.ok(c.unstated.includes('basis') && c.unstated.includes('aggregation'));
  const same = await mergeFacts([done('a', [fact({ scope: 'admin-area' })]), done('b', [fact({ scope: 'Admin Area' })])]);
  assert.equal(row(same).comparability.facets.scope.state, 'same', 'spelling folds, so the same words are the same');
});

test('② a period is part of what a row is: the same year over two spans is two rows, and a total is not a reading', async () => {
  const m = await mergeFacts([
    done('a', [fact({ attribute: 'throughput', value: 14.4, period: { from: '2023-01-01', to: '2023-12-31' } })]),
    done('b', [fact({ attribute: 'throughput', value: 3.6, period: { from: '2023-10-01', to: '2023-12-31' } })]),
  ]);
  assert.equal(m.objects[0].attributes.length, 2, 'two spans are not one row to be compared');
  assert.ok(m.objects[0].attributes.every((r) => r.status === 'single' && !r.comparability));
});

test('③ a fact that names its dataset column takes missing facets from the semantic layer, marked derived, and carries its comparable() verdict', async () => {
  const semantics = {
    describe: (id) => ({ ok: true, id, scope: { state: 'stated', value: { kind: id === 'pop-metro' ? 'metro-area' : 'admin-area' }, from: 'declared' },
      basis: { state: 'unstated' }, columns: [{ name: 'pop', basis: { state: id === 'pop-metro' ? 'derived' : 'stated', value: id === 'pop-metro' ? 'as-of-time' : 'present-day', from: 'lineage' }, unit: { state: 'stated', value: 'persons' }, aggregation: { state: 'unstated' } }] }),
    comparable: (a, b) => ({ ok: true, comparable: false, quantity: { verdict: 'comparable' }, warnings: [{ code: 'basis-differs', severity: 'caution', message: { en: 'x', jp: 'y' } }] }),
  };
  const m = await mergeFacts([
    done('a', [fact({ column: { dataset: 'pop-admin', field: 'pop' } })]),
    done('b', [fact({ value: 9, column: { dataset: 'pop-metro', field: 'pop' } })]),
  ], { semantics });
  const c = row(m).comparability;
  assert.deepEqual(c.differing.sort(), ['basis', 'scope']);
  assert.match(c.facets.basis.values[0].from, /^semantic-layer:pop-(admin|metro)/);
  assert.equal(c.semantics[0].comparable, false);
  assert.equal(c.semantics[0].warnings[0].code, 'basis-differs');
  /* without the layer the columns are named but nothing is read — and that is said */
  const bare = await mergeFacts([done('a', [fact({ column: { dataset: 'x', field: 'f' } })]), done('b', [fact({ value: 2, column: { dataset: 'y', field: 'f' } })])]);
  assert.ok(row(bare).comparability.unobserved.includes('semantic-layer'));
});

test('④ the unit kernel decides whether two spellings are one measurement; without it the facet says it was not observed', async () => {
  const units = { compare: (a, b) => ({ verdict: (a === 'km' && b === 'mi') || (a === 'mi' && b === 'km') ? 'convertible' : 'incompatible' }) };
  const conv = await mergeFacts([done('a', [fact({ attribute: 'length', value: 10, unit: 'km' })]), done('b', [fact({ attribute: 'length', value: 6.2, unit: 'mi' })])], { units });
  assert.equal(row(conv).comparability.facets.unit.state, 'same');
  assert.equal(row(conv).unitMismatch, true, 'the merge still reports the spelling difference it always did');
  const inc = await mergeFacts([done('a', [fact({ attribute: 'length', value: 10, unit: 'km' })]), done('b', [fact({ attribute: 'length', value: 3, unit: 'TEU' })])], { units });
  assert.equal(row(inc).comparability.facets.unit.state, 'differs');
  const none = await mergeFacts([done('a', [fact({ unit: 'km' })]), done('b', [fact({ value: 2, unit: 'mi' })])]);
  assert.equal(row(none).comparability.facets.unit.state, 'differs');
  assert.ok(row(none).comparability.unobserved.includes('unit-kernel'));
});

test('⑤ ties that begin or end inside the span the values cover come back verbatim; an unreadable graph is checked:false', async () => {
  const ms = (y) => Date.UTC(y, 0, 1);
  const ties = async (ref) => ({ ties: [{ rel: 'part_of', ref: 'admin:jp-metro', fromMs: ms(2005) }, { rel: 'operated_by', ref: 'company:x', fromMs: ms(1990) }], validity: { fromMs: ms(1950), toMs: ms(2010) } });
  const facts = [done('a', [fact({ at: '2000', value: 1 })]), done('b', [fact({ at: '2015', value: 2 })])];
  const m = await mergeFacts(facts, { ties });
  const b = m.objects[0].boundary;
  assert.equal(b.checked, true);
  assert.deepEqual(b.changedWithin.map((t) => t.rel), ['part_of'], 'a 1990 tie is not inside 2000–2015');
  assert.equal(b.changedWithin[0].begins, true);
  assert.equal(b.validity.ends, true, 'the object itself ending inside the span is reported');
  const broken = await mergeFacts(facts, { ties: async () => { throw new Error('db'); } });
  assert.deepEqual(broken.objects[0].boundary, { checked: false, failed: true });
  const absent = await mergeFacts(facts, {});
  assert.equal(absent.objects[0].boundary, undefined, 'no graph handed in: nothing is claimed either way');
});

test('normalizeFact keeps only what was stated: no default scope, basis, period or aggregation', () => {
  const f = normalizeFact({ subject: { name: 'X' }, attribute: 'a', value: 1 });
  for (const k of ['scope', 'basis', 'period', 'aggregation', 'column']) assert.equal(k in f, false, k);
  const g = normalizeFact({ subject: { name: 'X' }, attribute: 'a', value: 1, scope: { kind: 'radius' }, period: { from: '2023' }, column: { dataset: 'd', field: 'f' } });
  assert.equal(g.scope, 'radius'); assert.deepEqual(g.column, { dataset: 'd', field: 'f' }); assert.equal(g.period.from, '2023');
});

test('signed observations compare numerically while keeping the reported spelling', async () => {
  const merge = async (a, b) => row(await mergeFacts([done('a', [fact({ value: a, unit: 'm' })]), done('b', [fact({ value: b, unit: 'm' })])]));
  const equal = await merge('−12.50', -12.5);
  assert.equal(equal.status, 'agree');
  assert.deepEqual(equal.values.flatMap((v) => v.observations.map((o) => o.value)), ['−12.50', -12.5]);
  for (const a of [-17, '-17']) {
    for (const b of [17, '+17']) {
      const diff = await merge(a, b);
      assert.equal(diff.status, 'conflict');
      assert.equal(diff.relDiff, 2);
    }
  }
});

test('equivalent units compare after conversion, while distinct ratio symbols remain distinct evidence', async () => {
  const compare = async (a, b) => row(await mergeFacts([done('a', [fact(a)]), done('b', [fact(b)])], { units: makeGisUnits() }));
  const length = await compare({ value: '1', unit: 'km' }, { value: 1000, unit: 'm' });
  assert.equal(length.status, 'agree');
  assert.deepEqual(length.values.map((v) => [v.value, v.unit]), [['1', 'km'], [1000, 'm']]);
  const equivalent = await compare({ value: '−3%', unit: undefined }, { value: -30, unit: '‰' });
  assert.equal(equivalent.status, 'agree');
  assert.deepEqual(equivalent.comparability.facets.unit.values.map((v) => v.value), ['%', '‰']);
  const different = await compare({ value: 5, unit: '%' }, { value: 5, unit: '‰' });
  assert.equal(different.status, 'conflict');
  assert.ok(Math.abs(different.relDiff - 0.9) < 1e-15);
  for (const unit of ['kg', 'unregistered-scale', undefined]) {
    const unavailable = await compare({ value: 25, unit: 'm' }, { value: 25, unit });
    assert.equal(unavailable.status, 'pending');
    assert.equal(unavailable.unitMismatch, true);
    assert.equal(unavailable.relDiff, undefined);
  }
});

test('research.delegate compares units on a page that has not loaded GIS', async () => {
  const cap = (await import('../js/atlas-cap-research.js')).default.find((c) => c.row[0] === 'research.delegate');
  const previousWindow = globalThis.window;
  globalThis.window = {};
  const K = {
    HOST: {}, R: (ok, html, extra) => ({ ok, html, ...extra }), L: (en) => en, esc: String, warn: String,
    _curTurnKey: 'fact-comparison', turnSignal: () => undefined,
    askAIJSONEnvelope: async (prompt) => {
      const first = /first measurement/.test(prompt);
      return { data: { summary: 'Read the station record.', facts: [
        fact({ attribute: 'height', value: first ? 2000 : '2', unit: first ? 'm' : 'km' }),
        fact({ attribute: 'offset', value: 12, unit: first ? 'm' : 'kg' }),
      ] } };
    },
  };
  try {
    const result = await cap.run({ tasks: [{ goal: 'first measurement' }, { goal: 'second measurement' }], fresh: true }, {}, K);
    const facts = result.meta.integrated.facts;
    assert.equal(facts.counts.agree, 1);
    assert.equal(facts.counts.pending, 1);
    assert.match(result.html, /pending unit verification/);
    assert.doesNotMatch(result.html, /differ in what they measure/);
    assert.equal(globalThis.window.IntMapGisUnits, undefined);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('a quantity with an unreadable inline unit is held when the other worker reports a known unit', async () => {
  const units = makeGisUnits();
  const compare = async (a, b) => row(await mergeFacts([
    done('a', [fact({ value: a, unit: undefined })]),
    done('b', [fact({ value: b, unit: undefined })]),
  ], { units }));
  for (const [a, b] of [['1 furlong', '1 km'], ['0.25 unseenScale', '25 m']]) {
    const r = await compare(a, b);
    assert.equal(r.status, 'pending');
    assert.equal(r.comparisonPending, 'unit-conversion-unavailable');
    assert.equal(r.relDiff, undefined);
  }
  for (const v of ['3 May', '3 may', '3 Sept', '2026-05-03', '3 people were counted', '3人がいた']) {
    const r = await compare(v, '3 m');
    assert.equal(r.status, 'conflict');
    assert.equal(r.comparability.facets.unit.state, 'partial');
    assert.equal(r.relDiff, undefined);
  }
  assert.equal((await compare('3', '3 May')).status, 'conflict');
});

test('when the unit module is unavailable, two different inline units leave comparison pending', async () => {
  const r = row(await mergeFacts([
    done('a', [fact({ value: '5 km', unit: undefined })]),
    done('b', [fact({ value: '5000 m', unit: undefined })]),
  ]));
  assert.equal(r.status, 'pending');
  assert.equal(r.relDiff, undefined);
});
