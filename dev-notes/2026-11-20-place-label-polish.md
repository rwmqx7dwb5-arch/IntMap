---
title: 都市名の丸を撤去し、地名ラベルを約 9% 大きくした——画質と国境色は原因を特定できていない
date: 2026-11-20
newsen: City names no longer have a circle or double circle beside them, and place names are slightly larger.
newsjp: 都市名の横の丸・二重丸をやめ、地名ラベルを少し大きくしました。
---

〈依頼〉「都市名の中心に丸や二重丸があるのはおかしい。文字と被る。地名を少し大きく。画質が低い。国名は太字。国境線の色が前と違う。」

## 0. 測った
- `ofm-city-dot`（circle レイヤー）は点に固定で、名前だけが `text-variable-anchor` で動くため、左右の配置で重なった（実画面 日本・欧州 z5 で確認）。
- 国名は実画面で太字（Inter Bold グリフ）で描かれていた。変更不要。
- 国境のレイヤー（`borders-only-line` `#d9dbe0`・`borders-only-casing` 黒 35%）の実行時の値は定数どおり。11/16〜11/18 の境界・順序の変更（d7afc180・3f1c208d・7fa0985c）を読んだが、色を変えるものは見つからなかった。

## 1. 直したもの
- `js/place-labels.js`: `ofm-city-dot` を撤去。`ofm-city` は `text-anchor: center`（点そのものに名前を置く）。`applyLabelLang` の丸の再着色、`js/map-ui.js` のクリック・ホバー登録、`js/label-occlusion.js` と `js/data-layers.js` の一覧からも外した。同じ記号が要るなら、別レイヤーではなく同一 symbol の icon として作ること。
- `js/label-scale.js`: 地名の 4 曲線を約 1.09 倍（country 12/17→13/18.5、admin1 9.5/11.5→10.4/12.5、city 9.5..19.5→10.4..21.2、other 9/11→9.8/12）、`REF` も追随。地名以外（`SUB_REF`）は据え置き。

## 2. 検査
- `tests/city-label-size-checks.test.mjs` と `tests/labels-stack-and-scale-checks.test.mjs`: 「#R198 以前より小さい」の天井を 1.1 倍に（今回の要求が後の指示）。丸の検査は「丸レイヤーが無い・中央アンカー」に差し替え。

## 3. 未解決（隠さない）
- 画質（粗さ）: グリフの解像度・DPR を実測して直す作業は未了。
- 国境色: 「前」の見た目の基準が無く、原因を特定できていない。基準の画像か日付があれば二分探索できる。
