/* Atlas fact merge — several workers' STATED facts matched by real-world object, across scripts.
   Evaluates the code (the real world-object index as the resolver's source); nothing here reads source text. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAtlasGeoObject } from '../js/atlas-geo-object.js';
import { makeAtlasWorldObjects } from '../js/atlas-world-objects.js';
import { mergeFacts, normalizeFact, makeFactResolver } from '../js/atlas-orchestrate.js';
import { shapeOf } from '../js/atlas-delegate.js';

const geo = makeAtlasGeoObject();
const done = (id, facts) => ({ id, state: 'done', facts, findings: [], gaps: [], sources: [] });
const index = () => {
  const W = makeAtlasWorldObjects();
  W.register([geo.worldObject({ type: 'facility', kind: 'port', id: 'wd-Q1', name: 'Port of Rotterdam', lng: 4.05, lat: 51.95, provenance: 'feed_coordinate', ids: { wikidata: 'Q1' } })]);
  return W;
};
const resolverOf = (W) => makeFactResolver({ find: (q) => W.find(q), findPersisted: async () => null });
const row = (m, attr) => m.objects[0].attributes.find((a) => a.attribute.toLowerCase() === attr);

test('① the same object named in two scripts is ONE object when an id or the index says so — and the same value agrees', async () => {
  const W = index();
  const m = await mergeFacts([
    done('en', [{ subject: { name: 'Port of Rotterdam' }, attribute: 'throughput', value: 14.4, unit: 'Mt', at: '2023', source: 'https://a.example/x' }]),
    done('jp', [{ subject: { name: 'ロッテルダム港', ids: { wikidata: 'Q1' } }, attribute: 'throughput', value: 14.4, unit: 'Mt', at: '2023', source: 'https://b.example/y', evidenceId: 'ev-7' }]),
  ], { resolve: resolverOf(W) });
  assert.equal(m.objects.length, 1, 'one object, not two spellings');
  assert.equal(m.objects[0].ref, 'facility:wd-Q1');
  assert.equal(m.objects[0].resolved, true);
  const r = row(m, 'throughput');
  assert.equal(r.status, 'agree');
  assert.deepEqual(r.tasks.slice().sort(), ['en', 'jp']);
  assert.equal(m.counts.agree, 1);
});

test('② a different value is a conflict that carries every observation with its source and evidence', async () => {
  const W = index();
  const m = await mergeFacts([
    done('en', [{ subject: { name: 'Port of Rotterdam' }, attribute: 'Throughput', value: 14.4, unit: 'Mt', at: '2023', source: 'https://a.example/x' }]),
    done('jp', [{ subject: { name: 'ロッテルダム港', ids: { wikidata: 'Q1' } }, attribute: 'throughput', value: 13.1, unit: 'Mt', at: '2023', source: 'https://b.example/y', evidenceId: 'ev-7' }]),
  ], { resolve: resolverOf(W) });
  const r = row(m, 'throughput');
  assert.equal(r.status, 'conflict');
  assert.equal(r.values.length, 2);
  const jp = r.values.find((v) => v.value === 13.1);
  assert.equal(jp.observations[0].evidenceId, 'ev-7');
  assert.equal(jp.observations[0].source, 'https://b.example/y');
  assert.ok(r.relDiff > 0 && r.relDiff < 0.1, 'the difference is measured, not judged');
});

test('③ a different unit is reported as not comparable; a different year is another row, not a conflict', async () => {
  const W = index();
  const m = await mergeFacts([
    done('a', [{ subject: { name: 'Port of Rotterdam' }, attribute: 'throughput', value: 14.4, unit: 'Mt', at: '2023' }, { subject: { name: 'Port of Rotterdam' }, attribute: 'throughput', value: 12, unit: 'Mt', at: '2020' }]),
    done('b', [{ subject: { name: 'Port of Rotterdam' }, attribute: 'throughput', value: 14400000, unit: 'tonnes', at: '2023' }]),
  ], { resolve: resolverOf(W) });
  const rows = m.objects[0].attributes;
  assert.equal(rows.length, 2, '2023 and 2020 are separate rows');
  const y23 = rows.find((r) => /2023/.test(r.at));
  assert.equal(y23.status, 'conflict');
  assert.equal(y23.unitMismatch, true);
  assert.equal(rows.find((r) => /2020/.test(r.at)).status, 'single');
});

test('④ a worker that covered the object but not the attribute is missingFrom; one worker alone is single, never agree', async () => {
  const W = index();
  const m = await mergeFacts([
    done('a', [{ subject: { ref: 'facility:wd-Q1' }, attribute: 'operator', value: 'Port of Rotterdam Authority' }]),
    done('b', [{ subject: { name: 'Port of Rotterdam' }, attribute: 'throughput', value: 14.4, unit: 'Mt', at: '2023' }]),
  ], { resolve: resolverOf(W) });
  assert.equal(m.objects.length, 1);
  assert.equal(row(m, 'operator').status, 'single');
  assert.deepEqual(row(m, 'operator').missingFrom, ['b']);
  assert.deepEqual(row(m, 'throughput').missingFrom, ['a']);
  assert.equal(m.counts.missing, 2);
});

test('⑤ shared external ids fold two facts with no resolver at all; a name nothing resolves stays apart and is listed', async () => {
  const m = await mergeFacts([
    done('a', [{ subject: { name: 'Rotterdam port', ids: { wikidata: 'Q1' } }, attribute: 'x', value: 1 }]),
    done('b', [{ subject: { name: 'ロッテルダム港', ids: { wikidata: 'Q1' } }, attribute: 'x', value: 1 }]),
    done('c', [{ subject: { name: '鹿特丹港' }, attribute: 'x', value: 1 }]),
  ]);
  assert.equal(m.objects.length, 2);
  const folded = m.objects.find((o) => o.ids);
  assert.deepEqual(folded.tasks.slice().sort(), ['a', 'b']);
  assert.equal(m.unresolved.length, 2, 'both groups lack a ref: said so, not guessed');
  assert.equal(m.unresolved.find((u) => u.names.includes('鹿特丹港')).tasks[0], 'c');
});

test('⑥ a resolver that throws is observed, not fatal; unusable results and empty facts are ignored', async () => {
  const m = await mergeFacts([
    done('a', [{ subject: { name: 'X' }, attribute: 'x', value: 1 }, { subject: { name: 'Y' }, attribute: 'x' }, null]),
    { id: 'f', state: 'failed', facts: [{ subject: { name: 'X' }, attribute: 'x', value: 2 }] },
  ], { resolve: () => { throw new Error('down'); } });
  assert.equal(m.objects.length, 1);
  assert.equal(m.unresolved[0].resolveFailed, true);
  assert.equal(row(m, 'x').status, 'single', 'the failed worker contributes nothing');
});

test('⑦ the worker answer shape keeps facts and drops what states nothing checkable', () => {
  const r = shapeOf({ summary: 's', findings: [], facts: [{ subject: { name: 'A', ids: { wikidata: 'Q1' } }, attribute: 'pop', value: 5, unit: 'm', at: '2020-01-01' }, { subject: {}, attribute: 'x', value: 1 }, { subject: 'B', attribute: '', value: 1 }, { subject: 'B', attribute: 'a', value: NaN }] });
  assert.equal(r.ok, true);
  assert.equal(r.out.facts.length, 1);
  assert.equal(r.out.facts[0].subject.ids.wikidata, 'Q1');
  assert.equal(normalizeFact({ subject: 'A', attribute: 'a', value: 'v', at: 'not a date' }).at, undefined, 'no time is invented');
});
