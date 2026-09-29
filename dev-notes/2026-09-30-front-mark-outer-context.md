---
title: 地名検索の結果をクリックしても地図が動かなかった——「触ったパネルを最前面に」の印が、親の重なり文脈に閉じ込められた内側の要素に付いていた
date: 2026-09-30
---

〈依頼〉 監査の本番検証（#823 の確認）で見つかった。#823 で結果は**見える**ようになったが、マウスで**選べ**なかった。

## 0. 測った

本番 6cd2402、1280x800、新しい訪問者の既定配置（Köppen の凡例が結果一覧の真下）。結果の行に pointerdown すると `js/map-ui.js` の `_wireFrontMost` が `body.im-float-front` を付け、凡例 `#koppen-legend`（z 1100）が検索欄 `#map-search`（z 1002）の上に来る。pointerup は凡例の H4 に落ち、click は地図へ行き、`js/app-body.js` の外側クリック処理が一覧を閉じて `gotoPlace` は呼ばれない。行の `onclick()` を直接呼ぶと flyTo もピンも正常——検索は壊れていない。

## 1. 原因（1 件の事例ではなく規則）

`panelOf()` は「最初の positioned 祖先」を印の置き場にしていた。それは `#ms-results`（absolute）で、`.im-front` の 2650 はそこに付いた。だが `#ms-results` は fixed・z-index 付きの `#map-search` の中にあり、**子の z-index は親の重なり文脈から出られない**。印は付いたのに効かず、同時に `im-float-front` は他のパネルを引き上げた。検索欄に限らず、重なり文脈を作る入れ子の中で押されたものはすべて同じ形。

## 2. 直した

最初の positioned 祖先を見つけた後も上へ歩き、**重なり文脈を作り、z-index を取れる祖先**（fixed/sticky、または z-index・transform・filter・opacity を持つ absolute/relative）があれば印をそこへ移す。一番外側が帯の中で競う要素。地図と外殻（`_NOT_PANEL`）では、それまでに見つけたものを返して止まる（MapLibre のポップアップは今までどおりポップアップ自身）。検索欄の特例は書いていない。

## 3. 検査

`tests/map-a11y-structure.spec.js` ⑥——同じ起動の中で、結果の行の上に z 1100 の fixed パネル（凡例の代わり）を置き、行へ実際に pointerdown を送り、印が `#map-search` に付くこと・その後の同じ点が行自身であることを測る。旧 `panelOf` で赤（印が一覧に付く）、新で緑を確認。`tests/r508.spec.js`（最前面化の既存 5 件）と `tests/smoke.spec.js`（55 件）も緑。`tests/hazard-other-dock-window-checks` R258 ⑧ は `return n` の綴りを固定していたので、同じ主張（z-index を持つ relative はパネル）を新しい形で読むよう直した。
