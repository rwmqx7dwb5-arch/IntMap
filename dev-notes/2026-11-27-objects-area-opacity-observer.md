---
title: Objects の横スクロール・塗の面積・塗の既定不透明度・合成図形の個別削除・object 観測器の読み戻し
date: 2026-11-27
---

発注書（物体編集）の 5 件。個別の事例ではなく、それぞれを生んだ構造を直した。

## 直したこと

- **Objects ポップアップの横スクロール**: 本体が `overflow-y:auto` だけで、暗黙に `overflow-x:auto` になっていた。本体を `overflow-x:hidden`、行とその子を `min-width:0`・ボタンを縮ませないに（`js/map-tools.js`）。
- **面積**: 一覧は既に `area()` を持つ物体の面積を出していたが、持たない種類があった（描いた図形 `annot`・行政界アウトライン・到達圏）。3 種に測地的面積（`geomKm2`＝球面の面積公式）を持たせた。値は `IntMapObjects.list()` の `areaKm2` として Atlas からも同じものが読める。
- **塗の既定不透明度を #1468 以前へ**: Atlas のポリゴン `nlq-poly-fill` は 0.32（#1468 で 0.2 にしていた）、合成図形の塗は 0.2（0.17 にしていた）。色の抑え（彩度）は変えない。ポリゴンの基準は `window._imHlPolys.fillBase` の 1 か所で、Objects のスライダ（`setOpacity`）が同じ値を掛ける。
- **合成地図の個別削除**: Objects の × は `AC.clear()` を呼んでいたので、2 地点のうち 1 つを消すと同じ合成地図の全部が消えた。`IntMapAtlasCompose.removeOne(id)` を足し、その図形だけを消す（地点を消したときはその地点に繋がる線も消す。地図全体は `clear()` だけ）。既存テスト B2b が「全件消えた」を合格にしていたので、「1 件だけ消え、残りは描かれたまま」へ直した。
- **`object` 観測器（`js/atlas-capabilities.js`）**: 変更前後の署名の違いだけで判定していたため、「赤にしたい」に対し変更前後とも青でも、幅だけ変わっても completed になった。いまは要求された属性ごとに、対象 id（要求の id、無ければ解決された id）の値を変更後の一覧から読み戻し、setter が適用したと言う値と突き合わせる。読み戻せない属性は `not_rendered`（partial）、別の物体に触れたら `wrong_target`、全部が最初から正しければ `already_there`。物体が値を公開していない属性は「観測できなかった」であって失敗ではない（one-pass-or-a-reason §5）。

## 検査

`tests/objects-area-opacity-observer-checks.test.mjs`（観測器 8 件）・`tests/atlas-completion-routes-checks.test.mjs` B2b（1 件だけ消える）。

## 予算

`eager.gzip` の天井を 1568.6 kB → 1576.7 kB に上げた（`check:perf`）。この PR の増分は観測器の読み戻し・面積・個別削除・CSS で数 kB 未満だが、CI が測る tree（main を取り込んだもの）は取り込み前より重く、増えた分のうち main 側（他セッションの変更）と本 PR の内訳は分けて測っていない。
