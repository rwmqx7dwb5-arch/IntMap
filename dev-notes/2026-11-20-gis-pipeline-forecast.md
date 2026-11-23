---
title: Atlas の分析を地域を変えて再実行できる手順にし、外部の予測データ（河川流量・気象）を観測・推計・条件・不確実性に分けて GIS へ戻す
date: 2026-11-20
newsen: Atlas analyses can now be kept as steps that re-run for another region (only the affected steps are recomputed), and real public forecast data (river discharge, weather) can be brought into the GIS as labelled model estimates with the provider's stated uncertainty.
newsjp: Atlas の分析を、地域を変えて再実行できる手順として保持できるようになった（影響を受ける段だけ再計算）。実在する公開予測データ（河川流量・気象）も、モデル推計と提供元が述べた不確実性を分けた形で GIS に取り込める。
---

〈依頼〉総合技術監査（6.6/6.7/6.13/5.7）。①Atlas の分析を GIS Project の依存関係と部分再計算に載せ、対象地域を変えると影響を受ける部分だけ再取得・再計算・再表示 ②実在の公開予測データを利用規約を確認して取り込み、観測・モデル推計・利用者条件・不確実性を別々に保存して地図にも区別して出す（`research.scenario` の拡張）。

## 0. 着手前の実測

- `IntMapGisProject` は段の保存と `setParams`（1 段の引数を変えて下流を再計算）を持つ。**窓（地域）は 1 段の引数ではなく複数段が共有する値**で、どの段が使ったかの記録が無かったので「地域を変える」だけが表現できなかった。
- 取得（`acquire`）は新しい id のデータセットを作る。出自は `provenance.kind:'layer'`（layer・bounds・statedTime）。→ 系譜から手順を**復元できる**。
- `research.scenario` は IntMap 自身のシミュレータだけで、外部の予測は無かった。
- Open-Meteo の 2 API を 2026-11-20 に実測: どちらも 200・`Access-Control-Allow-Origin: *`。洪水 API は `river_discharge` に加え `_min/_max/_p25/_p75`（アンサンブルの幅）を返す。座標は提供元の格子に寄せられて返る。

## 1. 足したもの

- `js/gis-analysis-pipeline.js`（`IntMapGisPipeline`。main に同名の `js/gis-pipeline.js`＝取得段の台帳が先にあったため、こちらを改名）— 段は `gis` の扉の action そのもの。`"$region"` と `"$step:<id>"` の 2 つの印から**依存を導出**し、段の鍵＝印を置き換えた action の要約。`setRegion` は地域を使う段と下流だけを再計算、他は `reused`（同じデータセット・再取得なし）。失敗は下流を `skipped`＋`stale`。`capture` は既存の系譜から作る（取り込み・Python は `not-capturable`）。定義はプロジェクトの保存に同梱（`save(name,{extras})`→`load` が `extras` を返す→`restore`）。
- `js/gis-forecast.js`（`IntMapGisForecast`）— `open-meteo-flood`（GloFAS）と `open-meteo-forecast`。推計と不確実性は別データセット、観測は参照のみ、利用者の条件は保存して `threshold` を比較にだけ使う。取得に失敗した点・値の無い点は欠測として数える。`dataClass` で地図を着色。
- `data.gisProject` に `capture / pipelines / plan / region / runPipeline`、`research.scenario` に `forecast` 引数（`forecastReport` が 4 欄を保証）。能力は増やしていない。
- `tests/gis-pipeline-forecast-checks.test.mjs`（11 本）。

## 2. 規約（2026-11-20 に open-meteo.com/en/terms を確認）

データは CC BY 4.0（出典表記が要る）。**無料 API は非商用のみ**（1 日 10,000 回未満・毎時 5,000・毎分 600）、商用は有償プラン。記録の `terms` に持ち、報告にも出す。IntMap は既に Open-Meteo を天気・標高に使っており、この点は**既存の依存と同じ状況**（営利の扱いは別の判断事項として最終報告に挙げた）。

## 3. 入れなかったもの（理由）

- **人口分布の予測**: 公開 API の規約・応答を確かめていないので提供しない（WorldPop は現在・過去の推計）。実在しないモデルの接続を装わない。
- **観測の取得**: この 2 つの提供元は測定値を配信しない（モデル出力と再解析）。観測は既存データセットを**参照**として渡す形のみ。
- **利用者条件をモデルへ戻す**（降水 +20% 等）: 水文を IntMap が発明することになるので、閾値の比較だけ。
- 再表示: 再計算で新しい id のデータセットができるが、地図上の旧い描画の自動差し替えは未実装（Atlas は `map.drawDataset` で描き直す）。

## 4. 失敗の形

`complete` を最初「全点に値がある」で定義し、実 API で河川の無いセルが `null` を返して誤って `false` になった。「取得に失敗した」と「値が無かった」は別で、`failed` と `noValue` に分けた。

## 5. 天井と基準を上げた理由

- **perf（遅延チャンクのみ。起動時の通信は増えていない）**: `gis-core` 622.7→638.9 kB（パイプラインと予測データの 2 モジュール）、`atlas-reasoning` 15.0→18.2 kB（`forecastReport`）、`atlas-cap-runs` 884.2→893.1 kB（`research.scenario` の `forecast` 分岐）、async 合計 4745.6→4775.6 kB。買ったもの: 地域を変えた再実行と外部予測データの取り込み。
- **表面の基準**: `window.IntMapLazy` の読みが 186→187。`research.scenario` が `gisCore` を読み込むための 1 回で、`data.gisProject` など同じ名簿の能力が既にしている方法と同じ。所有者（`js/lazy-modules.js`）からの import へ寄せる整理は別件。
- **外向き通信の台帳**: `flood-api.open-meteo.com`（座標を送る・既存の Open-Meteo 開示に含まれる）と、規約アドレスの文字列 `open-meteo.com`（取得しない参照）を追加。
- **refusal の文言検査**: パイプライン・予測は Atlas からしか呼ばれず（GIS パネルに操作が無い）、拒否は model へ code と detail で返る。対象外の理由を検査に書いた。
- **perf の再引き上げ（main 取り込み後の測り直し）**: `gis-core` 637.0→654.1 kB、`atlas-cap-runs` 903.4→915.2 kB、`dist.assets` 21686.9→21801.0 kB、`async.gzip` も増。増分は本 PR の遅延チャンク内の 2 モジュール（解析手順・予測データ）と、それを呼ぶ `data.gisProject` / `research.scenario` の分で、起動時の通信は増えていない。main 側の変更ぶんと合わせた再測定で、`perf-budget --update` が上がった行だけを引き上げた。
- **perf（2 回目の main 取り込み後）**: `atlas-cap-runs` 909.0→915.2 kB、`async.raw` 14304.0→14381.3 kB。main 側の同時引き上げと本 PR の分（`research.scenario` / `data.gisProject` の入口）が両方動いたため、取り込みで main の値が採られた行を再測定して引き上げた。`dist.total` は main が上限を上げており本 PR は触れない。
- **perf（`dist.total`）**: 1542452.9→1550199.4 kB。CI と同じ data（`npm run data:pull`）で測り直すと main の時点で既にこの値で、天井は #1101 の古い測定のまま。本 PR の寄与は JS 約 0.5 MB（解析手順・予測データの 2 モジュール）で 7.7 MB の超過の原因ではない。main の直近の run も同じ perf で赤だったため、再現できた超過を本 PR で引き上げた（起動時の通信は増えていない）。
- **perf（3 回目の main 取り込み後）**: `atlas-cap-runs` 918.5→924.7 kB（本 PR の入口分）、`atlas-orchestrate` 82.4→96.1 kB。後者は本 PR が触らない（`js/atlas-orchestrate` に本 PR の差分は無い）ので main 側の積み上がりが測り直しで見えた分で、CI と同じ data・main 取り込み後の木で再現できたため引き上げた。
- **perf（4 回目の main 取り込み後）**: `async.gzip` 4833.8→4863.8 kB。本 PR の遅延 2 モジュール（gzip で約 30 kB 弱は main の同時増と合算）。CI と同じ data・取り込み後の木で再現して引き上げた。
- **perf（gis-network 取り込み後の再測定）**: `gis-core` 663.6→679.8 kB・`atlas-cap-runs` 924.7→931.1 kB・`atlas-console` 1105.8→1112.0 kB・`dist.assets` 21796.5→21923.7 kB。`gis-core` は main の `gis-network`（グラフ解析）と本 PR の 2 モジュールが同じチャンクに載った合算で、両者の追加が重なって初めて見えた。CI と同じ data・取り込み後の木で再現して引き上げた。
- **perf（DIRTY 解消の取り込み後）**: `async.gzip` 4864.8→4889.7 kB・`atlas-console` 1112.0→1118.7 kB。取り込んだ main 側の増分（本 PR は `atlas-console` に載るファイルを触らない）を、CI と同じ data の木で再現して引き上げた。
