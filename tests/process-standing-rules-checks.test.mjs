/* ============================================================================
 *  IntMap · the standing rules are still written down, where a session is sent
 * ----------------------------------------------------------------------------
 *  AGENTS.md is a document nobody executes, so a rule can vanish from it and every later round runs
 *  on without noticing. Held here: every load-bearing rule of the old pasted 定例指示 (#R257), the
 *  finish procedure and its report lines (#R260), the removal policy 「提案 → 確認 → 実行」 in all
 *  three standing documents — proved by making each one wrong and watching `shrink-policy` go red
 *  (#R473) — and the permanent ban on case-by-case hardcoding, reachable from what is loaded (#R515).
 *  ⚠ The subject of every assertion here is PROSE — the rule is the sentence — so reading the
 *  document is the evaluation; there is no code whose behaviour would say the same thing.
 *
 *  Each block below was one round-numbered file until the tests were regrouped by subject. A block
 *  keeps that file's helpers private to it (a `{ … }` scope), so two rounds' `docFacts()` or
 *  `scenario()` cannot shadow each other; the helpers every block shared — ROOT, rd/read and the
 *  line-ending-tolerant anchor — are declared once above. Titles keep their round tag so a failure
 *  still names the round whose record explains it.
 *
 *  Was: tests/r257, r260, r473, r515 ⑥
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { withTreeLock } from './helpers/gate-lock.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const read = rd;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R257 — was tests/r257-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  #R257 — the standing instructions live in the repository, and carry no secret
 * ----------------------------------------------------------------------------
 *  Until this round the operating rules were pasted into chat by hand at the top
 *  of every session ("IntMap 定例指示"). They now live in AGENTS.md, which Claude
 *  Code loads automatically, so the first message is the task alone.
 *
 *  Two things can silently undo that, and each has a test here:
 *
 *    · a later round trims AGENTS.md and a load-bearing rule quietly disappears —
 *      nobody notices, because nothing was ever asserting it was there;
 *    · a later round copies the account credentials out of the untracked
 *      CLAUDE.local.md and into a tracked file. **This repository is PUBLIC.**
 *      That is a live-credential leak, not a style problem.
 *
 *  ⚠ THIS FILE MUST NEVER CONTAIN THE SECRET IT GUARDS. The assertions match the
 *  SHAPE of a credential (an address, a `Password:` line), never its value —
 *  a test that pins a leak by quoting it is the leak.
 * ==========================================================================*/

const at = (p) => new URL('../' + p, import.meta.url);
const read = (p) => readFileSync(at(p), 'utf8');

/* ── ① AGENTS.md exists and is the thing Claude Code actually auto-loads ─────────────────────── */
test('#R257 ① AGENTS.md exists at the repository root', () => {
  assert.ok(existsSync(at('AGENTS.md')),
    'AGENTS.md is gone — every session is back to needing the instructions pasted by hand');
  const md = read('AGENTS.md');
  assert.ok(md.length > 3000,
    `AGENTS.md is ${md.length} bytes — it has been trimmed to a stub`);
});

/* ── ② every load-bearing rule of the old 定例指示 survived the move ─────────────────────────── */
test('#R257 ② AGENTS.md still carries each standing rule', () => {
  const md = read('AGENTS.md');
  /* Each entry is [what the rule is, a string that can only be there if the rule is].
     They are quoted from the instructions the user maintained by hand for 250+ rounds. */
  const rules = [
    ['着手前の確認',          '着手前に必ず確認するもの'],
    ['再現してから根本原因',  '根本原因'],
    /* ⚠ (#R473) この行の needle は書き換わった。利用者が方針を変え、削除・縮小は
       「提案 → 確認 → 実行」になったので、AGENTS.md §3 の 1 はもう「してはならない」で
       終わっていない。**規則が消えたのではなく形が変わった**ので、needle も substance を
       追う——⑴ 無断の削除は今も禁止 ⑵ 確認を取ってから行う、の両方が在ること。
       3文書が揃っているかは check:docs の `shrink-policy` が別に見ている。 */
    ['無断の削除・縮小の禁止','承認の無い削除・縮小・無効化・簡略化は、今までどおり禁止'],
    ['削除は提案→確認→実行','確認を取ってから行う'],
    ['勝手な変更の禁止',      '要求された範囲を超える変更'],
    ['ハリボテ実装の禁止',    'プレースホルダーの実装は禁止'],
    ['Atlas/catalog/SYS',     'SYS 定義'],
    ['出典・規約の同時更新',  '出典表記'],
    /* ⚠ (#R700) THE RULE WAS AMENDED, AND THIS NEEDLE WAS ANCHORED TO THE OLD WORDING.
       §3-5 said 「…現在対応している全言語すべてに反映する」 until CONSTITUTION.md §7 narrowed
       AUTHORING to en+jp on 2026-09-11. The rule did not GO — it changed — and a needle that spells
       out one phrasing is #R488 in the place that exists to prove the rules are still there: it
       cannot tell an amendment from a deletion. What survives every phrasing of this rule is that
       §3 still tells the reader WHERE the language policy is decided, so that is what is asked for. */
    ['言語方針の在り処',      'lang-policy.mjs'],
    ['絵文字の禁止',          '許可なく絵文字を追加してはならない'],
    ['iOS 風デザイン',        'iOS 風の洗練されたデザイン'],
    ['1回のパスで完了',       '1 回のパスで完了'],
    ['npm test と回帰テスト', 'npm test'],
    ['migrations 経由のDB',   'supabase/migrations/'],
    ['ワークフロー完走',      'production verification'],
    ['branch deletion',       'branch deletion'],
    ['Edge Function デプロイ','supabase functions deploy'],
    ['追加承認を求めない',    '追加承認を求めないこと'],
    ['破壊的変更は要確認',    '破壊的変更'],
    ['並行セッションは別 worktree', '独立した worktree'],
    ['他セッションを壊さない','別セッションの未コミット変更'],
    ['ユーザー依頼は最小限',  '2FA'],
    ['推測の禁止',            '推測・Guess・独自解釈'],
    ['言い訳語の禁止',        '最も自然なのは'],
    /* ⚠ (#R503) この needle も書き換わった。`AskUserQuestion` は **Claude Code の道具の名前**で、
       Codex にその道具は無い（あちらは「質問だけを本文にして turn を終える」）。恒久指示から
       製品固有の綴りが消えたのであって、**規則が消えたのではない**——だから needle は規則の側を
       追い、道具の名前のほうは下の ⑦ が製品固有ファイルに残っていることを確かめる。 */
    ['質問は質問機能で',      '質問は必ず質問用の機能で行う'],
    ['ドキュメント最新化',    '古い情報を放置しない'],
    /* (2026-09-25) the rule «write the record» is unchanged; its form is one file per entry now
       (dev-notes/), and the index is generated — so what AGENTS.md must still carry is the command
       that makes the record reach DEV-NOTES.md, not a heading spelled with a round number */
    ['記録を 1 本足す',       'node scripts/dev-notes.mjs --list'],
    ['日本語で報告',          '日本語'],
    ['最終報告の項目',        'CI 状態'],
    ['追加作業不要の明示',    '追加作業が不要'],
    ['本ファイルの保守',      '完全置換'],
  ];
  for (const [name, needle] of rules) {
    assert.ok(md.includes(needle),
      `AGENTS.md lost the rule 「${name}」 (looked for ${JSON.stringify(needle)})`);
  }
});

/* ── ③ the project facts the user used to paste are all there ───────────────────────────────── */
test('#R257 ③ AGENTS.md carries the project information block', () => {
  const md = read('AGENTS.md');
  for (const needle of [
    'https://rwmqx7dwb5-arch.github.io/IntMap/',        // production
    'https://github.com/rwmqx7dwb5-arch/IntMap',        // repo
    'npm run serve',                                    // local
    '127.0.0.1:4173',                                   // local port
    'file://',                                          // ...which does NOT work
    'admin.html',                                       // admin
    'vpekfwdpurzejrrmacac',                             // supabase ref (a public identifier)
    'Architecture.md', 'DEV-NOTES.md', 'CONSTITUTION.md',
    /* (#R280) the list of operational documents grew; match its stem so it can grow again */
    'docs/{TESTING,RELEASE,MONITORING,INCIDENT-RESPONSE',
    'donate.stripe.com/5kQdR2d2m1oa1lAadk5gc01',        // Stripe EN
    'donate.stripe.com/8x29AM9Qa2se7JYetA5gc00',        // Stripe JA
    'CLAUDE.local.md',                                  // where the credentials went
  ]) {
    assert.ok(md.includes(needle), `AGENTS.md lost the project fact ${JSON.stringify(needle)}`);
  }
});

/* ── ④ the /rename rule is gone and stays gone ──────────────────────────────────────────────── */
test('#R257 ④ no session-rename instruction — the title is generated, not typed', () => {
  const md = read('AGENTS.md');
  /* The old rule 14 told Claude to run `/rename <name>` at session start. That command does not
     exist in the Desktop app, so it was an instruction that could only ever be failed. Claude Code
     titles an unnamed session from its first prompt instead. */
  assert.ok(!/\/rename\s+</.test(md),
    'the `/rename <name>` instruction is back — it cannot be executed from the Desktop app');
  assert.ok(md.includes('自動生成'),
    'the note that the session title is auto-generated is gone, so /rename can creep back in');
});

/* ── ⑤ THE SECRET STAYS OUT OF THE TRACKED TREE ─────────────────────────────────────────────── */
test('#R257 ⑤ CLAUDE.local.md is ignored, and no tracked doc carries a credential', () => {
  /* the ignore rule itself */
  const gi = read('.gitignore');
  assert.match(gi, /^CLAUDE\.local\.md$/m,
    '.gitignore no longer excludes CLAUDE.local.md — the credentials file can be committed to a PUBLIC repo');

  /* ...and nothing credential-shaped in any tracked markdown. Shapes, never values. */
  const ADDRESS = /[A-Za-z0-9._%+-]+@(?:gmail|googlemail)\.com/;
  const PASSWORD_LINE = /^[^\n]{0,40}(?:Password|password|パスワード)\s*[:：]\s*\S/m;

  const roots = readdirSync(at('.')).filter((f) => f.endsWith('.md'));
  const docs = existsSync(at('docs'))
    ? readdirSync(at('docs')).filter((f) => f.endsWith('.md')).map((f) => 'docs/' + f)
    : [];
  const scanned = [...roots, ...docs].filter((f) => f !== 'CLAUDE.local.md');
  assert.ok(scanned.includes('AGENTS.md'), 'the scan did not reach AGENTS.md');
  assert.ok(scanned.length >= 10, `only ${scanned.length} markdown files were scanned — the sweep is not reaching the tree`);

  for (const f of scanned) {
    const body = read(f);
    assert.ok(!ADDRESS.test(body),
      `${f} contains an account address. This repository is PUBLIC — credentials belong in CLAUDE.local.md only.`);
    assert.ok(!PASSWORD_LINE.test(body),
      `${f} contains a password line. This repository is PUBLIC — credentials belong in CLAUDE.local.md only.`);
  }
});

/* ── ⑥ the other docs point at AGENTS.md, so it cannot be forgotten ─────────────────────────── */
test('#R257 ⑥ CONSTITUTION.md and Architecture.md both register AGENTS.md', () => {
  const con = read('CONSTITUTION.md');
  assert.ok(con.includes('AGENTS.md'),
    'CONSTITUTION.md §6 no longer lists AGENTS.md — the two top-level rule files have drifted apart');
  assert.ok(con.includes('CLAUDE.local.md'),
    'CONSTITUTION.md no longer records where the credentials live');
  const arch = read('Architecture.md');
  assert.ok(arch.includes('AGENTS.md'),
    'Architecture.md §3 (ファイル構成) no longer lists AGENTS.md');
});

/* ── ⑦ the product-specific half kept what the neutral half had to give up ────────────────────
   (#R503) §8 of AGENTS.md used to name `AskUserQuestion` — a Claude Code tool that does not exist
   in Codex. Making the standing instructions provider-neutral meant taking the tool name out, and
   the failure mode of that move is silent: the RULE survives in AGENTS.md while the instruction a
   Claude Code session can actually act on quietly disappears. So the needle did not vanish, it
   MOVED, and this is the test that says where to. */
test('#R257 ⑦ CLAUDE.md keeps the Claude Code spelling of the neutral rules', () => {
  const claude = read('CLAUDE.md');
  assert.ok(claude.includes('AskUserQuestion'),
    'CLAUDE.md no longer names AskUserQuestion — AGENTS.md §8 stopped naming it too (it is not a Codex tool), '
    + 'so no document tells a Claude Code session which tool to ask with');
  assert.ok(/@AGENTS\.md/.test(claude),
    'CLAUDE.md no longer imports AGENTS.md — a Claude Code session would start with none of the standing rules above');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R260 — was tests/r260-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  #R260 — the session has an END, and the end is written down
 * ----------------------------------------------------------------------------
 *  「定例指示に追加して。作業終了処理…」— until this round AGENTS.md described how to
 *  do the work and stopped at `branch deletion`. What happens AFTER the work was
 *  carried in the user's head and pasted when it mattered: commit and push, then
 *  mirror the site onto the backup USB stick, once a calendar day, and VERIFY the
 *  mirror instead of trusting that the copy returned 0.
 *
 *  This file exists for the same reason tests/r257-checks.test.mjs does: AGENTS.md
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

const at = (p) => new URL('../' + p, import.meta.url);
const read = (p) => readFileSync(at(p), 'utf8');

/* ── ① the section exists, and the renumbering it caused did not lose the old one ────────────── */
test('#R260 ① AGENTS.md has §11 作業終了処理 and still has 本ファイル自体の保守', () => {
  const md = read('AGENTS.md');
  assert.match(md, /^## 11\. 作業終了処理/m,
    'AGENTS.md §11 (作業終了処理) is gone — the session has no defined end again');
  assert.match(md, /^## 12\. 本ファイル自体の保守/m,
    '§12 本ファイル自体の保守 disappeared when §11 was inserted — the renumbering dropped a section');
  /* §10 has to hand off to it, or the backup line quietly stops appearing in reports.
     ⚠ (#R628) THIS USED TO FIX THE SPELLING «§11.8», AND §11 HAS ONLY EVER HAD FOUR SUBSECTIONS.
     So the one test guarding the hand-off was pinning a number with no section behind it: the
     instruction that every final report must follow pointed nowhere, and this assertion was what
     kept it pointing nowhere. Ask the question that actually matters — §10 names a subsection of
     §11, and that subsection exists. */
  const ref = md.match(/§11\.(\d+)/g);
  assert.ok(ref && ref.length, '§10 no longer points into §11 — the final report can omit the backup status and look complete');
  for (const r of new Set(ref)) {
    const n = r.slice(1);
    assert.match(md, new RegExp('^### ' + n.replace('.', '\\.') + ' ', 'm'),
      `AGENTS.md points at §${n}, and §11 has no such subsection — the hand-off has an empty address`);
  }
});

/* ── ② every clause of the procedure survived ───────────────────────────────────────────────── */
test('#R260 ② AGENTS.md still carries each clause of the finish procedure', () => {
  /* ⚠⚠ (#R280) THE PROCEDURE IS CODE NOW. §11 was 114 lines of prose steps; steps written in
     prose are re-implemented slightly differently every time they are followed, and «slightly
     differently» is how a backup ends up verified by a weaker test than the one written down.
     scripts/backup-usb.ps1 is the implementation and AGENTS.md keeps WHEN to run it and the
     invariants. What #R260 established — that every clause is WRITTEN DOWN — is unchanged, so
     this reads both, and asserts that AGENTS.md actually points at the script.

     ⚠⚠ (#R718) AND THE CORPUS FOLLOWS THE CLAUSE, BECAUSE THE CLAUSE MOVES. AGENTS.md has a
     32,768-byte ceiling that Codex enforces by dropping the tail in silence, so §12 of that file
     tells every round to answer a full document by MOVING a section out rather than by raising
     the number. #R718 moved §11.3 「スクリプトが守っていること」 to docs/AGENT-SETUP.md §10 for
     exactly that reason, and thirteen of the needles below went with it. What #R260 established
     is that each clause is WRITTEN DOWN SOMEWHERE A SESSION IS SENT — not that AGENTS.md is where
     it is written. The corpus is therefore the set of documents that carry the procedure, and it
     grows when a clause moves. ⚠ THE ONE THING THAT MUST NOT HAPPEN is deleting a clause to make
     this list pass: a rule dropped from all three files is precisely the silent loss this test
     was built to catch, and it looks identical to a move until you check where it landed. So
     §11.3 of AGENTS.md still has to POINT at the document that took it (asserted below), or a
     clause could be «moved» somewhere no session ever opens. */
  const CARRIERS = ['AGENTS.md', 'docs/AGENT-SETUP.md', 'scripts/backup-usb.ps1'];
  const md = CARRIERS.map(read).join('\n');
  assert.ok(read('AGENTS.md').includes('scripts/backup-usb.ps1'),
    'AGENTS.md no longer names the script — a procedure nobody is told to run is not a procedure');
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
    ['成功時のみ日付を更新',     'THE LEDGER MOVES ONLY ON SUCCESS'],
    ['未接続はエラーにしない',   'NOT CONNECTED IS NOT AN ERROR'],
    ['恒久的な識別',             'ボリュームラベル'],
    ['候補が1台なら設定してよい','ちょうど1台'],
    ['推測で選ばない',           'NEVER GUESS THE DRIVE'],
    ['内蔵/OneDrive は対象外',   'ネットワークドライブ'],
    ['USB のルートが対象',       'USB のルート'],
    ['一方向のみ',               '一方向のみ'],
    ['逆同期の禁止',             '逆同期しない'],
    ['node_modules は含めない',  'node_modules'],
    ['Git HEAD の追跡対象が基準','Git HEAD の追跡対象ファイル'],
    ['削除も反映する完全ミラー', 'リポジトリに無いものは USB からも削除'],
    ['古いファイルを残さない',   'EXTRAS ARE DELETED EXPLICITLY'],
    ['管理情報は同期対象外',     '.intmap-backup-id.json'],
    ['コピー成功≠バックアップ成功', 'コピーが成功したことを、バックアップが成功したことにしない'],
    ['再帰比較で差分ゼロ',       '完全に一致することを確認'],
    ['ハッシュで照合',           'SHA-256'],
    ['失敗したら自分で直す',     '再同期・再検証する'],
    ['1回で諦めない',            '既定3回'],
    ['無限ループにしない',       '無限ループにせず'],
    ['失敗時は記録しない',       'This is a failed backup, not a slow one'],
    ['失敗を隠さない',           'その事実を隠さず明示する'],
  ];
  for (const [name, needle] of rules) {
    assert.ok(md.includes(needle),
      `the finish procedure lost the rule 「${name}」 — none of ${CARRIERS.join(', ')} carries it`
      + ` (looked for ${JSON.stringify(needle)})`);
  }
  /* the move is only a move while the reader of AGENTS.md is still sent to where it went */
  assert.match(read('AGENTS.md'), /### 11\.3 [^\n]*\n(?:[^\n]*\n){0,6}?[^\n]*docs\/AGENT-SETUP\.md/,
    'AGENTS.md §11.3 no longer points at the document that holds the invariants — the clauses moved'
    + ' somewhere no session is told to open, which is indistinguishable from losing them');
});

/* ── ③ the three report shapes are all spelled out ──────────────────────────────────────────── */
test('#R260 ③ the finish report has a line for each outcome', () => {
  const md = read('AGENTS.md');
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
  /* (#R718) same corpus as ②, and for the same reason: the sentence that states the direction
     moved to docs/AGENT-SETUP.md §10 with the rest of §11.3. The negative half below is asserted
     over the same text, so a document that starts describing a sync running back from the USB is
     caught wherever it is. */
  const md = ['AGENTS.md', 'docs/AGENT-SETUP.md'].map(read).join('\n');
  const ps = read('scripts/backup-usb.ps1');
  /* ⚠ THE ASSERTION IS THE PROPERTY, NOT THE WORDING. This read «PC 上の IntMap → USB» literally
     until #R282, when the source had to be named more precisely: 「PC 上の IntMap」 was ambiguous
     between the master copy and a temp worktree, and mirroring the worktree is exactly the defect
     that round fixed. #R280 then moved the mechanism into scripts/backup-usb.ps1, so the direction
     is now stated in two places and BOTH have to keep saying it. */
  assert.match(md, /(原本|PC 上の IntMap)\s*→\s*USB/,
    'the sync direction is no longer written down — a "sync" that can run backwards is not a backup');
  assert.ok(!/USB\s*→\s*(原本|PC)/.test(md), 'AGENTS.md now describes a sync that runs back from the USB');
  assert.match(ps, /ONE WAY\. .*→ USB/, 'the script no longer states the direction it enforces');
  assert.ok(md.includes('USB 上のファイルを作業元にしない'),
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
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R473 — was tests/r473-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  #R473 — 「既存機能は絶対に削らない」を、利用者が「確認を取れば削ってよい」に変えた回
 * ----------------------------------------------------------------------------
 *  方針転換の一文はこうである——**必要と判断すれば提案し、確認が取れれば削除・縮小してよい。
 *  ただし勝手にはやらない。** そして Atlas だけは別扱いで、**実装は削ってよいが、到達可能な
 *  能力と回答品質は削らない。**
 *
 *  この一文は3つの文書に、3つの声で書いてある——`CONSTITUTION.md`（何を守るか）・
 *  `AGENTS.md`（どう働くか）・`PRODUCT.md`（§2.1 守ること）。**同じ方針が3か所にある**という
 *  形は、この repository が最もよく壊してきた形そのものである（#R403 の gate-lists、#R399 の
 *  本数、`backup-shell` の launcher——どれも「1つを直して2つを直し忘れた」）。
 *
 *  ⚠ ここでは**両方の古さが事故になる**。古い禁止だけを読んだセッションは、いま望まれている
 *    削減を提案せずに終わる。逆に、許可だけを読んで「確認」の段を落としたセッションは、
 *    **訊かずに消す**。後者は取り返しがつかない。
 *
 *  よってこのファイルが検査するのは「文言」ではなく、`scripts/doc-facts.mjs` の
 *  `shrink-policy` 規則が**実際に赤くなること**である。
 *
 *    ① 現状は緑（この規則が何かを主張していること自体の前提）
 *    ② どの1文書からでも「確認・承認」の段が消えたら赤——**許可だけが残った文書**を作らない
 *    ③ 「勝手にはしない」が消えたら赤——ブレーキの無い許可は許可証である
 *    ④ Atlas の但し書きは `CONSTITUTION.md` が正本で、そこから消えたら赤
 *    ⑤ 他の2文書が正本を**名指さなくなったら**赤——写しを増やさずに届かせる唯一の手段
 *    ⑥ 錨（`既存機能`）ごと消えても緑にならない（#R385 の形——文が消えたせいで緑）
 *
 *  ⚠ 変異は**窓の中だけ**に効かせる。ファイル全体から「確認」を消すような変異は、通っても
 *    何も証明しない（規則が読んでいるのはその窓だから）。
 * ==========================================================================*/

const CANON = 'CONSTITUTION.md';
const OWNERS = [CANON, 'AGENTS.md', 'PRODUCT.md'];
const WIN = 700;                 /* scripts/doc-facts.mjs の窓と同じ幅 */

/* ⚠ 規則1本だけを走らせる（#R407 の `--rule=`）。全規則を回すと 11 秒、これは 1 秒。
   変異を戻さないまま長く錠を持たないためでもある。 */
function docFacts() {
  try {
    execFileSync(process.execPath, [join(ROOT, 'scripts/doc-facts.mjs'), '--rule=shrink-policy', '--check'],
      { cwd: ROOT, encoding: 'utf8' });
    return { code: 0, out: '' };
  } catch (e) {
    return { code: e.status == null ? -1 : e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

/* 壊す → 走らせる → **バイト列で**戻す（#R403 の helper と同じ約束） */
async function breaking(file, mutate, fn) {
  await withTreeLock(() => {
    const originalBytes = rd(file);
    const original = readLF(join(ROOT, file));
    const broken = mutate(original);
    assert.notEqual(broken, original, `the mutation did not change ${file} — its anchor is gone`);
    try {
      writeFileSync(join(ROOT, file), broken);
      fn(docFacts());
    } finally {
      writeFileSync(join(ROOT, file), originalBytes);
    }
    assert.equal(rd(file), originalBytes, `${file} was not restored byte-for-byte after the mutation`);
  });
}

/* 錨から WIN 文字ぶんだけを書き換える。錨が複数あれば、そのすべてを書き換える
   （規則は「どれか1つの窓が条件を満たせば緑」なので、1つ残せば変異は無効になる）。 */
function editWindows(src, fn) {
  let out = '', last = 0;
  for (const m of src.matchAll(/既存機能/g)) {
    if (m.index < last) continue;                         /* 重なった窓 */
    const end = Math.min(src.length, m.index + WIN);
    out += src.slice(last, m.index) + fn(src.slice(m.index, end));
    last = end;
  }
  return out + src.slice(last);
}

function green(msg) {
  return withTreeLock(() => {
    const r = docFacts();
    if (r.code === 0) return;
    let dirty = '(git status unavailable)';
    try {
      dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim() || '(clean)';
    } catch { /* leave the placeholder */ }
    assert.fail(`${msg}\n--- check:docs (shrink-policy) said ---\n${r.out}\n--- working tree ---\n${dirty}`);
  });
}

const red = (r, file, why) => {
  assert.equal(r.code, 1, `the gate stayed GREEN with ${file} broken — ${why}`);
  assert.ok(r.out.includes('shrink-policy'), `the gate failed but never named shrink-policy (${why}):\n` + r.out);
  assert.ok(r.out.includes(file), `the gate failed but never named ${file} (${why}):\n` + r.out);
};

test('R473 ① 3つの正本が、確認つきの形で削除・縮小の方針を述べている', async () => {
  await green('shrink-policy must be green before any mutation below means anything');
  /* 規則を信じる前に、錨が実在することを直接確かめる（規則が「見ていなかった」ことによる緑を除く） */
  for (const f of OWNERS) {
    const body = readLF(join(ROOT, f));
    assert.ok(body.includes('既存機能'), `${f} does not state the policy about 既存機能 at all`);
    const win = body.slice(body.indexOf('既存機能'), body.indexOf('既存機能') + WIN);
    assert.match(win, /削除|縮小/, `${f} names 既存機能 but not what may happen to it`);
    assert.match(win, /確認|承認/, `${f} states the policy without the asking step`);
  }
});

test('R473 ② どの1文書からでも「確認」の段が消えたら赤い', async () => {
  await withTreeLock(async () => {
    for (const f of OWNERS) {
      await breaking(f, (s) => editWindows(s, (w) => w.replace(/確認|承認/g, '——')),
        (r) => red(r, f, 'permission with the asking step dropped'));
    }
  });
});

test('R473 ③ 「勝手にはしない」が消えたら赤い', async () => {
  await withTreeLock(async () => {
    for (const f of OWNERS) {
      await breaking(f, (s) => editWindows(s, (w) => w.replace(/勝手|承認の無い|承認されるまで/g, '——')),
        (r) => red(r, f, 'a permission with no brake on doing it alone'));
    }
  });
});

test('R473 ④ Atlas の但し書きは CONSTITUTION.md が正本で、そこから消えたら赤い', async () => {
  await withTreeLock(async () => {
    /* (a) 「一体として扱う」が消える */
    await breaking(CANON, (s) => s.replace(/一体/g, '別々'),
      (r) => red(r, CANON, 'Atlas no longer treated as one system'));
    /* (b) 「到達可能な能力は削らない」が消える——実装だけでなく能力まで削ってよく読める状態 */
    await breaking(CANON, (s) => s.replace(/到達/g, '——'),
      (r) => red(r, CANON, 'the reachable-capability floor is gone'));
  });
});

test('R473 ⑤ 他の2文書が正本を名指さなくなったら赤い', async () => {
  await withTreeLock(async () => {
    for (const f of OWNERS.filter((x) => x !== CANON)) {
      await breaking(f, (s) => editWindows(s, (w) => w.split(CANON).join('憲法')),
        (r) => red(r, f, 'the pointer to the owner of the Atlas carve-out is gone'));
    }
  });
});

test('R473 ⑥ 錨ごと消えても緑にならない（文が消えたせいで緑、を作らない）', async () => {
  await withTreeLock(async () => {
    for (const f of OWNERS) {
      await breaking(f, (s) => s.split('既存機能').join('既存の機能'),
        (r) => red(r, f, 'the policy simply stopped being stated'));
    }
  });
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R515 — was tests/r515-checks.test.mjs ⑥
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
const R = (f) => readFileSync(join(ROOT, f), 'utf8');
/* ══ ⑥ the rule this round was told to make permanent ═══════════════════════════════════════════ */
test('R515 ⑥: case-by-case hardcoding is forbidden by a standing rule that is actually loaded', () => {
  const rule = R('.agents/rules/no-ad-hoc-hardcoding.md');
  /* it forbids the thing, and it says what to do instead — a prohibition with no alternative is ignored */
  assert.match(rule, /場当たりのハードコーディング/);
  assert.match(rule, /直すのは事例ではなく/);
  assert.match(rule, /着手前の 3 問/);
  /* ⚠ a rule nobody loads is not a rule: AGENTS.md must point at it and CLAUDE.md must import it
     (scripts/agent-sync.mjs enforces the import; this holds the POINTER, which it does not). */
  assert.match(R('AGENTS.md'), /場当たりのハードコーディングで逐事的に対処してはならない/);
  assert.match(R('AGENTS.md'), /\.agents\/rules\/no-ad-hoc-hardcoding\.md/);
  assert.match(R('CLAUDE.md'), /@\.agents\/rules\/no-ad-hoc-hardcoding\.md/);
  assert.match(R('docs/README.md'), /no-ad-hoc-hardcoding\.md/, 'docs/README.md is the index — a document not in it has no owner');
  /* ⚠ AGENTS.md is read to a byte ceiling; the rule bought its room by MOVING a measurement out */
  assert.ok(Buffer.byteLength(R('AGENTS.md'), 'utf8') < 32768, 'AGENTS.md would be silently truncated');
  assert.match(R('docs/AGENT-SETUP.md'), /--use-api/, 'the measurement that made room has to land somewhere');
});
}
