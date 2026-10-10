# AGENT-SETUP — Claude Code と Codex で、同じ IntMap を同じように作る

> **対象読者**: IntMap を **Claude Code** または **Codex** で開く人と、そのエージェント自身。
> **答えること**: 何が両方に共通で、何が製品固有で、**何が自動にならず手作業で残るか**。
> 恒久指示そのものはここに無い。正本は [`../AGENTS.md`](../AGENTS.md)（両製品が読む）。ここは**配線図**であって、
> 規則の写しではない（`AGENTS.md` §9）。

---

## 1. 何が、誰に、いつ読まれるか

| 中身 | 正本（1 つ） | Claude Code が読む経路 | Codex が読む経路 |
|---|---|---|---|
| 恒久指示（§0〜§12） | **`AGENTS.md`** | `CLAUDE.md` の `@AGENTS.md` import | **そのまま自動**（設定も信頼も要らない） |
| 規則（実行戦略・場当たりの禁止 ほか） | **`.agents/rules/*.md`** | `CLAUDE.md` の `@` import | `AGENTS.md` §1 が「自分で開け」と要求 |
| 作業の手順 | **`.agents/skills/intmap-round/`** | `.claude/skills/`（生成）→ `/intmap-round` | **そのまま自動**（`$intmap-round`） |
| 専用 subagent 5 役 | **`.agents/roles/*.md`** | `.claude/agents/*.md`（生成） | `.codex/agents/*.toml`（生成・**要 trust**） |
| 製品固有の作法 | `CLAUDE.md` §A / `.codex/config.toml` の `developer_instructions` | 自動 | **要 trust** |
| セッション開始時に何を伝えるか | **`.agents/session-start.json`** | `.claude/settings.json` の `hooks.SessionStart`（生成） | `.codex/hooks.json`（生成・**要 trust ＋ `/hooks` 承認**） |
| 蓄積メモリ | **`scripts/agent-memory.mjs` が出すディレクトリ**（1 か所） | **自動で読む**（hook は要らない） | 上の正本の `products` が Codex だけに配る |

**生成物は編集しない。** `.claude/agents/`・`.claude/skills/`・`.codex/agents/`・**両製品の SessionStart hook** は
`node scripts/agent-sync.mjs --write` が `.agents/` から書き、`npm run check:agents` が照合する（直す場所は `.agents/` の側）。
hook の正本は `.agents/session-start.json` 1 つで、**どの製品に配るかは各コマンドの `products`**、配らない理由は `why`
が持つ（片方の製品にだけ hook を足せる状態を作らない）。実際の非対称は 1 つ: Claude Code は `MEMORY.md` を自分で
読み込むので、メモリの hook は Codex にしか要らない（両方に配ると同じ索引を二度渡す）。

### `AGENTS.md` には 32,768 バイトの天井がある

Codex は `project_doc_max_bytes`（既定 **32,768**）まで読んで**止まる**。警告はどこにも出ない（実測 #R503・
codex-cli 0.150.0: 36,095 バイトの `AGENTS.md` で、先頭の行は答えられ末尾の行は「無い」と答えた）。
`.codex/config.toml` はこれを 262,144 に上げるが、**信頼されたプロジェクトでしか読まれない**（§7）ので、常に効いて
いるのは既定値で、`npm run check:agents` は既定値に対して測る。天井に当たったら、上げるのではなく**正本を移す**
（手順は skill、戦略は `.agents/rules/`、製品固有はこの文書と `CLAUDE.md`）。

数えるのは**ディスク上のバイト**で、CRLF の木（2026-10-02 の `* text=auto eol=lf` より前のチェックアウト）は改行ごとに
1 バイト多い（実測: LF 32,718 バイトが 33,183 バイトになり、CI は緑のまま Codex は §12 を失っていた）。主題がバイトそのもの
なので `scripts/eol.mjs` で正規化せず、**最悪値**＝`LF のバイト数 + 改行の本数` を測る（どの環境でも同じ数で、どの読者の
バイト数より小さくならない）。

---

## 2. 不明点の訊き方（`AGENTS.md` §8）

規則は同じ——**推測で埋めない・質問を説明文に混ぜない**。手段だけが違う。

| | Claude Code | Codex |
|---|---|---|
| 訊く | `AskUserQuestion` ツール | **質問だけを本文にして turn を終える** |
| 計画を見せる | plan mode | `/plan` |

Codex には専用の質問 UI が無い。作業を進めながら報告の末尾に質問を添えるのは §8 が禁じている形で、訊くならそこで止まる。

---

## 3. 資格情報とマシン固有ファイル

| ファイル | 中身 | 追跡 | Claude Code | Codex |
|---|---|---|---|---|
| `CLAUDE.local.md` | 本番検証用アカウント・このマシンのパス | **されない** | **自動で読む** | **読まない**——要るときに自分で開く |
| `.claude/launch.json` | 作業（slug）別プレビュー | されない（§4） | 読む | 使わない |
| `.claude/settings.local.json` | このマシンの許可 | されない | 読む | 使わない |
| `~/.codex/config.toml` | Codex のモデル・信頼したプロジェクト | リポジトリ外 | — | 読む |

秘密情報を追跡対象のファイルへ書き写さない（public。正本は `AGENTS.md` §2）。

---

## 4. プレビューと dev サーバ

慣例は **`intmap-preview-<slug>`**、ポートは **4400〜4999 の空き**（`AGENTS.md` §2）。`node scripts/worktree.mjs new <slug>`
が `.claude/launch.json` に 1 件足す——ポートは、このマシンのどの `launch.json`（原本と全 worktree）にも無く、いま listen
もされていない最小の番号（`scripts/worktree.mjs` の `PREVIEW_PORTS`。テスト用サーバ `tests/helpers/session-seed.js` の
範囲とは重ならない——`check:docs` の `preview-port` が測る）。

- **Claude Code**: preview ツール（`preview_start`）で起動する。シェルから直に起動しない。
- **Codex**: browser プラグインで開く。dev サーバが要るなら `npm run preview`（`npm run serve` は build を伴う）。

### `.claude/launch.json` を追跡から外した理由

中身はこのマシンだけの絶対パスで、共有する意味が無い。追跡していた間は preview ツールが**原本の**そのファイルへ
書くため、並行セッションが 1 つでもプレビューを持つと原本の早送りが拒否され（他セッションの未コミット変更を触らない
`AGENTS.md` §6 どおりの正しい拒否）、USB バックアップも `skipped master-not-synced` で止まっていた（実測 #R334:
19 セッション同時・原本は 3 コミット遅れ）。USB から復元した原本には preview 設定が無いが、`node scripts/worktree.mjs new`
が作り直すので手当は要らない。

---

## 5. 製品のハーネスが作る worktree

`AGENTS.md` §6 の「worktree は OneDrive の外」は `node scripts/worktree.mjs new` が守る。**効かないのは、製品の
ハーネスがリポジトリの中に作るもの。**

**Claude Code**: `<repo>\.claude\worktrees\` にでき、そこは **OneDrive の中**（実測: 2 本・611 MB・11,615 ファイルが
アップロードされ、同期量の約 9 割が一時物だった）。

- 隔離が要るときは `node scripts/worktree.mjs new <slug>`。**Agent tool の `isolation: "worktree"` を使わない。**
- 恒久的に外へ出すには、その階層に**使用中の worktree が 1 本も無いとき**に `.claude\worktrees` を OneDrive 外への
  junction に置き換える（OneDrive は reparse point をたどらない）。**使用中の worktree があるときに行ってはならない。**

**Codex**: 同種のハーネス worktree は作らない。`scripts/worktree.mjs` だけを使う。

**git の外にあるデータ**（data-outside-git）: `worktree.mjs new` は `node_modules` と同じ扱いで `data-assets.json` の集合も
用意する（その worktree の目録で `data:pull`。ディレクトリ集合は `%LOCALAPPDATA%intmap-data` の 1 部への junction）。
`done` は削除の前にその junction を外す。ハーネスの worktree では自分で `npm run data:pull` を走らせる（走らせなければ
門が赤くなってそう言う）。

### 5.1 worktree を手で消すときは、リンクを 1 つも辿らない

どの worktree も `node_modules`（とデータ集合）を**原本・共有の 1 部への junction** として持つ。消す道具がそれを辿ると
**原本の `node_modules` の中身が消え、全セッションが同時に壊れる**（実測 2026-09-25: `cmd /c dir /s /b /aL` が
junction の向こう側まで列挙し、必須パッケージ 45 個とファイル単位の欠損が出た。`npm ci` で復旧）。

- 自分の worktree は `node scripts/worktree.mjs done` で片付ける（junction を先に外す）。
- それ以外は各項目を `lstat` で見て**リンクはリンクそのものだけ外す**（Node は junction を `isSymbolicLink()` と報告
  する）。`dir /s`・PowerShell 5.1 の `Remove-Item -Recurse`・`rm -rf` を junction を含みうる木に使わない。
- OneDrive 配下のファイルは **reparse point 属性**を持つ（`.git/worktrees/*` も）。リンクの判定は `LinkType` /
  `isSymbolicLink()` で行う。
- 消した後は、原本で lock の全パッケージの**中身**が揃っているかを確かめる（`npm ci` が最も確実。`package.json` の
  有無だけではファイル単位の欠損を見逃す）。

### 5.2 共有される場所と、そこへ書くもの

worktree は分かれていても、次の場所は全セッションで 1 つである。

- **subagent の scratchpad**（Claude Code）: 1 つのセッションが起動した subagent は全員が親と同じ scratchpad
  （`…\Temp\claude\<cwd>\<session-id>\scratchpad`）を受け取る。⇒ **置くファイル名には slug を入れる**
  （`build-<slug>.log`。同名のログを他人のビルドのものと取り違えた実測がある）。
- **`node_modules`**（原本への junction）: `vite build` の一時ファイル `node_modules/.vite-temp/` は毎回一意の名前で、
  束の中の `import.meta.dirname` にその木の設定の位置が焼き込まれる——別の木の設定を取り違える経路は無い
  （`tests/build-isolation-checks.test.mjs`）。強制終了されたビルドの一時ファイル（約 5 MB）は OneDrive の中に残る。
  `node_modules/.vite/`（dev の依存キャッシュ）、データ更新の上流キャッシュ（`node_modules/.cache/intmap-*`・
  `%TEMP%\intmap-*-cache`）も共有。
- **時代タイルのキャッシュ**（`%LOCALAPPDATA%\intmap-data\hvt-cache`）: 全 worktree のビルドが読む。内容のハッシュで
  名づけ、書いてから名前へ rename する。
- **同じ木の `dist/`**: 2 つのビルドが重なると互いの `dist/` を空にし合った（`EPIPE`・CSS の無いページ）。ビルドは
  出力先を**1 本ずつ**握り（出力先から名づけた named pipe）、2 本目は待つ（`vite.config.js` の `acquireOutDirLock`）。
  別の出力先（`--outDir`）は待たない。錠が守るのは書き手どうしで、そのビルドを配っているサーバは守らない。

---

## 6. subagent・ツール・MCP

5 役の使い分けは `.agents/rules/execution-strategy.md` §2 が正本。**呼び方だけが違う。**

| | Claude Code | Codex |
|---|---|---|
| 起動 | Agent tool の `subagent_type` | 「`intmap-scout` に投げて」と依頼／`/agent` で確認 |
| 名前 | `intmap-scout` ほか 4 つ | 同じ名前（`.codex/agents/*.toml` の `name`） |
| 道具の絞り方 | frontmatter の `tools` | `sandbox_mode` ほか config キー |
| **モデルの指定** | frontmatter の `model`／Agent tool の `model` | **無い**（アカウント設定が決める） |
| 並列 | 同じメッセージで複数起動 | 1 回の依頼でまとめて spawn |

**MCP**: このリポジトリは MCP サーバを 1 つも宣言していない（`.mcp.json` は無い）。どちらの製品もブラウザ操作など
を製品側が供給するものに頼っているので、移植の対象は上の表の「呼び方」だけ。**本番検証の道具は同じではない**
（Claude Code は preview ツール群、Codex は browser プラグイン）が、測る対象（`AGENTS.md` §5.1）は同じ。

### モデルの指定は Claude Code 固有の差である

`.agents/roles/*.md` の `claude:` ブロックの `model:` は Codex には届かない（`.codex/agents/*.toml` の役で走るモデルは
アカウント側が決めるので、`codex:` へ写せば読まれないキーを作るだけ）。どの役に何をさせるかの判断は
[`.agents/skills/intmap-round/`](../.agents/skills/intmap-round/SKILL.md) §2 にあり両方が読む——届かないのは機械に
伝える**手段**だけ。⇒ Codex で走る scout / i18n / verifier / implementer は Claude Code 側より高いモデルで走ることが
あり、これはこの表が明記している差（昇格条件は自動的に満たされる）。
実際に答えたモデルを役ごとに数えるのは `node scripts/agent-models.mjs`（Claude Code の transcript。Codex は対象外）。
モデル名の綴りの誤りは `npm run check:agents` が止める（Claude Code は知らない名前を黙って継承に戻す。
`scripts/agent-sync.mjs` の `CLAUDE_MODELS`）。

---

## 7. Codex を初めて使うときに、一度だけ要ること

`AGENTS.md` は何もしなくても読まれる。`.codex/` の中身（5 役・hook・Codex 固有の作法）は以下を済ませるまで読まれない。

1. **プロジェクトを信頼する。** `node scripts/worktree.mjs new` は作った作業場を `~/.codex/config.toml` に
   `trust_level = "trusted"` として登録するので作業場は自動。原本も同じ形で登録済み（機械が書ける）。
2. **hook を承認する。** `/hooks` を開いて `SessionStart` を trust する。Codex は hook の**ハッシュ**に対して信頼を記録
   するので、`.codex/hooks.json` を編集すると**もう一度**訊かれる。承認するまで hook は「一覧には出るが走らない」。
   hook の command は**セッションの cwd** で走るので、`node scripts/worktree.mjs status --brief` はチェックアウトの
   **根**から起動したときだけ当たる（公式の例の `$(git rev-parse --show-toplevel)` は POSIX 構文でこのマシンの既定
   シェルでは動かない。サブディレクトリから起動する運用にするなら `commandWindows` を足す）。
3. **モデルと reasoning effort を選ぶ**（最大の非互換）。費用は利用者のものなので、リポジトリからは変えない。
   浅い推論だと「手順は踏むが判断が浅い」形で落ちる（`AGENTS.md` §3 は根本原因での修正を要求する）。上げるなら
   `codex -c model_reasoning_effort="high"`、恒久的には `~/.codex/config.toml` に `model_reasoning_effort = "high"`。

### 手作業が残るもの（#R704 で実測）

| 事項 | いまも手作業か | 実測と理由 |
|---|---|---|
| hook の trust（`/hooks`） | **残る（`.codex/hooks.json` を変えるたびに 1 回）** | trust の実体は `~/.codex/config.toml` の `[hooks.state."<key>"] trusted_hash`（アプリが書く・完全一致判定）。**`key` と hash をアプリが計算する**ので設定から書けない。#R704 まで一度も trust されておらず hook は走っていなかった。届いていない間も `AGENTS.md` §0 の 4 と `.codex/config.toml` C-0 が同じ中身を自分で取る手順を持つ |
| 原本を信頼する初回 | **もう手作業ではない** | `[projects.'…\IntMap'] trust_level = "trusted"` が実在し、`scripts/worktree.mjs` が作業場に同じ形を書く |
| モデル / reasoning effort | **残る（アプリが所有する鍵）** | `config.toml` に書いても、起動中の Codex が UI の選択で書き戻す（`high` が数分後に `low` へ）。**UI で選ぶ**のが唯一の与え方で、`codex-setup.mjs` は書かずに食い違いを報告する。仕事ごとに変える手段も無い（`[projects."…"]` が持てるのは `trust_level` だけ・絞れる単位は profile のみ） |
| 承認とサンドボックス | **もう手作業ではない** | `codex-setup.mjs --apply` が `workspace-write` ＋ `network_access = true` ＋ `approval_policy = "on-failure"` を書く（`AGENTS.md` §5.1 の追加承認不要に合わせる） |
| workspace の外へ書くこと | **もう手作業ではない** | メモリの正本と `%LOCALAPPDATA%\Temp\intmap-worktrees` を `codex-setup.mjs` が導出して `writable_roots` に入れる。USB ミラーだけは入れない（ドライブ文字はバックアップ時にラベルで見つけるもの）——そこは `approval_policy` が 1 回訊く |
| Codex アプリの "Choose project" | **残る** | 設定ファイルにも CLI にもキーが無く、アプリ所有の state（`~/.codex/.codex-global-state.json` の `selected-project`）だけ。リポジトリからは書かない |
| Claude Code 側の `@` import の確認 | 残る | 新しいセッションで `/context` を開き、Memory files に `CLAUDE.md` と `AGENTS.md` が並ぶことを見る |

hook の trust を飛ばす経路は実在する（`codex.exe` 0.153.4 の `--dangerously-bypass-hook-trust`・`BYPASS_HOOK_TRUST`・
app-server の `bypass_hook_trust`）が、**採らない**——効く範囲がこのマシンの全プロジェクト。全自動にできる管理層
（`%ProgramData%\OpenAI\Codex\requirements.toml` の managed hook）も、管理者権限が要り hook の正本がリポジトリの外へ出るので採らない。

### このマシン側を 1 コマンドで揃える

`npm run check:agents` はリポジトリの中だけを見る。リポジトリの外（`~/.codex/config.toml`）を測って揃えるのが:

```bash
npm run setup:codex          # 何が揃っていて、何が手作業で残っているかを印字（何も書かない）
npm run setup:codex:apply    # 揃える（変更前を config.toml.r704.bak に残す・冪等）
```

値の一覧とその理由の正本は `scripts/codex-setup.mjs` の `SETTINGS` 1 か所。パスも書き写さない（所有者から導出する）。

### 蓄積メモリは 1 か所で、両方が読み書きする

正本は 1 つで、Claude Code は自動で読み、Codex は `SessionStart` hook から読む（かつて Codex 側に IntMap を含む記憶は
0 件で、同じ罠を片方だけが知っていた）:

```bash
node scripts/agent-memory.mjs --path      # 場所（どの worktree から呼んでも同じ）
node scripts/agent-memory.mjs             # hook が渡すもの（先頭に場所、続けて索引）
node scripts/agent-memory.mjs --check     # 索引 N / 天井 M 文字（超えていなくても述べる）
```

- パスはハードコードしない（原本は `git rev-parse --git-common-dir` から導出し、Claude Code の鍵＝絶対パスの非英数字を
  `-` に置換したものを組み立てる）。
- 切るときは黙って切らない（`--budget` は落とした文字数と続きの読み方を印字する）。
- **索引には天井がある**——切るのは `--budget` ではなく、索引を自分で読み込む製品の側の上限（実測: 25,710 文字の
  `MEMORY.md` に「Only part of it was loaded.」）。数の正本は `scripts/agent-memory.mjs` の `INDEX_CEILING`。超えていたら
  **詰めるのは索引の古い側だけ**で、実体の `.md` は 1 本も消さない。
- 書く側も同じ場所（`.codex/config.toml` の C-7）。workspace の外なので、Codex のサンドボックスが拒んだら承認を求めて書く。

---

## 8. 壊れていないかを確かめる

```bash
npm run check:agents     # AGENTS.md の余白・CLAUDE.md の import・生成物と .agents/ の一致
npm run check:docs       # 文書どうしの事実の突き合わせ
node --test tests/process-agent-context-checks.test.mjs
```

`check:agents` が落ちる典型は 3 つ——天井に当たった（§1）、生成物を直接編集した（`--write` で戻る）、
`CLAUDE.md` の `@AGENTS.md` を消した（Claude Code のセッションが恒久指示ごと無くなる）。

## 9. Edge Function の deploy に `--use-api` が要る理由（実測）

**通常の deploy は CI。** `main` への push で `supabase/functions/**`・`supabase/config.toml`・`supabase/migrations/**` が
変わると `.github/workflows/supabase-deploy.yml` が**最後に成功した配備から**変わった関数（`_shared/` か `config.toml`
なら全関数・本番に無い宣言済みの関数は常に）と足された migration を出し、宣言された関数が本番に無ければ赤にする
（正本 [`RELEASE.md`](RELEASE.md) の「Supabase: Edge Functions and migrations」）。secret `SUPABASE_ACCESS_TOKEN` が
未登録なら run は赤で Issue が名前を述べる（登録は [`BACKUP-RESTORE.md`](BACKUP-RESTORE.md)「一度だけの登録」）。
**手での deploy（`AGENTS.md` §5.1）は緊急時の手段**——CI が赤で直すより早く出す必要があるとき・未登録の間だけ。

`--use-api` はこのマシンの状態を測った結果である（CI も同じ旗で出す）。既定のバンドルは **Docker** を使うが、
`docker --version` は 29.6.1 を返すのに**デーモン**は止まっていて `docker info` は `failed to connect to the docker API
at npipe:…`（実測 2026-08-24）。旗が無いと標準出力が 1 バイトも出ないまま 600 秒経っても終わらない。
**進んでいるかは経過時間ではなく `supabase functions list` の `version` / `updated_at`** で判定する。

### Edge Function の名簿（**ここが正本**）

**Edge Functions は 21 本**（`ai-proxy` / `ais-feed` / `alerts-relay` / `atlas-embed` / `aviation-feed` / `cable-geo` /
`client-errors` / `delete-account` / `fetch-relay` / `gdelt-relay` / `news-ingest` / `news-relay` / `quotes-relay` /
`radiation-feed` / `reader-reports` / `refresh-news` / `routing-relay` / `sv-cov` / `usage-count` / `volcano-feed` / `who-don`）。21 本すべてが
`supabase/config.toml` に `[functions.*]` として宣言されている。
**`_shared/` は関数ではない**——ライブラリ用ディレクトリ（`ai-provider.js`・`newsgeo.js`・`relay-guard.js`・`rate-limit.js`・
`atlas-persona.js`・`aviation-codec.js`・`aviation-model.js`・`news-cluster.js`・`news-entities.js`・`news-geo-prompt.js`・
`news-ingest.js`・`radiation-sources.js`・`volcano-parse.js`・`who-don-extract.js`・`bbox.js`・`read-budget.js`・`client-error-shape.js`・`site-origin.js`・`fetch-relay-policy.js`・`ai-ledger.js`・`ai-usage.js`・`atlas-grade-schema.js`・`ai-stream.js`・`plans.js`・`inquiry-shape.js`・`correction-shape.js`・`place-watch.js`・`great-circle.js`）で、import した関数の中に CLI がバンドルする。`[functions._shared]` を書いてはならない。

`AGENTS.md` の天井のため、測定の詳細も名簿もここが正本で、`AGENTS.md` は 1 行で指すだけ。**数と名前を 2 か所に置かない。**

---

## 10. USB バックアップのスクリプトが守っていること（**書き換えるときも壊さないこと**）

**いつ走らせるか**は `AGENTS.md` §11.2（「作業のたびに毎回」と、このマシンにある shell）。起動は `powershell` であって
`pwsh` ではない（PowerShell 7 は無い。実測 `$PSVersionTable` は 5.1.26100.9168。スクリプトは 5.1 で完動する）。
以下は **`scripts/backup-usb.ps1` が実装している不変条件**——どれも、壊してもコピー自体は成功して見えるものばかり。

- **ミラー元は原本（`C:\Users\gyuuk\OneDrive\IntMap`）であって、temp の worktree ではない。** 原本の場所は
  `git rev-parse --git-common-dir` から導出するので、どの worktree から実行しても原本を見る。原本が merge 後の状態で
  なければ同期せず `skipped` で終わる（順序の指示は `AGENTS.md` §11.2）。
- **同期方向は `原本 → USB` の一方向のみ。** USB 上のファイルを作業元にしない。逆同期しない。
- **USB のルートが IntMap の完全ミラー**。中身は **Git HEAD の追跡対象ファイル**（`node_modules` / `.git` / `dist` /
  キャッシュは入らない）。新規は作成、更新は上書き、**リポジトリに無いものは USB からも削除**する。例外は
  `.intmap-backup-id.json`（ドライブを識別するためにスクリプト自身が置く管理情報）。
- **git の外にあるデータ集合も入る**（data-outside-git）。`data-assets.json` が名指す集合（`data/border-detail/`・
  `data/hist-eras.js`）を `node scripts/data-assets.mjs list` の一覧として追跡ファイルに足す。`list` は原本の配置が目録の
  sha256 どおりかを先に検証し、無い・違うなら 1 行も出さずに失敗する——そのときスクリプトは**ミラーせず**
  `RESULT failed data-assets-not-placed` で終わる（ミラーすると USB の正しい写しが消されるから）。原本の集合は
  `npm run master:sync` が早送りのあとに `data:pull` で置く（USB へはリンクではなく中身がコピーされる）。
- **マシン固有のファイル**（§4）は追跡外なのでミラーの対象外で、USB 上の古い写しは次回同期で削除される（正しい）。
- 追跡から外すコミット自身の早送りでは、git がローカルで変更された／追跡外のパスの削除を拒む。そこで
  `master-sync.mjs --sync` が**宣言されたマシン固有のパスに限り**中身を退避 → git に消させる → 書き戻す（commit も
  破棄もしない。宣言に無いパスが混じれば拒否のまま）。
- **ドライブは推測しない。** ボリュームラベル `INTMAP-BACKUP`（または識別ファイル）で特定する。ラベル付きが無く、
  書き込み可能なリムーバブルが**ちょうど1台**のときだけそれを採用してラベルを刻む。一意に決まらなければ**スキップして
  報告する**。内蔵 SSD・システムドライブ・OneDrive・ネットワークドライブは対象外（DriveType で除外。OneDrive はミラーの元）。
- **コピーが成功したことを、バックアップが成功したことにしない。** 同期後に両側を再帰的に歩き直し、相対パス・存在・
  SHA-256 が**完全に一致することを確認する**。一致した場合のみ成功とする。
- **失敗したら原因を調べ、再同期・再検証する**（既定3回）。それでも駄目なら**無限ループにせず**失敗として終える。
- **成功したときだけ**台帳に日時を書く: `~/.claude/projects/C--Users-gyuuk-OneDrive-IntMap/usb-backup-state.json`
  （リポジトリの外・追跡対象外）。

---

## 11. 原本と並行セッション——`AGENTS.md` §6 の規則の理由と実測

`AGENTS.md` §6 は規則だけを持つ。規則を変えるときに読み直すべき実測はここにある。

- **なぜ原本を作業場にしないのか。** 作業場にすると排他ロックと回復手順が要り、ロックは失効ロックという壊れ方を作る。
  実測 #R282: 初版の `--sync` が、原本で `feat/session-a` を使っていたセッションの作業ディレクトリを、別セッションの
  終了処理が黙って `main` に切り替えた。**`main` 専用なら切り替える branch が無い。**
- **原本だけが「どの工程も責任を持たない写し」になっていた**（実測: origin/main より 15 コミット・159 ファイル遅れ。
  OneDrive は正常で、原本に何も書き込まれていなかった）。⇒ `node scripts/master-sync.mjs --sync` を §5 の最終工程に置いた。
- **`--sync` は冪等で、1 回の実行がその時点で merge 済みの全セッション分を運ぶ。** 早送りが触らないファイル
  （他セッションのマシン固有ファイルなど）は素通りし、実際に上書きになる場合だけ `git merge --ff-only` の理由を出して
  止まる。`--check` は「遅れ」と「汚れ」を分け、汚れは警告として印字するが exit 0 を妨げない（USB ミラーは作業
  ディレクトリをそのまま写す）。以前の「汚れていれば何であれ拒否」は、正しい作業にゲートを迂回させた。
- **テストの dev サーバをセッションごとに分ける理由**（`tests/helpers/session-seed.js`）: 全チェックアウトが 4173 を共有し
  `reuseExistingServer` が効いていた間は、2 つ目のセッションが相手の `dist/` を試験するか、相手がサーバを落とした瞬間に
  `ERR_CONNECTION_REFUSED` で死んだ（実測 2 failed / 25 did not run。私有ポートなら 52 passed）。
- **識別子に番号を使わない理由**（利用者承認済み）は `.agents/skills/intmap-round/` §4。slug は
  `git worktree add -b feat/<slug>` で**原子的に**取る（`tests/process-without-round-numbers-checks.test.mjs` ①）。
- **`git stash` は全 worktree で共有される**（`refs/stash` は clone に 1 本）。clean な木で stash→pop すると**別セッションの
  stash を pop する**（2026-10-02 実測）。統合の退避は **commit か一時 branch** で。main の取り込みは `git rebase origin/main`
  と merge driver（`node scripts/merge-driver.mjs --finish`・§12）。

---

## 12. 生成物の merge driver——**追跡されない設定が 1 つある**

並行 PR の衝突のほぼ全部が**人が書かないもの**（生成物・台帳・件数）だった（2026-10-01 実測・15 本）。解き方は
`scripts/merge-driver.mjs` が持ち、どのファイルをどう解くかの**宣言は `.gitattributes` の 1 か所**
（`merge=intmap-generated` と `intmap-merge=json|regen|tokens`）。何を測っているかは [`TESTING.md`](TESTING.md) の
`tests/generated-file-merge-driver-checks.test.mjs`。

- **`.gitattributes` だけでは効かない。** git は driver の**コマンド**を clone の config（`merge.intmap-generated.driver`）から
  だけ読む。未登録なら黙って普通の行マージに戻る（解けたはずの衝突が人に回る）。
- **登録は冪等で、3 か所が行う**: `node scripts/worktree.mjs status`（両製品の SessionStart hook）、`worktree.mjs new`、
  `master-sync.mjs --sync`。手でなら `node scripts/merge-driver.mjs --install`。config は clone の全 worktree が共有するので
  1 回の登録が全セッションに効き、Codex で hook が未 trust でも `new` と `--sync` が書く。**登録は「git が読み返した」で
  判定する**——`master-sync.mjs` はどのモードでも終了前に登録し、`--sync` の後は原本の新しい `merge-driver.mjs --install`
  でもう一度。読み返せなければ `--check` も `--sync` も赤（同テスト ⑨ が一時 clone で全経路を走らせる）。
- 台帳の行ごとの規則は書き手が持つ（`intmap-clash-by=<script>` の `mergeClash(keys)`）。`tests/perf-baseline.json` は数
  （`requests`・`modules`）を合算し、量は main の値を取る。
- **driver が走る間、作業ツリーは merge 後の木ではない**（git 2.54・merge-ort 実測）。だから driver は記録だけして、
  merge／rebase の後に `node scripts/merge-driver.mjs --finish` が生成器を走らせる（待っているものは `worktree.mjs status`
  が言う。build・ブラウザ・ネットワークが要る生成器——`perf-budget.mjs --update` など——はコマンドを印字する）。
- **どちらが main か**は操作で逆になる（`git merge origin/main` では %B、`git rebase origin/main` では %A）。driver は
  rebase／cherry-pick の最中かと `main` 上にいるかで判定する。
- **GitHub 側の merge（DIRTY 判定・Update branch・squash）は driver を使わない。** 解くのは手元の `git rebase origin/main`
  （`.agents/skills/intmap-round/` §5）。CI は merge しないので登録は要らない。
- 宣言より前に切った branch の `git merge` では driver は呼ばれない（rebase なら効く）。script の無い checkout では
  `git merge-file` に戻り、普通の衝突マーカーを残す。
- **同じ宣言を衝突の外でも使う: `npm run regen`**（`scripts/regen.mjs`・使い方は skill §4）。`intmap-tighten=<writer>` の
  台帳は**全部の動きが締める方向（数が減る・名前やキーが消える）のときだけ**結果を残し、緩む方向は元のバイトに戻して名指す
  （`--update` は木にあるものを何でも受け入れるから）。`intmap-tighten-info=<key>` は門が読まない参考値。宣言の無い台帳
  （実測値・上へ締める床）には触れない。並列で約 25 秒（直列 2 分 13 秒）。
