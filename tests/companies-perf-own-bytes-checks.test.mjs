/* (companies-perf-own-bytes) A SCHEDULED REFRESH RAISES THE DEPLOY CEILINGS BY ITS OWN BYTES — NO MORE.
 *
 * MEASURED 2026-11-15 (run 43744761841, #1101): the weekly company batch failed check:perf on
 * dist.total three weeks running. The batch added 1,371,136 bytes under data/companies; the rest of the
 * overrun was main sitting at the top of its band. A bot cannot say why with `--update`, and `--update`
 * from a build would ratify main's undecided growth too. `perf-budget.mjs --raise-own` raises the deploy
 * rows by exactly the shipped bytes the job's own paths add, and the pull request's check:perf still
 * judges the real build. These checks hold the arithmetic, the copy rule it is read from, and the
 * workflow's use of one declared path for what it rewrites, adds and answers for.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIST_ROWS, distRowsOf, ownGrowth, raiseBy, shippedByConfig, judge, measureFrom } from '../scripts/perf-budget.mjs';

const ceilings = (total, data, assets) => ({ dist: { total, data, assets } });

test('① the bytes a change adds under shipped paths raise exactly the rows those files land in', () => {
  const shipped = (rel) => (rel.startsWith('data/') ? rel : null);
  const before = new Map([['data/c/a.json', 100], ['data/c/gone.json', 30], ['scripts/x.mjs', 5]]);
  const after = new Map([['data/c/a.json', 160], ['data/c/new.json', 50], ['scripts/x.mjs', 5000]]);
  const g = ownGrowth(before, after, shipped);
  /* +60 +50 −30 = 80; the script grew 4995 bytes and is not deployed, so it explains nothing */
  assert.deepEqual(g, { total: 80, data: 80, assets: 0 });
  const { baseline, changes } = raiseBy(ceilings(1000, 900, 50), g);
  assert.deepEqual(baseline.dist, { total: 1080, data: 980, assets: 50 });
  assert.deepEqual(changes.map((c) => c.what), ['dist.total', 'dist.data']);
});

test('② a shrink raises nothing and lowers nothing — lowering stays main\'s CI\'s', () => {
  const g = ownGrowth(new Map([['data/c/a.json', 500]]), new Map([['data/c/a.json', 100]]), (r) => r);
  assert.equal(g.total, -400);
  const b = ceilings(1000, 900, 50);
  const { baseline, changes } = raiseBy(b, g);
  assert.deepEqual(baseline, b);
  assert.equal(changes.length, 0);
});

test('③ growth the paths do not account for still fails the judged build', () => {
  /* main at the top of its band, the batch's 80 bytes on top, and 10 kB from somewhere else */
  const b = { eager: {}, async: { raw: 0, gzip: 0, chunks: {} }, ...ceilings(1_000_000, 900_000, 50) };
  const raised = raiseBy(b, { total: 80, data: 80, assets: 0 }).baseline;
  const m = (total) => ({ eager: {}, async: { raw: 0, gzip: 0, chunks: {} }, dist: { total, data: 900_080, assets: 50 } });
  const top = 1_000_000 + 5000; /* band = max(0.5 %, 2 kB) = 5000 */
  assert.equal(judge(m(top + 80), b).errors.length, 1, 'without the raise the batch fails (the observed failure)');
  assert.equal(judge(m(top + 80), raised).errors.length, 0, 'with it, exactly the batch passes');
  assert.equal(judge(m(top + 80 + 10_240), raised).errors.length, 1, 'and growth the batch does not explain still fails');
});

test('④ the rows a file is counted in are the rows measureFrom weighs — one table', () => {
  assert.deepEqual(distRowsOf('data/companies/x.json'), ['total', 'data']);
  assert.deepEqual(distRowsOf('assets/main-abc.js'), ['total', 'assets']);
  assert.deepEqual(distRowsOf('index.html'), ['total']);
  assert.deepEqual(distRowsOf('database/x'), ['total'], 'a prefix of a name is not the directory');
  const report = { eager: { raw: 0, gzip: 0, brotli: 0, requests: 0, modules: 0, css: { raw: 0, gzip: 0 }, chunks: [] }, async: { raw: 0, gzip: 0, chunks: [] }, chunks: {} };
  assert.deepEqual(Object.keys(measureFrom(report, 'no-such-dist-dir').dist), Object.keys(DIST_ROWS));
});

test('⑤ «shipped» is vite.config.js\'s own copy rule, exclusions included', async () => {
  const shipped = await shippedByConfig();
  assert.equal(shipped('data/companies/profiles/x.json'), 'data/companies/profiles/x.json');
  assert.equal(shipped('fonts/src/Inter.ttf'), null, 'STATIC_EXCLUDE is honoured');
  assert.equal(shipped('scripts/perf-budget.mjs'), null, 'what is not copied explains no deployed byte');
});

test('⑥ the refresh workflow names what it owns once, raises before committing, and commits the raise', () => {
  const y = readFileSync(new URL('../.github/workflows/companies-refresh.yml', import.meta.url), 'utf8');
  const owned = /^\s+OWNED:\s*(\S+)/m.exec(y);
  assert.ok(owned, 'the job declares OWNED');
  assert.ok(!/git (add|diff)[^\n]*\bdata\/companies\b/.test(y), 'no step spells the path a second time');
  const raise = y.indexOf('perf-budget.mjs --raise-own "$OWNED"'), add = y.indexOf('git add "$OWNED" tests/perf-baseline.json'), commit = y.indexOf('git commit -F');
  assert.ok(raise > 0 && add > raise && commit > add, 'raise (against HEAD) → add the batch and the raised ceilings → commit');
  assert.ok(y.indexOf('npm ci') > 0 && y.indexOf('npm ci') < raise, 'the dependencies vite.config.js imports are installed first');
});
