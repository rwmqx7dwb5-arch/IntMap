---
title: データセットを Excel (.xlsx) として書き出せるようにした（連続作業の出口の穴を埋める）
date: 2026-11-20
newsen: Atlas can now save a dataset or result as an Excel workbook, with numbers kept as numbers and codes like 01100 kept as text.
newsjp: Atlas が、データセットや解析結果を Excel（.xlsx）として保存できるようになりました。数値は数値のまま、「01100」のようなコードは文字のまま保たれます。
---

〈依頼〉 CSV 読込 → 修正 → Python 分析 → 新データセットと図表 → 再保存を、ファイル処理と GIS を分けずに 1 本の作業として行えるか。
成果物の版管理と外部出力の対応範囲を実測し、不足を実装する。

## 実測（2026-11-20 時点の main と #1314）

| 段 | 状態 |
|---|---|
| 読む: CSV / xlsx / docx / pptx / PDF / 画像 / KML 等 | あり（`atlas-attach.js`・`geo-import.js`） |
| 直す・分析: gis 演算・`compute.run`（Pyodide）→ 新データセット | あり（出力は GIS レジストリのデータセット） |
| 図表: `chart.compose` | あり |
| 書き出し（データセット）: GeoJSON / CSV / GeoPackage / KML / GPX / GeoTIFF / COG | あり（`gis-export.js`） |
| 書き出し: **Excel / Word / PowerPoint / PDF** | **無かった**（読むだけで書く手段が無い） |
| 保存・版管理・再利用（成果物を 1 つの仕事にまとめる） | #1314（`work.job`）が実装中。**執筆時点で OPEN・CI 赤**で main に無い。別セッションが担当のため触っていない |

つまり連続作業のうち「作業の束ね」は #1314、**Excel 出口が穴**だった。

## 足したもの

- `js/office-writer.js`（DOM なし・依存なし）: stored ZIP（CRC-32）+ SpreadsheetML。数・真偽・文字を型どおりに書き、
  NaN/Infinity は空セル（件数を返す）、31 字超のシート名・3 万 2767 字超のセルは切って件数を返す、行数・列数の上限超過は名前付きで断る（黙って切らない）。
- `gis-export.js` に `xlsx` 形式（ベクタ）。列と幾何の規則は CSV と同じ（点→longitude/latitude、図形→geometry_wkt）。
  `data.gisExport` と、#1314 の `work.job` の dataset 成果物の書き出し（`write()` を呼ぶ）の両方が自動的にこれを使える。
- 検査 `tests/work-files-checks.test.mjs`: 中央ディレクトリの CRC を実際に検算、型・損失の計数、IntMap 自身の読み手での往復、CSV との列の一致、上限の拒否。

## 足していないもの（理由）

- **Word / PowerPoint / PDF の書き出し**: 文書の出口が要るのは #1314 の `document`/`answer` 成果物で、その `fileOf` がまだ main に無い。
  土台が merged されてから、同じ `office-writer.js` に docx を足して `fileOf` から呼ぶ（先に足しても到達できないコードになる）。
  PDF は日本語フォントを同梱せずに正しく書けないので、ブラウザの印刷（HTML → PDF）経由を検討する。
- Python 側から直接ファイルを書く機能（永続ファイルシステム）は server-exec セッションの担当。

## 引き継ぎ

#1314 が merge されたら: `fileOf` の `table` を csv に加えて xlsx でも出せるようにする（`writeXlsx` を直接呼ぶ）、`document` を docx で出す。

## perf 天井を上げた理由

`gis-export` の async chunk は 31.4 kB → 39.2 kB。増えた分は xlsx 書き出し（`js/office-writer.js`・ZIP と SpreadsheetML の書き手）そのもので、
ライブラリを入れない代わりに自前で持つ約 8 kB。起動（eager）には入らず、書き出しを開いたときだけ読まれる。
同じ `--update` で `atlas-cap-runs`・`dist.assets`・`async.gzip` の天井も上がったが、これは取り込んだ origin/main 側の増加分で、この変更の寄与ではない（main の CI が次の push で締め直す）。
