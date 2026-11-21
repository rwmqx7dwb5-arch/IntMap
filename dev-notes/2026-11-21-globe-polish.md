---
title: 地図の描画解像度が起動時の devicePixelRatio に固定されていた——ブラウザのズーム・モニタ移動の後にラベルと国境がぼやけたまま
date: 2026-11-21
newsen: Place names and borders stay sharp after you zoom the browser or move the window to another display.
newsjp: ブラウザのズームやウィンドウのモニタ間移動のあとも、地名と国境線がぼやけず鮮明なままになりました。
---

〈依頼〉地球表現の完成度（ラベルの画質・昼夜と大気・国境色の環境差・3D 都市モデル）。本記録は 1 と 3 の一部。

## 0. 測った

- プレビュー（dpr 1.5）で `map.getPixelRatio()` が 1、canvas 1024px / CSS 1024px。描画は 1× で、合成器が引き伸ばしていた。
- 原因は MapLibre 6.18 の `getPixelRatio()` = `_overridePixelRatio ?? devicePixelRatio`（`src/ui/map.ts`）。
  `js/app-body.js` は `pixelRatio` を明示するため、起動時の値に固定され、`resize` でも読み直されない。
- 実機の経路: Ctrl +/-（ブラウザのズーム）・別モニタへのドラッグは dpr を変えるが、地図は古い解像度のまま。
  ベクタのラベル・グリフ・線はすべて pixelRatio で解像度が決まるので、地名がぼやける。

## 1. 直した

`js/app-body.js` の `followDevicePixelRatio`: `(resolution: Ndppx)` の change と `resize` で `setPixelRatio` を呼び直す。
スマホの上限 2 は同じ規則。`GE().render.setRenderScale` など他者が設定した値は上書きしない（自分が最後に適用した値のときだけ置換）。
回帰: `tests/globe-polish.spec.js`（dpr 1→2 に実行中に変えて canvas が 2× になること）。

## 2. 直していないもの（正直に）

- 昼夜の夜側が出ない件・大気: PR #1355 が担当（起動時の描画準備の遅れ）。重複を避け本件では触れない。
- 国境線の色の環境差: 再現条件を特定できていない。dpr 1 / 1.5 / 2 で国境線のピクセル数は dpr に比例し、平均輝度は同等
  （zoom 2〜5・MapLibre）。残る候補は Cesium 側・GPU/ANGLE・ダークテーマ。環境名つきの報告が要る。
- ラスタータイル（衛星）の 2x 選択 `_hiDPITiles` は起動時 1 回の判定のまま（dpr 変化では切り替わらない）。
- 3D 都市モデルの被覆と安定性: 未着手。
