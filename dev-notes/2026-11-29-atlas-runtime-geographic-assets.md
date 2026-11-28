---
title: Atlas が公開ページの実行時に読み込まれる地理データを見つける
date: 2026-11-29
newsen: Atlas can discover geographic files a public map loads at runtime, even when the page has no download link.
newsjp: ダウンロードリンクがない公開地図でも、Atlas がページの実行時に読み込まれる地理ファイルを探せるようになりました。
---

静的なページに地理データの URL が出ず、実行後の DOM にも追加されない場合を再現した。
通常の Cloudflare Snapshot の応答には通信履歴が含まれない。Atlas が通信観測を指定したとき、
既存の描画枠内で新規ブラウザーを開き、送信された匿名 GET と対応する成功応答から候補を得る。
Atlas は候補の URL を既存のファイル取得や GIS の入口に渡せる。

履歴のある操作セッションは使わない。公開 URL・DNS、処理時間と観測件数を制限する。
Chromium を使う個別プローブで、別ホストの拡張子なし GeoJSON を 1 件発見し、取得したファイルから 1 地物を読んだ。
読み取り条件は常設の Node 回帰検査に追加し、ブラウザーのテスト時間枠は共有のまま維持した。

公開ページの実測では [OpenLayers の地図](https://openlayers.org/en/latest/examples/webgl-points-layer.html) の
静的候補に含まれない [都市の GeoJSON](https://openlayers.org/en/latest/examples/data/geojson/world-cities.geojson) を
ローカル Chromium で観測した。応答は HTTP 200・`application/geo+json`。発見した URL を既存の取得に渡し、
19,321 地物を読んだ。通信審査を有効化できない子ターゲットがあったため、観測全体は `partial` と報告された。
