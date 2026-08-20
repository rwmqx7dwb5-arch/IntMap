/* ============================================================================
 *  IntMap · the documents describe the repository that exists  (checks)
 * ----------------------------------------------------------------------------
 *  「現状の Architecture.md は『現行仕様の正本』として全面的には信用できません」
 *
 *  Two separate jobs here:
 *
 *   A. Architecture.md is a CURRENT-STATE specification again — 1,600 lines describing what
 *      the app is, with the round-by-round history removed to DEV-NOTES.md where it belongs.
 *      The mechanical property that keeps it that way is "no round references in the file".
 *
 *   B. The facts written down in MORE THAN ONE document are machine-compared, both with the
 *      repository and with each other (`scripts/doc-facts.mjs`). A fact in two places rots in
 *      one place at a time, and the reader who opens the stale copy is simply misled.
 *
 *  ⚠ AND THE GATE MUST NOT BE BLIND. The failure this repository keeps meeting is an
 *    instrument that is green because its population is empty. So the tests below check that
 *    every rule actually REPORTED, that the sweep reached the tree, and — with a throw-away
 *    document — that a violation really does fail the gate.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTreeLock } from './helpers/gate-lock.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function runGate(args = []) {
  try {
    const out = execFileSync(process.execPath, [join(ROOT, 'scripts/doc-facts.mjs'), ...args],
      { cwd: ROOT, encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}

/* ── ① the gate passes, and it reports EVERY rule ────────────────────────────────────────── */
const RULES = ['app-size', 'edge-functions', 'migrations', 'serving', 'deploy', 'build-info',
  'usb', 'languages', 'alerts', 'app-shape', 'anon-key', 'arch-rounds'];

test('① the cross-document gate passes, and every rule actually ran', () => {
  const { code, out } = runGate(['--check']);
  assert.equal(code, 0, 'scripts/doc-facts.mjs --check failed:\n' + out);
  for (const r of RULES) {
    assert.ok(out.includes('✓ ' + r + ':'), `the gate never reported the rule "${r}" — a rule that does not run cannot fail\n` + out);
  }
});

test('② the sweep reaches the whole tree of current-state documents', () => {
  const { out } = runGate();
  const n = Number((out.match(/(\d+) current-state documents scanned/) || [])[1]);
  const expected = readdirSync(ROOT).filter((f) => f.endsWith('.md') && !/^DEV-NOTES/.test(f) && f !== 'CLAUDE.local.md').length
    + readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).length;
  assert.equal(n, expected, 'the gate did not read every markdown document it should');
  assert.ok(n >= 15, `only ${n} documents scanned — the sweep is not reaching the tree`);
});

/* ── ③ …and it is NOT blind: a real violation fails it ───────────────────────────────────── */
/* ⚠ (#R280) THIS TEST WRITES TO THE TREE, AND SO DOES tests/r280 ②. `node --test` runs files in
   parallel, so without a lock one file's probe is on disk while the other asserts the tree is
   clean — measured: this test passed alone and failed inside `npm test`. */
test('③ a violating document really does fail the gate', async () => {
  await withTreeLock(() => {
  const probe = join(ROOT, 'docs', '_doc-facts-negative-probe.md');
  /* assembled, so this test file is not itself a violation of the rule it is proving */
  const badStamp = '`/' + '-' + 'build-info.json`';
  try {
    writeFileSync(probe, '# probe\n\nCheck ' + badStamp + ' to see which build is live.\n', 'utf8');
    const { code, out } = runGate(['--check']);
    assert.equal(code, 1, 'a document spelling the build stamp wrongly did NOT fail the gate:\n' + out);
    assert.match(out, /build-info —/, 'the gate failed, but not for the reason under test:\n' + out);
  } finally {
    if (existsSync(probe)) unlinkSync(probe);
  }
  const after = runGate(['--check']);
  assert.equal(after.code, 0, 'the probe was not cleaned up — the tree is left failing');
  });
});

/* ── ④ the gate is wired into the run, so it cannot quietly stop running ─────────────────── */
test('④ the gate runs as part of `npm test`, and this file runs as part of test:checks', () => {
  const chain = read('scripts/test-parallel.mjs');
  assert.match(chain, /scripts\/doc-facts\.mjs', '--check'/,
    'scripts/doc-facts.mjs is not in the source-level chain — it would never run');
  assert.match(chain, /scripts\/arch-files-check\.mjs', '--check'/,
    'scripts/arch-files-check.mjs is not in the source-level chain — §3 could drift silently');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['check:docs'], 'node scripts/doc-facts.mjs --check');
  assert.ok(pkg.scripts['test:checks'].includes('tests/r274-checks.test.mjs'),
    'this file is not in test:checks — it will never run, so it asserts nothing');
});

/* ── ⑤ Architecture.md is a specification, not a changelog ───────────────────────────────── */
test('⑤ Architecture.md carries no round references', () => {
  const md = read('Architecture.md');
  const hits = [];
  md.split('\n').forEach((l, i) => {
    if (/(?:#R\d{1,3}|(?:^|[^A-Za-z0-9_/])R\d{1,3}(?![\d)A-Za-z]))/.test(l)) hits.push(i + 1 + ': ' + l.trim().slice(0, 70));
  });
  assert.deepEqual(hits, [], 'the history is creeping back into the specification:\n' + hits.join('\n'));
});

test('⑥ Architecture.md still has §1–§18, in order', () => {
  const md = read('Architecture.md');
  const nums = [...md.matchAll(/^## (\d+)\. /gm)].map((m) => Number(m[1]));
  assert.deepEqual(nums, Array.from({ length: 18 }, (_, i) => i + 1),
    'a top-level section was lost or reordered — this file is the map other documents point at');
  assert.ok(!/^## 19\. /m.test(md), 'a §19 appendix is back; per-round appendices belong in DEV-NOTES.md');
});

test('⑦ Architecture.md says what the reader most needs to be told correctly', () => {
  const md = read('Architecture.md');
  /* the three facts whose staleness was actively dangerous: what is served, where the DB schema
     lives, and how many Edge Functions there are. Relations, not literals — the numbers are the
     gate's job (rule app-size / edge-functions), this is about the sentences existing at all. */
  assert.match(md, /`dist\/`/, 'Architecture.md no longer says that dist/ is what is served');
  assert.match(md, /supabase\/migrations\//, 'Architecture.md no longer points the restore procedure at the migrations');
  assert.match(md, /`src\/vendor\.js`/, 'Architecture.md no longer says where the Supabase connection lives');
});

/* ── ⑧ single-owner facts stay single-owner ──────────────────────────────────────────────── */
test('⑧ each shared fact still has exactly one owner', () => {
  assert.match(read('CLAUDE.md'), /USB/, 'CLAUDE.md §11 is the owner of the backup procedure and no longer mentions it');
  assert.match(read('docs/RELEASE.md'), /ENABLE_PAGES_DEPLOY/, 'docs/RELEASE.md is the owner of the release procedure');
  assert.match(read('docs/SECURITY-ARCHITECTURE.md'), /## 6\. Browser security/,
    'docs/SECURITY-ARCHITECTURE.md is the owner of the browser-security posture');
  /* Architecture.md points at those owners rather than restating them */
  const md = read('Architecture.md');
  for (const owner of ['docs/RELEASE.md', 'docs/SECURITY-ARCHITECTURE.md', 'CLAUDE.md']) {
    assert.ok(md.includes(owner), `Architecture.md no longer points at ${owner}`);
  }
});
