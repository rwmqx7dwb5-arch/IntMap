# AGENT-SETUP — Claude Code と Codex で、同じ IntMap を同じように作る

> **対象読者**: IntMap を **Claude Code** または **Codex** で開く人と、そのエージェント自身。
> **この文書が答えること**: 何が両方に共通で、何が製品固有で、**何が自動にならず手作業で残るか**。
>
> ⚠ **恒久指示そのものはここに無い。** 正本は [`../AGENTS.md`](../AGENTS.md)（両製品が読む）。
> ここは**配線図**であって、規則の写しではない（`AGENTS.md` §9）。

---

## 1. 何が、誰に、いつ読まれるか

| 中身 | 正本（1 つ） | Claude Code が読む経路 | Codex が読む経路 |
|---|---|---|---|
| 恒久指示（§0〜§12） | **`AGENTS.md`** | `CLAUDE.md` の `@AGENTS.md` import | **そのまま自動**（設定も信頼も要らない） |
| 実行戦略 | **`.agents/rules/execution-strategy.md`** | `CLAUDE.md` の `@` import | `AGENTS.md` §1 が「自分で開け」と要求 |
| GPT 受け渡し規約 | **`.agents/rules/gpt-handoff.md`** | 同上 | 同上 |
| ラウンドの手順 | **`.agents/skills/intmap-round/`** | `.claude/skills/`（生成）→ `/intmap-round` | **そのまま自動**（`$intmap-round`） |
| 専用 subagent 5 役 | **`.agents/roles/*.md`** | `.claude/agents/*.md`（生成） | `.codex/agents/*.toml`（生成・**要 trust**） |
| 製品固有の作法 | `CLAUDE.md` §A / `.codex/config.toml` の `developer_instructions` | 自動 | **要 trust** |
| セッション開始時の状態 | `scripts/worktree.mjs status --brief` | `.claude/settings.json` の hook | `.codex/hooks.json` の hook（**要 trust ＋ `/hooks` 承認**） |

**生成物は編集しない。** `.claude/agents/`・`.claude/skills/`・`.codex/agents/` は
`node scripts/agent-sync.mjs --write` が `.agents/` から書き、`npm run check:agents` が照合する。
写しを直しても、次の生成で消える——**直す場所は `.agents/` の側**。

### ⚠ `AGENTS.md` には 32,768 バイトの天井がある

Codex は `project_doc_max_bytes`（既定 **32,768**）まで読んで**止まる**。
**実測（#R503・codex-cli 0.150.0）**: 36,095 バイトの `AGENTS.md` を置いて訊いたところ、
**先頭の行は答えられ、末尾の行は「無い」と答えた**。警告はどこにも出ない。

`.codex/config.toml` はこれを 262,144 に上げるが、**それは信頼されたプロジェクトでしか読まれない**
（§7）。つまり**常に効いている数は既定値のほう**なので、`npm run check:agents` は
既定値に対して測る。天井に当たったら、上げるのではなく**正本を移す**——
手順は skill、戦略は `.agents/rules/`、製品固有はこの文書と `CLAUDE.md`。

---

## 2. 不明点の訊き方（`AGENTS.md` §8）

規則は同じ——**推測で埋めない・質問を説明文に混ぜない**。手段だけが違う。

| | Claude Code | Codex |
|---|---|---|
| 訊く | `AskUserQuestion` ツール | **質問だけを本文にして turn を終える** |
| 計画を見せる | plan mode | `/plan` |

⚠ Codex には専用の質問 UI が無い。作業を進めながら報告の末尾に質問を添えるのは、
**§8 が禁じている形**（確認を取ったことにならない）。訊くなら、そこで止まる。

---

## 3. 資格情報とマシン固有ファイル

| ファイル | 中身 | 追跡 | Claude Code | Codex |
|---|---|---|---|---|
| `CLAUDE.local.md` | 本番検証用アカウント・このマシンのパス | **されない** | **自動で読む** | **読まない**——要るときに自分で開く |
| `.claude/launch.json` | ラウンド別プレビュー | されない（§4） | 読む | 使わない |
| `.claude/settings.local.json` | このマシンの許可 | されない | 読む | 使わない |
| `~/.codex/config.toml` | Codex のモデル・信頼したプロジェクト | リポジトリ外 | — | 読む |

⚠ **秘密情報を追跡対象のファイルへ書き写さない。** このリポジトリは public。
`AGENTS.md` §2 が正本で、この表は「どちらが自動で読むか」だけを足している。

---

## 4. プレビューと dev サーバ

慣例は **`intmap-preview-r<N>` / ポート `4000 + N`**（`AGENTS.md` §2）。
`node scripts/worktree.mjs new` が `.claude/launch.json` に 1 件足す。

- **Claude Code**: preview ツール（`preview_start`）で起動する。シェルから直に起動しない。
- **Codex**: browser プラグインで開く。dev サーバが要るなら `npm run preview`
  （`npm run serve` は build を伴う）。

### ⚠ `.claude/launch.json` を追跡から外した理由（#R338・#R334 の実測）

中身は `C:/Users/.../Temp/intmap-worktrees/…/dist` のような**このマシンだけの絶対パス**で、
共有する意味が無い。追跡していた間は、preview ツールが**原本の**そのファイルへ書くため、
**並行セッションが 1 つでもプレビューを持つと原本の早送りが拒否され**
（`AGENTS.md` §6 が他セッションの未コミット変更を触ることを禁じているので、その拒否は正しい）、
**USB バックアップも `skipped master-not-synced` で止まっていた**。
実測 #R334: 19 セッション同時・原本は 3 コミット遅れ・バックアップは skip。

外したことで、書き込みも読み出しも今までどおりのまま、他セッションの merge を塞がなくなった。
**USB から復元した原本には preview 設定が無い状態で立ち上がるが、
`node scripts/worktree.mjs new` が作り直す**ので手当は要らない。

---

## 5. 製品のハーネスが作る worktree

`AGENTS.md` §6 は「worktree は OneDrive の外に置く」と要求し、
`node scripts/worktree.mjs new` はそれを守る。**効かないのは、製品のハーネスが
リポジトリの中に作るもの。**

**Claude Code**: `<repo>\.claude\worktrees\` にでき、そこは **OneDrive の中**である。
実測（#R282 追記）: そこに 2 本・**611 MB・11,615 ファイル**があり、ファイル属性に PINNED が
立っていて **OneDrive が実際にアップロードしていた**（追跡対象の本体は 113.8 MB / 693 ファイル
なので、**同期量の約 9 割が一時物**）。

- 隔離が要るときは `node scripts/worktree.mjs new <slug>` を使う。
  ⚠ **Agent tool の `isolation: "worktree"` を使わない。**
- 恒久的に外へ出すには、その階層に**使用中の worktree が 1 本も無いとき**に
  `.claude\worktrees` を OneDrive 外への junction に置き換える（OneDrive は reparse point を
  たどらない）。**使用中の worktree があるときに行ってはならない。**

**Codex**: 同種のハーネス worktree は作らない。`scripts/worktree.mjs` だけを使う。

---

## 6. subagent・ツール・MCP

5 役の使い分けは `.agents/rules/execution-strategy.md` §2 が正本。**呼び方だけが違う。**

| | Claude Code | Codex |
|---|---|---|
| 起動 | Agent tool の `subagent_type` | 「`intmap-scout` に投げて」と依頼／`/agent` で確認 |
| 名前 | `intmap-scout` ほか 4 つ | 同じ名前（`.codex/agents/*.toml` の `name`） |
| 道具の絞り方 | frontmatter の `tools` | `sandbox_mode` ほか config キー |
| 並列 | 同じメッセージで複数起動 | 1 回の依頼でまとめて spawn |

**MCP**: このリポジトリは MCP サーバを 1 つも宣言していない（`.mcp.json` は無い）。
どちらの製品も、ブラウザ操作・ファイル操作などを**製品側が供給する**ものに頼っている。
したがって **MCP の設定に移植すべきものは無い**——移植の対象は、上の表の「呼び方」だけ。

⚠ **本番検証の道具は同じではない。** Claude Code は preview ツール群、Codex は browser
プラグイン。測る対象（`AGENTS.md` §5.1 の production verification）は同じ。

---

## 7. Codex を初めて使うときに、一度だけ要ること

`AGENTS.md` は**何もしなくても読まれる**。以下は**それ以外の半分**を有効にするための手順で、
`.codex/` の中身（5 役・hook・Codex 固有の作法）は**これを済ませるまで読まれない**。

1. **プロジェクトを信頼する。** 初回の TUI 起動時に訊かれる。
   `node scripts/worktree.mjs new` は、作った作業場を `~/.codex/config.toml` に
   `trust_level = "trusted"` として登録するので、**ラウンドごとの作業場については自動**。
   原本（`C:\Users\gyuuk\OneDrive\IntMap`）だけは一度手で信頼する。
2. **hook を承認する。** `/hooks` を開いて `SessionStart` を trust する。
   Codex は hook の**ハッシュ**に対して信頼を記録するので、`.codex/hooks.json` を編集すると
   **もう一度**訊かれる。承認するまで hook は「一覧には出るが走らない」。
   ⚠ hook の command は**セッションの cwd** で走るので、`node scripts/worktree.mjs status --brief`
   はチェックアウトの**根**から Codex を起動したときだけ当たる（`.claude/settings.json` と同じ形に
   揃えてある）。公式の例は `$(git rev-parse --show-toplevel)` で根を解決するが、**それは POSIX の
   構文**で、このマシンの既定シェルでは動かない。サブディレクトリから起動する運用にするなら
   `commandWindows` を足す。
3. **モデルと reasoning effort を選ぶ。** ⚠ **これが最大の非互換**。
   `~/.codex/config.toml` の既定は利用者の設定であって、リポジトリからは変えていない
   （費用は利用者のものなので、勝手に上げない）。IntMap の作業は
   `AGENTS.md` §3 が根本原因での修正を、§3.5 が 9 言語すべてへの反映を要求する——
   浅い推論だと**手順は踏むが判断が浅い**という形で落ちる。上げるなら:

   ```bash
   codex -c model_reasoning_effort="high"
   ```

   恒久的にするなら `~/.codex/config.toml` に `model_reasoning_effort = "high"`。

### 手作業が残るもの（自動化できなかったもの）

| 事項 | なぜ |
|---|---|
| hook の trust（`/hooks`） | ハッシュ単位の**対話的な承認**で、設定ファイルからは与えられない |
| 原本を信頼する初回の 1 回 | `worktree.mjs new` は自分が作った作業場しか登録しない |
| モデル / reasoning effort | 費用の判断は利用者のもの |
| Claude Code 側の `@` import の確認 | 新しいセッションで `/context` を開き、**Memory files** に `CLAUDE.md` と `AGENTS.md` が並ぶことを見る |
| **蓄積済みメモリの引き継ぎ** | 下記 |

### ⚠ 蓄積済みメモリは自動では渡らない

Claude Code は `~/.claude/projects/C--Users-gyuuk-OneDrive-IntMap/memory/` に**このリポジトリで
学んだこと**を貯めていて（索引 `MEMORY.md` は毎セッション自動で読まれる）、Codex は**それを読まない**。
Codex には Codex 自身の `/memories` があり、これから貯まるぶんはそちらに入る。

**`AGENTS.md` §1 は「片方で学んだことはもう片方にも書く」を要求している**ので、これから先は
揃っていく。**既存ぶんを渡すかどうかは利用者の判断**——渡すなら、`.codex/hooks.json` の
`SessionStart` にもう 1 本足して索引を読ませるのが最短:

```json
{ "type": "command", "command": "node -e \"try{process.stdout.write(require('fs').readFileSync(require('os').homedir()+'/.claude/projects/C--Users-gyuuk-OneDrive-IntMap/memory/MEMORY.md','utf8'))}catch{}\"" }
```

⚠ **既定では入れていない。** 索引だけで約 7 KB あり、毎ターンではなくセッションごととはいえ
費用が要る。そして中身は**このマシンの絶対パスに依存する**（追跡対象のファイルにマシン固有の
パスを増やすのは `AGENTS.md` §2 が避けたがっている形）。入れるなら、上を承知のうえで。

---

## 8. 壊れていないかを確かめる

```bash
npm run check:agents     # AGENTS.md の余白・CLAUDE.md の import・生成物と .agents/ の一致
npm run check:docs       # 文書どうしの事実の突き合わせ
node --test tests/r503-checks.test.mjs
```

`check:agents` が落ちる典型は 3 つ——**天井に当たった**（§1）、
**生成物を直接編集した**（`--write` で戻る）、**`CLAUDE.md` の `@AGENTS.md` を消した**
（Claude Code のセッションが恒久指示ごと無くなる）。
