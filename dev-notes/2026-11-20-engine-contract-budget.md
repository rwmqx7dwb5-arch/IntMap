---
title: Cesium のスタイル演算子を 4 つ足し、描画方法の選択と 3D Tiles の端末別予算を共通契約にした
date: 2026-11-20
newsen: The 3D globe now evaluates more map-style expressions and sizes its 3D city streaming to the device.
newsjp: 3D 地球儀が対応する地図スタイル式が増え、3D 都市モデルの読み込み量が端末に合わせて調整されるようになりました。
---

〈依頼〉 外部監査 5.8/5.13: MapLibre と Cesium の差を共通契約で扱う。#1284 の続きで未実装演算子を実装し、エンジン固有能力は明示、できないときは別の描画方法を選べる設計、3D 都市の端末別負荷調整。

## 0. 測った
- `UNSUPPORTED` の 8 演算子のうち、app が書くのは #1284 時点で `distance` のみ（掃引で再確認、検査が見張る）。
- 3D Tiles の予算は `/Mobi|Android…/` の二分で、メモリの少ない PC・省データ端末が `high` と同じ 384 MiB を与えられていた。
- **未測**: `mid`／`low` 層の数は比例で置いた値で、その端末での実測はしていない（`tileset-budget.js` に失効条件を書いた）。WebGL を使う実描画の再計測もこの回では行っていない。

## 1. 直した・足した
- `collator`（比較演算子の第 3 引数）・`resolved-locale`・`number-format`・`within` を実装（Intl／ray casting）。`within` は地物ごと評価。残る `format`/`image` は中身に縮退、`pitch`/`distance-from-center` はカメラ値が文脈に無いので未実装のまま、全部 app が書かないことを検査が見張る。
- `js/render-plan.js` と facade の `plan()`: 候補を良い順に並べ、エンジンの能力で選ぶ。PLATEAU の可否判定をこれに載せた（挙動は同じ）。
- `js/tileset-budget.js`: 端末層（low/mobile/mid/high）。`high`・`mobile` は従来値と同一なので既存端末の挙動は変わらず、メモリ・コアの少ない端末だけ下がる。`_governTilesets` の SSE 上限も層から。
- 検査: `tests/engine-render-plan-checks.test.mjs`（新）、`cesium-style-parity-checks`（拡張）。

## 2. 性能天井を上げた理由（CI の perf-budget が実測した増加）
- `eager.modules` 912→913: `js/render-plan.js`（facade の `plan()` が使う純粋関数 1 本）。起動時に読む。
- async チャンク `cesium-style` 15.3→18.2 kB: Cesium でしか読まれない遅延チャンク。`within`・`collator`・`number-format` の実装分で、MapLibre の起動には影響しない。
