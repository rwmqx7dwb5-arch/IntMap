/* ============================================================================
 *  (proportional-finish) the full run moved to CI; what it used to catch by hand is now one command
 * ----------------------------------------------------------------------------
 *  AGENTS.md §4: the local `npm test` before the push is gone — the PR's CI runs the same gates on
 *  three machines and auto-merge waits for green. Two things had to exist for that to be safe:
 *
 *   ① `npm run regen` (scripts/regen.mjs) keeps a ratchet ledger's rewrite ONLY when every move
 *      tightens — a number down, a member or key gone — and puts any loosening back, byte for byte
 *   ② …driven by DOING it: a throwaway checkout, a writer that lowers and a writer that raises
 *   ③ the declarations it reads cannot rot: every `intmap-tighten` writer exists, sits on a json
 *      ledger, and every `intmap-tighten-info` key is a key that ledger actually has
 *   ④ a PR left on auto-merge with a red CI is named by `worktree.mjs status` (the session that
 *      opened it has ended, and nothing else would say so)
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loosenings, plan, regen } from '../scripts/regen.mjs';
import { declarations, parseRegen } from '../scripts/merge-driver.mjs';
import { redAutoMerge } from '../scripts/worktree.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('(proportional-finish) ① only a tightening passes', () => {
  assert.deepEqual(loosenings({ total: 5, files: { a: 3, b: 2 } }, { total: 4, files: { a: 3, b: 1 } }), [], 'counts falling');
  assert.deepEqual(loosenings({ files: { a: 3, b: 2 } }, { files: { a: 3 } }), [], 'a file gone');
  assert.deepEqual(loosenings({ host: ['A', 'B', 'C'] }, { host: ['A', 'C'] }), [], 'a name gone, order kept');
  assert.equal(loosenings({ total: 5 }, { total: 6 }).length, 1, 'a count rising');
  assert.equal(loosenings({ files: { a: 3 } }, { files: { a: 3, b: 1 } }).length, 1, 'a new file');
  assert.equal(loosenings({ host: ['A', 'C'] }, { host: ['A', 'B', 'C'] }).length, 1, 'a new name');
  assert.equal(loosenings({ stack: ['x', 'y'] }, { stack: ['y', 'x'] }).length, 1, 'a reordering (z-layers paints in order)');
  assert.equal(loosenings({ why: { a: 'one' } }, { why: { a: 'two' } }).length, 1, 'a changed sentence');
  assert.equal(loosenings({ total: 5 }, { total: '5' }).length, 1, 'a type change');
  assert.deepEqual(loosenings({ sinks: 680, total: 375 }, { sinks: 714, total: 375 }, '$', ['sinks']), [],
    'a context key the writer declares may move either way');
  assert.equal(loosenings({ files: { sinks: 1 } }, { files: { sinks: 2 } }, '$', ['sinks']).length, 1,
    'but only at the top level — the same name inside the ratchet is still held');
});

test('(proportional-finish) ② a lowering writer is kept, a raising one is put back byte for byte', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'im-regen-'));
  try {
    mkdirSync(join(dir, 'w'));
    const writer = (to) => `import{writeFileSync}from'node:fs';writeFileSync(process.argv[2],JSON.stringify(${JSON.stringify(to)}));`;
    writeFileSync(join(dir, 'w', 'down.mjs'), writer({ total: 1, files: { a: 1 } }));
    writeFileSync(join(dir, 'w', 'up.mjs'), writer({ total: 9, files: { a: 1, b: 8 } }));
    writeFileSync(join(dir, 'w', 'gen.mjs'), `import{writeFileSync}from'node:fs';writeFileSync('gen.txt','fresh');`);
    const original = '{\n "total": 3,\n "files": { "a": 3 }\n}\n';
    writeFileSync(join(dir, 'down.json'), original);
    writeFileSync(join(dir, 'up.json'), original);
    const decls = [
      { path: 'down.json', kind: 'json', regen: [], tighten: parseRegen('w/down.mjs,down.json'), tightenInfo: [] },
      { path: 'up.json', kind: 'json', regen: [], tighten: parseRegen('w/up.mjs,up.json'), tightenInfo: [] },
      { path: 'gen.txt', kind: 'regen', regen: parseRegen('w/gen.mjs;!w/needs-a-browser.mjs'), tighten: [] },
    ];
    const lines = [];
    const r = await regen(dir, { decls, log: (s) => lines.push(s) });
    assert.equal(r.ok, true, lines.join('\n'));
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'down.json'), 'utf8')), { total: 1, files: { a: 1 } }, 'the tightening is written');
    assert.equal(readFileSync(join(dir, 'up.json'), 'utf8'), original, 'the loosening is put back, byte for byte');
    assert.deepEqual(r.tightened, ['down.json']);
    assert.deepEqual(r.refused.map((x) => x.path), ['up.json']);
    assert.ok(r.refused[0].moves.some((m) => m.includes('9')) && r.refused[0].moves.some((m) => m.includes('b')),
      'and the refusal names what rose');
    assert.equal(readFileSync(join(dir, 'gen.txt'), 'utf8'), 'fresh', 'a generator is run');
    assert.deepEqual(r.manual, ['node w/needs-a-browser.mjs'], 'a `!` command is named, not run');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('(proportional-finish) ③ every intmap-tighten declaration points at something real', () => {
  const decls = declarations(ROOT);
  const p = plan(decls);
  assert.ok(p.ledgers.length > 0, 'the ratchet ledgers are declared');
  for (const d of decls.filter((x) => x.tighten && x.tighten.length)) {
    assert.equal(d.kind, 'json', `${d.path}: intmap-tighten belongs on a json ledger`);
    for (const c of d.tighten) {
      assert.ok(!c.manual, `${d.path}: a tightening writer must be runnable here`);
      assert.ok(existsSync(join(ROOT, c.argv[0])), `${d.path}: ${c.argv[0]} exists`);
    }
    const ledger = JSON.parse(readFileSync(join(ROOT, d.path), 'utf8'));
    for (const k of d.tightenInfo || []) assert.ok(Object.prototype.hasOwnProperty.call(ledger, k), `${d.path}: intmap-tighten-info names «${k}», which the ledger has`);
  }
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.regen || '', /scripts\/regen\.mjs/, 'npm run regen runs it');
});

test('(proportional-finish) ④ a red PR waiting on auto-merge is named; nothing else is', () => {
  const prs = [
    { number: 1, autoMergeRequest: { mergeMethod: 'SQUASH' }, statusCheckRollup: [{ name: 'Gates 1/3', conclusion: 'FAILURE' }, { name: 'Gates 2/3', conclusion: 'SUCCESS' }] },
    { number: 2, autoMergeRequest: { mergeMethod: 'SQUASH' }, statusCheckRollup: [{ name: 'Gates 1/3', conclusion: 'SUCCESS' }, { name: 'Gates 2/3', conclusion: '' }] },
    { number: 3, autoMergeRequest: null, statusCheckRollup: [{ name: 'Static checks', conclusion: 'FAILURE' }] },
    { number: 4, autoMergeRequest: { mergeMethod: 'SQUASH' }, statusCheckRollup: [{ context: 'legacy', state: 'ERROR' }] },
  ];
  assert.deepEqual(redAutoMerge(prs), [{ number: 1, failed: ['Gates 1/3'] }, { number: 4, failed: ['legacy'] }]);
  assert.deepEqual(redAutoMerge([]), []);
});
