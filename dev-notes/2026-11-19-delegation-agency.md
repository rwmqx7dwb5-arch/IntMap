---
title: 委譲の枠を実際の子の数で数え、GIS の結果に取得した record を載せる
date: 2026-11-19
newsen: Delegating several map-analysis steps no longer trips the model-worker limit, and Atlas is told up front when verification needs more workers than allowed. GIS results now return the dataset's coordinate system, time, source and coverage.
newsjp: 地図分析の手順をいくつ委譲しても AI の子の上限に引っかからなくなり、検証を頼む依頼が上限を超えるときは最初に知らされます。GIS の結果には座標系・時点・出典・被覆が Atlas に返るようになりました。
---

〈依頼〉 外部の技術監査（2026-11-19）が挙げた委譲の不具合と不足の修正。実コードで当たったものを直す。

## 0. 測った（着手前の事実）

- `research.delegate` の事前判定は `tasks.length` を `maxChildren` と比べていた。サーバの数えるのは `ai_turns` に作られた子の行（`consume_ai_child_turn`）で、モデルを呼ばない `kind:"capability"` の仕事は行を作らない。既定上限 2 で、GIS の 3 件は子ゼロなのに `too_many_tasks` で拒まれた。
- `verify:true` の検証 worker は別の子の行になる。worker 2 + 検証 1 は 3 番目で `delegation_children` になり、仕事が済んだ後に拒否されていた。
- `data.gis` の `meta.gis` は `{op, dataset, count, drawn}` だけで、`gis-atlas.js` `datasetRow()` が作る record（`crs` `time` `origin` `coverage` `fields`）は `_gr.dataset` に在るのに捨てていた。

## 1. 直したもの

- 子の数 = worker の数 + `verify:true` の worker の数。能力タスクは数えない。超えるなら何も使う前に、内訳（`workers` `checkers`）つきで `too_many_tasks`。何を束ねるかは Atlas の判断で、機構は切らない。
- `meta.gis.record` に `datasetRow` をそのまま載せる（要約しない）。

## 2. 直していないもの（この記録の範囲外）

- 子が自分で IntMap の能力を選ぶループ、ブラウザを閉じても続く実行、`data.gis` の解析データセットの所有範囲（読み取り扱いだが registry に登録する）、地理的対象の識別子による統合。いずれもサーバの呼び出し上限・費用・migration を伴う。
- 監査の「検証モデルが応答しないときは続行する」は仕様（観測できなかったは失敗ではない）。

回帰: `tests/delegation-agency-checks.test.mjs`。
