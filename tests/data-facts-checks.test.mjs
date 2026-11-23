/* data-facts — 対象時点の食い違い警告・周期の根拠の種別・上流の変化検出・Atlas が読む台帳。
   ⚠ 「推定を事実のように申告しない」を値で測る（intmap-data-must-not-claim-an-author-it-lacks）。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { temporalMismatch, spanOf, account, FACETS, BASIS_KINDS } from '../js/data-governance.js';
import { basisProblem } from '../scripts/data-governance.mjs';
import { compare } from '../scripts/upstream-change.mjs';

test('temporalMismatch: 2020 の人口と 2025 の行政区画は重ならず、差の年数を述べる', () => {
  const r = temporalMismatch([{ id: 'pop', asOf: '2020' }, { id: 'adm', asOf: '2025-04-01' }]);
  assert.equal(r.state, 'mismatch');
  assert.equal(r.pairs.length, 1);
  assert.ok(r.pairs[0].gapYears > 4 && r.pairs[0].gapYears < 5);
});

test('temporalMismatch: 重なる期間は合っていると言い、述べていない入力は「合っている」にしない', () => {
  assert.equal(temporalMismatch([{ id: 'a', period: '2015-2020' }, { id: 'b', asOf: '2018' }]).state, 'aligned');
  const r = temporalMismatch([{ id: 'a', asOf: '2020' }, { id: 'b' }, { id: 'c', asOf: 'last 24 h' }]);
  assert.equal(r.state, 'unstated');
  assert.deepEqual(r.unstated.map((u) => u.why).sort(), ['period-not-a-date', 'period-undeclared']);
  assert.equal(r.pairs.length, 0);
});

test('spanOf: 裸の年はその年の 1 年、範囲は端を含む、日付でない文は null', () => {
  const y = spanOf('2020');
  assert.ok(y.hi - y.lo >= 364 && y.hi - y.lo <= 365);
  assert.equal(spanOf('recent'), null);
  assert.equal(spanOf({ start: '2019', end: '2021' }).hi > spanOf('2021').lo, true);
});

test('account: describes.* は述べられたときだけ stated、無ければ理由つきの未申告', () => {
  const a = account({ publisher: 'X', period: '2020', cadence: 'P1Y' });
  assert.equal(a.describes.period, '2020');
  const silent = a.undeclared.filter((u) => u.facet.startsWith('describes.')).map((u) => u.facet);
  assert.ok(silent.includes('describes.extent') && !silent.includes('describes.period'));
  assert.ok(FACETS.filter((f) => f.startsWith('describes.')).length === 6);
});

test('basisProblem: 推定は推定と名乗り、測定には日付がある', () => {
  const ok = { observed: 'measured 2026-11-20 on example.org', expires: 'long enough text', canon: 'long enough text', kind: 'measured' };
  assert.equal(basisProblem({ cadence: 'P1D', cadenceBasis: ok }), null);
  assert.match(basisProblem({ cadence: 'P1D', cadenceBasis: { ...ok, kind: undefined } }), /kind/);
  assert.match(basisProblem({ cadence: 'P1D', cadenceBasis: { ...ok, observed: 'estimate, not measured: it changes often' } }), /estimate presented as measured/);
  assert.match(basisProblem({ cadence: 'P1D', cadenceBasis: { ...ok, kind: 'estimate' } }), /does not say so/);
  assert.match(basisProblem({ cadence: 'P1D', cadenceBasis: { ...ok, observed: 'measured on example.org' } }), /no date/);
  assert.ok(BASIS_KINDS.includes('estimate'));
});

test('upstream-change compare: 見られなかったものは changed でも unchanged でもない', () => {
  const was = { state: 'observed', etag: '"a"', lastModified: 'Mon', contentLength: 10 };
  assert.equal(compare(was, { state: 'unobserved', why: 'no-answer' }).verdict, 'unobserved');
  assert.equal(compare(was, { state: 'unprobeable', why: 'server-states-no-validator' }).verdict, 'unprobeable');
  assert.equal(compare(null, { state: 'observed', etag: '"a"' }).verdict, 'new');
  assert.equal(compare(was, { state: 'observed', etag: '"a"', lastModified: 'Mon', contentLength: 10 }).verdict, 'unchanged');
  const c = compare(was, { state: 'observed', etag: '"b"', lastModified: 'Tue', contentLength: 12 });
  assert.equal(c.verdict, 'changed');
  assert.deepEqual(c.differs.sort(), ['contentLength', 'etag', 'lastModified']);
  assert.equal(compare(was, { state: 'observed', etag: 'W/"b"', lastModified: 'Mon', contentLength: 10 }).note, 'etag-only-difference');
});

test('data-facts.json: 述べられた欄だけが入り、述べていない欄は unstated に挙がる', () => {
  const f = JSON.parse(fs.readFileSync(new URL('../data/data-facts.json', import.meta.url), 'utf8'));
  const m = f.subjects['data/maddison.json'];
  assert.ok(m, 'maddison is declared');
  assert.equal(m.describes.period.start, '1850');
  assert.ok(m.unstated.includes('completeness'));
  for (const [name, s] of Object.entries(f.subjects)) {
    for (const k of Object.keys(s.describes)) assert.ok(!s.unstated.includes(k), name + ' states and denies ' + k);
  }
});
