/* ============================================================================
 *  R338 — machine-local なファイルを共有物として追跡すると、全員の merge を塞ぐ
 * ----------------------------------------------------------------------------
 *  `.claude/launch.json` はラウンドごとのプレビュー設定で、中身は
 *  `C:/Users/.../Temp/intmap-worktrees/wt-r330/dist` のような **このマシンだけの絶対パス**である。
 *  それを追跡していた間、Browser の preview ツールは **原本の**そのファイルへ書いていたので、
 *
 *    並行セッションが 1 つでもプレビューを持つ
 *      → 原本の `git merge --ff-only` が「ローカルの変更が上書きされる」と拒否する
 *      → §6 は他セッションの未コミット変更に触ることを禁じているので、その拒否は**正しい**
 *      → 原本が古いままなので `scripts/backup-usb.ps1` が `skipped master-not-synced` で止まる
 *
 *  という連鎖が**毎ラウンド**起きていた。実測 #R334: 19 セッション同時・原本は 3 コミット遅れ・
 *  USB バックアップは skip。#R320 も同じことを測って記録していたが、原因は残っていた。
 *
 *  ⇒ 追跡から外した。書き込みも読み出しも今までどおりで、他人の merge を塞がなくなっただけ。
 *  この検査は、**うっかり追跡へ戻らないこと**を押さえる。
 * ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const rd = (p) => readLF(path.join(ROOT, p));

const LJ = '.claude/launch.json';

/* ── ① 追跡されていない ───────────────────────────────────────────────── */
test('① .claude/launch.json is not tracked', () => {
  const tracked = git('ls-files', '--', '.claude/').split('\n').map((s) => s.trim()).filter(Boolean);
  assert.ok(!tracked.includes(LJ),
    LJ + ' is tracked again. It holds absolute paths into this machine\'s worktrees, and the '
    + 'preview tool writes into the MASTER copy — tracking it blocks every concurrent session\'s '
    + 'fast-forward, and with it the USB backup (measured at #R334).');
  /* 同じ理由で危ないものが増えていないか。
     ⚠ 見るのは **ツールが書き換える設定ファイル**（.json）だけである。`.claude/agents/*.md` は
     散文の中で `C:\Users\...` を例として引用しており、それは誰の merge も塞がない——
     最初に書いたこの検査は .md まで見て、その引用で落ちた。**危ないのは「絶対パスが書いてある」
     ことではなく「毎セッションが機械的に書き換える」ことである。** */
  for (const f of tracked.filter((x) => x.endsWith('.json'))) {
    const body = rd(f);
    assert.ok(!/[A-Za-z]:[\\/]Users[\\/]/.test(body),
      f + ' is a TRACKED config file holding a machine-local absolute path (C:\\Users\\…). '
      + 'That is exactly what made ' + LJ + ' block every other session\'s fast-forward.');
  }
});

/* ── ② 無視されている（消しただけでは、次に誰かが add -A したら戻る） ── */
test('② it is ignored, so `git add -A` cannot put it back by accident', () => {
  const ignore = rd('.gitignore');
  assert.ok(ignore.includes(LJ), '.gitignore must name ' + LJ);
  /* git 自身に訊く——.gitignore の書き方ではなく、実際の判定を見る。 */
  let ignored = false;
  try { git('check-ignore', '-q', LJ); ignored = true; } catch (e) { ignored = e.status === 0; }
  assert.equal(ignored, true, 'git check-ignore says ' + LJ + ' is NOT ignored');
});

/* ── ③ 外したことで壊れていないこと ─────────────────────────────────────
 * worktree.mjs は原本のこのファイルから**使用済みラウンド番号**を導いている。
 * 追跡をやめてもファイルは在るので読めるが、その読み取り自体が消えていないかを見る。 */
test('③ the round-number finder still reads it, and the writer can create it', () => {
  const src = rd('scripts/worktree.mjs');
  assert.match(src, /intmap-preview-r\(\\d\{2,4\}\)/,
    'worktree.mjs must still derive used round numbers from the master launch.json');
  assert.match(src, /if \(!existsSync\(ljPath\)\) writeFileSync\(ljPath/,
    'worktree.mjs must create the file when a fresh clone has none — it is ignored now, '
    + 'so a clone does not come with one');
});

/* ── ④ 文書が実体と合っている ────────────────────────────────────────── */
test('④ the documents say it is untracked', () => {
  /* (#R503) AGENTS.md now has a hard 32,768-byte ceiling — Codex truncates past it in silence —
     so the MEASUREMENT behind this (19 concurrent sessions, the master three commits behind, the
     USB mirror skipped) moved to docs/AGENT-SETUP.md §4. The standing instructions keep the FACT
     and the pointer; the setup document keeps the story. Both are asserted, because a pointer at
     a document that quietly stopped saying it is the same silence #R338 was written against. */
  assert.match(rd('AGENTS.md'), /追跡対象ではない/,
    'AGENTS.md §2 must say the preview config is untracked');
  assert.match(rd('docs/AGENT-SETUP.md'), /追跡から外した理由/,
    'docs/AGENT-SETUP.md §4 owns why the preview config is untracked, and no longer explains it');
  assert.match(rd('.claude/skills/intmap-round/SKILL.md'), /追跡対象外/,
    'the round skill must say the preview entry does not appear in the commit');
});
