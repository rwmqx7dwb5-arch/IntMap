/* ============================================================================
 *  atlas-parallel-truth — a worker returns EVIDENCE, not a verdict, evaluated (not read)
 *  js/atlas-delegate.js (makeWorkerExecutor · makeDelegation · shapeOf) · js/atlas-job-core.js (workerSystem · shapeOf)
 *  · js/atlas-cap-research.js (research.delegate's description)
 *  No network: the worker's model is a fake `ask` that hands back what a model would.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDelegation, makeWorkerExecutor, shapeOf } from '../js/atlas-delegate.js';
import { workerSystem } from '../js/atlas-job-core.js';

/* one worker, run through the real executor and the real substrate; `data` is what its model returns */
async function runWorker(data, extra) {
  const asked = [];
  const ask = async (prompt, system) => { asked.push({ prompt, system }); return Object.assign({ data, text: JSON.stringify(data), meta: { costUsd: 0.001 } }, extra || {}); };
  const D = makeDelegation({ parent: 't1-1', executor: makeWorkerExecutor({ ask, parentTurn: 't1-1' }) });
  const [r] = await D.run([{ id: 'w', goal: 'What did the port authority say about the closure?' }]);
  return { r, asked };
}

test('① the worker is told to return evidence — source, verbatim excerpt, what was not found — and not a verdict', () => {
  const sys = workerSystem('PERSONA');
  assert.match(sys, /EVIDENCE, not a conclusion/);
  assert.match(sys, /"excerpt": string/);
  assert.match(sys, /verbatim/);
  assert.match(sys, /"notFound": \[/);
  assert.match(sys, /capability you called/, 'a capability id is a source');
  assert.match(sys, /NOT an answer to the question/, 'the summary is what was done, not the conclusion');
  assert.doesNotMatch(sys, /what you found, 2-6 sentences/, 'the old summary-as-answer wording is gone');
});

test('② evidence items keep their source and excerpt all the way to the result Atlas reads', async () => {
  const { r } = await runWorker({
    summary: 'Searched the port authority site and two outlets; one statement found.',
    findings: [
      { claim: 'The port closed berth 4 on 3 Nov.', source: 'https://port.example/news/123', excerpt: 'Berth 4 will be closed from 3 November until further notice.', date: '2026-11-02' },
      { claim: 'Throughput was 1.2 Mt in October.', source: 'econ.data', excerpt: { value: 1.2, unit: 'Mt', period: '2026-10' } },
    ],
    notFound: [{ looked: 'a reopening date', where: 'port.example, Reuters, Lloyd\'s List' }, 'any statement from the ministry'],
    gaps: [],
  });
  assert.equal(r.state, 'done');
  assert.equal(r.findings.length, 2);
  assert.equal(r.findings[0].source, 'https://port.example/news/123');
  assert.equal(r.findings[0].excerpt, 'Berth 4 will be closed from 3 November until further notice.');
  assert.equal(r.findings[0].date, '2026-11-02');
  assert.equal(r.findings[1].source, 'econ.data', 'a capability id is kept as the source');
  assert.deepEqual(JSON.parse(r.findings[1].excerpt), { period: '2026-10', unit: 'Mt', value: 1.2 }, 'raw returned values are kept as the excerpt');
  assert.deepEqual(r.notFound, [{ looked: 'a reopening date', where: 'port.example, Reuters, Lloyd\'s List' }, { looked: 'any statement from the ministry' }]);
  assert.deepEqual({ ...r.evidence }, { findings: 2, sourced: 2, unsourced: 0, notFound: 2, none: false });
  assert.ok(!r.gaps.some((g) => /not evidence/.test(g)), 'fully sourced evidence gets no "not evidence" gap');
});

test('③ a reply that is only a prose verdict is reported as carrying no evidence — not silently accepted as evidence', async () => {
  const { r } = await runWorker({ summary: 'The closure is clearly temporary and the port will reopen within a week; nothing to worry about.' });
  assert.equal(r.findings.length, 0);
  assert.equal(r.evidence.none, true);
  assert.equal(r.evidence.sourced, 0);
  assert.ok(r.gaps.some((g) => /not evidence/.test(g)), 'a gap tells Atlas the summary is the worker\'s own statement');
  assert.equal(r.summary.startsWith('The closure is clearly temporary'), true, 'what it said is still readable — Atlas decides what to make of it');
});

test('④ claims without a source AND an excerpt are counted as unsourced, never as evidence', async () => {
  const { r } = await runWorker({
    summary: 'Read two outlets.',
    findings: [
      { claim: 'Berth 4 is closed.', source: 'https://port.example/news/123', excerpt: 'Berth 4 will be closed.' },
      { claim: 'Traffic moved to Antwerp.', source: 'https://news.example/a' },   /* a source but no excerpt */
      { claim: 'Insurers raised premiums.' },                                      /* neither */
    ],
  });
  assert.deepEqual({ ...r.evidence }, { findings: 3, sourced: 1, unsourced: 2, notFound: 0, none: false });
  assert.ok(r.gaps.some((g) => /^2 of this worker's findings carry no source with an excerpt/.test(g)));

  const only = shapeOf({ summary: 'x', findings: [{ claim: 'y', source: 'https://a.example' }] });
  assert.equal(only.ok, true, 'the shape is still accepted — the answer is not thrown away');
  assert.equal(only.out.evidence.none, true, 'but a claim with a source and no excerpt is not evidence');
});

test('⑤ research.delegate describes parallel work of any kind, as fact, with nothing that limits Atlas', () => {
  const src = readFileSync(new URL('../js/atlas-cap-research.js', import.meta.url), 'utf8');
  const at = src.indexOf("'research.delegate'");
  assert.ok(at > 0);
  const docAt = src.indexOf("text: '", at);
  const doc = src.slice(docAt + "text: '".length, src.indexOf("\\n' }", docAt));
  /* the registry's one-line purpose is the text before the first ': ' (js/atlas-catalog-text.js summaryFor) */
  const head = doc.slice(0, doc.indexOf(': '));
  assert.ok(head.length < 80, 'the head fits summaryFor\'s cut');
  assert.match(head, /ANY KIND/);
  assert.match(head, /SAME TIME/);
  assert.doesNotMatch(head, /RESEARCH/, 'the purpose is not research-only');
  assert.match(doc, /lookups, web research, data queries, read-only capability runs, analyses, drafting a section/);
  assert.match(doc, /slowest piece instead of the sum/);
  assert.match(doc, /hosted web searches run one after another/);
  assert.match(doc, /EVIDENCE, not a conclusion/);
  assert.doesNotMatch(doc, /not for a single lookup/, 'nothing tells Atlas when not to use it');
});
