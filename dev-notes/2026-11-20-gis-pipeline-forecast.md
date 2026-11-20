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

- `js/gis-pipeline.js`（`IntMapGisPipeline`）— 段は `gis` の扉の action そのもの。`"$region"` と `"$step:<id>"` の 2 つの印から**依存を導出**し、段の鍵＝印を置き換えた action の要約。`setRegion` は地域を使う段と下流だけを再計算、他は `reused`（同じデータセット・再取得なし）。失敗は下流を `skipped`＋`stale`。`capture` は既存の系譜から作る（取り込み・Python は `not-capturable`）。定義はプロジェクトの保存に同梱（`save(name,{extras})`→`load` が `extras` を返す→`restore`）。
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
