/*  R703 · 索引を切るのは、この道具の budget ではなく、索引を自分で読み込む製品の上限
 *  ------------------------------------------------------------------------------------------
 *  実測 2026-09-11: MEMORY.md は 25,710 文字で、セッションは
 *  «MEMORY.md is 25.1KB (limit: 24.4KB) — Only part of it was loaded.» と告げられていた。
 *  25710/1024 = 25.10 なので、ホストは 1024 文字を 1KB として数え、24.4KB で止める。
 *
 *  ⚠ この索引が天井を越えたのは 3 度目（#R236・#R548・#R703）で、前の 2 回の処置はどちらも
 *  「詰め直す」だった。詰め直しは越えた事実を消すが、越えたことを**告げる機構**を作らない。
 *  だから測っているのは詰め方ではなく、**毎セッション実測が述べられるか**である。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INDEX_CEILING, INDEX_CEILING_KB, indexVerdict } from '../scripts/agent-memory.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'agent-memory.mjs');
const readJSON = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

/* 索引を持つ偽の HOME を 1 つ作って、そこに N 文字ちょうどの索引を置く。
   ⚠ 場所はスクリプト自身に訊く——テストが鍵を組み立て直すと、導出ではなく写しを測る（#R696 ②）。 */
const withIndex = (chars) => {
  const home = mkdtempSync(path.join(tmpdir(), 'intmap-r703-'));
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  const dir = execFileSync(process.execPath, [SCRIPT, '--path'], { encoding: 'utf8', cwd: ROOT, env }).trim();
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'MEMORY.md'), 'x'.repeat(chars));
  return { env, dir };
};
const check = (env) =>
  execFileSync(process.execPath, [SCRIPT, '--check'], { encoding: 'utf8', cwd: ROOT, env });

/* ① 天井はホストが報告した対そのもの。#R703 を開かせた実測が、いまも超過と判定される。 */
test('① 天井はホストが報告した 24.4KB × 1024 文字で、25,710 文字は超過', () => {
  assert.equal(INDEX_CEILING_KB, 24.4);
  assert.equal(INDEX_CEILING, Math.floor(24.4 * 1024));
  const observed = indexVerdict(25710);
  assert.equal(observed.over, true, '#R703 を開かせた実測が超過と判定されない');
  assert.equal(indexVerdict(INDEX_CEILING).over, false, '天井ちょうどを超過にしている');
  assert.equal(indexVerdict(INDEX_CEILING + 1).over, true);
});

/* ② 超えていないことと、一度も測っていないことを同じ出力にしない（#R699）。 */
test('② 超えていなくても文字数を述べる', () => {
  const { env } = withIndex(1000);
  const out = check(env);
  assert.ok(out.trim().length > 0, '何も言わずに終わった');
  assert.match(out, /1,000/, `測った文字数を言っていない: ${out}`);
  assert.match(out, /24,985/, `比べた天井を言っていない: ${out}`);
  assert.ok(!/⚠/.test(out), `超えていないのに警告した: ${out}`);
});

/* ③ 超えたら、超過量・何が起きているか・どこを直すかを述べる。 */
test('③ 超えたら、超過量と場所を述べる', () => {
  const over = INDEX_CEILING + 725;
  const { env, dir } = withIndex(over);
  const out = check(env);
  assert.match(out, /725/, `超過量を言っていない: ${out}`);
  assert.ok(out.includes(path.join(dir, 'MEMORY.md')), `どのファイルかを言っていない: ${out}`);
  assert.match(out, /⚠/, '超過なのに警告の印が無い');
  /* ⚠ 実体を消せとは言わない——落ちているのは索引の末尾であって、.md ではない。 */
  assert.match(out, /実体/, `「実体は消えていない」を言っていない: ${out}`);
});

/* ④ これは門ではなく観測である。非 0 で終えると「起動に失敗した」という別の意味になる。 */
test('④ 超過していてもセッションの起動を失敗にしない', () => {
  const { env } = withIndex(INDEX_CEILING + 5000);
  const r = execFileSync(process.execPath, [SCRIPT, '--check'], { encoding: 'utf8', cwd: ROOT, env });
  assert.ok(r.length > 0);   /* execFileSync は非 0 で throw するので、ここに来ること自体が exit 0 */
});

/* ⑤ 測定は**両方の製品**の SessionStart に配られている。綴りを固定せず、hook が名指した
      コマンドをそのまま実行して、測定行が出ることで確かめる（#R505: ソースを読む検査は
      評価順序を見ない）。 */
test('⑤ Claude Code と Codex の両方が、起動時にこの測定を受け取る', () => {
  const claude = readJSON('.claude/settings.json').hooks.SessionStart.flatMap((g) => g.hooks).map((h) => h.command.trim());
  const codex = readJSON('.codex/hooks.json').hooks.SessionStart.flatMap((g) => g.hooks).map((h) => h.command.trim());
  const { env } = withIndex(1234);
  for (const [product, cmds] of [['claude', claude], ['codex', codex]]) {
    const measuring = cmds.filter((c) => c.includes('agent-memory.mjs'));
    const outs = measuring.map((c) => {
      const [, ...args] = c.split(/\s+/);
      return execFileSync(process.execPath, args.slice(1).length ? [path.join(ROOT, args[0]), ...args.slice(1)] : [path.join(ROOT, args[0])],
        { encoding: 'utf8', cwd: ROOT, env });
    });
    assert.ok(outs.some((o) => /1,234\s*\/\s*24,985/.test(o)),
      `${product} の SessionStart は索引を天井と比べていない（受け取るのは: ${measuring.join(' | ')}）`);
  }
});

/* ⑥ 数は 1 か所にしかない。文書はこのファイルを指す（#R500: 機械が持つ数を散文が写すと必ず離れる）。
      ⚠ 針は「その数字」ではなく「その主張」を探す。最初に書いた針は 24985 という**桁の並び**を
      探したので、data/hist-kuni.js の座標に当たった——数字は主張ではない（#R699 の形）。 */
test('⑥ 天井の数を持っているのは scripts/agent-memory.mjs だけ', () => {
  const tracked = execFileSync('git', ['ls-files', '*.mjs', '*.js'], { encoding: 'utf8', cwd: ROOT })
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => f !== 'scripts/agent-memory.mjs' && !f.startsWith('tests/'));
  const carriers = tracked.filter((f) => {
    const src = readFileSync(path.join(ROOT, f), 'utf8');
    return src.includes('INDEX_CEILING') || src.includes('24.4 * 1024');
  });
  assert.deepEqual(carriers, [], `天井の数を写しているファイル: ${carriers.join(', ')}`);
});
