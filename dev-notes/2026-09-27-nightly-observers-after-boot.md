---
title: 夜間 deep tier の赤 3 件は観測器だった——中継経由の要求にスタブが当たらず本番の株価を読んでいた／起動画面が早く消えるようになり、消えた要素の背景を読んでいた／共有リンクの # を保ったまま再読み込みしていた
date: 2026-09-27
---

〈依頼〉「IntMap, 様々な側面から監査し、すべてやりきって。」の続き。夜間 run 36268858774（head c1464e39）の
Deep rest 4/5 が 3 失敗 1 flaky。どれも前日に入った**正しい**製品変更（#739 公開 CORS プロキシの撤去・
#760 起動を `load` から `whenCanDraw` へ）に、試験の前提が追いついていなかった。製品のコードは変えていない。

## 0. 測った（成果物と trace から）

- `tests/r170.spec.js`「a live price is stamped with the quote's OWN time」: `price` が 225.5（スタブ）でなく
  **335.92**。#739 以降ブラウザの要求は `…/functions/v1/quotes-relay?u=https%3A%2F%2Fquery1…%2Fv8%2Ffinance%2Fspark…`
  だけになり、`**/v8/finance/spark**` の glob は URL エンコードされた `u` に当たらない。以前は生の URL を
  渡す公開プロキシが並走していたので当たっていた。**試験が本番の quotes-relay と本物の株価に依存していた。**
- `tests/r186.spec.js` 起動画面: `backgroundImage` が `""`。メインスレッドが 26 秒塞がれている間に起動画面が
  外され DOM から取り除かれ、取り除かれた要素の計算済みスタイルは空文字。画像は 1 回だけ配られていた。
- `tests/r186.spec.js` 既定値: climate が true。1 回目の起動が既定 ON の層を URL の `#…&l=` に書き、それが
  `page.reload()` より前に済むようになった。reload は `#` を保つので、設計どおり共有リンクがセッションに勝った。
- `tests/r379.spec.js` の 1 件は flaky（28.3 秒・Cesium の r185 と並走、再試行で緑）。原因は特定していない。

## 1. 直したもの

1. `tests/helpers/network.js` に `upstreamOf(url)`（我々の中継なら `u` を取り出す）と `routeUpstream(target, test, handler)`。
   スタブは**要求が本当は何を求めているか**で当てる。r170 はそれを使う。
2. r186 の起動画面は、同じ主張（内容ハッシュ付きの IntMap のマークを、2 つのうち 1 つだけ取得した）を
   **ネットワーク上の取得**で測る——起動画面がいつ消えても成り立つ。
3. r186 の既定値は `page.goto('/')`（`#` の無い次の起動）で読み直す。

## 2. 検査

`tests/nightly-observers-after-boot-checks.test.mjs`（`upstreamOf` をページ自身の `ownRelayUrl` が作った URL で評価）。
`IM_TIER=all npx playwright test tests/r170.spec.js tests/r186.spec.js` 21 件緑（r170 は 225.5 を読んだ＝スタブが中継経由で当たった）。
