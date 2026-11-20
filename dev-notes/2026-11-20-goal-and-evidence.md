---
title: 操作が成功しても目的は達成されていない——成果物の中身と独立した根拠を観測して完了判定へ渡し、Evidence Graph を永続・統合・更新の影響特定まで完成させた
date: 2026-11-20
newsen: Atlas's completion check now sees what the outputs actually hold (rows filled, independent sources behind each figure), and the evidence lineage is saved to the account, linked to news and notebook entries, and reports exactly which results a data update touches.
newsjp: Atlas の完了判定が、成果物の中身（値が入っている行数・各数値を支える独立した出典の数）を見るようになり、根拠の系譜はアカウントに保存され、ニュース・調査ノートとつながり、データ更新が触れる結果を名指しで返す。
---

〈依頼〉 総合技術監査（2026-11-20）の P0/P1。① 操作の成功と調査目的の達成を区別する（20 都市比較で人口が 8 都市分しか無ければ未完成、同じ出典を 3 回引いても独立した 3 証拠ではない）。② #1287 の Evidence Graph の未実装部分（Supabase 永続化・ニュース/ノートとの統合・未接続の呼び出し元・更新の影響の特定）。モデルの判断は縛らない。

## 0. 測ったこと
- goal verifier（`js/atlas-goal-verify.js`）が見る記録は `recordOf` ＝ 各操作の ok/FAILED だけで、**成果物の中身**は何も見ていなかった。20 行の表のうち 8 行にしか人口が入っていなくても、`gis.import → ok` なら記録上は満たされる。
- 一方で材料は既にあった: GIS データセットの `fields[]` は列ごとに `filled/total/min/max` を持ち（`js/gis-datasets.js` `typeColumn`）、Evidence Graph は各数値の入力の節を持つ。足りなかったのは **それらを完了判定へ事実として運ぶ線**と、**独立性の数え方**。
- #1287 の「直していないもの」4 点（Supabase・ニュース/ノート・未接続の呼び出し元・影響の特定）を実装した。

## 1. 変えたこと
- **`js/evidence-graph-deliver.js`（新・純粋）** — `assessDataset`（各列が何行に値を持つか。呼び出し側が目標を知っていれば `expected` で不足を計算）、`assessSupport`（数値ごとの `citations` と `independent`＝独立した出典の数。web 文書は**ホスト**で 1 出典、dataset は layer 鍵。`corroborated`／`single`／`model_only`／`unobserved`）、`assessDeliverable`、`observationLines`。
  **依頼の語を 1 つも読まない。** 「8/20 が不足か」は事実を見る別モデル（verifier）が依頼と照らして決める。観測できなかった列は `observed:false`（「欠けている」にしない）。
- **完了判定へ** — `makeGoalVerify({observe})`。`observe(ctx)` の行を「WHAT THE OUTPUTS ACTUALLY HOLD」としてプロンプトに足し、規則文に「ok を返した操作は満たした部分ではない」を足した。`makeTurnObserver(since)`（`atlas-console.js` が 1 行で配る）が、そのターンに作られたデータセットと回答の数値を読む。observe が投げたら記録だけで走る（観測できない＝未達ではない）。Atlas のループは変えていない（既存の `goal_unmet` の 1 回の注記のまま）。
- **独立性の事実の源** — `recordAnswer` が節の `meta.statedBy`（引いた節のうち、その値を自分で述べているもの）と `meta.turnId` を持つ。同一ホストの 2 URL を引いた数値は `citations 2 / independent 1`。
- **更新の影響の特定** — `putSource` が版の変化を検知した瞬間に `impactReport`（触れた派生・段数・GIS の dataset id・回答の数値とその値・stale の理由）を作り、`onSourceChanged` に配り `updates()` に残す。
- **永続化** — `supabase/migrations/20261120120000_evidence_graph_nodes.sql`（`(user_id,id)`・本人だけ RLS・50 MiB の名前付き上限・アカウントデータ台帳の 1 文・`on delete cascade`）、pgTAP `52_evidence_graph_test.sql`、構造テスト 2 表。`js/evidence-graph-sync.js` は pull（merge）→ push（`pending()`、**サーバが受けた分だけ** `ackPending`）。同意はノート同期と同じで、`atlas-notebook.js` が自分の同期の後に呼び、アカウントのコピーを消すときに一緒に消す。
- **統合** — `recordNews`（版は公開日。取得時刻は版にしない）、`recordNote`（ノートは `evidenceRefs`＝そのターンの回答の数値の節＋出典のニュースの上に立つ派生。ノート正規化が `evidenceRefs` を運ぶ）、`datasetFacts`＋`research.analyze` の `datasets` 引数（データセット自身が測った行数・数値列の最小/最大/埋まっている行数を `graphRef` 付きで回答へ）。
- `graph.merge`（版の和集合・派生は到着順に依らない）、`pending/ackPending`。`atlas-evidence` の `graphRef` の切り詰めを 120→400 に（長い URL 鍵の節 id が黙って壊れていた）。

## 2. 直していないもの（理由）
- **完了の判断そのものをコードで行うことはしていない**（`CONSTITUTION.md` §5）。コードが出すのは事実で、判断は verifier と Atlas。`expected` を渡す呼び出し元はまだ無い（Atlas が引数で述べる設計は、必要が出たとき `research.analyze` / `gis.*` に足す）。
- 調査ノートは 2026-10-04 から利用者に非表示（`NOTEBOOK_SHOWN`）。非表示の間はノートが保存されないので、ノート節も永続も走らない。表示に戻した瞬間から効く。
- 本番での検証（実ログインでの 20 都市比較・sync の実往復）は未実施。migration は PR の CI が `supabase db reset` / `supabase test db` で通す。

## 3. 検査
`tests/goal-and-evidence-checks.test.mjs`（①20 行中 8 行の人口・不足の計算 ②同一ホスト 3 回は独立 1・model_only ③verifier へ渡り観測が投げても走る ④更新が GIS 結果・回答の数値・ノートを名指す ⑤送信失敗で失わず pull が置換しない・到着順に依らない合流 ⑥ニュース・ノート・`datasets` 引数）。`tests/evidence-graph-checks.test.mjs`（#1287 の既存 5 本）は無変更で通る。

## 4. 費用の増加（perf）
- `atlas-notebook` の非同期チャンクが 34.3 kB → 52.8 kB（+18.5 kB）。**理由**: ノートが `evidence-graph-record`（節の記録）・`evidence-graph-sync`（アカウントへの往復）を取り込み、ノートの保存が回答の数値の節へ立つようになったため。ノートを開くまで読まれないチャンクで、起動の経路には載らない。天井を 54200 へ上げた（CI の測定 52.8 kB・帯 2 kB 以内。main の CI が測定値へ締める）。
- `research.analyze` の `datasets` 引数は `window.IntMapData` を直に読まず、`datasetFactsOnPage`（`evidence-graph-record.js`）が globalThis 経由で読む（`check:surface` の読み取り件数 27→28 を増やさない）。
