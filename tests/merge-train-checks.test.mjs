// IntMap · merge-train — many pull requests, one CI run (scripts/merge-train.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTrailer, formatTrailer, selectCandidates, TRAILER, BRANCH_PREFIX } from '../scripts/merge-train.mjs';

const pr = (n, o = {}) => ({ number: n, title: 't' + n, isDraft: false, baseRefName: 'main', headRefName: 'feat/x' + n,
  autoMergeRequest: { enabledAt: 'x' }, createdAt: `2026-11-${String(n).padStart(2, '0')}`, failed: [], ...o });

test('① the trailer round-trips, and only its own lines are read', () => {
  const items = [{ n: 12, sha: 'a'.repeat(40) }, { n: 7, sha: 'b'.repeat(40) }];
  const text = 'merge train\n\n- #12 x\n' + formatTrailer(items) + '\nMerge-Train-Includes: #9 (no sha)\n';
  assert.deepEqual(parseTrailer(text), items);
  assert.deepEqual(parseTrailer(''), []);
});

test('② a PR boards only when it is open, ready, on main, asked to land, green on its own, and not carried', () => {
  const prs = [
    pr(1), pr(2, { isDraft: true }), pr(3, { baseRefName: 'feat/base' }), pr(4, { autoMergeRequest: null }),
    pr(5, { failed: ['Gates 2/3'] }), pr(6), pr(7, { headRefName: BRANCH_PREFIX + 'x' }),
  ];
  const { board, held } = selectCandidates(prs, { carried: new Set([6]) });
  assert.deepEqual(board.map((p) => p.number), [1]);
  assert.deepEqual(held.map((p) => p.number).sort(), [2, 3, 4, 5, 6, 7]);
  assert.match(held.find((p) => p.number === 5).why, /Gates 2\/3/);
});

test('③ oldest first; --max holds the rest with a reason; --pr narrows, --exclude removes', () => {
  const prs = [pr(9), pr(3), pr(5)];
  const a = selectCandidates(prs, { max: 2 });
  assert.deepEqual(a.board.map((p) => p.number), [3, 5]);
  assert.match(a.held[0].why, /--max 2/);
  assert.deepEqual(selectCandidates(prs, { only: new Set([5, 9]), exclude: new Set([9]) }).board.map((p) => p.number), [5]);
});

test('④ main runs the closer, and only for a commit that carries the trailer the script writes', () => {
  const y = readFileSync(new URL('../.github/workflows/merge-train.yml', import.meta.url), 'utf8');
  assert.match(y, /branches: \[main\]/);
  assert.ok(y.includes(`contains(github.event.head_commit.message, '${TRAILER}:')`));
  assert.match(y, /node scripts\/merge-train\.mjs --close "\$GITHUB_SHA"/);
  assert.match(y, /pull-requests: write/);
});
