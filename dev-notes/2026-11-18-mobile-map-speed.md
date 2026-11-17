---
title: スマホの地図——地名グリフをその字の書体で一度だけ描いて端末に残し、星空の GL canvas を毎フレーム複写しない
date: 2026-11-18
newsen: On phones the map no longer redraws Japanese, Chinese and Korean place names every time you open it — they are kept on the device — and moving the map no longer copies the star sky every frame.
newsjp: スマホで、日本語・中国語・韓国語の地名の文字を開くたびに描き直さず端末に保持するようにしました。地図を動かすたびに星空を複写する処理も無くしました。
---

〈依頼〉「スマホ版で地図が遅すぎる。爆速にしろ。」

## 0. 測った（本番・390×844・DPR 3・CPU ×4・携帯の UA・実 GPU）

- 指の操作（タッチの pan と pinch）の CPU プロファイル（sourcemap で元のファイルへ）: 忙しい時間のうち地図の描画 56 %、
  **ブラウザが描く地名グリフ（TinySDF）10.5 %**、アプリの毎フレームの仕事 6.7 %。
- 地図の描画そのものは固定の 240 フレームを同期で描かせて最小値で 5.3 ms/フレーム（1×）。層を外しても 4.0〜4.4 ms
  （衛星画像だけで 4.1 ms）——1 フレームの描画は主因ではない。静止中に描き続けることも無い（5 秒で 0〜7 回）。
- 日本・韓国・中国の 6 地点を回ると、グリフを **2,381 回・1 回 4.2 ms（CPU ×4）＝10 秒**描いていた。同じ字・同じ書体の
  2 回目が 450 回。2 回目の訪問でも 2,407 回（15.9 s）——毎回ゼロから描いていた。
- 原因: MapLibre は `document.fonts.load(font)` を**文字無しで**待つので、unicode-range の subset が届く前に代替書体で描き、
  届いた時点で作り直して、その字を使う記号タイルを全部レイアウトし直していた。
- SwiftShader（GPU 無し）では、星空の WebGL canvas を 2D canvas へ毎フレーム `drawImage` する 1 行が 216 s 中 55.3 s・4.4 fps。

## 1. 直したこと

1. **その字の書体で 1 回だけ描く**（`js/geo-engine.js` `_drawWithItsFace`）: 描く前に `document.fonts.load(font, 字)`。待つのは
   CSS の font-display の block period（100 ms）だけ——4G 相当で subset は中央値 2.3 s かかる（初回 121 本・同時取得）ので、
   それを待つと初回の地名が秒単位で遅れる。書体で描けた字は印を付け、書体の到着で作り直さない（新しい family は従来どおり全部）。
2. **端末に残す**（新しい `js/glyph-store.js`）: 書体で描けた字の SDF と寸法を IndexedDB に。鍵はフォント文字列・言語・canvas・
   buffer・radius・cutoff・字。有効期間は Google Fonts の CSS の `max-age=86400`（版付きのファイル名を指す期間）。保存先が無ければ何もしない。
3. **星空の GL canvas をそのまま表示**（`js/space-sky.js`・`css/intmap.css`）: `#space-stars` を `#space-canvas` の直下に置き、複写をやめた。

## 2. 効果（同じ機械で本番と新 build を同じ手順で）

| | 1 回目の訪問 | 2 回目の訪問 |
|---|---|---|
| 本番 | 2,381 回・12.8 s | 2,407 回・15.9 s |
| 新 | 1,931 回・9.8 s | **0 回・0 s** |

（CPU ×4 のグリフ描画の CPU 時間。2 回目のソウルの地名は本番と見た目が同じことをスクリーンショットで確認。星空も表示される。）

## 3. やらなかったこと・残り

- 起動（本番で CPU ×4 のとき 12.5 s）は多数のモジュールに薄く分散していて、この回では触っていない。
- 空のデータソース（10 個の空の GeoJSON）を描画から外すと 1 フレーム約 0.5〜0.9 ms 減るが、`used` の管理を MapLibre の内部で
  正しく保つ設計が要るので見送った。
- 否定された見立て: 夜側の街明かり・空の色の書き換え（13 回/秒）・モバイルのパネル追従の観測者は、厳密に測ると差が雑音以下
  （最後のは試験手法の `jumpTo` が起こしていただけで、実際のタッチでは毎フレーム起きない）。
