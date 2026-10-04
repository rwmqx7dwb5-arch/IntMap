---
title: ガイドの入口を 1 つに——設定の「チュートリアル」は、手書きの 4 レイヤーを 9 秒ずつ点ける専用の仕組みをやめ、作例から作ったツアーをツアー再生器で再生する
date: 2026-10-04
newsen: The Tutorial in Settings now plays as a tour, built from the example maps, in the same player as the classroom tours. Each step has words and a question.
newsjp: 設定の「チュートリアル」が、作例の地図から作ったツアーとして、授業ツアーと同じ再生器で進むようになりました。各ステップに説明と問いが付きます。
---

〈依頼〉 ガイドの入口が 3 つの仕組み（チュートリアル・授業ツアー・作例ギャラリー）に分かれていたのを 1 つにする。利用者は統合を承認済み。

## 0. 測った・読んだ

- `js/onboarding.js` の `_imStartDemo` は `SHOW`（手書きの 4 レイヤー: Köppen・夜間光・標高・人口密度）を 9 秒ごとに
  自動で点け、専用のピル（`#im-demo-pill`）と自前の後始末（全レイヤーを消す・ラベルを戻す）を持っていた。
  同じ「地図の状態に言葉を付けて順にたどる」ことを、`js/tour-player.js` が既に持っている。
- ⚠ **`index.html` に `#btn-tutorial` は無い**（R22「settings cleanup (tutorial/blueberry removed)」で外れた。`git show 37e8eb69`）。`js/app-body.js` のハンドラは `if(!tb) return` で何もせず、
  `_imStartDemo` は**どこからも呼ばれていなかった**＝チュートリアルは製品から到達できなかった。入口をどこに置くかは未決（報告に記す）。
- ⚠ **`index.html` に `#btn-tutorial` は無い**（R22「settings cleanup (tutorial/blueberry removed)」で外れた。`git show 37e8eb69`）。`js/app-body.js` のハンドラは
  `if(!tb) return` で何もせず、`_imStartDemo` は**どこからも呼ばれていなかった**＝チュートリアルは製品から到達できなかった。入口をどこに置くかは未決（報告に記す）。
- 非強制（初回自動）の呼び出し元は、ウェルカムカードを止めた時点（#18）から**どこにも無い**。呼ばれるのは設定の
  `#btn-tutorial`（force=true）だけ。

## 1. したこと

- `js/showcase.js` の作例 4 件（ring-of-fire・koppen・population-density・night-lights）に `guide: true`。
- `js/tours.js` に `guideTour()`／`GUIDE_TOUR_ID`: `guide` の付いた作例から、タイトル・説明（blurb）・問い・撮影済みリンクをそのまま
  段にする。`TOURS` には入れない（授業ではない。教員ページ・一覧に出ない）。
- `js/tour-player.js` の `tourFor` が `guide` を解く。`?tour=guide` で再読み込みできる。
- `js/onboarding.js`: `SHOW`・ピル・タイマー・後始末を畳み、`_imStartDemo` はツアーを始める「入口」だけになった。
  「一度だけ（`intmap_demo_seen`）・スマホでは出さない・主題レイヤーが既にオンなら出さない」は入口に残した。
- `js/app-body.js`: 設定のボタンは同じ入口を呼ぶ。`_imDemoStop` の呼び出しを除いた（再生器が終了と元の地図への復帰を持つ）。

## 2. 変わる挙動

- 標高（段彩）の段は無くなった（作例に標高の作例が無い）。代わりに火山とプレート境界が入る。作例に標高が加われば `guide: true` 一語で戻る。
- 各段に説明と問いが付く（作例の文）。終了すると、再生器が始める前の地図へ戻す。

## 3. 残したもの

- `window._imDemoActive` を読む箇所（`js/data-layers.js`・`js/map-ui.js`）は、もう誰も立てないので常に偽。`js/map-ui.js` は別作業の領分なので触っていない。
