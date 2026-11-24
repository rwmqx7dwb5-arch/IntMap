#!/usr/bin/env node
/* ============================================================================
 *  check:migrationorder — a PR must not add a migration older than what main already has
 * ----------------------------------------------------------------------------
 *  MEASURED: concurrent PRs landed migrations whose file-name time was older than the newest one on
 *  origin/main. `supabase db push` refuses that without --include-all, the Supabase deploy workflow
 *  went red, and the Pages publish stopped with it (six migrations were then applied by hand).
 *
 *  The fact this gate asks: «for every migration THIS branch adds, is its version (the 14 digits of
 *  the file name) strictly greater than the greatest version on the base?» Nothing is listed here —
 *  both sides are read from git and the directory. Renaming or deleting a migration that the base
 *  already has is reported too: a version main (and possibly production) has applied must not change.
 *
 *  WHY NOT check:static: its earlier rule read the base as HEAD^1, which a depth-1 pull_request checkout does not have —
 *  it then only WARNED («not measured»), so an unobserved base passed. Here an unobserved base is red.
 *
 *  BASE: env MIGRATION_BASE_REF, else GITHUB_BASE_REF (set on pull_request events), else origin/main.
 *  On GitHub Actions without a base ref (a push to main) there is nothing to compare: the gate says so
 *  and passes — main is the base, a push cannot be «older than main».
 *  CI checks out with depth 1, so the base tip is fetched here when it is missing (public repo).
 *
 *    node scripts/migration-order.mjs            gate
 *    node scripts/migration-order.mjs --base <ref>
 * ==========================================================================*/
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd(); // the repo the gate is run in (npm scripts run from the root)
const DIR = 'supabase/migrations';
const NAME = /^(\d{14})_.+\.sql$/;

export const versionOf = (file) => (NAME.exec(path.posix.basename(file)) || [])[1] || null;

/* (kept) the earlier name for the same two facts — tests/migration-order-guard-checks.test.mjs reads them. */
export const stampOf = versionOf;
export function outOfOrder(onBase, inTree) {
  const have = new Set(onBase);
  const latest = onBase.map(versionOf).filter(Boolean).sort().pop() || '';
  return inTree.filter((n) => !have.has(n) && versionOf(n) && versionOf(n) <= latest).map((n) => ({ name: n, stamp: versionOf(n), latest }));
}

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds());
const parse = (v) => new Date(Date.UTC(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8), +v.slice(8, 10), +v.slice(10, 12), +v.slice(12, 14)));

/* Pure: the judgement. `baseTip` = files on the base tip, `ancestor` = files on the merge-base (what this
 * branch started from), `head` = files on this branch. */
export function analyze({ baseTip, ancestor = baseTip, head, now = new Date() }) {
  const baseMax = baseTip.map(versionOf).filter(Boolean).sort().pop() || '00000000000000';
  const inHead = new Set(head), inTip = new Set(baseTip), inAnc = new Set(ancestor);
  const added = head.filter((f) => !inAnc.has(f) && !inTip.has(f)).sort();
  const removed = ancestor.filter((f) => !inHead.has(f)).sort();
  const problems = [];
  const stale = added.filter((f) => versionOf(f) && versionOf(f) <= baseMax);
  const bad = added.filter((f) => !versionOf(f));
  for (const f of bad) problems.push({ kind: 'name', file: f, text: `${f}: ファイル名が <14桁の時刻>_<名前>.sql ではない` });
  /* the fix: keep the order among the stale files, move them past both now and the base's newest */
  let next = stamp(now) > baseMax ? stamp(now) : stamp(new Date(parse(baseMax).getTime() + 1000));
  const fixes = [];
  for (const f of stale) {
    const to = f.slice(0, f.lastIndexOf('/') + 1) + next + path.posix.basename(f).slice(14);
    fixes.push({ from: f, to });
    problems.push({ kind: 'stale', file: f, text: `${f}: 時刻 ${versionOf(f)} は base の最新 ${baseMax} 以前` });
    next = stamp(new Date(parse(next).getTime() + 1000));
  }
  for (const f of removed) problems.push({ kind: 'removed', file: f, text: `${f}: base に在る migration が削除または改名されている（適用済みの版は変えない）` });
  const dup = new Map();
  for (const f of head) { const v = versionOf(f); if (v) dup.set(v, [...(dup.get(v) || []), f]); }
  for (const [v, fs] of dup) if (fs.length > 1) problems.push({ kind: 'duplicate', file: fs[0], text: `版 ${v} を ${fs.length} 本が名乗る: ${fs.join(', ')}` });
  return { baseMax, added, removed, fixes, problems };
}

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const tryGit = (...a) => { try { return git(...a); } catch { return null; } };
const list = (ref) => (tryGit('ls-tree', '--name-only', ref, DIR + '/') || '').split('\n').filter((f) => f.endsWith('.sql'));

function main() {
  const argBase = process.argv.indexOf('--base') > 0 ? process.argv[process.argv.indexOf('--base') + 1] : null;
  const ci = !!process.env.GITHUB_ACTIONS;
  const baseName = argBase || process.env.MIGRATION_BASE_REF || process.env.GITHUB_BASE_REF || (ci ? '' : 'main');
  if (!baseName) { console.log('migration-order: base ref 無し（main への push）— 比較対象が無いので通す'); return 0; }
  let ref = 'origin/' + baseName;
  if (argBase && tryGit('rev-parse', '--verify', '-q', argBase)) ref = argBase;
  else if (ci || !tryGit('rev-parse', '--verify', '-q', ref)) {
    const got = tryGit('fetch', '--no-tags', '--depth=1', 'origin', `+refs/heads/${baseName}:refs/remotes/origin/${baseName}`);
    if (got === null) { console.log(`migration-order: FAIL  base ${ref} を取得できない（観測できなかったのであって通ったのではない）`); return 1; }
  }
  const head = list('HEAD');
  const baseTip = list(ref);
  const mb = (tryGit('merge-base', ref, 'HEAD') || '').trim();
  const analysis = analyze({ baseTip, ancestor: mb ? list(mb) : baseTip, head });
  console.log(`migration-order: base ${ref}（最新の版 ${analysis.baseMax}）· 追加 ${analysis.added.length} 本 · 削除/改名 ${analysis.removed.length} 本`);
  if (!analysis.problems.length) { console.log('  ok    追加した migration は全て base の最新より新しい'); return 0; }
  for (const p of analysis.problems) console.log('  FAIL  ' + p.text);
  if (analysis.fixes.length) {
    console.log('\n直し方: supabase db push は base より古い版を --include-all 無しでは拒み、deploy が赤くなる。ファイル名の時刻を base の最新より後へ付け替える:');
    for (const f of analysis.fixes) console.log(`  git mv ${f.from} ${f.to}`);
  }
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
