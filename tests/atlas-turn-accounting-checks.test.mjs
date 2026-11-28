import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunLedger, registerRunLedger, observeAtlasProviderCall } from '../js/atlas-run-ledger.js';
import { buildTurnMetrics, makeTurnRecorder, reportShown } from '../js/atlas-turn-metrics.js';
import { compareEffortReports, effortSample } from '../scripts/atlas-eval.mjs';

test('first artifact time starts at submit and ignores model-only and superseded tool results', () => {
  let time = 20;
  const rec = makeTurnRecorder({ startedAt: 0, now: () => time, turnKey: 'current', emit() {} });
  reportShown({ meta: { produced: ['map'] } }, 'older');
  reportShown({ meta: { modelOnly: true, produced: ['chart'] } }, 'current');
  time = 25;
  reportShown({ drew: [{ visible: false }] }, 'current');
  time = 39;
  reportShown({ meta: { produced: ['table'] } }, 'current');
  time = 60;
  const row = rec.recordAnswer({ completion: 'partial' }, 'current');
  assert.deepEqual([row.first_useful_ms, row.total_ms], [39, 60]);
});

test('origin call IDs, known zero, paid failures and unobserved calls survive turn replacement', async () => {
  const old = makeRunLedger(), current = makeRunLedger(), gate = Promise.withResolvers();
  const closeOld = registerRunLedger('older', old);
  const closeCurrent = registerRunLedger('current', current);
  const ask = (turnId, id, call) => observeAtlasProviderCall({ turnId, task: 'web_search' }, id, call);
  try {
    const running = ask('older', 'zero', () => gate.promise);
    assert.deepEqual(old.summary().providerCallIds, ['zero']);
    assert.equal(old.summary().costUnknownCalls, 1);
    closeOld();
    await assert.rejects(ask('current', 'billed', () => { throw Object.assign(new Error('invalid'), { meta: { costUsd: 0.004 } }); }));
    await assert.rejects(ask('current', 'unknown', () => { throw new Error('network timeout'); }));
    gate.resolve({ meta: { costUsd: 0, costComplete: true } });
    await running;
    assert.deepEqual([old.summary().costUsd, old.summary().costUnknownCalls], [0, 0]);
    assert.deepEqual([current.summary().costUsd, current.summary().costUnknownCalls], [0.004, 1]);
    assert.deepEqual(current.summary().providerCallIds, ['billed', 'unknown']);
  } finally { closeOld(); closeCurrent(); }
});

test('pending worker and durable work do not masquerade as complete price observations', () => {
  const delegate = (state, calls) => ({ details: { delegationRun: 'batch' }, delegated: [{ id: 'reader', state, calls }] });
  const running = delegate('running', 0);
  assert.equal(buildTurnMetrics({ results: [running] }).pending_delegation, true);
  const completed = buildTurnMetrics({ results: [running, delegate('done', 2)] });
  assert.equal(completed.pending_delegation, false);
  assert.equal(completed.delegated_model_tasks, 1);
  assert.equal(buildTurnMetrics({ results: [{ details: { job: { created: true } } }] }).pending_delegation, true);
});

test('paired comparison keeps zero and missing measurements distinct and validates the conditions', () => {
  const report = (policy, n) => ({
    build: { sha: 'same' }, url: 'https://example.test/', effortComparison: { policy, conditions: 'same' },
    turns: [{ id: 'paired', text: 'Show two study areas.', lang: 'en',
      effort: { costMicros: n, firstUsefulMs: n, totalMs: n },
      deliverables: { rows: [{ kind: 'map', why: 'requested' }, { kind: 'table', why: 'requested' }], present: 1, unobserved: 1 } }],
  });
  const auto = report('auto', 0), high = report('high-fixed', null);
  const [pair] = compareEffortReports(auto, high).pairs;
  assert.equal(pair.auto.totalCostMicros, 0);
  assert.equal(pair.highFixed.totalCostMicros, null);
  assert.equal(pair.delta.totalCostMicros, null);
  assert.deepEqual([pair.auto.achievedTargets, pair.auto.requestedTargets, pair.auto.unobservedTargets], [1, 2, 1]);
  assert.equal(effortSample(auto.turns, 'auto').observedCostMicros, 0);
  assert.equal(effortSample(high.turns, 'high-fixed').observedCostMicros, null);
  high.effortComparison.conditions = 'changed image';
  assert.throws(() => compareEffortReports(auto, high), /images/);
});
