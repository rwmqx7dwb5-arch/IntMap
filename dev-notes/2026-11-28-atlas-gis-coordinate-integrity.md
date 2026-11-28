---
title: Atlas のラスター処理で画素位置とバンドの意味を保つ
date: 2026-11-28
newsen: Atlas preserves raster pixel positions and band definitions, joins aligned tiles across the antimeridian without interpolation, and reports sampled coordinate checks separately from drawing.
newsjp: Atlas はラスターの画素位置とバンドの宣言を保ち、日付変更線をまたぐ整列済みのタイルを補間なしで結合します。座標の照合結果も描画の成否とは別に示します。
---

添付報告で指摘された GIS カーネルを調査した。幅 361 列で列 360 が列 0 を読むことを再現した。
地理経度と画素参照の座標空間を分け、経度の折り返しを地理側に置いた。モザイクは共通格子に
整列する入力を直接読み、解像度と重複セルの選択を独立させた。

登録、マスク、warp、モザイクのバンド宣言を共有規則から引き継ぐ。位置照合の不一致があれば
結果を登録せず、観測した範囲と件数を Atlas の既存の結果と Goal Verifier に渡す。

検査は幅 359〜1,031 の恒等変換、単一有効画素、未知の分類コード、日付変更線の結合と総量保存、
Worker の同一性、異常注入、Rasterio/GDAL との全画素比較。

初回の CI でラスター取り込み画面向けの拒否文言不足を検出し、英語・日本語の表示を追加した。
GIS を初めて使うときに読む `gis-core` のビルドは、座標照合と格子配置の処理を加えたことで
初回 CI では 698.9 kB の上限に対して 708.9 kB となった。その非同期チャンクの上限を実測に合わせる。
スマートフォンの起動時の読込量とリクエスト数は初回 CI で同じだった。
