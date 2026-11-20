---
title: 混雑した PC での地図のパンを測り直し、全球の下地タイルの作成を描画スレッドから外した／計測器に --cpu と --cpuprofile を足した
date: 2026-11-20
newsen: The whole-earth satellite floor is now built off the thread that draws the map, which takes a share of the work out of every pan.
newsjp: 全球の衛星下地を地図を描くスレッドの外で作るようにし、パンのたびの処理を減らしました。
---

〈依頼〉「パン・スクロールが遅い。PC が混んでいると使い物にならず、Google Earth は滑らか。地図以外も重い」。
⚠ 「速度のために見た目を勝手に落とす機構」は #R229 で利用者の指示により全削除済み。再導入の可否を訊き、
**「落とさない」**と回答を得た。以降は見た目を変えず実処理だけを減らす。

## 0. 測った（デスクトップ 1280×800・Intel Arc・`scripts/map-motion.mjs`、機械は他の負荷で 65〜90% 使用中）

| 条件 | フレーム（wheel / drag） |
|---|---|
| CPU ×1 | p50 16.7 ms・hitch 0（60 fps） |
| CPU ×6（`--cpu 6`、起動後に絞る） | p50 150〜183 ms / 100〜250 ms（約 5〜7 fps） |

- 放置状態は 10 秒で CPU 373 ms（97% idle）。**常時動いている処理が重いのではなく、操作 1 フレームの仕事が重い。**
- 1 フレームの GL は 約 380〜470 draw・bufferData 50〜107・bindTexture 180〜400（可視 53 レイヤー）。
  bufferData の出所は MapLibre の `Gd.upload`（描画ごとのバッファ更新）で、アプリ側の再アップロードではない。
- ×6 の主スレッド自己時間（`--cpuprofile`）でアプリ側に帰せられたもの:
  タイニー SDF の CJK 字形（`measureText` 0.9〜1.2 s）、ベクタタイル復号（`pbf readString→decode` 0.7〜1.0 s）、
  `js/world-base.js` の下地タイル（`drawImage`＋`createImageBitmap` 0.5〜1.2 s）。

## 1. 直したもの

- 全球の下地タイル（Mercator 1 枚＝512 行の `drawImage`）を `js/world-floor-tile.js` の 1 関数にし、
  衛星 worker（`src/sat-worker.js`）が OffscreenCanvas で作る。写しは作らず、worker が無い環境では
  `js/world-base.js` が同じ関数を主スレッドで呼ぶ。絵は同じ（同じ関数・同じ入力）。
- ×6 の同条件 3 反復で、`world-base.js` の主スレッド時間は 523 ms → 0。run 全体 35.2 s → 29.9 s（機械が混んでおり誤差大）。
  **フレーム p50 の差は誤差の範囲で、これだけでは体感は変わらない。**
- `map-motion.mjs` に `--cpu N` と `--cpuprofile` を足した（混雑時の再現と関数別の自己時間）。

## 2. 直していないもの（次の仕事）

- **描画命令の本数が支配項。** ×6 で MapLibre の 1 フレーム自体が約 100 ms。減らすには 18 の line と 13 の circle と 16 の symbol を
  どう描くか（レイヤーの統合・空レイヤーの除外）を設計し直す必要があり、見た目の同一性を測りながら行う別作業。
- CJK 字形の `measureText`（MapLibre が同梱する `@mapbox/tiny-sdf`）。字形を事前に焼く案は見た目が変わらないが、配信量が増える。
- 主スレッドでのベクタタイル復号（呼び出し元の特定が未了）。
