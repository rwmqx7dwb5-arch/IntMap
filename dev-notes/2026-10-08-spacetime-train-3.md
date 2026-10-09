---
title: 時空間の 3 本（時計を親指で回す・この場所の地震の記録・「引用」）を 1 本の統合として着地させ、外していたブラウザ試験 4 本を戻す——能力表の生成器が前の表の重複を写していた
date: 2026-10-08
internal: 3 本の機能そのものの記録はそれぞれの dev-notes（mobile-product・live-news-product・sales-pro-audiences）にある。ここは統合で起きたことだけ
---

〈依頼〉利用者の全権委任で並行に作った商品 8 本のうち、能力（Atlas の能力表）を 1 つずつ足す 5 本は、どれか 1 本が main に入るたびに残りの
手書きの能力数・遅延チャンクの天井・評価の録画がずれる。必須チェックは strict ではないので、古い main の上で緑の PR が続けて入ると
main が赤になりうる。#1047 → #1044 を 1 本ずつ着地させ、残る #1046・#1048・#1049 はこの統合 1 本にまとめた（CI 1 回）。

## 1. 統合で解いた衝突

- `js/atlas-cap-time.js`: 3 本がそれぞれ足した能力の項目を全部並べた。地震の記録と時をまたぐ道のりが `time.coverage` の説明書の
  同じ位置 28 に断片を置いていた（`atlas-caps` が拒む）ので、地震の記録を 29 へ。
- `js/time-borders.js`: nightly 修正（#1051）の「国境の番」（`_turnClose`）と、「引用」の「表示中の形が答える日付」（`_drawnWhen`）を両立。
- `js/legal-text.js`: 3 本の改訂注記を全部残した。`data/governance-ledger.json` は `data-governance.mjs --update` で作り直した。

## 2. 能力表の生成器が、前の表の重複を写していた

main（#1044 の squash）と、#1044 の枝から切った統合を merge すると、生成物 `js/atlas-capabilities.js` の表に `time.polityArc` が 2 行残り、
`atlas-caps --write` は宣言が 1 つしか無いのに 223 行を書いた（宣言は 222）。`capabilityRows` は前の表の並びを引き継ぐとき id の重複を
除いていなかった。id は最初の位置で 1 回だけ取るように直した（`js/atlas-caps.js`）。回帰は `tests/spacetime-train-3-checks.test.mjs`。

## 3. 戻したブラウザ試験

#1047 が古い記入値 2 本の実測で空けた 68 s の中に、4 本を記入: hist-product 8・mobile-product 26・live-news-product 8・sales-pro-audiences 15
（どれも各担当が 1 worker で実測した値）。全体 87.3 min / 天井 87.5 min。
