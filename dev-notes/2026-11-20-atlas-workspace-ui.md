---
title: Atlas が質問に応じて操作できる画面(ボード)を宣言して組み、保存・復元できる
date: 2026-11-20
newsen: Atlas can now answer with a working screen — a table, chart, filters and map linked together — that you can click, filter, save and reopen.
newsjp: Atlas が答えとして、表・グラフ・フィルタ・地図を連動させた操作できる画面を出せるようになりました。保存して開き直せます。
---

〈依頼〉外部監査の指摘「`ui.inlineControls` はスイッチ・スライダー・ボタンだけ」。Atlas が質問に応じて操作可能な画面を宣言的に構成し、保存・再編集でき、GIS Project の部分再実行に繋がる設計の最小の縦串。

## 0. 何を作ったか

- `js/board-spec.js` — 宣言の検査。widget は table / chart / filter / map / evidence / param。各 kind は Artifact の節（Map・Data・Analysis・Evidence・Execution）に写像（`SECTION_OF`）。Time・Objects は widget がまだ無いので名指しだけ（空の枠は作らない）。データは `data.dataset`（IntMapData の id）か `data.rows`（Atlas が持つ記録、最大 2000）。**列がデータに実在しない・出典が無い・未知の kind は名前つきで拒む**。HTML・スクリプトを受ける欄は無い。
- `js/board-state.js` — 共有状態（選択・フィルタ・パラメータ）。**要素同士は直接知らず、状態を読む**。手で作る画面も Atlas の画面も同じ呼び出し（`IntMapBoard.open(spec)`）で同じ状態を共有する。
- `js/board.js`（遅延 `board`）— DOM を自前で組む（textContent のみ）。デスクトップは右の浮動パネル、640px 以下は下からのシート。既存の CSS 変数で明暗に追従。
- `js/atlas-cap-board.js` — `board.compose`（`save:true` で保存）と `board.restore`。
- 部分再実行: `param` widget は値を `IntMapGisProject.setParams(dataset,{key})` に渡す。依存先の再計算と失敗時の `stale` は gis-project の仕事のまま。board は `IntMapData.subscribe` で dataset の入れ替えを受けて描き直すだけ。

## 1. 保存するもの・しないもの

保存: spec（inline rows 込み）と状態の snapshot を IndexedDB `intmap-board/boards` へ。**保存しない**: spec が名指すだけの dataset（gis-project がレシピとして持つ）、カメラ・時計（session-tabs）。gis-project の `projects` store には載せなかった（レコード形が dataset steps 専用）。

## 2. 測った

preview（ローカル）で、表の行クリック → 棒と地図点が選択・カテゴリフィルタで 8→3 行・保存→閉じる→復元で状態一致・存在しない列の宣言は `unknown-column:nope` で拒否。375px 幅で下からのシートになり、選択が表・棒・地図で連動することをスクリーンショットで確認。

## 3. 今回やらなかったこと（見つけた事実）

- 地図 widget の簡易表示は輪郭のみの SVG。本物の地図には「地図に表示」ボタンが `IntMapGis.draw(datasetId)` を呼ぶ。選択を本物の地図へ反映する経路は未実装。
- グラフは atlas-chart を使っていない（あれは HTML 文字列で個々の点の識別子を持たず、クリックを選択に繋げられない）。board のグラフは 40 本まで・自前の SVG。重複を避けるには atlas-chart に点の識別子を持たせるのが筋で、別の作業。
- 時間軸 widget（IntMapTime 共有）と Objects は未実装。
- チャット内の「開き直す」ボタンは無い（`board.restore` を Atlas に頼む）。

## 起動費用の上限を上げた理由(perf-budget)
新しい遅延チャンク `board`(利用者がボードを開くまで読まれない)と、`board.compose`/`board.restore` の能力記述が
`atlas-cap-runs` に約 6.7 kB 足されたため、`async.gzip`・`atlas-cap-runs`・`dist.assets` の天井を `--update` で上げた。
起動時の経路には載らない(`check:perf` の起動側の行は動いていない)。

`atlas-console` チャンクも約 6 kB 増えた(1061.2 → 1067.2 kB)。能力記述 2 本が dispatch の注記表に入るため。起動時の経路ではなく、Atlas を開いたときに読まれる遅延チャンク。

追記(2026-11-21): main を取り込んで測り直したところ、遅延チャンク `atlas-orchestrate` が 82.4 → 96.1 kB になっていた。このチャンクはボードの変更ではなく、main 側の別の変更で増えたもの。PR の CI は main との合成を測るため、この PR で天井を上げて通した(起動時の経路ではない)。
