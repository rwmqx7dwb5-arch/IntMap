/* ============================================================================
 *  #R260 — the session has an END, and the end is written down
 * ----------------------------------------------------------------------------
 *  「定例指示に追加して。作業終了処理…」— until this round CLAUDE.md described how to
 *  do the work and stopped at `branch deletion`. What happens AFTER the work was
 *  carried in the user's head and pasted when it mattered: commit and push, then
 *  mirror the site onto the backup USB stick, once a calendar day, and VERIFY the
 *  mirror instead of trusting that the copy returned 0.
 *
 *  This file exists for the same reason tests/r257-checks.test.mjs does: CLAUDE.md
 *  is a document nobody executes, so a rule can vanish from it and every later
 *  round will run happily without ever noticing. Three things in particular are
 *  load-bearing and silent when broken:
 *
 *    · the DIRECTION (`PC → USB`, never the reverse). A round that softens this
 *      into "sync" makes the backup a second working copy, and the first conflict
 *      overwrites real work with a stale mirror.
 *    · the VERIFICATION. "robocopy exited 1" is not "the backup is good"; the rule
 *      is a recursive hash comparison with a zero-difference result.
 *    · the ONE-A-DAY ledger and the rule that its date only moves on SUCCESS. A
 *      round that stamps the date first and syncs after turns one failed backup
 *      into a whole day of skipped ones.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const at = (p) => new URL('../' + p, import.meta.url);
const read = (p) => readFileSync(at(p), 'utf8');

/* ── ① the section exists, and the renumbering it caused did not lose the old one ────────────── */
test('#R260 ① CLAUDE.md has §11 作業終了処理 and still has 本ファイル自体の保守', () => {
  const md = read('CLAUDE.md');
  assert.match(md, /^## 11\. 作業終了処理/m,
    'CLAUDE.md §11 (作業終了処理) is gone — the session has no defined end again');
  assert.match(md, /^## 12\. 本ファイル自体の保守/m,
    '§12 本ファイル自体の保守 disappeared when §11 was inserted — the renumbering dropped a section');
  /* §10 has to hand off to it, or the backup line quietly stops appearing in reports */
  assert.ok(md.includes('§11.8'),
    '§10 no longer points at §11.8 — the final report can omit the backup status and look complete');
});

/* ── ② every clause of the procedure survived ───────────────────────────────────────────────── */
test('#R260 ② CLAUDE.md still carries each clause of the finish procedure', () => {
  const md = read('CLAUDE.md');
  const rules = [
    ['作業完了後に必ず実行',     '作業終了処理'],
    ['commit と push',           'GitHub へ push'],
    ['変更が無ければ commit しない', '不要な commit を作成しない'],
    ['GitHub が最新であることの確認', '最新状態になっていることを確認'],
    /* ⚠⚠ (#R267) THE CADENCE CHANGED BY INSTRUCTION, NOT BY DRIFT.
       「これからはIntMapのUSBメモリバックアップは、一日一回ではなく毎回に。」 — so the two rules that
       pinned «at most once a calendar day» and «skip for the rest of that day» are replaced by the
       rule that replaced them. Everything else in this list is untouched: what #R260 established is
       that the finish procedure is WRITTEN DOWN, and it still is. */
    ['毎回同期する',             '依頼された作業が完了するたびに毎回'],
    ['1日1回の制限は無い',       '1 日 1 回の制限は無い'],
    ['日時をローカルに記録',     'usb-backup-state.json'],
    ['成功時のみ日付を更新',     '正常完了した場合のみ'],
    ['未接続はエラーにしない',   'エラー扱いにせず'],
    ['恒久的な識別',             'Volume Label'],
    ['候補が1台なら設定してよい','1 台だけ'],
    ['推測で選ばない',           '絶対に推測で選択しない'],
    ['内蔵/OneDrive は対象外',   'ネットワークドライブ'],
    ['USB のルートが対象',       'USB メモリのルート'],
    ['一方向のみ',               '一方向のみ'],
    ['逆同期の禁止',             '逆同期したりしてはならない'],
    ['node_modules は含めない',  'node_modules'],
    ['Git HEAD の追跡対象が基準','Git HEAD に含まれる追跡対象ファイル'],
    ['削除も反映する完全ミラー', 'USB 側からも削除する'],
    ['古いファイルを残さない',   '古い IntMap のファイルを残さない'],
    ['管理情報は同期対象外',     '.intmap-backup-id.json'],
    ['コピー成功≠バックアップ成功', 'コピー処理の成功だけで'],
    ['再帰比較で差分ゼロ',       '差分がゼロであることを確認'],
    ['ハッシュで照合',           'SHA-256'],
    ['失敗したら自分で直す',     '自動的に修正・再同期・再検証'],
    ['1回で諦めない',            '1 回失敗しただけで諦めない'],
    ['無限ループにしない',       '無限ループにはせず'],
    ['失敗時は記録しない',       '「バックアップ済み」記録を更新してはならない'],
    ['失敗を隠さない',           'その事実を隠さず明示する'],
  ];
  for (const [name, needle] of rules) {
    assert.ok(md.includes(needle),
      `CLAUDE.md lost the finish-procedure rule 「${name}」 (looked for ${JSON.stringify(needle)})`);
  }
});

/* ── ③ the three report shapes are all spelled out ──────────────────────────────────────────── */
test('#R260 ③ the finish report has a line for each outcome', () => {
  const md = read('CLAUDE.md');
  for (const [what, needle] of [
    /* (#R267) the sample line carries a TIME now — «once a day» was the only reason a bare date
       was enough — and the «already done today» shape is gone with the rule that produced it. */
    ['同期した日時', 'USB: 2026-08-19 14:20 同期済み'],
    ['検証の結果',   'USB検証: 差分ゼロ'],
    ['未接続',       'USB: 未接続のためスキップ'],
    ['GitHub の行',  'GitHub: push済み / 最新'],
  ]) {
    assert.ok(md.includes(needle),
      `the finish report lost the ${what} line (looked for ${JSON.stringify(needle)})`);
  }
});

/* ── ④ the direction of the sync, asserted on its own ───────────────────────────────────────── */
test('#R260 ④ the mirror is one-way, PC → USB', () => {
  const md = read('CLAUDE.md');
  assert.ok(md.includes('PC 上の IntMap → USB'),
    'the sync direction is no longer written down — a "sync" that can run backwards is not a backup');
  assert.ok(md.includes('USB 上のファイルを作業元として使用したり'),
    'the ban on working from the USB copy is gone');
});

/* ── ⑤ the other two rule documents know the procedure exists ───────────────────────────────── */
test('#R260 ⑤ CONSTITUTION.md and Architecture.md record the finish procedure', () => {
  for (const f of ['CONSTITUTION.md', 'Architecture.md']) {
    const body = read(f);
    assert.ok(/作業終了処理|USB/.test(body),
      `${f} no longer mentions the finish procedure — the rule documents have drifted apart`);
  }
});

/* ── ⑥ the new checks file is actually in the list npm test runs ────────────────────────────── */
test('#R260 ⑥ tests/r260-checks.test.mjs is wired into `npm run test:checks`', () => {
  /* ⚠ a per-round checks file that nobody added to this list is a test that never runs and
     therefore never fails — the exact shape of "the instrument was green because it was blind". */
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.scripts['test:checks'].includes('tests/r260-checks.test.mjs'),
    'this file is not in test:checks — it will never run, so it asserts nothing');
});
