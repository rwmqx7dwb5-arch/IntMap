---
title: 比較ウィンドウが右下だけ画面外へ埋もれ、上辺のリサイズでヘッダの移動も始まっていた——4 辺を 1 つの規則で画面内に留め、時刻の札の重複表示をやめた
date: 2026-10-05
newsen: The compare window now stays fully on screen on every side, resizing from its top edge no longer drags it around, and its time badge shows one label when both maps are at the same moment.
newsjp: 比較ウィンドウが四辺とも画面内に留まるようになり、上辺でのリサイズで勝手に動かなくなりました。両方の地図が同じ時刻のときは時刻の札を 1 つだけ表示します。
---

〈依頼〉「compare viewのリサイズ、挙動がバグってるし、ウィンドウは画面左上にはそれ以上外に行かないようにちゃんとなってるのに、右下には埋もれてしまうのが気持ち悪い」「そして謎のToday/Today表示」（右下方向と訂正あり）。

## 0. 測った（ビルド済みの main 相当・1280×800・合成 PointerEvent）

- ヘッダを右下へドラッグ → `[1220,770,1661,1111]`。左・上は `_sbRight()` と 0 で止めていたが、右・下は `innerWidth-60` / `innerHeight-30`（「60/30 px 見えていればよい」）だった。
- 上辺の中央（ヘッダと重なる 9 px の帯）で上へ 50 px → リサイズとヘッダの移動が**同時に**始まる。ヘッダの listener が先に走って `drag=true` とポインタ捕捉を取り、次に `addEdgeResize` が捕捉を奪うので、ヘッダの `pointerup` は届かない。離した後、ボタンを押さずにヘッダ上を動かしただけでウィンドウが 121 px 左・197 px 下へ動いた。
- 辺を掴むたびに幅と高さが 2 px 増えた（`width` に外寸を書くが比較窓は content-box で border 1 px）。
- 時刻の札は「このウィンドウ｜メイン地図」を常に 2 つ並べ、従っているときは `Today|Today`。

## 1. 直したもの

- **位置の規則を 1 つに**（`js/compare.js` `_fitPos`）: 箱全体が画面内、左端はサイドバーの右。ヘッダの移動と `_cmpReclamp`（サイドバーの変化に加え、`window` の `resize` でも呼ぶ）が同じ関数に訊く。以前の `_cmpReclamp` はサイドバーとの重なりしか見ていなかった。
- **押下の持ち主**: ヘッダは、`addEdgeResize` の `edgeAt` がその点を辺と答えるなら移動を始めない。`buttons` の無い `pointermove` と `lostpointercapture` でも移動を終える（捕捉を奪われても状態が残らない）。
- **辺のリサイズは画面の端で止まる**（`js/window-manager.js` `addEdgeResize`）: 境界は offset parent の箱、`opts.bounds()` が辺を狭める（比較窓は左をサイドバーへ）。最小寸法は境界より優先。共通部品なので Atlas のウィンドウ・経路カードにも効く——「端を掴んで画面外まで広げると、その端（戻す唯一の取っ手）も画面外へ行く」は同じだったため。
- 掴んだ時点で `box-sizing:border-box` を書く（外寸を書くのだから外寸として解釈させる）。
- 時刻の札: 2 つのラベルが同じなら 1 つだけ。違うときだけ「｜」で並べる。

## 2. 検査

- `tests/smoke.spec.js` の `compare-window-bounds`（新しい spec ファイルは起動費を払うので共有ページに 1 本）: 右下・左上への移動が画面内、上辺のリサイズで下端と幅が動かない、離した後のホバーで動かない、右下の角を画面外へ引いても画面内、札が同じ時刻で 1 つ・違う時刻で 2 つ。修正前の挙動では 5 つの期待が落ちる。
