---
title: 描けたレイヤーの記録が「描画できませんでした」と述べていた——状態 ok に失敗の文
date: 2026-10-11
---

〈きっかけ〉#1065（衛星カタログの更新）の本番検証（2026-10-11）で、Live satellites を ON にして 6,574 機が
描かれているのに、レイヤーの記録は state «ok» と並んで detail «The layer could not be drawn» を返していた。

## 0. 測った・原因

`js/layer-state.js` の `pub()`（`get(id)` と `snapshot()` が返す形）は、`detail` を**状態を見ずに**
`words().detail(rec)` で作っていた。その関数の既定の枝は reason の無い失敗の文
「The layer could not be drawn」なので、reason を持たない ok と loading の記録は全部「描けなかった」と述べた。
行の印（`markFace`）は 3 状態だけに文を付けていたので画面の行には出ていなかったが、
**Atlas は `layerStates` でこの snapshot を読む**——成功を失敗のように報告する観測器
（`.agents/rules/one-pass-or-a-reason.md` §2 の 1）。

## 1. 直し方

- 「何かを述べる状態」（failed / unobserved / nodata）を `SPEAKS` として 1 か所に書き、
  行の印・記録の `detail`・作り直されたタイルを見張るかの判定（同じ 3 状態を写していた 2 か所）をそれで決める。
  ok と loading の `detail` は `null`。
- `js/service-status.js`（状態ページの「問題」の行）も同じ 3 状態を写していた。このファイルは
  `sources.html` に生のまま読まれるので layer モジュールを import できない
  （`tests/shell-experience-checks.test.mjs` ⑧ が止めた）。そこで規則を写さず、
  **記録自身が文を持つか**（`detail == null` でないか）を読む——判断する場所は owner の 1 か所になった。

## 2. 検査

- `tests/layer-state-ok-says-nothing-checks.test.mjs`（新規・owner を評価）: ok と loading は文を持たず、
  3 状態は持ち、snapshot の全記録で「文がある ⇔ SPEAKS」。修正を外すと落ちることを確かめた。
- 既存の `layer-failure-state-checks`・`shell-experience-checks` は緑。
