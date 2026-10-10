# IntMap — 恒久指示 (Standing instructions)

> 毎セッション自動で読まれる常設の指示書（Codex は直に、Claude Code は `CLAUDE.md` の `@AGENTS.md` から。
> 製品固有は `docs/AGENT-SETUP.md`）。ユーザーは最初のメッセージに「今回やってほしい作業」だけを書く——
> **貼られていない定例の前置きは「省略された」であって「不要になった」ではない。**
> 優先順位: **`AGENTS.md` ＝ `CONSTITUTION.md` ＞ `Architecture.md` ＞ `DEV-NOTES.md`（`dev-notes/` の索引）**。
> 本ファイルは「どう働くか」、`CONSTITUTION.md` は「何を守るか」。**両方を読むこと。**

## 0. セッションの始め方

1. ユーザーの最初のメッセージ＝**そのセッション固有の作業内容**。それ以外は本ファイルが供給する。
2. **セッション名はエージェントが最初のプロンプトから自動生成する。**
   `/rename` を実行しない。ユーザーにセッション名を入力させない。
3. 作業に入る前に、§1 の事前確認を必ず済ませる。
4. **起動時の文脈が届いていないなら自分で取る**（要るコマンドと、このマシンに残っている手作業は
   `node scripts/codex-setup.mjs` が印字する）。
5. **Claude Code と Codex は常に同じ環境に保つ。** 恒久的なもの（指示・規則・教訓・役・設定）は追跡された
   リポジトリへ（`AGENTS.md`・`.agents/`。`.claude/` と `.codex/` は `agent-sync.mjs` の写し）。memory にだけ
   置かない。違ってよいのは **`docs/AGENT-SETUP.md` に明記された差だけ**で、新しい差はその場で書くか消す。

## 1. 着手前に必ず確認するもの

- **メモリ**（正本は 1 か所・場所は `node scripts/agent-memory.mjs --path`。Claude Code は自動で読み、Codex は
  hook が読む。**届いていなければ `node scripts/agent-memory.mjs` を自分で走らせる**。写しを作らず同じ場所へ
  書く。主題で名づけ、番号を名前にしない——`.agents/skills/intmap-round/` §4）
- **`.agents/rules/` の全ファイル**（Claude Code は import で自動・**Codex は自分で開く**）、`CONSTITUTION.md`、
  **最新の記録**（`node scripts/dev-notes.mjs --latest`）
- **[`docs/README.md`](docs/README.md)**（文書の索引）で今回の主題の**正本**を特定し、その文書を読む。
  `Architecture.md`・`PRODUCT.md`・`DECISIONS.md` は通読せず、案内図の表で章（`docs/architecture/`）を選び
  `grep -n '^## \|^### '` で主題の節を読む——読んだ節を最終報告に書く。`README.md` と関係する記録も。
- **Git 状態**（branch・未コミット変更・他セッションの worktree）、**既存の PR** と **CI 状態**。
  手で数えず `node scripts/worktree.mjs status`（`origin/main` との差・最新の記録・前回までの未了も出す）。

報告されたバグは、**実際に観測される挙動として再現したうえで**、**根本原因のレベルで**修正する。

## 2. プロジェクト情報

| 項目 | 値 |
|---|---|
| Production | [本番サイト][site:]（正本 `supabase/functions/_shared/site-origin.js`・`node scripts/site-url.mjs`） |
| GitHub | https://github.com/rwmqx7dwb5-arch/IntMap （**public**・default branch `main`） |
| Local | `npm run serve` → http://127.0.0.1:4173/ （**`file://` は非対応**）・Admin は `admin.html` |
| Supabase project ref | `vpekfwdpurzejrrmacac` |
| **文書の索引** | **`docs/README.md`**（どれが何の正本か・更新条件。**まずここ**） |
| 実行戦略／手順 | `.agents/rules/execution-strategy.md`／`.agents/skills/intmap-round/`（Claude `/intmap-round`・Codex `$intmap-round`）・作業場は `node scripts/worktree.mjs` |
| 専用 subagent | `.agents/roles/`（正本）— scout（全数調査）／verifier（テストとログ）／i18n（9言語）／implementer（隔離実装）／prod-verifier（本番検証） |
| 製品別の設定 | `docs/AGENT-SETUP.md`（Claude Code と Codex の同じ・違う・手作業） |
| 仕様・製品・判断 | `Architecture.md`（案内図 → `docs/architecture/`・`docs/FILES.md`・`docs/MAP-LAYERS.md`）／`PRODUCT.md`／`DECISIONS.md`／統治原則 `CONSTITUTION.md` |
| 開発記録 | `dev-notes/`（1 エントリ 1 ファイル）。`DEV-NOTES.md` は固定の案内、`DEV-NOTES-ARCHIVE.md` は過去分（追記しない） |
| 運用 | `docs/{TESTING,RELEASE,MONITORING,INCIDENT-RESPONSE,DATABASE,MIGRATIONS,BACKUP-RESTORE,SECURITY-ARCHITECTURE}.md` |
| Stripe 寄付 | EN https://donate.stripe.com/5kQdR2d2m1oa1lAadk5gc01?locale=en ・ JA https://donate.stripe.com/8x29AM9Qa2se7JYetA5gc00?locale=ja |

[site:]: https://rwmqx7dwb5-arch.github.io/IntMap/

エージェント用 IntMap アカウント（Google）の資格情報は `CLAUDE.local.md`（`.gitignore` 済み。Claude Code は
自動で読み、Codex は要るときに開く）。リポジトリは **public**——秘密情報を追跡対象のファイルに書かない。

### 識別子とローカルプレビュー

**ラウンド番号は名前にしない**（利用者承認済み）。識別子は**主題（slug）**: branch `feat/<slug>`・worktree
`wt-<slug>`・`tests/<slug>-checks.test.mjs`・記録 `dev-notes/<日付>-<slug>.md`。PR を作ったら **PR 番号**が
一意の識別子。プレビューは `intmap-preview-<slug>`、ポートは 4400〜4999 の空き。どれも
`node scripts/worktree.mjs new <slug>` が用意する（手で組み立てない）。dev サーバをシェルから直に起動しない
（起動手段と、`.claude/launch.json` が**追跡対象ではない**理由は `docs/AGENT-SETUP.md` §4）。

## 3. 変更の作法

1. **能力と品質は下げない。形式上の削除は自分の判断で行う**（2026-10-10 改正）。守る対象は利用者が得るもの
   （能力・正確さ・速さ・到達経路）で、それを運ぶコード・規則・文書・検査・入口の数ではない。死んだコード・
   二重実装・重複した入口・二重の正本は消してよく、消すべき。物差しは「消したあと、何が同じだけ働いているか」
   ——言えないなら本質的な削除で、行わない。正本 [`.agents/rules/substance-over-form.md`](.agents/rules/substance-over-form.md)・
   `CONSTITUTION.md` §0 の 3。**Atlas も同じ**——実装は削ってよいが、到達可能な能力と回答品質は削らない
   （`CONSTITUTION.md` §5）。要求と**無関係な**仕様・UI・挙動の変更は勝手に行わない（2 と同じ理由）。
2. **絶対に勝手な判断または解釈によって余計な変更を行ってはならない。**
   要求された範囲を超える変更が必要または有益と考えた場合も、**実行する前に必ず確認**する。
3. **偽物・表面的・暫定的・ハリボテ・プレースホルダーの実装は禁止。** 実データと実際の挙動で実装し、
   **Atlas dispatch ロジック、catalog、SYS 定義**その他関連する内部定義にも**同時に**組み込む。
4. **データソースを変更する場合**は、**出典表記・利用規約・プライバシー情報・関連する説明ページ**も同時に更新する。
5. **IntMap 自身が書く文は en + jp、出典が書いたラベルは出典の全言語をそのまま運ぶ。** 正本は `CONSTITUTION.md` §7、
   機械の正本は `scripts/lang-policy.mjs`（`return all;` の 1 行で全言語へ戻る）。綴りは実装のまま（`jp` / `zh`）。
   ゲート `npm run check:i18n`（en+jp は 100%、残り 7 言語は床）。**9 言語体制は完全凍結**——言語をそれ自体を目的と
   した作業の対象にしない（被覆の穴は直さずに記録して次へ。改善するのは実態であって実態の翻訳ではない）。いまは英語
   話者と日本語話者しか存在しないものとして扱う。凍結は削除ではない（既存の行は 1 つも消さない）。
6. **許可なく絵文字を追加してはならない。**
7. **すべてをモダンな実装で行い、明示のない限り iOS 風の洗練されたデザインにすること。**
8. **各指示について、要求された作業を可能な限り 1 回のパスで完了する。** 不必要に分割し、同じ種類の
   確認・修正・テスト・deployment をユーザーに何度も要求してはならない。
9. **場当たりのハードコーディングで逐事的に対処してはならない。** 1 件のための分岐・特例・埋め込み一覧を足さず、
   その事例を生んだ構造を直す。正本 `.agents/rules/no-ad-hoc-hardcoding.md`。
10. **歴史地図は機械的検証だけで済ませてはならない。** 門が測るのは形式、読者に差し出すのは主張。正本
    `.agents/rules/historical-verification.md`・計器 `npm run check:histfidelity`。
11. **同じ操作を二度やらせてはならない。一発で決める。** 繰り返しは ⑴ 観測器の誤報 ⑵ 結果が次の手に届かない
    ⑶ 操作が冪等でない、の症状。手数の上限を下げて塞がない（`CONSTITUTION.md` §5）。再試行は実在した失敗のあとだけ。
    正本 `.agents/rules/one-pass-or-a-reason.md`・計器 `npm run check:atlasrepeat`。

## 4. テストとデータベース

- **変更後は触った範囲の検査を通し**（`execution-strategy.md` §4 の段 0〜2）、**必要な回帰テストを追加**する。
- **データベース変更は必ず `supabase/migrations/` を通じて**行う。環境が許せば **`supabase db reset`** と
  **`supabase test db`** も実行する。
- 1 ターンを数時間にしない。**全件（`npm test` 相当）は PR の CI が 1 回走らせ、ローカルでは回さない**
  （3 台で全部走り、緑でなければ merge されない）。赤なら**落ちた門だけを単独で**再現して直す。待つ間は
  ポーリングせず別の独立作業を進める。変更が足した・変えた spec は PR の core で走る（`scripts/tiers.mjs`）。

## 5. ワークフロー（原則として最後まで完走する）

### 5.0 実行戦略はエージェントが決める（利用者に管理させない）

**分解・並列化・subagent への委譲・worktree による隔離・検証の段は、毎回エージェント自身が判断し**、
その手動管理をユーザーに要求しない。**速度のために IntMap の品質を落とさない。** 正本
[`.agents/rules/execution-strategy.md`](.agents/rules/execution-strategy.md)、手順は `.agents/skills/intmap-round/`。

### 5.1 工程 — **待たない鎖**

工程は減っていない。やる「時刻」だけが動いた（理由は `.agents/skills/intmap-round/` §5〜§7）。

```
その作業の中で: 調査 → 再現 → 実装 → ドキュメント更新 → 触った段のゲート（execution-strategy.md §4）
     → dev-notes/ に記録を1本（node scripts/dev-notes.mjs --check） → commit → push → PR（auto-merge）
次の作業の着手時に前回分を: production verification → 原本 (OneDrive) の最新化 → USB（§11）
```

- **PR は auto-merge on green にし、CI を座って見ない**（緑なら squash merge され branch も消える＝branch
  deletion まで。**赤いときだけ戻る**。ゲートは `fail-fast: false` で落ちたものが全部出る・`scripts/ci-gates.mjs`）:
  `gh pr merge --squash --auto --delete-branch`
- **merge 後に main で走る CI を待たない。** 本番公開はその run が緑のときに同じ run が行う（赤なら公開しない）。
- 後ろへ倒した工程は `node scripts/worktree.mjs status` が PR 番号で述べる（本番未到達・本番検証の記録なし・
  原本の遅れ）。検証を終えたら `node scripts/worktree.mjs verified` で受領証を残す——**書かずに次へ行かない**。

**変更した Edge Function は本番へ出す。** 通常は merge 後に CI が出す。手での deploy（CI が赤いときなど）:

```bash
supabase functions deploy ai-proxy --project-ref vpekfwdpurzejrrmacac --use-api
```

`--use-api` を省くと無言でハングする。進捗は経過時間でなく `supabase functions list` の `version` /
`updated_at` で見る。CI の配備・実測・**Edge Functions の名簿**は [`docs/AGENT-SETUP.md`](docs/AGENT-SETUP.md) §9 が正本。

原本は `git rev-parse --git-common-dir` から導出する。**冪等なので他セッションと同時に走らせてよく、1回の
実行がその時点の全セッション分を運ぶ**（§6）:

```bash
node scripts/master-sync.mjs --sync    # fetch して原本を origin/main へ早送り
node scripts/master-sync.mjs --check   # 原本が merge 後の状態でなければ exit 1
```

**非破壊的な migration、設定変更、deployment、commit、push、PR 作成、merge その他通常の完了工程に
ついて、追加承認を求めないこと。**

### ただし、必ず事前に確認を求める場合

- 指示または意図された挙動の**一部でも不明確**な場合
- **能力か品質が下がる変更**（§3 の 1。形式上の削除は含まない）
- **破壊的変更・データ損失・料金発生・契約変更・外部サービス上の重大な変更**その他重大な結果を伴う判断

## 6. 原本と、並行セッションと Git

**原本（master copy）は `C:\Users\gyuuk\OneDrive\IntMap`**——main worktree で、OneDrive が同期する唯一の
作業ディレクトリ。GitHub（共有と CI）も USB（§11）も原本ではない。原本は**「`main` の置き場」**で、常に `main`・
`origin/main` と一致・clean。**原本で branch を切って作業してはならない**（理由と実測: `docs/AGENT-SETUP.md` §11）。

- **作業は必ず専用 branch と独立した worktree で行う**（OneDrive の外 `%LOCALAPPDATA%\Temp` 以下。原本に
  1 バイトも書かない）。`node scripts/worktree.mjs new <slug>` が branch・worktree・`node_modules` の junction・
  preview 設定を 1 回で用意し、`node scripts/worktree.mjs done` が**自分のものだけ**片付ける。
- **§5 の最終工程で原本を merge 後の状態にする**（`master-sync.mjs --sync`）。しない限り作業は原本に存在しない。
  ロックは要らない: `--sync` は早送りだけで branch を切り替えず未コミットの変更を上書きしない＝**冪等**。
  邪魔かどうかは git が判定し、`--check` は「遅れ」と「汚れ」を分けて汚れは警告だけにする。
- ハーネスがリポジトリの**中**に作る worktree にはこの規則が効かない（`docs/AGENT-SETUP.md` §5）。

複数のセッションが同時に実行されている場合:

- **各セッションは必ず独立した worktree および専用 branch を使用する。** 同一の working directory を共有してはならない。
  同一 branch も共有してはならない。テストの dev サーバも分かれる（`tests/helpers/session-seed.js`）。
- **別セッションの未コミット変更・branch・worktree・stash その他の作業状態を、変更・削除・reset・clean・
  force-push・上書きしてはならない。** 重なる場合も勝手に上書きしない。
- 編集前・push 前・merge 前に**最新の Git 状態を確認**し、必要なら `main` の最新を取り込む。
- 各セッションは PR 作成 → CI 確認・修正 → squash merge → production deployment → production verification →
  branch deletion まで**完了させる**。安全かつ明確に解決できない競合は**必ず確認を求め**、解決後に再開する。

## 7. ユーザーに依頼してよいこと（ごく限定）

**2FA の完了・CAPTCHA の解決・秘密情報の本人入力**その他、**エージェントにとって物理的または技術的に不可能な
もの**だけ。CLI・API・SQL・Git・GitHub・Supabase・認証済み環境で**自分で完了できる作業を依頼してはならない。**
代替手段を尽くし、それでも要るときだけ**可能な限り 1 回の依頼にまとめて**提示する。

## 8. 不明点の扱い（推測禁止）

判断に必要な事項（指示・意図・仕様・範囲・優先順位）が**少しでも不明確な場合**、**推測・Guess・独自解釈に
よって補完してはならない。必ず確認する。** 質問数は制限しない。確認を省くために「**一般的には**」「**おそらく**」
「**最も自然なのは**」等の判断を用いない。**質問は必ず質問用の機能で行う**（手段は `docs/AGENT-SETUP.md` §2）。
説明文・進捗報告・最終報告の文章中に混ぜない。

## 9. ドキュメントの更新

- **プロジェクトの状態を記録または説明する文書**（記録・メモリ・`Architecture.md`・`README.md`・出典ページ・
  解説ページ）は**実装の現状を正確に反映し、古い情報を放置しない。**
- 複数の文書にある同じ事実は `npm run check:docs` が実体と照合する。**正本を 1 つに決め、他はリンクする。**
  現状仕様書は変更履歴ではない——**ラウンド番号・PR 番号を書かない**。
- **現状仕様（挙動・構成・データ）が変わったなら**該当章と関連文書を更新する（仕様に戻すだけの修正・内部の整理・
  テストの追加では触らない）。毎回 **`dev-notes/<YYYY-MM-DD>-<slug>.md` を 1 本足す**（詳しさは変更の大きさに
  比例。一覧は `node scripts/dev-notes.mjs --list`。`DEV-NOTES.md` は固定の案内で触らない。書式は
  `.agents/skills/intmap-round/` §3）。
- **文書を1本足したら同じコミットで [`docs/README.md`](docs/README.md) に1行足す**（無いと `check:docs` が落ちる）。
  役割が重なるなら既存の文書へ足す。分担の全体像は `docs/README.md` と `CONSTITUTION.md` §6。

## 10. コミュニケーションと最終報告

**報告・質問・完了報告は、原則として日本語で行う。** 最終報告には少なくとも: 実施した変更／テストと結果／
CI 状態／commit・PR・merge 状態／production deployment の状態／production verification の結果／残っている問題。
**正常に完了したなら、ユーザーによる追加作業が不要であることも明示する。** 末尾に §11.4 のバックアップ状態を書く。

## 11. 作業終了処理（Git → USB バックアップ）

依頼された作業が**すべて完了した後**、必ず以下を行う。

### 11.1 Git

実装・テスト・ドキュメント更新を完了させ（§5）、**今回の変更を commit し、GitHub へ push する。**
**変更が存在しない場合は、不要な commit を作成しない。** **GitHub 側が今回の作業を含む最新状態になっていることを確認してから**
次へ進む。

### 11.2 USB バックアップ — **作業のたびに毎回**

USB は**依頼された作業が完了するたびに毎回**行う（**1 日 1 回の制限は無い**）。時刻は §5.1 のとおり、前回分を
次の作業の着手時に行う。**手順は実装されている——読んで真似せず、これを実行する:**

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup-usb.ps1
```

**`pwsh` ではない**（このマシンに PowerShell 7 は無い）。最後の1行は `RESULT <status> <detail>`
（`ok` / `skipped` / `failed`）。`skipped` は**エラーではない**（USB 未接続、または候補が一意に決まらない）。
**ミラー元は原本であって worktree ではない**——先に原本を最新化し、`node scripts/master-sync.mjs --check` が
exit 0 を返してから走らせる（そうでなければスクリプトは同期せず `skipped` で終わる）。

### 11.3 スクリプトが守っていること

**正本は [`docs/AGENT-SETUP.md`](docs/AGENT-SETUP.md) §10**（`scripts/backup-usb.ps1` を書き換えるときに壊しては
ならない不変条件）。**書き写さない。**

### 11.4 終了報告

すべての終了処理後、**最終報告（§10）の末尾**にバックアップ状態を明示する。

```
GitHub: push済み / 最新
USB: 2026-08-19 14:20 同期済み
USB検証: 差分ゼロ
```

USB が接続されていなければ:

```
GitHub: push済み / 最新
USB: 未接続のためスキップ
```

**USB 同期が最終的に失敗した場合は、その事実を隠さず明示する。**

## 12. 本ファイル自体の保守

**本ファイルには 32,768 バイトの天井があり、超えた分は無言で落ちる**（`docs/AGENT-SETUP.md` §1。
`npm run check:agents` が余白ごと測る）。**足す前に正本を疑う。**

前提（構成・開発環境・Git 運用・CI/CD・言語構成・Supabase 構成・deployment 方法）が変わり本ファイルを変えるべき
状態を放置しない。何が変わり、どこを変えるべきかを説明し、**`AGENTS.md` 全体を完全置換できる最新版**を示す
（部分差分だけにしない）。通常はエージェント自身が編集し、PR → CI → merge に載せる（ユーザーに手作業を求めない）。
