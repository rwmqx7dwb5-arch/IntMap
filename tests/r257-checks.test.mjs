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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

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
    ['全言語に反映',          '全言語すべてに反映'],
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
    ['DEV-NOTES に R### 追加','R###'],
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
