/* (atlas-knowledge) the rules of the knowledge layer — js/atlas-knowledge-store.js: a past answer is not a fact. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { claimFromInput, makeKnowledgeStore, recall, withinBudget, expired } from '../js/atlas-knowledge-store.js';

const NOW = Date.UTC(2026, 10, 20);
const src = { id: 'e3', url: 'https://www.example.org/report?utm_source=x', title: 'Report', publisher: 'Example' };
const ok = (a) => { const r = claimFromInput(a, NOW); assert.ok(r.claim, JSON.stringify(r.error)); return r.claim; };

test('verified needs a source that can be checked again; the evidence id alone is not one', () => {
  assert.equal(claimFromInput({ statement: 'Terminal X has 5 Mtpa capacity', kind: 'verified' }, NOW).error.code, 'verified_needs_source');
  assert.equal(claimFromInput({ statement: 'Terminal X has 5 Mtpa capacity', kind: 'verified', evidence: [{ id: 'e3' }] }, NOW).error.code, 'verified_needs_source');
  assert.equal(claimFromInput({ statement: 'Terminal X has 5 Mtpa capacity', kind: 'verified', evidence: [{ url: 'http://localhost/x' }] }, NOW).error.code, 'verified_needs_source');
  const c = ok({ statement: 'Terminal X has 5 Mtpa capacity', kind: 'verified', evidence: [src] });
  assert.equal(c.sources[0].evidenceId, 'e3'); assert.ok(!/utm_source/.test(c.sources[0].canonicalUrl));
  assert.equal(ok({ statement: 'Capacity of X', kind: 'verified', evidence: [{ origin: 'app_data', dataset: 'IntMap LNG terminals' }] }).sources[0].origin, 'app_data');
});
test('inferred needs its basis; stale and contested cannot be written directly', () => {
  assert.equal(claimFromInput({ statement: 'X will expand', kind: 'inferred' }, NOW).error.code, 'inferred_needs_basis');
  assert.equal(ok({ statement: 'X will expand', basis: 'announced tender' }).kind, 'inferred');
  assert.equal(claimFromInput({ statement: 'old thing', kind: 'stale' }, NOW).error.code, 'kind_not_writable');
  assert.equal(claimFromInput({ statement: 'ab', basis: 'x' }, NOW).error.code, 'needs_statement');
});
test('place, period and world refs are validated, not guessed', () => {
  const c = ok({ statement: 'Terminal X operated by Y', kind: 'verified', evidence: [src], validFrom: '2018', validTo: '2020', refs: ['facility:wd-Q1', 'not a ref'], place: { name: 'Port', lng: 1, lat: 2 } });
  assert.deepEqual(c.refs, ['facility:wd-Q1']); assert.equal(c.validToMs, Date.UTC(2021, 0, 1) - 1);
  assert.equal(claimFromInput({ statement: 'abc', basis: 'b', validFrom: '2020', validTo: '2019' }, NOW).error.code, 'period_reversed');
  assert.equal(claimFromInput({ statement: 'abc', basis: 'b', supersedes: ['kn-aaaa-bbbb'] }, NOW, new Map()).error.code, 'unknown_claim');
});
test('supersedes makes stale; contradicts marks both; nothing is deleted; identical claims merge', async () => {
  const S = makeKnowledgeStore();
  const a = (await S.remember(ok({ statement: 'Operator is Alpha', kind: 'verified', evidence: [src] }), NOW)).claim;
  const dup = await S.remember(ok({ statement: 'operator is alpha.', kind: 'verified', evidence: [{ url: 'https://other.example.net/p', title: 'P' }] }), NOW);
  assert.equal(dup.merged, true); assert.equal(dup.claim.id, a.id); assert.equal(dup.claim.sources.length, 2);
  const b = (await S.remember(ok({ statement: 'Operator is Beta', kind: 'verified', evidence: [src], supersedes: [a.id] }), NOW + 1)).claim;
  assert.equal((await S.get(a.id)).kind, 'stale'); assert.equal((await S.get(a.id)).wasKind, 'verified'); assert.equal((await S.get(a.id)).supersededBy, b.id);
  const c = (await S.remember(ok({ statement: 'Operator is Gamma', basis: 'press hint', contradicts: [b.id] }), NOW + 2)).claim;
  assert.equal(c.kind, 'contested'); assert.equal((await S.get(b.id)).kind, 'contested'); assert.equal(await S.count(), 3);
});
test('recall filters by words, place, ref and date; stale is left out and counted; budget loads only what fits', async () => {
  const S = makeKnowledgeStore();
  await S.remember(ok({ statement: 'Terminal X capacity is 5 Mtpa', kind: 'verified', evidence: [src], refs: ['facility:wd-Q1'], place: { name: 'Port', lng: 10, lat: 10 }, validFrom: '2019', validTo: '2020' }), NOW);
  await S.remember(ok({ statement: 'Terminal Z capacity may double', basis: 'tender', place: { name: 'Far', lng: 100, lat: -40 } }), NOW + 1);
  const old = (await S.remember(ok({ statement: 'Terminal Q capacity is 1', kind: 'verified', evidence: [src] }), NOW + 2)).claim;
  await S.remember(ok({ statement: 'Terminal Q capacity is 2', kind: 'verified', evidence: [src], supersedes: [old.id] }), NOW + 3);
  const all = await S.list();
  assert.equal(recall(all, { query: 'capacity' }, NOW).claims.length, 3);
  assert.equal(recall(all, { query: 'capacity' }, NOW).omittedStale, 1);
  assert.deepEqual(recall(all, { refs: ['facility:wd-Q1'] }, NOW).claims.map((c) => c.statement), ['Terminal X capacity is 5 Mtpa']);
  assert.equal(recall(all, { near: { lng: 10.2, lat: 10.1, km: 100 } }, NOW).claims.length, 1);
  assert.equal(recall(all, { at: '2019-06-01' }, NOW).claims.length, 3);   /* a claim with no stated period is not excluded by a date */
  assert.equal(recall(all, { at: '2025-01-01' }, NOW).claims.length, 2);   /* the one stated for 2019-2020 is */
  assert.equal(recall(all, { at: '2025-01-01', refs: ['facility:wd-Q1'] }, NOW).claims.length, 0);
  assert.equal(recall(all, { refs: ['facility:wd-Q1'] }, NOW).claims[0].expired, true);
  assert.equal(recall(all, { query: 'capacity' }, NOW).claims[0].kind, 'verified');
  const big = recall(all, { query: 'capacity' }, NOW).claims;
  assert.equal(withinBudget(big, 1, 10).shown.length, 1); assert.equal(expired({ validToMs: 5 }, 6), true);
});
test('a stored verified row with nothing to check reads back as inferred', async () => {
  const { normalize } = await import('../js/atlas-knowledge-store.js');
  assert.equal(normalize({ id: 'kn-abcd-1234', statement: 'x y z', kind: 'verified', sources: [] }).kind, 'inferred');
});
