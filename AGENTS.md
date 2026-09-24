# IntMap — 恒久指示 (Standing instructions)

> **このファイルは毎セッション自動で読み込まれる常設の指示書。**
> **Codex は直に読み、Claude Code は `CLAUDE.md` の `@AGENTS.md` から読む。製品固有は `docs/AGENT-SETUP.md`。**
> ユーザーは各セッションの最初のメッセージに**「今回やってほしい作業」だけ**を書く。
> 定例の前置きは貼られない——**貼られていないことは「省略された」であって「不要になった」ではない。**
> ここに書いてあるルールは、毎回明示されなくても**常に有効**。
>
> 優先順位: **`AGENTS.md`（本ファイル） ＝ `CONSTITUTION.md` ＞ `Architecture.md` ＞ `DEV-NOTES.md`（`dev-notes/` の索引）**
> 本ファイルは「どう働くか」、`CONSTITUTION.md` は「何を守るか（製品の不文律）」。**両方を読むこと。**

---

## 0. セッションの始め方

1. ユーザーの最初のメッセージ＝**そのセッション固有の作業内容**。それ以外は本ファイルが供給する。
2. **セッション名はエージェントが最初のプロンプトから自動生成する。**
   `/rename` を実行しない。ユーザーにセッション名を入力させない。
3. 作業に入る前に、§1 の事前確認を必ず済ませる。
4. **起動時の文脈が届いていないなら自分で取る**——要るコマンドと、このマシンに残って
   いる手作業は `node scripts/codex-setup.mjs` が印字する。

5. ⚠⚠⚠ **Claude Code と Codex は、今後も常に同じ環境に保つ。**
   **恒久的なもの（指示・規則・教訓・役・設定）は必ず追跡されたリポジトリへ**
   （`AGENTS.md`・`.agents/`。`.claude/` と `.codex/` は `agent-sync.mjs` の写し）。
   ⚠ **memory にだけ置かない**——リポジトリの外で、**Codex に届いていなかった実測がある**
   （hook 未 trust なら 0 件）。**片方だけが知っている状態を作らない。**
   ⚠ 違ってよいのは **`docs/AGENT-SETUP.md` に明記された差だけ**。新しい差はその場で書くか消す。

---

## 1. 着手前に必ず確認するもの

作業を開始する前に、以下をすべて確認すること。

- **メモリ**（**正本は 1 か所**で、場所は `node scripts/agent-memory.mjs --path` が出す。
  Claude Code は自動で読み、**Codex は hook が読む。届いていなければ `node scripts/agent-memory.mjs`
  を自分で走らせる**——写しを作らず同じ場所へ書く）
  ⚠ **memory は主題で名づける。番号を名前にしない**（正本 `.agents/skills/intmap-round/` §4）。
- **`.agents/rules/` の全ファイル**（⚠ Claude Code は import で自動・**Codex は自分で開く**）
- **最新の記録**（`DEV-NOTES.md` は `dev-notes/` の生成索引で、先頭が最新）
- `CONSTITUTION.md`（製品の不文律）
- **[`docs/README.md`](docs/README.md) — 文書の索引。**「どれが何の正本か・いつ更新するか」がここに
  1枚の表であるので、今回触る主題の**正本**をここで特定してから、その文書を読む
- `Architecture.md`（現状仕様）・`PRODUCT.md`（何ができるか）・`DECISIONS.md`（なぜそうなっているか）
- `README.md`、および今回の作業に関係するすべてのドキュメント・記録ファイル
- **現在の Git 状態**（ブランチ、未コミット変更、他セッションの worktree）
- **既存の PR** と **CI 状態**

Git 側の確認は 1 コマンドで済む——**手で `git status` / `worktree list` を数えない**:

```bash
node scripts/worktree.mjs status
```

これが、branch・未コミット変更・全 worktree・`origin/main` との差・最新の記録・前回までの未了を
まとめて出す。ここに出ないものだけ個別に見る。

報告されたバグについては、**実際に観測される挙動として再現したうえで**、表面的な対処ではなく
**根本原因のレベルで**修正すること。

---

## 2. プロジェクト情報

| 項目 | 値 |
|---|---|
| Production | https://rwmqx7dwb5-arch.github.io/IntMap/ |
| GitHub | https://github.com/rwmqx7dwb5-arch/IntMap （**public**・default branch `main`） |
| Local | `npm run serve` → http://127.0.0.1:4173/ （**`file://` は非対応**） |
| Admin | `admin.html` |
| Supabase project ref | `vpekfwdpurzejrrmacac` |
| **文書の索引** | **`docs/README.md`** — どれが何の正本か・対象読者・更新条件（**まずここ**） |
| **実行戦略** | **`.agents/rules/execution-strategy.md`** — 並列化・委譲・隔離・検証の段（§5.0） |
| **作業の手順** | **`.agents/skills/intmap-round/`**（Claude `/intmap-round`／Codex `$intmap-round`）・作業場は `node scripts/worktree.mjs` |
| 専用 subagent | **`.agents/roles/`**（正本）— scout（全数調査）／verifier（テストとログ）／i18n（9言語）／implementer（隔離実装）／prod-verifier（本番検証） |
| **製品別の設定** | **`docs/AGENT-SETUP.md`** — Claude Code と Codex で何が同じ・何が違う・何が手作業か |
| 現状仕様書 | `Architecture.md`（＋ `docs/FILES.md` ファイル台帳・`docs/MAP-LAYERS.md` レイヤー実装） |
| 製品 | `PRODUCT.md`（目的・機能一覧・Atlas の到達点） |
| 技術判断 | `DECISIONS.md`（今も有効な判断とその理由だけ） |
| 開発記録 | **`dev-notes/`**（**1 エントリ 1 ファイル**）。`DEV-NOTES.md` はその**生成索引**（手で編集しない） |
| 過去記録 | `DEV-NOTES-ARCHIVE.md`（読むだけ・追記しない） |
| 統治原則 | `CONSTITUTION.md` |
| 運用ドキュメント | `docs/{TESTING,RELEASE,MONITORING,INCIDENT-RESPONSE,DATABASE,MIGRATIONS,BACKUP-RESTORE,SECURITY-ARCHITECTURE}.md` |
| Stripe 寄付 (EN) | https://donate.stripe.com/5kQdR2d2m1oa1lAadk5gc01?locale=en |
| Stripe 寄付 (JA) | https://donate.stripe.com/8x29AM9Qa2se7JYetA5gc00?locale=ja |

**エージェント用 IntMap アカウント（Google）の資格情報は `CLAUDE.local.md` にある。**
このリポジトリは **public** なので、パスワード等の秘密情報を `AGENTS.md` や
その他の追跡対象ファイルに書いてはならない（`CLAUDE.local.md` は `.gitignore` 済み）。
⚠ **Claude Code は自動で読み、Codex は読まない**——要るときに自分で開く。

### 識別子とローカルプレビュー

⚠ **ラウンド番号は名前にしない**（利用者承認済み）。作業の識別子は**主題（slug）**で、
branch `feat/<slug>`・worktree `wt-<slug>`・`tests/<slug>-checks.test.mjs`・記録
`dev-notes/<日付>-<slug>.md`。PR を作ったら**PR 番号**が一意の識別子になる。
プレビューは `intmap-preview-<slug>`、ポートは 4400〜4999 の空き。
**どれも `node scripts/worktree.mjs new <slug>` が用意する——手で組み立てない。**
⚠ **dev サーバをシェルから直に起動しない。** 起動手段と、`.claude/launch.json` が
**追跡対象ではない**理由（#R338）は `docs/AGENT-SETUP.md` §4。

---

## 3. 変更の作法

1. **既存機能の削除・縮小は、確認を取ってから行う。勝手にはしない。**
   必要と判断したら**提案してよい**——何を・なぜ・代わりに何が残るか・失うものを示し、
   **承認を得てから実行する**。⚠ **承認の無い削除・縮小・無効化・簡略化は、今までどおり禁止。**
   ⚠ **確認の時期**は、今回の依頼と**不可分**なときだけその場で訊き、それ以外は**依頼を完遂してから**
   最終報告の中で提案する（正本は `CONSTITUTION.md` §0 の 3）。
   ⚠ **Atlas は別扱い**——実装は削ってよいが、**到達可能な能力と回答品質は削らない**
   （`CONSTITUTION.md` §5）。
   なお、要求された作業と**無関係な**リファクタリング・仕様変更・UI 変更・挙動変更を勝手に行っては
   ならない（2 と同じ理由）。削るべきものに気づいたときも、まず今回の作業を終えてから提案する。

2. **絶対に勝手な判断または解釈によって余計な変更を行ってはならない。**
   要求された範囲を超える変更が必要または有益であると考えた場合も、**実行する前に必ず確認**すること。

3. **偽物・表面的・暫定的・ハリボテ・プレースホルダーの実装は禁止。**
   機能は**実データおよび実際の挙動**を用いて実装し、必要な **Atlas dispatch ロジック、catalog、
   SYS 定義**その他関連する内部定義にも**同時に**組み込むこと。

4. **データソースを変更する場合**は、**出典表記・利用規約・プライバシー情報・関連する説明ページ**も
   同時に更新すること。

5. **IntMap 自身が書く文は en + jp。出典が書いたラベルは、出典が書いた全言語をそのまま運ぶ。**
   2026-09-11 の改正。**正本は `CONSTITUTION.md` §7**、機械の正本は `scripts/lang-policy.mjs`
   の 1 行（`return all;` で 9 言語へ戻る）。⚠ **既存の 7 言語を消すのは別の話**——今日は全言語
   100% で、縮小には §3-1 の承認が要る。綴りは実装のコードそのまま（`jp` / `zh`）。
   ゲートは `npm run check:i18n`（`npm test` に内包。en+jp は 100%、残り 7 言語は床）。
   ⚠⚠⚠ **9 言語体制は完全凍結（2026-09-12 追補）。言語を、それ自体を目的とした
   作業の対象にしない。**「◯◯語の被覆が低い」は**それだけでは着手の理由にならない**
   ——**穴は直さずに記録して次へ行く**。改善の対象は**実態**（地図が何を描くか・
   その形が正しいか・触れるか）であって、実態の翻訳ではない。
   ⚠ **いまは英語話者と日本語話者しか存在しないものとして扱う。残り 7 言語の被覆率を
   設計判断の入力にしない。** ⚠ 凍結は削除ではない（既存の行は 1 つも消さない）。

6. **許可なく絵文字を追加してはならない。**

7. **すべてをモダンな実装で行い、明示のない限り iOS 風の洗練されたデザインにすること。**

8. **各指示について、要求された作業を可能な限り 1 回のパスで完了する。**
   不必要に作業を分割し、同じ種類の確認・修正・テスト・deployment をユーザーに何度も要求してはならない。

10. **歴史地図は機械的検証だけで済ませてはならない。** 門が測るのは形式で、読者に差し出して
   いるのは主張である。年と場所を名指して描かれるものを列挙し、制度の成立・廃止と突き合わせ、
   上流が述べていない日付をコードが代入していないか確かめる。正本
   `.agents/rules/historical-verification.md`。計器は `npm run check:histfidelity`。

9. **場当たりのハードコーディングで逐事的に対処してはならない。** 報告された 1 件のための分岐・特例・
   埋め込み一覧を足さず、**その事例を生んだ構造**を直す。判断はデータ・上流・Atlas に訊き、コードは
   根拠のないものを拒む。正本 `.agents/rules/no-ad-hoc-hardcoding.md`。

11. **同じ操作を二度やらせてはならない。一発で決める。** 繰り返しは Atlas の判断ではなく、
   ⑴ 観測器が成功を失敗と報告した ⑵ 結果が次の手に届いていない ⑶ 操作が冪等でない、の症状である。
   ⚠ **手数の上限を下げて塞がない**（`CONSTITUTION.md` §5。上限は最後の柵であって予算ではなく、
   実測では繰り返しではなく成果物のほうが先に死んだ）。再試行は**実在した失敗のあとだけ**。
   正本 `.agents/rules/one-pass-or-a-reason.md`。計器は `npm run check:atlasrepeat`。

---

## 4. テストとデータベース

- **変更後は必ず `npm test` を実行**し、**必要な回帰テストを追加**すること。
- **データベース変更は必ず `supabase/migrations/` を通じて**行うこと。
- 環境が許す場合は **`supabase db reset`** および **`supabase test db`** も実行すること。
- 1 ターンを数時間にしない。全件テストは**完成後に 1 回**。長い待ちは並列化し、
  push 前に CI と同じ門をローカルで通す。待っている間はポーリングせず別の独立作業を進める。
- **テストの段は触った範囲で選ばれる**——固定の core に加え、**その変更が足した・変えた spec は
  PR の core で走る**（差分から。`scripts/tiers.mjs`）。

---

## 5. ワークフロー（原則として最後まで完走する）

### 5.0 実行戦略はエージェントが決める（利用者に管理させない）

ユーザーは「これを実装して」「これを直して」としか言わない。
**分解・並列化・subagent への委譲・worktree による隔離・検証の段は、毎回エージェント自身が判断する。**
worktree・subagent・agent 設定の手動管理をユーザーに要求してはならない。

- 独立した調査・分析・実装は**積極的に並列化**する（ただし**小さい仕事まで並列化しない**）
- リポジトリ探索・大量ログ解析・独立調査は **subagent へ委譲**し、メインの context を浪費しない
- 並列編集が有効なら **worktree で安全に分離**する（同じファイルを 2 体に書かせない）
- 作業中は**対象テストだけ**で高速に検証し、広い網は**適切な段階で 1 回**
- **速度のために IntMap の品質を落とさない**

⚠ **正本は [`.agents/rules/execution-strategy.md`](.agents/rules/execution-strategy.md)**
（判断基準・委譲先の agent・検証の段の表）。1 本の作業を通す**具体的な手順**は
**`.agents/skills/intmap-round/`**（Claude `/intmap-round`／Codex `$intmap-round`）。書き写さない。

### 5.1 工程 — **待たない鎖**（#R771）

⚠ **工程は1つも減っていない。やる「時刻」だけが動いた**（実測と理由は `.agents/skills/intmap-round/` §5〜§7）。

**その作業の中でやること（待ちがほぼ無い）:**

```
調査 → 再現 → 実装 → ドキュメント更新 → 触った段のゲート（execution-strategy.md §4）
     → dev-notes/ に記録を1本（node scripts/dev-notes.mjs --check）
     → commit → push → PR（auto-merge を有効化）
```

**次の作業の着手時に、前回分をまとめてやること:**

```
production verification → 原本 (OneDrive) の最新化 → USB（§11）
```

- **PR は auto-merge on green にし、CI を座って見ない。** 緑なら勝手に squash merge され branch も消える。
  **赤いときだけ戻る。** CI のゲートは3台に分かれ `fail-fast: false` なので**1回の run で落ちたゲートが
  全部出る**（`scripts/ci-gates.mjs`）。

  ```bash
  gh pr merge --squash --auto --delete-branch
  ```

- ⚠ **merge 後に main で走る CI を待たない。** PR の CI が緑なら同じ木が同じ結果を出す。
- ⚠ **後ろへ倒した工程には読み手がある。** `node scripts/worktree.mjs status` が「本番に届いて
  いない commit」「本番検証の記録が無い commit」「原本の遅れ」を PR 番号で述べる。検証を終えたら
  `node scripts/worktree.mjs verified` で受領証を残す。
  ⚠ **読み手の無い先送りは「やらなかった」と区別がつかない。** 受領証を書かずに次へ行かない。

**変更した Edge Function は本番環境へデプロイする。** 例:

```bash
supabase functions deploy ai-proxy --project-ref vpekfwdpurzejrrmacac --use-api
```

⚠ **`--use-api` を省くと無言でハングする**（Docker デーモンが止まっている）。⚠ **進んでいるかは
経過時間ではなく `supabase functions list` の `version` / `updated_at` で見る。**実測と理由、および
**Edge Functions の名簿**は [`docs/AGENT-SETUP.md`](docs/AGENT-SETUP.md) §9 が正本。書き写さない。

原本の場所は `git rev-parse --git-common-dir` から導出する。
**冪等なので他セッションと同時に走らせてよく、1回の実行がその時点の全セッション分を運ぶ**（§6）:

```bash
node scripts/master-sync.mjs --sync    # fetch して原本を origin/main へ早送り
node scripts/master-sync.mjs --check   # 原本が merge 後の状態でなければ exit 1
```

**非破壊的な migration、設定変更、deployment、commit、push、PR 作成、merge その他通常の完了工程に
ついて、追加承認を求めないこと。**

### ただし、必ず事前に確認を求める場合

- 指示または意図された挙動の**一部でも不明確**な場合
- **既存機能の削除・縮小・無効化**（§3 の 1。**提案は歓迎、実行は承認後**）
- **破壊的変更・データ損失・料金発生・契約変更・外部サービス上の重大な変更**、
  その他同様に重大な結果を伴う判断

---

## 6. 原本と、並行セッションと Git

**原本（master copy）は `C:\Users\gyuuk\OneDrive\IntMap` である。**
これはリポジトリの main worktree であり、OneDrive が同期している唯一の作業ディレクトリ。
GitHub は共有と CI のための remote、USB は §11 のバックアップであって、**どちらも原本ではない。**

**原本は「作業場」ではなく「`main` の置き場」である。**
原本は常に `main` にあり、`origin/main` と一致し、作業ツリーは clean。
**原本で branch を切って作業してはならない。**（理由と実測: `docs/AGENT-SETUP.md` §11）

- **作業は必ず、専用 branch と独立した worktree で行う。**
  worktree は OneDrive の外（`%LOCALAPPDATA%\Temp` 以下）に置く。
  そこで完結した作業は**原本に 1 バイトも書き込まない**——だから次の工程が要る。
  **手で組み立てない**——`node scripts/worktree.mjs new <slug>` が branch・OneDrive 外の worktree・
  `node_modules` の junction・preview 設定までを 1 回で行う（§2）。
  終わったら `node scripts/worktree.mjs done`（**自分のものだけ**片付ける）。
- **§5 の最終工程で原本を merge 後の状態にする。** `node scripts/master-sync.mjs --sync`。
  これを行わない限り、その作業は原本に存在しない。
- **この工程はロックを必要としない。** `--sync` は `main` を `origin/main` へ早送りするだけで、
  **branch を切り替えず、未コミットの変更を上書きしない**＝**冪等**。拒否されても失うものは無い。
- **未コミットの変更が「邪魔かどうか」を判定するのは git であって、このツールではない。**
  `--check` は「遅れている」と「汚れている」を分け、**汚れは警告として印字するが exit 0 を妨げない**
  （経緯と実測は `docs/AGENT-SETUP.md` §11）。

> ⚠ **この規則が効かない範囲がある。** 製品のハーネスがリポジトリの**中**に作る worktree には
> 効かない（実測と対処は `docs/AGENT-SETUP.md` §5）。

複数のエージェントセッションが同時に実行されている場合:

- **各セッションは必ず独立した worktree および専用 branch を使用する。**
  セッション間で同一の working directory を共有してはならない。同一 branch も共有してはならない。
- **テストの dev サーバもセッションごとに分かれる**（`tests/helpers/session-seed.js`。
  原本と CI は 4173・各 worktree は 4174〜4373。共有していた頃の実測は `docs/AGENT-SETUP.md` §11）。
- **別セッションの未コミット変更・branch・worktree・stash その他の作業状態を、
  変更・削除・reset・clean・force-push・上書きしてはならない。**
- 編集前・push 前・merge 前には**最新の Git 状態を確認**し、必要に応じて `main` の最新更新を取り込む。
- 変更範囲が別セッションの作業と重なる場合、**そのセッションの作業を勝手に上書きしない。**
- 各セッションは、割り当てられたタスクについて PR 作成 → CI 確認・修正 → squash merge →
  production deployment → production verification → branch deletion まで**完了させる**。
- **競合その他の問題を安全かつ明確に解決できない場合は、必ず確認を求める。**
  問題解決後はワークフローを再開し、可能な限り完了まで実行する。

> 実務上の注意: 原本（`C:\Users\gyuuk\OneDrive\IntMap`）が他セッションの作業中である場合がある。
> 着手時に `git status` と `git worktree list` を必ず見ること。

---

## 7. ユーザーに依頼してよいこと（ごく限定）

ユーザーが行うべき作業は、**2FA の完了・CAPTCHA の解決・秘密情報の本人入力**その他、
**エージェントにとって物理的または技術的に不可能なもの**に限る。

CLI、API、SQL、Git、GitHub、Supabase、既存の認証済み環境その他利用可能な手段を通じて
**エージェント自身が完了できる作業を、ユーザーに依頼してはならない。**

一見不可能に見える場合でも、まず利用可能な代替手段を徹底的に確認し、エージェント自身で可能な手段を
尽くすこと。それでも人間による操作が必要な場合に限り、**必要な操作を可能な限り 1 回の依頼にまとめて**
提示する。

---

## 8. 不明点の扱い（推測禁止）

指示の一部、意図する挙動、仕様、変更範囲、優先順位その他判断に必要な事項が**少しでも不明確な場合**、
**推測・Guess・独自解釈によって補完してはならない。必ず確認すること。**

- 確認事項が複数ある場合は、**質問数を制限せず**、必要な事項を徹底的に質問する。
- 確認を省略するために「**一般的には**」「**おそらく**」「**最も自然なのは**」等の判断を用いてはならない。
- **質問は必ず質問用の機能で行う**（製品ごとの手段は `docs/AGENT-SETUP.md` §2）。
  通常の説明文・進捗報告・最終報告等の文章中に質問を混在させてはならない。

---

## 9. ドキュメントの更新

- Markdown 系の記録、メモリ／記憶用途のファイル、`Architecture.md`、開発記録、`README.md`、
  出典ページ、ロジック解説ページその他**プロジェクトの状態を記録または説明する文書**については、
  **実装の現状を正確に反映するよう常に更新し、古い情報を放置しない。**
- **複数の文書に書いてある同じ事実**（配信方法・Edge Function の一覧・対応言語・
  USB バックアップの頻度など）は **`npm run check:docs`（`npm test` に内包）が実体と照合する**。
  事実を書き写して二重にしないこと——**正本を 1 つに決め、他はそこへリンクする**。
  ⚠ `Architecture.md` は**現状仕様書**であって変更履歴ではない。**ラウンド番号・PR 番号を書かない**
  （経緯は開発記録の仕事。同じ検査がこれを見ている）。
- **作業完了時**には、現在の状態を反映するよう `Architecture.md` および関連ドキュメントを更新し、
  **`dev-notes/<YYYY-MM-DD>-<slug>.md` を 1 本足す**（一覧は `node scripts/dev-notes.mjs --list`。
  `DEV-NOTES.md` は固定の案内で触らない。書式は `.agents/skills/intmap-round/` §3）。
- **文書を1本足したら、同じコミットで [`docs/README.md`](docs/README.md) に1行足す**
  （その行が無ければ `npm run check:docs` が落ちる）。役割が既存の文書と重なるなら、
  **新しい文書を作らずそちらへ足す**——1つの事実に正本が2つある状態を作らない。
- ファイルの分担の全体像は [`docs/README.md`](docs/README.md) と `CONSTITUTION.md` §6:
  `PRODUCT.md`＝何のためにあり何ができるか / `DECISIONS.md`＝なぜそうなっているか /
  `Architecture.md`＝今どうなっているか（主題順） /
  `dev-notes/`＝記録（1 エントリ 1 ファイル。`DEV-NOTES.md` が新しい順の索引） /
  `DEV-NOTES-ARCHIVE.md`＝それ以前（古い順・追記しない）。

---

## 10. コミュニケーションと最終報告

**作業中の報告・質問・完了報告その他のコミュニケーションは、原則として日本語で行う。**

最終報告は日本語で記述し、少なくとも以下を簡潔に記載する。

- 実施した変更
- 実施したテストおよび結果
- CI 状態
- commit / PR / merge 状態
- production deployment の状態
- production verification の結果
- 残っている問題

**作業が正常に完了した場合は、ユーザーによる追加作業が不要であることも明示する。**

**最終報告の末尾には、§11.4 のバックアップ状態を必ず記載する。**

---

## 11. 作業終了処理（Git → USB バックアップ）

ユーザーから依頼された作業が**すべて完了した後**、必ず以下の終了処理を行う。

### 11.1 Git

実装・修正・テスト・必要なドキュメント更新をすべて完了させ（§5 のワークフロー）、
**今回の変更を commit し、GitHub へ push する。**

- **変更が存在しない場合は、不要な commit を作成しない。**
- **GitHub 側が今回の作業を含む最新状態になっていることを確認してから**次へ進む。

### 11.2 USB バックアップ — **作業のたびに毎回**

USB は**依頼された作業が完了するたびに毎回**行う（**1 日 1 回の制限は無い**）。⚠ **行う時刻は
§5.1 が定める——前回分を次の作業の着手時にまとめて行い、その作業の中では待たない。**

**手順は実装されている。読んで真似せず、これを実行する:**

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup-usb.ps1
```

⚠ **`pwsh` ではない**（このマシンに PowerShell 7 は無い。実測は `docs/AGENT-SETUP.md` §10）。

最後の1行が `RESULT <status> <detail>` で、`ok` / `skipped` / `failed` のいずれかを返す。
`skipped` は**エラーではない**（USB 未接続、または候補が複数あって一意に特定できない）。

⚠ **ミラー元は原本であって、この worktree ではない。** 先に原本を最新化し、
`node scripts/master-sync.mjs --check` が exit 0 を返してから走らせること
（原本が merge 後の状態でなければ、スクリプト自身が同期せず `skipped` で終わる）。

### 11.3 スクリプトが守っていること

**正本は [`docs/AGENT-SETUP.md`](docs/AGENT-SETUP.md) §10。** ミラー元・同期方向・何が入って何が
入らないか・ドライブの選び方・検証と再試行・台帳——`scripts/backup-usb.ps1` を書き換えるときに
壊してはならない不変条件がそこにある。**書き写さない。**

### 11.4 終了報告

すべての終了処理後、**最終報告（§10）の末尾**にバックアップ状態を簡潔に明示する。

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

---

## 12. 本ファイル自体の保守

⚠ **本ファイルには 32,768 バイトの天井があり、超えた分は無言で落ちる**
（`docs/AGENT-SETUP.md` §1。`npm run check:agents` が余白ごと測る）。**足す前に正本を疑う**。

本規程の前提となる**プロジェクト構成・開発環境・Git 運用・CI/CD・言語構成・Supabase 構成・
deployment 方法**その他の事項に変更が生じ、**本ファイル自体を変更すべき状態になった場合は、
その事実を放置してはならない。**

その場合は、

1. **何が変更されたのか**
2. **本ファイルのどこを変更すべきなのか**

を具体的に説明したうえで、**`AGENTS.md` 全体をそのままコピー＆ペーストで完全置換できる形の最新版**
として提示すること。**部分的な差分のみを提示したり、「この箇所だけ置換してください」等の形式に
してはならない。**

（本ファイルはリポジトリで追跡されているため、通常はエージェント自身が編集し、通常の変更と同じ
ワークフロー——PR → CI → merge——に載せてよい。ユーザーに手作業を求めないこと。）
