---
title: 撮影日が分からない画像を「指定した日の画像」と呼ばない・HLS は場所ごとの撮影時刻と雲量、画像が無い地点は「無い」と言う
date: 2026-11-20
newsen: The satellite view no longer presents a picture of unknown date as the picture of the day you chose on the Chronos clock, shows the real acquisition time and cloud cover for NASA HLS scenes, and says plainly when no picture exists at that point that day.
newsjp: Chronos で指定した日に、撮影日が分からない画像をその日の画像として出さなくなりました。NASA HLS では場所ごとの撮影時刻と雲量を表示し、その日その地点に画像が無いときは「無い」と表示します。
---

〈依頼〉供給網（衛星・航空画像の供給網・同日の別 PR の上に積む）の残課題: 要求された時点・地点で使える画像を比べて供給元を選び、
画像が無い範囲はその旨を示し、撮影日が不明な画像を Chronos の指定日の画像として扱わず、取れる所は撮影日・解像度・雲量を取って Atlas からも読める。

## 欠陥（実測）
`pickForTime` は「最新」型（Esri・地理院最新・USGS・swisstopo）に「現在の年なら exact」、年代型（地理院 1974–78 など）に「範囲内なら exact」と返していた。
`exact` は「その供給元がその時刻に答えを持つ」の意味で、**その画像の撮影日がその日である**という意味ではない。しかし順位づけは `exact` を最優先にしていたので、
Chronos を 2026-03-01 にすると撮影日が 2019 年かもしれない Esri 画像が先頭に来て、1976-05-05 を指すと「1974–78 のどこか」の 1 枚が「その日の画像」として並んだ。

## 直し
- `basisOf(source, pick)`: 画像の日付が指定時刻に対して何であるかを 5 種（`day`・`year`・`nearest-year`・`range`・`current`）で述べる。**`day` だけが「その日の画像」**。
  `pickForTime` の戻り値は変えていない（既存の検査と呼び出し元がそのまま読める）。
- `rankAt`: 今日以外の時刻を問うときは、日付が分かる画像（`day`・`year`）を、未確定の画像（`nearest-year`・`range`・`current`）より上に置く。今（時刻なし）は従来どおり最も鮮明なものが先頭。
- `clockMatchNote`: 一致させたあと「その日の画像ではありません。1974–78 のどこかで撮影」等を画面（トースト）と Atlas の応答に出す。時計が現在のときは出さない。
- 場所ごとの撮影時刻と雲量: NASA CMR-STAC（`HLSS30_2.0`/`HLSL30_2.0`、CORS 開放・実測 2026-11-20）から、地図中心・選んだ日の scene の `datetime` と `eo:cloud_cover` を取る。
  scene が 0 件なら「この日、この地点に画像はありません（衛星が通っていない。レイヤーは透明）」と述べる。**読めなかった場合は「無い」ではなく従来の「選んだ日」表示へ戻す**（観測できなかったことを無いと言わない）。
- 台帳 `scripts/outbound-hosts.json` の `cmr.earthdata.nasa.gov` の説明に、HLS 表示中の地図中心点と選んだ日が送られることを足し、`data/connection-ledger.json` を再生成。
- Atlas `data.imageryInfo` の説明と本体: 雲量・「その日の画像か」を行ごとに返す。

## 残り
MODIS/VIIRS は日次合成で雲量の欄を持たない。Esri 以外の「declared」型は場所別の撮影日を供給元が公開しない（地理院は写真索引が別にある）。

## perf の天井
async.raw が 14136 → 14220 kB（+84 kB）。内訳は main から入った atlas-orchestrate（82 kB）等の新しい遅延 chunk と、今回の imagery-atlas（3.6 kB）。起動時の読み込みには載らない遅延 chunk の増加で、天井を実測へ上げた。
生成ページ readiness.html は台帳の説明変更に合わせて `node scripts/org-pages.mjs --write` で再生成した。
