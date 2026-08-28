# IntMap — Claude Code 固有 (provider-specific)

<!-- ⚠ 恒久指示の正本は AGENTS.md。ここには「Claude Code でしか意味を持たない事実」だけを書く。
     両方に書ける事実をここに書いた時点で正本が2つになる（AGENTS.md §9）。 -->

@AGENTS.md

@.agents/rules/execution-strategy.md

@.agents/rules/gpt-handoff.md

---

> **上の 3 行は import であって要約ではない。** Claude Code は `@` の指すファイルを起動時に
> 展開して読み込む（相対パスは本ファイルからの相対）。**恒久指示の正本は `AGENTS.md`** で、
> 本ファイルはそれに Claude Code 固有の作法を足すだけのもの。
> Codex は `AGENTS.md` を直に読む。対応表は [`docs/AGENT-SETUP.md`](docs/AGENT-SETUP.md)。
>
> ⚠ **もし上の import が展開されず、`AGENTS.md` の中身が見えていないなら、いますぐ読むこと。**
> それが見えていない状態は「恒久指示が無い」状態であって、「不要になった」ではない。

---

## A-1. セッションの始め方（Claude Code）

- **セッション名は Claude Code が最初のプロンプトから自動生成する。**
  `/rename` を実行しない。ユーザーにセッション名を入力させない。
- **不明点は `AskUserQuestion` で訊く**（`AGENTS.md` §8）。通常の説明文・進捗報告・
  最終報告の文章中に質問を混ぜない。
- 起動時に `.claude/settings.json` の `SessionStart` hook が
  `node scripts/worktree.mjs status --brief` を走らせ、branch・未コミット変更・空きラウンド
  番号・deep tier の夜間結果を出す。**その出力に出ている事実を、手で数え直さない。**

## A-2. 委譲（subagent）

`.agents/roles/` が**役の正本**で、`.claude/agents/*.md` は
`node scripts/agent-sync.mjs` が**そこから生成する写し**（`npm run check:agents` が照合）。
役そのものの説明は `.agents/rules/execution-strategy.md` §2。

Claude Code では **Agent tool** に `subagent_type` を渡して起動する:

| subagent_type | 渡す仕事 |
|---|---|
| `intmap-scout` | 全数調査・呼び出し元の特定 |
| `intmap-verifier` | テスト／CI／ビルドの大量ログ |
| `intmap-i18n` | 9 言語の掃引 |
| `intmap-implementer` | 触るファイルが重ならない並列実装 |
| `intmap-prod-verifier` | 本番サイトでの検証 |

- **独立した仕事は同じメッセージの中でまとめて起動する**（1 つずつ待たない）。
- ⚠ **Agent tool の `isolation: "worktree"` を使わない。** それが作る worktree は
  リポジトリの中（`.claude/worktrees/`）＝ OneDrive の中になる（§A-4）。
  隔離は `node scripts/worktree.mjs new <slug>` で行う。

## A-3. プレビューと dev サーバ

**dev サーバは必ず preview ツール（`mcp__Claude_Browser__preview_start`）で起動し、
Bash から直接起動しない。** ラウンド別の設定は `.claude/launch.json`（追跡対象外）にあり、
`node scripts/worktree.mjs new` が 1 件足す。**慣例と、追跡から外した理由は
[`docs/AGENT-SETUP.md`](docs/AGENT-SETUP.md) §4。**

本番検証は `intmap-prod-verifier` に渡す（`AGENTS.md` §5.1 の production verification）。

## A-4. ハーネスが作る worktree

⚠ **Claude Code のハーネスが作る worktree は `<repo>\.claude\worktrees\` にでき、
そこは OneDrive の中である。** `AGENTS.md` §6 の「worktree は OneDrive の外に置く」は
自分で `git worktree add` するものにしか効かない。**実測と恒久的な対処は
[`docs/AGENT-SETUP.md`](docs/AGENT-SETUP.md) §5。**

## A-5. 権限と設定

- `.claude/settings.json` — 追跡対象。読み取り専用コマンドと IntMap のゲートを allow 済み。
  `GPT-HANDOFF/HANDOFF.md` の編集は deny（`.agents/rules/gpt-handoff.md`）。
- `.claude/settings.local.json` — このマシンだけ。追跡対象外。
- **MCP サーバはこの製品が供給するもの**（ブラウザ・セッション管理など）で、リポジトリは
  1 つも宣言していない（`.mcp.json` は無い）。Codex 側の対応は
  [`docs/AGENT-SETUP.md`](docs/AGENT-SETUP.md) §6。
