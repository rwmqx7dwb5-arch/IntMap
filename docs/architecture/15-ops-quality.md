# IntMap — 現状仕様書 §15 運用品質基盤 (CI・テスト・リリース・監視)

> **現状仕様書の §15。** 案内図は [`Architecture.md`](../../Architecture.md)（§ → ファイルの表）。**節番号は案内図と共有している**
> ——他の文書・コード・テストが書く「`Architecture.md` §15.x」は、このファイル（と案内図の表が同じ行に挙げる文書）の見出しを指す。
> 今どうなっているかだけを書く。変更履歴・ラウンド番号・PR 番号は書かない（`npm run check:docs` の `arch-rounds` がこのファイルも読む）。

## 15. 運用品質基盤 (CI・テスト・リリース・監視)

アプリ本体とは分離した**開発／CI 用ツール**。ブラウザには一切ロードされない（`package.json` の devDependencies はアプリに同梱されない）。

### 15.1 正本の在り処

| 主題 | 正本 |
|---|---|
| 何をどう試験するか・層・tier・テスト予算・`check:*` ゲートの一覧 | [`docs/TESTING.md`](../TESTING.md) |
| リリース手順・ロールバック・着地確認 | [`docs/RELEASE.md`](../RELEASE.md) |
| 稼働監視・アラート（上流ホストの夜間の死活を含む） | [`docs/MONITORING.md`](../MONITORING.md) |
| 同梱データの出自・権利・鮮度と自動更新の名簿 | [`docs/DATA-GOVERNANCE.md`](../DATA-GOVERNANCE.md) |
| 障害対応（サイト・DB・鍵） | [`docs/INCIDENT-RESPONSE.md`](../INCIDENT-RESPONSE.md) |
| CI／検査スクリプトのファイル一覧 | [`docs/FILES.md`](../FILES.md) §3.12 |
| **作業終了処理**（commit / push → 原本の最新化 → USB への完全ミラーと検証） | [`AGENTS.md`](../../AGENTS.md) §11 ＋ `scripts/master-sync.mjs` ＋ `scripts/backup-usb.ps1` |
| **git の外にあるデータ**（目録・取得・検証・公開・CI のキャッシュ） | `data-assets.json` ＋ `scripts/data-assets.mjs` ＋ [`docs/TESTING.md`](../TESTING.md)「git の外にあるデータ」 |

### 15.2 実行

```bash
npm ci && npx playwright install --with-deps chromium   # 初回
npm test           # = 宣言済みの全ゲート（check:*）+ node 回帰 + hermetic ブラウザ（CI と同じ門）
npm run serve      # http://127.0.0.1:4173/（Pagesと同じ配信）
```

- 全件テストは完成後に1回にする。
- **ゲートの母集合は1か所で発見する**（`scripts/gate-universe.mjs` が `package.json` の `check:*` を数え、CI の `scripts/ci-gates.mjs` と `npm test` の `scripts/test-parallel.mjs` が同じ関数を
  使う。`npm test` が走らせないゲートは `CI_ONLY` に理由の文つきで置き毎回印字する——現在は空）。
- **node の回帰テストは実測秒で割る**（CI の `Regression i/n` は `scripts/checks-shards.mjs` が `.github/checks-cost.json` で詰めた束。台帳に無いファイルは中央値で見積もる）。
- 詳細は [`docs/TESTING.md`](../TESTING.md)。

### 15.3 診断のためにアプリが持っているもの

- `INTMAP_BUILD` ＝ 現行ビルド識別子（診断と Bug Report に露出する）。`index.html` にビルド印は2つある（`window.__imBuild` と `window.INTMAP_BUILD`。§1.1 のとおりビルドが書く）。
  `tests/engine-app-shell-split-checks.test.mjs` と `tests/shell-panels-tools-checks.test.mjs` がそれを検査する。
- **エラーの記録**は自前（外部アカウント不要）。`js/client-error-report.js` が `error` / `unhandledrejection` を拾い、洗ってから Edge Function `client-errors` へ送り、`client_errors` 表に欠陥
  ごとに回数を足す（同じ fingerprint は 1 ページ読み込みにつき 1 回・最大 10 件・本番のオリジンからだけ）。読むのは `admin.html` の **Errors** タブ（§6.2・`docs/MONITORING.md` §2）。
  利用者ごとの無効化の設定は無い（`INTMAP_ANALYTICS` はサイト全体の第三者アナリティクスのスイッチ）。送るものに利用者を識別するものは無い（プライバシーポリシー §1）。
  `window.__imErrors`（error / rejection のリングバッファ）が常に動き、Bug Report が添付する。
- **STAGING リボン**（`*.pages.dev` / `?staging=1` / meta フラグのときだけ表示）。

### 15.4 リリース（現行）

**本番は CI ゲート付きの GitHub Actions ワークフローで公開される**（手順の正本は [`docs/RELEASE.md`](../RELEASE.md)）。Pages の Source は **GitHub Actions**、リポジトリ変数
**`ENABLE_PAGES_DEPLOY = true`** が設定済みで、`main` への push ごとに走る `main` 自身の CI（`.github/workflows/ci.yml`）の最後で公開する。

- `build` ジョブが 1 run に 1 回だけ Vite でビルドし、`dist/` と `.perf/build-report.json` を artifact としてゲートの shard（`check:perf`・`check:assets`）とブラウザ試験の各機に渡す
  （`IM_PREBUILT_DIST=1`）。`main` への push では同じ `dist/` から Pages の artifact も組み、`build`・「Static checks」・「Regression suite」・「Browser smoke + internal QA」がすべて success の
  ときだけ `pages` ジョブが公開し、`post-smoke` が実 URL を検査する。nightly と手動実行の run は公開しない。`.github/workflows/deploy.yml` は手動の再公開ボタン（自前でビルドする）。bot の PR
  （衛星カタログ `tle-refresh.yml`・起動予算の天井 `perf-ceiling.yml`）は `.github/actions/land-bot-pr` が merge し、`GITHUB_TOKEN` の push は CI を起こさないので同じ手が `deploy.yml` を起動する。
- 着地の確認は `curl -s "$(node scripts/site-url.mjs)build-info.json"` の `sha` が `git rev-parse origin/main` と一致すること。本番のアドレスは `supabase/functions/_shared/site-origin.js` の
  1 か所だけが持ち（`CUSTOM_DOMAIN` が空なら Pages のアドレス）、他の場所に書くと `check:static` の `site-address` が赤。独自ドメインへの移り方は `docs/RELEASE.md`「Moving the site to its own
  domain」。ロールバックは `.github/workflows/rollback.yml`（履歴に実在する ref のみ・対象 ref を Vite ビルドして `dist` を配信）。ビルドする前にそのコミット自身の `data-assets.json` が名指す
  データ集合を取得する（`.github/actions/data-assets`。目録を持たない古いコミットは取得しない）。データ集合の Release は消さない。
- **配信先は AWS（S3 + CloudFront）へ移行中**（決定は `DECISIONS.md`「配信とビルド」、手順は `docs/RELEASE.md`「AWS（S3 + CloudFront）での配信」）。`ci.yml` の `aws` ジョブは `pages` と同じ
  門を待ち、同じ `dist/` を `scripts/aws-publish.mjs` で S3 に置いて CloudFront を無効化する（応答ヘッダは Pages の実測値に合わせる）。`AWS_PUBLISH_ROLE_ARN` が無い間はスキップし本番は Pages の
  まま。構成は `infra/aws/`（CloudFormation）。
- 公開する 3 か所（`ci.yml` の `pages`・`deploy.yml`・`rollback.yml`）は `concurrency: pages-production` で直列に走り、`main` への新しい push は古い CI の run を公開ごと取り消す。
- **配備単位は 3 つあり、互いに独立している**——静的サイト（Pages）・Edge Functions（Supabase）・DB（migration）。`node scripts/release-state.mjs`（`npm run release:state` / `release:check`）が
  3 面をまとめて測り、判定は時刻ではなく配備されたソースを取り寄せた中身（`supabase functions download`）で出す。PR のゲートではない。読み手は nightly の
  `.github/workflows/supabase-deploy.yml` の drift job（`--edge --db --check` の食い違い〔exit 1〕も測れなかったこと〔exit 2〕も赤にし、Issue を 1 本開く）。
- **Edge Functions と migration は `.github/workflows/supabase-deploy.yml` が出す。** `main` への push で `supabase/functions/**`・`supabase/migrations/**`・`supabase/config.toml` が変わったとき、
  `scripts/supabase-deploy.mjs` が最後に成功した配備から変わった関数（本番に無い宣言済みの関数を含む。起点は docs/RELEASE.md）を `supabase functions deploy <name> --use-api` で出す
  （`_shared/` か `config.toml` が変わったら全関数。名簿は `config.toml` の `[functions.*]`）。その push が足した migration は `supabase db push` で出すが、`--dry-run` が流すものが足したものと
  完全に一致するときだけ（本番の履歴は baseline を記録していない）。一致しなければ何も流さず赤、関数も出さない。必要な secret は `SUPABASE_ACCESS_TOKEN` 1 本（登録手順は
  [`docs/BACKUP-RESTORE.md`](../BACKUP-RESTORE.md)）。無ければ赤＋Issue。手での `supabase functions deploy` は緊急時の手段（`docs/AGENT-SETUP.md` §9）。

### 15.5 文書間の固定事実の照合 — `npm run check:docs`

`scripts/doc-facts.mjs` が、複数の文書に書かれている同じ事実と、文書と実装の食い違いを突き合わせる（`npm test` に内包）。**検査する事実の一覧は [`docs/TESTING.md`](../TESTING.md) の
「文書の検査」節が正本**（ルールを足したらそこに1行足す）。規則を文章で書いたら、その規則を測る検査を同じ変更の中で書く。

### 15.6 本番 Atlas の夜間評価

`.github/workflows/atlas-eval.yml` が毎晩、`scripts/atlas-eval.mjs` で本番の Atlas に記録済みの問い（`scripts/atlas-eval/questions.json`）を送り、各ターンを既存の観測口
（`IntMapAtlasState.lastTurn()`・`IntMapAtlasDebug.lastPlan()`・`snapshot()`・包んだ `IntMapAtlasTools.makeExecute`）から読んで、記録した回が使った基準と前回の報告に照らす。判定は
`scripts/atlas-eval/judge.mjs`（純粋。「打ち切り」「ターンの予算」「同じ呼び出し」は `js/atlas-agent.js` と `js/atlas-turn-results.js` から受け取る）。測れなかったターンは「測れない」で、全部
測れなかった夜は赤。退行と記録済みの欠陥の再発は Issue 1 本に書き直される。セッションは Secret のリフレッシュトークンから作り（パスワードは扱わない）、回転したトークンを次の晩のために
保存する。**正本は [`docs/TESTING.md`](../TESTING.md)「Atlas evaluation」、読み手は [`docs/MONITORING.md`](../MONITORING.md) §1d。**

- **問題集は 2 つ**: 記録された問い（`questions.json`）と、検証済みの答えと出典を持つ問い（`scripts/atlas-eval/answer-key.json`。距離・所要時間・人口・日付・面積・標高・長さ・数・名前、日英。
  答えは出典の URL で確かめた値で許容誤差か範囲を持ち、動く答えは問いの側で年を固定する）。
- **採点は 2 段**: ① 決定的な採点（`grade.mjs` `gradeAnswer`——返答が述べた量・日付・名前を読み、正しい／誤り／述べていないを分ける）、② 独立採点（`--rubric`。ai-proxy `atlas_grade`——
  別の provider が正しさ・言い切り・根拠・言語を 0〜2 で採点する）。返答の言語は全ターンで判定する。
- **答えの誤りは「欠陥の再発」ではない**（一度も正しく答えたことのない問いは品質の穴として報告し、夜を赤くするのは正しかった問いが誤りに転じたとき——`judge.mjs` `GRADED`）。
- **再生（モデル無し・毎 PR）**: カセット（`scripts/atlas-eval/cassettes/`）は 1 ターンの両側——モデルが各手で述べたこと（台本）と、ディスパッチが返したこと（世界）——を持つ。
  `scripts/atlas-eval/replay.mjs` が現在の `runTurn`・道具の面・スキーマ・レジストリと検索に台本を流し、node で計算できるものは再計算し、外から来たもの（ディスパッチの結果・意味検索）だけを
  再生する。録画時と違う行動は「乖離」として赤。欠陥のカセットは判定器が見つけるべき失敗を宣言する。本番のターンは `js/atlas-console.js` が `IntMapAtlasDebug.lastPlan()` に `replies`・
  `dispatches` を残すので、`--record` でそのままカセットになる（ディスパッチの中の観測器の判定は録画された判定）。
- **時系列**: 報告は前夜の `history` を引き継いで 1 行足す（半年分）。種類別・言語別・能力別の正答率を夜ごとに並べ、最新が悪いものを上に置く。報告は Issue・成果物・Job summary に出る。
- **セッションの要らない半分は毎晩測る**: `offline` job が `node scripts/atlas-eval.mjs --offline` で ① 全カセットの再生と ② 到達（`scripts/atlas-eval/reach.mjs`——解答つきの問いのうち
  `capabilities` を持つものについて、問いの言葉そのものを find_capability と同じ語彙検索に渡し、要る能力が何位に出るか）を `atlas-eval-offline` として上げる（答えの評価ではなく IntMap 自身の
  コードの確認とどこでも述べる）。ライブの報告（`atlas-eval-report`）とは名前で区別する（`scripts/lib/nightly-status.mjs` `LIVE_REPORT`）。`data/service-status.json` の `atlasEval.offline` が
  件数を状態ページへ運ぶ。

### 15.7 上流の死活と、同梱データの鮮度

正本: [`docs/DATA-GOVERNANCE.md`](../DATA-GOVERNANCE.md) §4.4〜§4.6（何を・なぜ）、[`docs/MONITORING.md`](../MONITORING.md) §1e（読み方）。

- **鮮度は「束のバイトが最後に書かれた日 × その束に宣言された周期」で判定する**（`npm run check:datagov` の `freshness-stated`・`scripts/data-governance.mjs` の `freshnessOf`）。周期は builder の
  `GOVERNANCE` に（上流ごとの値は `scripts/lib/upstream-cadence.mjs` に 1 回だけ。builder が居ない束は `scripts/data-unbuilt.mjs`）、日付は束の in-band 記録か最後に変えたコミットから取る。
  どの周期も根拠（observed / expires / canon）を持ち、`static` にも理由が要る。周期の無い束は落第、古いのは note、日付が測れない（shallow clone）のも note。
- **上流の応答は 1 つの判定で読む**（`scripts/lib/upstream.mjs` の `classify()`——alive / refused / dead / unobserved——と `fetchChecked()`——非 2xx・空・JSON でない・スキーマ違反を拒み、
  再試行は dead と 429 だけ）。`data/` へ書く builder はこれを通し、上流が答えなければ書かずに非 0 で終わる。
- **ブラウザが話すホストは毎晩訊く**（`scripts/outbound-hosts.json` の要求される行はどれも代表の `probe` を持ち——`check:datagov` の `probe-declared`——`.github/workflows/upstream-liveness.yml`
  が `scripts/upstream-liveness.mjs` で全部を 1 回ずつ訊く。赤になるのは up だったホストが 2 晩続けて down になった晩だけ）。
- **期限の来た束の一部は無人で取り直す**（`autoRefresh` を宣言した builder——軽い・鍵なし・全応答を確かめる、`check:datagov` の `refresh-safe`——を `tle-refresh.yml` の 1 段として
  `scripts/data-refresh.mjs` が期限の来たときだけ走らせ、衛星カタログと同じ PR に載せる）。
- **読者に見える記録（公開台帳）**: `scripts/build-service-status.mjs` が毎晩の結果を `data/service-status.json` の `history` に 1 晩ずつ畳み込む（`advanceHistory`。ホストごとに 1 晩 1 文字——
  `a` 応答・`r` 拒否・`d` 無応答・`u` 確かめられず・`.` 訊いていない、最大 `HISTORY_KEEP`＝90 晩。測った晩だけが晩で、同じ晩は二度足さず、古い晩は書き換えない。初回は `--backfill`）。読み手は
  状態ページ・出典ページとアプリ内の出典一覧・Atlas の `diagnose`。割合は測れた確認だけを分母にする。
- **2 つの宇宙**: ブラウザが話すホスト（`scripts/outbound-hosts.json`）と、国政選挙レイヤーを作り直すときの上流（`scripts/elections/upstreams.json`、識別子は `elections/<pack>: <host>`。読者向けの
  言葉は宣言から `readerLedger()` が作る）の両方を測る。

### 15.9 更新情報（What's new）——merge の記録から読者へ

- **正本は各 merge が書く記録**（`dev-notes/<日付>-<slug>.md` のうち、読者に見える変化を起こしたものは front matter に `newsen:`／`newsjp:`——各 1 行・平文・絵文字なし・280 字以内・両方か
  無しか——を持つ。規則は `scripts/dev-notes.mjs` の `newsProblems`、門は `node scripts/dev-notes.mjs --check`。2 行の無い記録は告知されない）。
- **build が書く**（`scripts/whats-new.mjs`＝vite の `whatsNewPlugin` が `dist/` に `whats-new.json`・`updates.html`／`ja/updates.html`・Atom フィード `updates.xml`／`ja/updates.xml`・
  `sitemap-updates.xml`〔`sitemap-index.xml` に連結〕を書く。追跡しない。日付は記録の日付、PR へのリンクは記録が番号を持ちリポジトリが読めるときだけ）。
- **読み手**: 設定 ▸ 新着（`js/whats-new.js`。§8.1.4）とその未読の印、Atlas の `system.whatsNew`、更新情報のページとフィード（どこへも投稿しない）。

### 15.8 nightly の赤を、それを起こした変更へ渡す

deep tier は push でも PR でも走らない（`scripts/tiers.mjs`）ので nightly が唯一の読者で、その赤を誰の赤かまで運ぶ仕組みが 3 段ある（読み方は [`docs/MONITORING.md`](../MONITORING.md) §1f）。

- **reach**（`scripts/spec-reach.mjs`）——各ブラウザ spec が守っているソースを spec が綴るもの（パス・import・`window.IntMapX` を代入するファイル・3 ファイル以下にしか現れない設計上の識別子）
  から発見する。順位づけだけに使い、どの tier にも効かない。`--changed` は手元の差分から push 前に走らせる deep spec を出す。
- **容疑**（`scripts/nightly-blame.mjs`）——2 晩続けて赤のテストごとに、最後に通った晩と赤の初日の commit で範囲を作り（`scripts/deep-history.mjs` の分類）、範囲内の main の merge を reach との
  重なりを証拠に並べる。ci.yml の `deep-alarm` job が計算して nightly の Issue に節として足し、`worktree.mjs status` も 1 行で出す。
- **判定**（`.github/workflows/nightly-bisect.yml` ＋ `scripts/nightly-bisect.mjs`）——`deep-alarm` が退行と範囲ごとに 1 回だけ起動する（run 名が鍵）。範囲の各 commit と通った晩（対照）で、その
  commit 自身の木・build・データでそのテストを単独で 3 回走らせ、境目を `culprit` / `narrowed` / `passes-alone` / `control-not-clean` / `flaky-at-bad` / `unmeasured` のどれかに決める。判定は
  Issue に、`culprit` は名指した PR にもコメントする。
