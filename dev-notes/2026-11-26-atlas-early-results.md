---
title: Atlas の並行作業で、先に届いた結果から親AIが使い始められるようにした（子AI委譲と Web 検索の wait:"any"）
date: 2026-11-26
internal: Atlas の内部の待ち方の変更で、画面の見た目や操作は変わらない（回答までの時間にだけ効く）
---

〈依頼〉親AIの往復と「並行作業の最後の一件待ち」で消える時間を減らす。何を待つか・何回呼ぶかは Atlas が決め、ハーネスは届いた結果を早く渡し、残りが走っていることと後から届いたことを正しく伝える。

## 0. 見つけたこと（読んで確かめた）

- 子AI委譲の `wait:"any"` は既にあった。ただし `firstUsable`（「どれか 1 つが終わった」）で待っていたため、**2 回目の `wait:"any"` は 1 件目で既に満たされており、待たずに同じ答えを返した**。3 か国のうち 2 か国目の到着を待つ手段が無く、使えるのは「最初の 1 件」か「全部」だけだった。
- `web.search` は複数の問いを同時に走らせるが、`Promise.all` で全部を待って一括で返した（最後の 1 件待ち）。
- ループ（`js/atlas-agent.js`）は、同じ引数の `partial` が同じ判定を返すと「繰り返し」と述べる（`repeatedPartialCallThisTurn`）。次の到着を待つ呼び出しは同じ引数・同じ code（`tasks_still_running`）で**中身だけ違う**ので、そのまま使うと「同じ答えが返るだけ」と誤って告げ、モデルに正しい 2 回目を撃たせなくする（観測器の嘘）。

## 1. 直したこと

- `research.delegate` `wait:"any"`: 「次の到着」まで待つ（その一覧が既に渡した到着は数えない）。各タスクに `arrivedSecAgo`、まだ走っている分は `pending` と `progressKey`。終わった分は記録から返し、再実行・二重課金しない。
- `web.search` に `wait:"any"|"all"`（既定 all＝従来どおり）。最初に答えが出た問いで返し、残りは `running` と述べ、同じ問いを再度出すと証拠ストアが**進行中の検索に合流**する（検索は 1 回）。2 回目以降は次の到着で返る。
- `progressKey`（`js/atlas-toolsurface.js` で結果に載せ、`partialCalls` の判定に含める）: 同じ呼び出しでも「何がまだ走っているか」が違えば同じ判定ではない。
- 計測: 各ステップの `trace.stepTiming` に `firstDoneAt`（最初の結果が届いた時刻）・`usedAt`（次のモデル呼び出しを出した時刻）・`firstResultHeldMs`（その差＝最初に届いた結果が親に使われるまで待った時間）を記録する。

縛りは足していない: 何を・いつ待つか（`wait` を付けるか・何回呼ぶか）はモデルが決める。

## 2. 本番での実測

本番での実測（3 か国比較の問いの前後）はこの記録の下に追記する。

## 3. 検査

`tests/atlas-early-results-checks.test.mjs`（次の到着で返る・二重に尋ねない・二重課金しない・別の standing は繰り返しでない・stepTiming）。既存の delegate-streaming／search-evidence-store／turn-engine は緑。
