/* ============================================================================
 *  architecture-by-subject — the counts that move with every change are measured, not written
 * ----------------------------------------------------------------------------
 *  Architecture.md §1 carried «index.html（N 行・K KB）＋ css/（N 本）＋ js/（N 本・M MB）＋ src/（N 本）»
 *  and §3 a second «js/ だけで N 本». Every branch that adds a js/ file edits that line, so parallel
 *  branches collided there on every landing (MEASURED 2026-09-30: six rebase conflicts in one day), and the
 *  §3 copy — read by no rule — had drifted two behind. The sentence now names what the app is made of;
 *  scripts/doc-facts.mjs `app-size` prints the measured numbers on every run and refuses a count written
 *  back into §1 or §3. RUN on a private copy of the tree (tests/helpers/scratch-tree.mjs).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { scratchTree } from './helpers/scratch-tree.mjs';

const SCRATCH = scratchTree();
function docFacts() {
  try {
    const out = execFileSync(process.execPath, [SCRATCH.path('scripts/doc-facts.mjs'), '--check'], { cwd: SCRATCH.root, encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) { return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') }; }
}

test('app-size prints the measured counts and holds none in the prose', () => {
  const r = docFacts();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /app-size: index\.html \d+ lines · js\/ \d+ · src\/ \d+ · css\/ \d+ \(measured/);
});

test('a count written back into §1 or §3 is red; the sentence going missing is red', () => {
  const original = readFileSync(SCRATCH.path('Architecture.md'), 'utf8');
  const cases = [
    ['§1 count', original.replace(/＋ `js\/` ＋/, '＋ `js/`（358本・17.8 MB）＋'), /states a file count or size again/],
    ['§3 count', original.replace(/`js\/` の 1 本ずつの 1 行説明を/, '`js/` だけで 358 本あり、1行説明を'), /states the js\/ count again/],
    ['sentence gone', original.replace(/本体は `index\.html`/, '本体は index'), /no longer names what the app is made of/],
  ];
  try {
    for (const [name, text, why] of cases) {
      assert.notEqual(text, original, name + ': the mutation found nothing to change — the sentence moved');
      SCRATCH.write('Architecture.md', text);
      const r = docFacts();
      assert.equal(r.code, 1, name + ' stayed green:\n' + r.out);
      assert.match(r.out, why, name + ':\n' + r.out);
    }
  } finally {
    SCRATCH.write('Architecture.md', original);
  }
  assert.equal(docFacts().code, 0, 'the restore left the copy failing');
});
