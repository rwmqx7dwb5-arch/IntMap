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
| 場当たりのハードコーディングの禁止 | **`.agents/rules/no-ad-hoc-hardcoding.md`** | `CLAUDE.md` の `@` import | `AGENTS.md` §1 が「自分で開け」と要求 |
| GPT 受け渡し規約 | **`.agents/rules/gpt-handoff.md`** | 同上 | 同上 |
| ラウンドの手順 | **`.agents/skills/intmap-round/`** | `.claude/skills/`（生成）→ `/intmap-round` | **そのまま自動**（`$intmap-round`） |
| 専用 subagent 5 役 | **`.agents/roles/*.md`** | `.claude/agents/*.md`（生成） | `.codex/agents/*.toml`（生成・**要 trust**） |
| 製品固有の作法 | `CLAUDE.md` §A / `.codex/config.toml` の `developer_instructions` | 自動 | **要 trust** |
| セッション開始時に何を伝えるか | **`.agents/session-start.json`** | `.claude/settings.json` の `hooks.SessionStart`（生成） | `.codex/hooks.json`（生成・**要 trust ＋ `/hooks` 承認**） |
| 蓄積メモリ | **`scripts/agent-memory.mjs` が出すディレクトリ**（1 か所） | **自動で読む**（hook は要らない） | 上の正本の `products` が Codex だけに配る |

**生成物は編集しない。** `.claude/agents/`・`.claude/skills/`・`.codex/agents/`・**両製品の
SessionStart hook** は `node scripts/agent-sync.mjs --write` が `.agents/` から書き、
`npm run check:agents` が照合する。写しを直しても、次の生成で消える——**直す場所は `.agents/` の側**。

⚠ **(#R699) hook が最後まで手書きの写しだった。** #R696 までは `.claude/settings.json` と
`.codex/hooks.json` が同じ起動コマンドを別々に持っており、**片方の製品にだけ hook を足せる状態**
だった——それは #R696 が直した「メモリの正本が 2 つあった」のと同じ形で、配線のほうに残っていた。
正本は `.agents/session-start.json` 1 つになり、**どの製品に配るかは各コマンドの `products`**、
**配らない理由は `why`** が持つ。実際の非対称は 1 つだけある: Claude Code は `MEMORY.md` を自分で
読み込むので、メモリの hook は Codex にしか要らない（両方に配ると同じ 43 KB を二度渡す）。
**「両方に要る事実」と「両方が hook を要る」は別**であり、除外の理由は製品の実装の側にある。

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

### 手作業が残るもの（**#R704 で実測し直した**）

| 事項 | いまも手作業か | 実測 |
|---|---|---|
| hook の trust（`/hooks`） | **残る（1 回だけ・届かない間の代替がある）** | ⚠⚠⚠ **#R704 実測: `[hooks.state]` は 1 件も無く、この hook は一度も走っていなかった**——`~/.codex/sessions` の 2026-09-01 以降の全 rollout に「IntMap · 蓄積メモリの索引」は **0 件**、状態行が出てくる唯一の箇所は `[external_agent_tool_result]` の中＝**Claude Code の記録を取り込んだもの**だった。配線は正しく、スイッチが入っていなかっただけ。⚠ trust の実体は `~/.codex/config.toml` の `[hooks.state."<key>"] trusted_hash`（`struct HookStateToml` ＝ `enabled` ＋ `trusted_hash`）で、アプリ自身が `config/batchWrite` でそこへ書く。判定は完全一致なので、**`.codex/hooks.json` を変えるたびに 1 回要る**。残る理由は「設定ファイルに書けない」ではなく、**`key` と hash をアプリが計算する**こと——対象も算法も exe の文字列からは決まらなかった（`sha256` の実在箇所は hook と無関係な SigV4・TLS ばかり）。⚠ **届いていない間は「メモリが無い」ではない**——`AGENTS.md` §0 の 4 と `.codex/config.toml` C-0 が、同じ中身を自分で取る手順を持つ |
| 原本を信頼する初回の 1 回 | **もう手作業ではない** | `~/.codex/config.toml` に `[projects.'…\IntMap'] trust_level = "trusted"` として実在し、`scripts/worktree.mjs` が作業場に同じ形を書いている。**機械が書ける形**なので、この行はかつての状態を写したままだった |
| モデル / reasoning effort | **もう手作業ではない（利用者が値を決めたあとは）** | 費用の判断は利用者のものなので、勝手には上げない。#R704 で利用者が `high` を選び、`node scripts/codex-setup.mjs --apply` がそれを書く。⚠ **推論の深さを仕事ごとに自動で変える手段は無い**——`[projects."…"]` が持てるのは `trust_level` 1 つだけ（exe の `struct ProjectConfig with 1 element`）で、深さを絞れる単位は profile しかない |
| 承認とサンドボックス | **もう手作業ではない** | `AGENTS.md` §5.1 は commit・push・PR・merge・deployment に追加承認を求めないことを要求するが、#R704 実測で `approval_policy` も `sandbox_mode` も**未設定**＝アプリ既定に委ねられていた。`codex-setup.mjs --apply` が `workspace-write` ＋ `network_access = true` ＋ `approval_policy = "on-failure"` を書く |
| workspace の外へ書くこと | **もう手作業ではない** | メモリの正本・`~/.intmap-handoff`・`%LOCALAPPDATA%\Temp\intmap-worktrees` は**どの workspace にも入っていない**ので、`workspace-write` では書けない。`codex-setup.mjs` が 3 つとも**導出して** `writable_roots` に入れる（手で並べない）。⚠ USB ミラーだけは入れない——ドライブ文字はバックアップ時にラベルで見つけるものなので、今日の文字は明日の誤りになる。そこは `approval_policy` が 1 回訊く側に残す |
| Codex アプリの "Choose project" | **残る（設定ファイルでは与えられない）** | `~/.codex/config.toml` にも CLI にも「起動時にこのプロジェクトを開く」キーは**見つからなかった**。アプリ所有の state（`~/.codex/.codex-global-state.json` の `selected-project`）でだけ与えられる——**設定面ではないので、リポジトリのスクリプトからは書かない** |
| Claude Code 側の `@` import の確認 | 残る | 新しいセッションで `/context` を開き、**Memory files** に `CLAUDE.md` と `AGENTS.md` が並ぶことを見る |

⚠⚠ **「バンドルにはどちらの綴りも無い」は #R704 の実測で誤りだった。** build 0.153.4 の `codex.exe` に
CLI フラグ `--dangerously-bypass-hook-trust`・環境変数 `BYPASS_HOOK_TRUST`・app-server の
`bypass_hook_trust` override が**3 つとも実在する**（説明文ごと: 「DANGEROUS. Intended only for
automation that already vets hook sources」）。**それでも採らない**——効く範囲が IntMap ではなく
**このマシンの全プロジェクト**で、`/hooks` の 1 回と引き換えに払う代償として釣り合わない。
⚠ **全自動にできる唯一の経路は管理層**
（Windows なら `%ProgramData%\OpenAI\Codex\requirements.toml` の managed hook）で、管理者権限が要り、
**hook の正本がリポジトリの外へ出る**——`.agents/` を 1 つの正本にした #R699 と逆向きなので採らない。

### このマシン側を 1 コマンドで揃える（#R704）

`npm run check:agents` が見るのはリポジトリの中だけで、上の表の残り半分は `~/.codex/config.toml`
——**リポジトリの外**にある。そこを測って揃えるのが:

```bash
npm run setup:codex          # 何が揃っていて、何が手作業で残っているかを印字（何も書かない）
npm run setup:codex:apply    # 揃える（変更前を config.toml.r704.bak に残す・冪等）
```

⚠ **値の一覧をここに書き写さない。** 機械の正本は `scripts/codex-setup.mjs` の `SETTINGS` 1 か所で、
そこには値と**なぜその値なのか**が並んでいる。⚠ **パスも書き写さない**——原本・メモリ・handoff・
worktree の場所は、それぞれを所有しているものに訊いて導出する。

### 蓄積メモリは 1 か所で、両方が読み書きする（#R696）

⚠ **かつてここは「自動では渡らない」だった。** Claude Code は
`~/.claude/projects/<原本のパス>/memory/` に**このリポジトリで学んだこと**を貯めていて、Codex は
それを読まず、自分の `/memories` に別に貯めていた。**実測（#R696）: Codex 側の
`memories_1.sqlite` に IntMap を含む行は 0 件**——同じ罠を、片方だけが知っている状態だった。
これは設定の差ではなく、利用者が「別人が作業している」と感じるもの**そのもの**である。

いまは正本が 1 つで、Codex は `SessionStart` hook から読む:

```bash
node scripts/agent-memory.mjs --path      # 場所（どの worktree から呼んでも同じ）
node scripts/agent-memory.mjs             # hook が渡すもの（先頭に場所、続けて索引）
```

- **パスはハードコードしていない。** 原本は `git rev-parse --git-common-dir` から導出し、
  Claude Code の鍵（絶対パスの非英数字を `-` に置換）を組み立てる。だから
  `AGENTS.md` §2 が避けたがっている「追跡ファイルにマシン固有の絶対パスを増やす」形にならない。
- **切るときは黙って切らない**（#R694）。`--budget` は落とした文字数と、続きの読み方を印字する。
- ⚠ **索引には天井がある。切るのは `--budget` ではなく、索引を自分で読み込む製品の側の上限**
  （#R703 実測: 25,710 文字の `MEMORY.md` に「Only part of it was loaded.」）。**数の正本は
  `scripts/agent-memory.mjs` の `INDEX_CEILING` 1 か所**で、ここには書き写さない。両製品の
  `SessionStart` が毎回これを実測して述べる:

  ```bash
  node scripts/agent-memory.mjs --check    # 索引 N / 天井 M 文字（超えていなくても述べる）
  ```

  超えていたら**詰めるのは索引の古い側だけ**——実体の `.md` は 1 本も消さない。
- **書く側も同じ場所**（`.codex/config.toml` の C-7）。そこは workspace の外なので、Codex の
  サンドボックスが書き込みを拒むことがある——そのときは承認を求めて書く。

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

## 9. Edge Function の deploy に `--use-api` が要る理由（実測）

`AGENTS.md` §5.1 のコマンドが `--use-api` を持っているのは、このマシンの状態を測った結果である。

- 既定のバンドルは **Docker** を使う。`docker --version` は **29.6.1** を返す（＝CLI は入っている）が、
  止まっているのは**デーモン**で、`docker info` は `failed to connect to the docker API at npipe:…`
  を返す（実測 2026-08-24）。
- 旗が無いと **標準出力が 1 バイトも出ないまま 600 秒経っても終わらない**ので、「まだ実行中」と
  「詰まっている」の区別がつかない。
- ⚠ **進んでいるかどうかは経過時間ではなく `supabase functions list` の `version` / `updated_at`**
  で判定する。

### Edge Function の名簿（**ここが正本**）

**Edge Functions は 17 本**（`ai-proxy` / `ais-feed` / `alerts-relay` / `aviation-feed` / `cable-geo` /
`delete-account` / `gdelt-relay` / `monitor-run` / `news-ingest` / `news-relay` / `quotes-relay` /
`radiation-feed` / `refresh-news` / `routing-relay` / `sv-cov` / `volcano-feed` / `who-don`）。17 本すべてが
`supabase/config.toml` に `[functions.*]` として宣言されている。
⚠ **`_shared/` は関数ではない**——ライブラリ用ディレクトリ（`newsgeo.js`・`relay-guard.js`・
`atlas-persona.js`・`aviation-codec.js`・`aviation-model.js`・`news-cluster.js`・`news-geo-prompt.js`・
`news-ingest.js`・`radiation-sources.js`・`volcano-parse.js`・`who-don-extract.js`）で、import した関数の中に CLI がバンドルする。`[functions._shared]` を書いてはならない。

⚠ この節は `AGENTS.md` から移してきたものである（deploy の実測は #R515、名簿は #R628）。
**`AGENTS.md` には 32,768 バイトの天井があり、超えた分は無言で落ちる**ので、測定の詳細も名簿も
ここが正本で、`AGENTS.md` は 1 行で指すだけにする。**数と名前を 2 か所に置かない。**
