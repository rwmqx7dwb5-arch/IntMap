---
title: 無制限チルトで見上げるドラッグが 90° で止まっていた——MapLibre 6.13 が地下補正の内部名と返り値を変え、修理が静かに外れていた／台風の目の smoke は地名の上の画素を読んでいた
date: 2026-10-13
newsen: With unlimited tilt on, dragging to look up past the horizon works again; since the MapLibre 6.13 update it stopped at exactly 90 degrees.
newsjp: 傾きの制限を外したとき、地平線より上を見上げるドラッグが再び効くようになりました。MapLibre 6.13 への更新以降、ちょうど 90° で止まっていました。
---

〈依頼〉本番デプロイ後の smoke が 2026-10-11 以降、毎回 `(#R179) …LOOKING UP` と `(#R276) …a real cyclone` で落ちる。根本原因を突き止めて直す。

## 0. 測った

- **見上げ**: 6.13 の build で `tests/r179.spec.js`（deep tier）を走らせると 24 件中 18 件が赤。見上げる全ケースで
  pitch がちょうど **90.0**、`eyePivotDiag().underGuard` は `'n/a'`、`cam._elevateCameraIfInsideTerrain is not a function`。
  smoke の CI 履歴でも 9938d17f（6.12.0）までは見上げは緑で、854b8b17（6.13 をソースから）以降が赤。
- 6.11.2・6.12.0 の配布物には `_elevateCameraIfInsideTerrain` があり、6.13.0 の `src/ui/camera.ts` には無い。
  6.13 は `_raiseCameraByPitchAndZoom(tr) → ITransform` に置き換え（空のままなら `tr` 自身、直すなら複製を返す）、
  `applyUpdatedTransform` は `_keepCameraAboveTerrain(tr)` 経由で**要求状態そのもの**を渡す（6.12 は複製を渡していた）。
  順序（補正 → `transformCameraUpdate`）は同じ。
- **台風の目**: 落ちた 4 回（10-11）はどれも実在の台風（19°N 105°W・39 m/s）を見つけていた。読んだ画素は
  `[10,7,12]`・`[21,19,22]`・`[212,210,213]`——色表のどこにも無い黒と白。失敗時のスクリーンショットでは、目が
  マンサニージョの地名・縁取り・海岸線の真下にあった（style はこれらを風のラスタより**上**に描く）。10-12 以降は
  台風が外洋に移って緑。**「観測できない」でも退行でもなく、観測器が地名の画素を風の色として読んでいた。**

## 1. 直したこと

- `js/geo-engine.js`: 修理の対象名を 1 か所の定数 `_UG_NAME='_raiseCameraByPitchAndZoom'` にし、6.13 の契約で書き直した
  （「渡したものがそのまま返る」＝問題なし。保持する標高は**複製**に載せて判定し、要求状態には書かない——6.12 で
  そうだったことを保つ）。`eyePivotDiag()` が `underGuardName` を述べ、ブラウザの探針は名前を写さずそれに訊く。
- `tests/look-up-gesture-checks.test.mjs`（新規・速い）: build がコンパイルする MapLibre のソースに、アダプタが名指す
  メソッドがあり、transform を返し、`applyUpdatedTransform` が `transformCameraUpdate` より前にそこへ届くこと。
  名前を旧名へ戻すと赤くなることを確かめた。見上げのドラッグを行う spec は deep tier なので版上げの PR では走らず、
  この欠陥を拾う速い読み手が無かった。
- `tests/r179.spec.js`: ③④ の探針を新しい名前（診断から）と新しい返り値に合わせ、「要求状態が書き換わらない」を足した。
- `tests/prod-smoke.spec.js`（台風）: 同じ 1 フレームを、風のラスタより上に見えている層を全部隠してもう一度描き、
  **2 枚が一致する点だけ**を候補にする（層名も余白も書かない。描画器に訊く）。判定は利用者が見る方の画素で行うので、
  ラスタ全体に何かを重ねる退行（#R276 の 0.36× の灰）は一致する点が残らず、その旨を述べて赤くなる。

## 2. 検査

- `IM_TIER=all npx playwright test tests/r179.spec.js`（build 済み dist）: 修正前 18 失敗 → 修正後 **24/24 緑**。
- `tests/prod-smoke.spec.js` の見上げ・風・台風の 3 件をローカル build に向けて: 緑。見上げ **135.0°・視点の移動 0 m**。
  台風は同じ時刻の別の嵐（20.4°N 106.6°W、海岸の近く）で、**119 点が地名や線の下として除かれ**、842 点から組を選んだ。
- `node --test tests/look-up-gesture-checks.test.mjs`、`check:static`・`check:engine`・`check:types`・`check:docs`。

## 3. 残り

- `tests/prod-smoke.spec.js` の `(#R276) prod draws the wind from the model` も画面中央の 1 画素を読み、上に載る層を
  確かめていない。外洋（150°E 20°N）なので今は当たらないが、同じ形である。
