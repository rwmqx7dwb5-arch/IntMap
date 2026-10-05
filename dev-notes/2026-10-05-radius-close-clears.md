---
title: Radius だけ、ウィンドウを閉じても円が地図に残っていた——ツールを離れたら確定していない円を消す
date: 2026-10-05
newsen: Closing the Radius tool (or switching to another tool) now removes its circles, like Distance/area and 3-D volume; use Done to keep them.
newsjp: Radius ツールを閉じる（または別のツールに切り替える）と、距離・面積や 3D 体積と同じく円が消えるようになりました。残したいときは「完了」を押してください。
---

〈依頼〉「この中で、Radiusだけウィンドウを消しても消えないのはキモイ。」（Measure メニュー: Distance / area・Draw・Radius・3-D volume）

## 0. 読んだ
`exitTool` は計測の点（`measurePoints=[]`）と 3D 体積の箱（`release()`）を捨てるが、半径の円は `radiusItems` にあり、`buildToolFeatures` はツールの状態に関係なくそれを描く。ウィンドウを閉じると、編集も削除もできない円だけが地図に残っていた。

## 1. 直したもの（`js/app-body.js`）
- `_leaveRadius()`: 半径ツールから離れるとき（閉じる・別のツールを選ぶ）に `radiusItems` を空にする。円を残す方法はパネルの「完了」（`_finalizeMeasurement`）で、地図の注釈として書いてから離れる——距離・面積と同じ。

## 2. 検査
- `tests/r147.spec.js` `radius-close-clears`: 円を 2 つ置いて × で閉じると `tool-source` が空、半径から計測ツールへ切り替えても空。
