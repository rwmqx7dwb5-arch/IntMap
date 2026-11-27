---
title: Atlas のジョブで、仕事の結果を次の仕事へ全件のまま渡す（参照＝依存・出力の置き場・出典・依頼の 2 つの版・切ってから数えない・計画器の照合）
date: 2026-11-27
pr: 1491
newsen: A background job's pieces now hand their whole GIS result to the next piece — filter, join and re-count what an earlier piece fetched, with its source file kept — and the result is filed as a dataset you can put back on the map.
newsjp: バックグラウンドの仕事が、前の段の GIS 結果を全件のまま次の段へ渡すようになりました。取得したデータを絞り込み・結合・集計し直せ、元ファイルの出典も残り、結果はデータセットとして保存されて地図に戻せます。
---

〈依頼〉外部監査（2026-11-27・main@638897c）が最優先とした「Atlas の GIS 結果の受け渡し」を 1 本で直す。個別の地名・件数のための分岐は禁止。

## 0. 測った（監査の再現を実際の計画器→実行器→GIS→ページで）

1. 500 地点: A（抽出）done・500 件。B（A を依存先に絞る）は計画は通るが実行で `wrong_input_count`。C（worker）は A が切れたと言われるが末尾が届かない。ジョブは B が失敗しても `done`。ページの成果物は answer 2・document 1 で dataset が無い。
   **原因**: 「A を待つ」（`deps`）と「A の結果を B に渡す」が別実装。ページの委譲は `@A:path` を解いていたが（`js/atlas-delegate.js` `resolveArgs`）、サーバの runner は解かず、B は計画時の引数で走った。twin は 1.5 MB で結果を切り、ページの `jobFacts` は要約しか持ち帰らなかった。
2. URL の GeoJSON を読んでも `sources:[]`、GIS の provenance は全入力 `headless-input`。
3. 「名古屋」→ 実行中に「大阪」→ 後続の GIS（引数は名古屋）は変更の後に始まったので最新の `requestVersion:1` が付き、変更前の計算だと誰も言わなかった。
4. `geo.shadeAreas` に 2,001 行 → 2,000 件・「2,000 件中 2,000 件」・`userGoalSatisfied:true`（先頭 2,000 で切ってから分母を数えた）。
5. 計画器: `server`/`job` の能力が `null` なのでサーバで動く演算があっても不能と答え、逆に期間未記載の候補・存在しない演算名・解像度未照合でも `runnable:true`。

## 1. 直したこと（構造で）

- **参照＝依存。** `resolveArgs`・`refsOf` を `js/atlas-job-core.js`（サーバに鏡写し）へ移し、ページの委譲とサーバの runner が同じ 1 つを使う。参照した仕事は `inputs` に書かなくても入力になる（`normaliseContract`）——待つ相手と読む相手が必ず一致する。`js/atlas-delegate.js` の写しは消した（形式上の削除。役目は core の 1 つが引き継ぐ）。
- **出力は全件で、置き場は runner が決める。** twin（`data.gis`）は切らずに全件を返し、runner の `keepOutput` が行に収まれば行、収まらなければ新しい表 `atlas_job_artifacts` に部分で置く（`INLINE_OUTPUT_BYTES` は twin の旧い切り幅をそのまま正本として runner へ移した）。読み戻しは `wholeData`（runner）と `output()`（ページの client）。終わった仕事は `output`（id・版・件数・列・出典・置き場所）と `reads`（読んだ出力の id・版）を持つ——完了判定の検証役（並行セッション）が受け取る形。
- **worker は切れた入力の残りを読める。** サーバでもページと同じ `read_step` を runner が自前で答える（切れた入力がある worker は道具ループで走る）。
- **ジョブの状態。** どれかの仕事が失敗・拒否・入力欠落なら `partial`（新しい状態。finish・cancel・purge が知る）。利用者が外した仕事（`dropped`）は失敗に数えない。結果の `incomplete` が名指す。
- **出典。** twin は URL を出典にし、GIS の provenance に入力の名前（URL・元の仕事と版）を書く（`gis-headless.js` `names`）。前の仕事から渡った入力は、その仕事の出典を引き継ぐ。
- **2 つの版。** `requestVersion`（開始）と `conditionsVersion`（条件を書いた時点: 能力の仕事は `contract.writtenAt`、worker は最後の要求）。古い条件の仕事とその出力を読んだ仕事は `stale` に挙がり、要約に変更内容が添えられる。やり直しは `jobs.amend` の `revise`（影響する仕事の新しい契約）と `keep`（成り立つ仕事）→ 関数 `op:"revise"` が全体を `planJob` してから `atlas_job_revise`。どれが成り立つかは Atlas の判断で、コードは決めない。
- **切ってから数えない。** `js/atlas-caps.js` に `counted(list, max)` を 1 つ。`geo.shadeAreas` は由来の無い 2,000 の上限を外し、分母は受け取った行数、達成判定は「全行が結ばれたか」。全数調査（scout）で同じ形だった `layers` の指標一覧（40）・custom score（8）・標高断面（12）・`ui.inlineControls`（8）・国の比較（10）は上限を残したまま、切ったときだけ元の件数と捨てた件数を述べ `userGoalSatisfied:false`。
- **計画器を実体と照合。** `server`/`job` → `jobs.start`。演算名は GIS が宣言する一覧（`flow.find().ops`、サーバ分は `flow.runsWithoutScreen`——`gis-headless.js` もこの 1 つの述語を使う）と照合し、無い名前は `runnable:false`。期間が問われたら `temporal:'overlaps'` の候補だけが覆い、解像度は `search` の `maxGsd` と `match.resolution:'meets'` で照合する。

## 2. 費用（`check:perf` の天井を上げた理由）

起動時の資産は変わらない。増えたのは遅延チャンクだけ: `atlas-cap-runs` +約 9 kB（`jobs.amend` の revise/keep、dataset 成果物、`counted`、計画器の照合——この回の能力そのもの）と、`atlas-cap-work.js` が `atlas-jobs-client.js` を遅延 import するようになったため `atlas-job-core` が独立した遅延チャンク（10.9 kB）になったこと。どちらも使うときに読む費用で、取り除けば受け渡しの能力が無くなる。`node scripts/perf-budget.mjs --update` で超えた行だけを上げた。

## 3. 検査

- `tests/gis-result-handoff-checks.test.mjs`（実際の planJob・runJob・ページの GIS・jobFacts・作業ストアを通す）: 500 地点から B が末尾 1 件を A から抽出／C が A の最後の行まで読む／ジョブ done／ページを開き直して 1 件の座標と元ファイルの URL が取れる・失敗は `partial`・1.5 MB 超は部分で全件・版 2 つと `revise`/`keep` の効果・参照の実装は 1 つ・`counted`。
- `tests/atlas-shade-areas-checks.test.mjs` に 2,001 行。`tests/geo-task-planner-checks.test.mjs` に監査の計画と実在 GIS の演算一覧。
- `supabase/tests/56_atlas_job_handoff_test.sql`（partial・artifacts の権限・revise）。ローカルは Docker が止まっていたので CI の pgTAP で走る。
- 既存の `atlas-durable-jobs`／`atlas-server-caps`／`atlas-success-truth` の 3 件は新しい振る舞いに合わせた（偽 DB が `drop` の `code:'dropped'` を書くように、twin の `truncated` は無くなった、版の書き方）。
