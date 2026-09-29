---
title: 狭いデスクトップ配置で地名検索の結果が 1 件も見えなかった——検索欄の overflow:hidden が下に垂れる結果パネルまで切っていた
date: 2026-09-30
---

〈依頼〉 監査（2026-09-29）の本番検証で見つかった。依頼の主題そのもの（構造改革）ではないが、利用者が実際に踏む欠陥なので同じ流れで直した。

## 0. 測った

本番、1280x800、左サイドバーとレイヤーパネルを開いた状態（`body.ms-narrow`）で «Tokyo» を検索すると、`#ms-results` は `display:block` で 12 件を持つのに、その中央の `elementFromPoint` は Köppen の凡例か地図 canvas を返した。高さ 35 px の検索欄の外（y=63〜345）が切り取られていた。

## 1. 原因

`css/intmap.css` の `body.ms-narrow .map-search{ … overflow:hidden; … }`。#R65 が求めたのは「アンカーより広くならず、横に潰れる」ことで、それは横方向の話だった。`overflow:hidden` は両軸を切るので、`top:48px` に垂れる結果パネルも切った。このレイアウトでしか起きないので、広い画面の検査には一度も映らなかった。

## 2. 直した

`overflow-x:clip; overflow-y:visible`。`clip` は `hidden` と違って反対の軸をスクロール領域に変えないので、縦は見えたまま横だけ潰れる。z-index は変えていない（`tests/z-layers-baseline.json` は不変）。

## 3. 検査

`tests/map-a11y-structure.spec.js` ⑤——同じ 1280x800 の 1 回の起動の中で、`ms-narrow` の検索欄に結果を開き、その中央が結果パネル自身であること、欄が横に clip し最大幅を超えないことを測る。新しい spec にすると起動 1 回分（約 8 s）を予算に足すことになるので、③ と同じ「重なりと描画」の問いとしてここに置いた。旧 CSS では赤、直した CSS では緑を確認（単独 spec の段階で）。
