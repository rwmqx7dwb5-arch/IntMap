---
title: 本番検証の残り 2 つ——比較ウィンドウの辺のカーソルが地図の上で「つかむ」のまま／読み込み中の地図にデータスタジオが「平面地図に切り替えて」と言った
date: 2026-10-04
newsen: The resize cursor now shows along the whole edge of the compare window, and the data studio waits for the map to finish loading instead of asking you to switch views.
newsjp: 比較ウィンドウの辺のどこでもリサイズのカーソルが出るようになり、データスタジオは地図の読み込みが終わるのを待つようになりました（表示の切り替えを求めません）。
---

〈依頼〉 #983（data-studio）・#981（compare-window-resize）・#987 の本番検証（ビルド印 `2026-10-04T13:13:12Z-fe85aaf`）で見つかった残り。

## 0. 測った（本番）

- 比較ウィンドウ: 左の辺を外へ 150 px 引くと幅 441 → 593 px（直っている）。ただし辺の縦の中央（地図の canvas の上）ではカーソルが `grab`。
  上から 60 px（見出しの上）では `ew-resize`。
- データスタジオ: 共有リンクを、描画の止まったタブで開くと「この地図表示では結果を描けません。平面地図に切り替えてください」。描画の動くタブでは
  正しく 5 階級・6 か国。ローカルでも同じ形を実測した: `addSource` が MapLibre の «Style is not done loading» で投げていた。

## 1. 直したこと

- `js/window-manager.js` `addEdgeResize`: 辺の帯にいる間だけ窓に `im-edge-hover` を付け、`.im-edge-hover *{cursor:inherit !important}` で子
  （地図の canvas）にも窓のカーソルを継がせる。ワークスペースの窓が #R107 で同じ問題に出した答え（`.rz-hover`）を、辺リサイズを求める全ての窓へ。
  class はカーソルが変わったときだけ書く（#R311: hover で style 属性を揺らさない）。
- `js/data-studio.js`: 描く前にエンジンへ「描けるか」を訊き（`canDraw`）、まだなら「地図の読み込みが終わるのを待っています…」と述べて
  `whenCanDraw()` を待つ。投影についての助言は、スタイルを持った描画器が拒んだときだけになる。

## 2. 検査

`tests/studio-wait-edge-cursor-checks.test.mjs` ① 継承の規則・帯で class を付け・離れて外す・カーソルが変わったときだけ ② 描く前に待ち、待つと述べる。
