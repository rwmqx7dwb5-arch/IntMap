---
title: 委譲した子が、許可された読み取り能力を自分で呼ぶ
date: 2026-11-19
newsen: A delegated research worker can now be granted read-only map capabilities and call them itself, look at the result and call again, before it answers. Each worker may make up to 8 requests, the last always kept for the answer.
newsjp: 委譲した調査の子に読み取り専用の地図の能力を許可でき、子が自分で呼び、結果を見てまた呼んでから答えるようになりました。子 1 体の呼び出しは最大 8 回で、最後の 1 回は必ず答えのために残します。
---

〈依頼〉 外部監査（2026-11-19）の P0「子 AI が IntMap を自律的に操作する」。上限は 3 → 8（利用者承認）、永続実行は今回やらない（利用者承認）。

## 0. 測った（着手前の事実）

- 子は Web 検索つきのモデルだけで、IntMap の能力は親 Atlas が名前と引数を決めた `kind:"capability"` の仕事としてしか動かなかった。どの能力をどう呼ぶかは親に集中していた。
- 子 1 体の要求上限は 3（`DELEGATION_DEFAULTS.childMaxCalls`）。形の修復と一時障害の再試行にも同じ枠を使うので、能力を 1 回呼んで答えるだけで尽きる。

## 1. 作ったもの

- 契約に `tools`（親が許可する能力 id、最大 12）。無ければ今までと同じ。契約の同一性（`contractKey`）にも入る。
- `makeWorkerExecutor` の `capability` レーン（`run`/`classify`/`describe`）。子の答えが `{"call":{capability,args}}` なら、許可内かつ `classify`==='read' のものだけを実行して、結果を次の要求へ入れる。許可外は実行せず、そう子に伝える。読み取りでないものは最初から提示しない。
- 各要求は子の要求上限の 1 回分。**最後の 1 回には「もう呼ばず答えよ」と書く**。最後に呼びが来ても実行しない。ループは上限より先に伸びない。
- 能力の引数は `describeCapability`（レジストリの schema を呼ぶ時に読む）で子に渡す。能力の一覧は手で持たない。
- `ATLAS_DELEGATION_CHILD_CALLS` の既定を 8 に。費用の柵（`TURN_COST_CAP_USD` 3 ドル）は変えていない。

## 2. 直していないもの

- ブラウザを閉じても続く実行（migration と server 側実行器を伴う。別作業）。
- 子が能力を探す手（`find_capability` 相当）。いまは親が ids を渡す。
- `data.gis` の解析データセットの所有範囲、地理的対象の識別子での統合。
- 8 回で十分かの実測。本番での単独 vs 委譲の比較が要る（`scripts/atlas-delegation-bench.mjs`）。

回帰: `tests/delegation-agent-loop-checks.test.mjs`。
