---
title: Atlas の操作で対象が複数一致したとき、入力を求めるはずが「失敗」と報告されていた——観測器が ok:false を先に見て、曖昧さの分岐に届かなかった。曖昧さを結果の事実として実行器の 1 か所で読む
date: 2026-09-29
---

〈依頼〉「IntMap、様々な側面から監査し、すべてやりきって。全部任せる。求めるのは修正ではなく改革」——ラウンド単位の検査を主題単位へ統合する作業（`2026-09-29-tests-by-topic.md`）で、綴りを読む検査を実行する形へ置き換えたときに見つかった。

## 0. 測った

- `js/atlas-controls.js` の `doControl` は、ほぼ同点の候補が 2 つ以上あると押さずに `{ok:false, meta:{code:'ambiguous_target', candidates}}` を返す（#R320）。
- `js/atlas-capabilities.js` の `control` 観測器は `raw.ok === false` を**先に**見て `failed` を返していたので、その下の「`ambiguous_target` なら `needs_input`」の分岐は**到達不能**だった。本物の実行器で 2 つ同名のボタンを作って実行すると `status: 'failed'`。
- #R320 の検査は `raw.meta.code === 'ambiguous_target'` という**綴りがあること**だけを見ていたので、分岐が死んでいても緑だった（#R488 の形）。
- 結果: Atlas は「押せなかった」と聞かされ、同じ操作を繰り返す。`.agents/rules/one-pass-or-a-reason.md` §2 ①「観測器が嘘をついた」——実際には失敗ではなく問いだった。

## 1. 直したこと

- 曖昧さは**結果が運ぶ事実**なので、観測器ごとの分岐順ではなく `js/atlas-executor.js` が**すべての能力について**、観測器の判定より前に読む。候補が 2 つ以上なら `needs_input`（code `ambiguous_target`・候補・`inputRequest.kind:'choice'`）。実行前の入力解決（手順 4 の `ambiguous`）と同じ形。
- 観測器側の到達不能な分岐は外し、なぜ要らないかを 1 行で残した（同じ判断を 2 か所に持たせない）。

## 2. 検査

`tests/atlas-ambiguous-is-not-failure-checks.test.mjs`——本物の `makeAtlasControls`・`makeAtlasCapabilities`・`installAtlasKernel` を組み、① 曖昧さを返す dispatch が `needs_input` と候補になる ② 本物の `doControl` に同名ボタン 2 つを与えると何も押さずに訊く ③ 普通の失敗は `failed` のまま。修正を戻すと ①② が赤くなることを確かめた。`tests/r320-checks` の綴りの照合は読む場所（実行器）に合わせた。
