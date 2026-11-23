---
title: STAC で「この場所・この時期の衛星画像・SAR・LiDAR・標高」を種別で探す（gisRemote の scenes）
date: 2026-11-24
---

〈依頼〉2025 年に OGC 標準になった STAC で、任意の場所・時期について利用できる衛星画像・SAR・LiDAR・DEM を Atlas が
発見できるようにする。既存の取得経路と重複させず統合する。

## 1. 全数調査の結論——入口は既にあった。無かったのは「種別で訊く」問い

- STAC のカタログ読み（`/collections`・`/search`）、COG の範囲読み、`stac:` 入力、署名、台帳つきの取得は
  `js/gis-remote.js`（`data.gisRemote`）と `js/gis-ogcapi.js`・`js/gis-cog.js` に**既に在る**（Earth Search・
  Planetary Computer・NASA CMR-STAC の 3 本）。別の入口を作ると二重になるので**作らない**。
- 足りなかったのは「どのコレクションに訊くか」を読み手が知っている前提だった点。`discover` はコレクション、`items` は
  1 コレクションのシーン。「東京の 2024 年 6 月の SAR」には最初の一手が無かった。
- #1339（`imagery-registry.js` の HLS 撮影時刻・雲量）は地図の日付スライダー用の 1 点照会で別の仕事。#1318・#1343 は
  未 merge だが、どちらも `url:<COG>` の入力（`gis-cog.js`）を読むので、**渡し口は既存の ref 文法**にした。

## 2. 入れたもの（1 経路）

`gisRemote` の `action:"scenes"`（`gis-remote.js` `scenes()`）。bounds＋time＋modality（optical/sar/dem/lidar・既定は 4 つ）＋
maxCloud で、全 STAC カタログのコレクションを種別で絞り、それぞれのシーンを新しい順に返す。

- **種別は STAC の述べる欄から読む**（`gis-catalog-search.js` `modalitiesOf`）: `sar:*` summaries、`eo:bands`、
  標高・LiDAR の語。ホスト名・コレクション名の一覧は持たない。決まらないものは `unclassified` に数える。
- **各シーンに**: 日時（`start/end` のみの SAR も）・雲量・欠損率（`nodata/degraded/saturated/defective` を含む数値の
  プロパティを原名のまま）・解像度・プラットフォーム・SAR の mode/偏波/軌道方向・コレクションのライセンス原文＋規約リンク・
  `refs.grids`（`url:<COG>`）。
- **「無い」を 3 つに分ける**: `no-collection` / `no-scene`（`atOtherTimes`・雲量で落とした数つき）/ `not-answered`
  （「訊けなかった」）。全て「問い合わせ先の中で」であり `worldCompleteness:'unproven'`。
- **DEM は期間を適用しない**（1 エポック）。実測: 期間つきで Copernicus DEM を訊くと 0 件で、場所を覆うのに「無い」と
  言ってしまう（`periodApplied:false`）。
- **非商用（SPDX `-NC`・non-commercial）は `excluded` に理由つきで挙げ、探さない**。実測: Planetary Computer の
  `chloris-biomass` は CC-BY-NC-SA。`proprietary` は STAC で「規約はリンク先」を表す語（Sentinel・Landsat）で、
  非商用ではない——原文とリンクを示し、開放とも閉鎖とも言わない。
- 候補は場所・期間の述べ → **述べられた解像度の細かい順** → カタログ間の巡回（同じ衛星が 3 カタログにあるため、
  先頭 6 件が 1 カタログの写しにならない）。数は `perModality`（既定 6）で、超えた分は `collectionsNotAsked`。

## 3. 実測（2026-11-24・実カタログ・Node から）

| 問い | 結果 |
|---|---|
| 東京 (139.6,35.6,139.8,35.8)・2024-06・全種別 | optical 12 シーン（Sentinel-2・Landsat・HLS）、sar 9（Sentinel-1 GRD/RTC・IW・VV+VH・descending）、dem 4（Copernicus DEM 30/90 m 2021-04-22）、lidar 12（GEDI）。約 15 秒 |
| 同・雲量 20% 以下 | HLS 1 シーン（雲 2%）。Sentinel-2 は 0（雲で落とした数を述べる） |
| 同・1999 年 | SAR は `no-collection`（Sentinel-1 は 2014〜）、optical は Landsat 5/7 が 8 シーン |
| 南極 (-150,-85)・2024-06 | optical `no-scene`（他の時期の在り処つき）・SAR `no-scene` |

コレクション数の実測: Earth Search 9・Planetary Computer 140・CMR-STAC 797（20 件ではない）。分類できなかったのは 363。

## 4. 検証と残り

- 回帰: `tests/stac-scenes-checks.test.mjs`（偽 fetch・16 件）。実カタログでの動作は上の表（手で 1 回・夜間の
  `scripts/gis-live-probe.mjs` は既存の STAC 3 本を引き続き測る）。
- 出典・規約・プライバシー: **新しいホストは増えていない**（同じ 3 本・送るのも bbox と期間だけ）ので
  `outbound-hosts.json`・プライバシー本文は変更なし。出典ページの 3 行（en/ja）に「シーン検索」「SAR・LiDAR」を足した。
- 触っていないもの: GEDI など衛星 LiDAR の分類は `lidar` の語（タイトル・キーワード）に頼る。3DEP の航空 LiDAR は
  Planetary Computer が持つが米国のみ。各コレクションは 1 ページ分だけ（`continues`）。
- #1318・#1343 が merge されたら、`refs.grids` を 2 時点の組へ渡す口（`scenes` の結果から 2 つ選んで変化解析へ）が
  次の一手。いまは Atlas が `refs.grids` を `gis` の `url:` 入力に渡す。

## 5. 起動費用の天井を上げた理由（check:perf）

`scenes()` と種別分類（`modalitiesOf`・`qualityOf`）を足したぶん、遅延チャンクが増えた。起動時に読まれるものではない
（いずれも Atlas が `gisRemote` を呼ぶときだけ読む async chunk）。CI の計測: gis-remote 28.6→35.3 kB・gis-core 697.3→702.8 kB・
atlas-console 1129.9→1137.2 kB・dist.assets 21923.7→22059.0 kB。`tests/perf-baseline.json` の 4 行をその計測の直上へ
上げた（worktree に `data/` が無く build できないため `--update` でなく CI の数値から手で書いた。main 後の `--tighten` が
実測へ締める）。
