---
title: Codex の付則が規則 5 本のうち 3 本だけを並べていた——一部だけの列挙を check:agents が拒む
date: 2026-11-28
internal: エージェントの文脈と検査だけの変更で、サイトの利用者に見える変化は無い
---

〈依頼〉 Claude Code と Codex でどれだけ同じ結果を期待できるか測り、ずれを直す。

## 0. 測った

- `check:agents` は緑（生成物 13 本が `.agents/` と一致）。ただし比べているのは**生成される側**だけだった。
- 手書きの `.codex/config.toml`（Codex の付則）は 2026-09-17 から更新されておらず、その間に指示書類は 1,658 行動いていた。
  古くなっていた記述: 規則を 3 本だけ並べていた（`one-pass-or-a-reason.md`・`substance-over-form.md` が抜けていた）、プレビューを
  `intmap-preview-r<N>`／ポート `4000 + N` としていた（いまは slug を名前にし、4400〜4999 の空き）、「空きラウンド」という言い方、
  `/hooks` の参照先の節番号の誤り（§C-6 → §C-0）。`.agents/session-start.json` の説明にも「free round number」が残っていた。
- 直近の Codex セッション 80 本（全部 IntMap・59 本が PR を作成）のうち、蓄積メモリを読んだのは 1 本、`worktree.mjs status` を
  走らせたのは 32 本。`~/.codex/config.toml` の `[hooks.state]` は空のままで、SessionStart hook は一度も走っていない。

## 1. 直したもの

- 付則から写しを消し、正本を指す形にした（規則はディレクトリを列挙して読む・preview の名前とポートは `worktree.mjs new` が印字する）。
- `check:agents` に `addendum-sets` を足した。手書きの文脈（`AGENTS.md`・`CLAUDE.md`・`.codex/config.toml`・`docs/AGENT-SETUP.md`・
  `.agents/**/*.md`）の 1 行が `.agents/rules/` か `.agents/roles/` の 2 つ以上を名指すなら、全部を名指していなければ赤にする。
  集合はディレクトリから数え上げる（手で並べない）。旧い付則に対して走らせると 46 行目で赤になることを確かめた。
- このマシンの `~/.codex/config.toml`: `npm run setup:codex:apply` で `writable_roots` を揃えた。外れたのは `~/.intmap-handoff` で、
  R762 で撤去した経路が使っていた場所（フォルダは既に無い）。

## 2. 残るもの（利用者にしかできない）

`/hooks` で SessionStart を承認すること（hook の説明文を変えたので hash も変わったが、もともと一度も承認されていない）と、
Codex のモデル選択画面で推論の深さを `high` にすること（アプリが持つ設定で、ファイルに書いても書き戻される）。

## 3. 検査

`tests/codex-addendum-drift-checks.test.mjs`（文脈を一時ディレクトリへ写して `agent-sync.mjs` を実際に走らせる。一部だけの列挙は赤、
1 か所で触れただけなら緑）、`check:agents`、`tests/process-agent-*-checks.test.mjs`。
