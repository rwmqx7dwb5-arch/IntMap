---
title: Atlas の「成功したか・完了したか」——検証役に届く英文から s が消えていた・「確かめられない」を「未達」と言っていた・言い換えた所見で何度も差し戻した・判定前の候補を答えの場所に流していた
date: 2026-11-27
newsen: Atlas no longer shows an answer and then withdraws it while it is still being checked; a candidate answer is written in the work trace and appears as the answer once, and a finished turn is no longer listed as unfinished because the checker could not see its result.
newsjp: Atlas は確認中の回答を答えとして出してから取り下げることをやめました。候補は作業の経過に書かれ、確定した時点で 1 回だけ回答になります。検証役が結果を見られなかっただけの完了済みのターンを「完了していないもの」と表示することもなくなりました。
---

〈依頼〉 利用者報告 3 件——A 成功したのに「このターンで完了していないもの:」、B 成功したのに撤回→成功→撤回を繰り返す、C 失敗した旨で書き始めてすぐ撤回し調査へ戻る、を何度も——と、外部監査（2026-11-27・main@638897c）の観測経路の欠陥 8 件。#1476・#1483 の後も起きていた。

## 0. 測った（実物の `runTurn` を、応答を固定したモデルと検証役で回した）

- 検証役（`js/atlas-goal-verify.js` `clipEnds`）が受け取る依頼と回答: `Show where salinity rises` → `Show where  alinity ri e`。`/s+/g`（`\s` の欠落）。英語の依頼は全部、読めない文で判定されていた。**観測器の誤報（one-pass-or-a-reason §2 ①）**。
- 1 つの不足を毎回言い換える検証役（「all prefectures」→「every prefecture」…）で、**40 回のモデル呼び出しのうち 20 回が「答え→差し戻し」**。所見を綴りで照合していたので、言い換えるたびに新しい所見になった。**「所見を Atlas に返す」操作が冪等でない（§2 ③）**。
- 検証役は「地図が描けた」しか記録を見られず、中身を確かめられないことを「未達」と言うしかなかった（§5: 観測できなかったは失敗ではない）。
- 最終回答の候補は門が判定する前に回答の場所へ流れ、差し戻されると消えて経過へ移っていた（C の見え方そのもの）。
- 差し戻した後に Atlas が作業し、次の読みが同じ不足を再確認しても、ターン終わりの集計は「前回差し戻した時点の索引」と比べていたので不足を捨て、`complete` と報告していた。

## 1. 直したこと

- **正規表現**: `/s+/g` 3 か所・`/s*(beta)s*$/`・`/^d{4}$/`（`js/atlas-goal-verify.js`・`js/atlas-controls.js`・`js/atlas-console.js`・`js/geo-ml-run.js`）。4 本は 2026-08-23〜11-25 に別々に入っており、書き込み経路がバックスラッシュを落とすので再発する。門 `regex-escape`（`scripts/regex-escapes.mjs`・`check:static`）は acorn のトークンで「先頭の裸の s/d/w に量指定子」を拒む——呼び出し元の綴りではなく事実に付けた。
- **検証役の所見は「見えた不足」と「見えない」を分ける**: `seen:"missing"|"unconfirmed"`（server schema `atlas_verify.ts` で必須）。未達として差し戻し・表示するのは `missing` だけ。`unconfirmed` は `trace.goalUnconfirmed` に残す。記録の行には操作自身が報告したもの（置いた物体数・置けなかった名前・`summary`）を足し、確かめられる範囲を広げた。
- **所見に id**（`g1`…）。前回の読みを id 付きで見せ、同じ不足は `prev` で名指す（または同じ語）。**Atlas へは 1 所見 1 回**。差し戻さなかった読みはその時点の記録の所見としてターン終わりに残る（`goalAt=-1`）。回数の上限ではない。
- **C の表示**（利用者が選んだ方式）: 回答になりうる返答は作業の経過（途中の一言の行）へ候補として流し、ターンが受け入れたら候補の行を外して回答として 1 回だけ出す。差し戻された候補は経過に残る（`js/atlas-live.js`・`js/atlas-progress.js` `unsay`）。
- **監査 2・3・7（Eval）**: `PAGE.observe` がターン記録の `completion`・`unmet` を写していなかった（主因）。`claimOf` は記録が無いとき `unmet`・`output_unmet` から `partial`/`none` だけを導き（`complete` は導かない）、根拠を `claimBasis` に書く。`kind:"result"` は completed＝present・running/needs_input＝pending・cancelled・unobserved・failed/partial＝absent。「さっきの線を赤く」は 2 ターンに分け、無関係な線を 1 本置き、同じ id・同じ経路（`js/map-tools.js` の `shape` 指紋）のまま対象だけ変わったことを採点する。
- **監査 4**: 出典と抜粋（または実データ）の無い「支持」は `asserted`（`basis:'model_unsourced'`）で、supported に数えず指標は未検証側に足す。抜粋はセッションが全文を持つときその本文に実在するかを照合する（`findingBasis` を再利用）。
- **監査 5**: GIS の op（`js/gis-ops.js` `run`）・`data.gis`/`draw`/`export`・`compute.run` が `datasetsRead:[{id,version,op,ok,why}]` を返し、`heldUntouched` は文字列検索をやめてこれだけを読む（読んだ／試して失敗／未使用／観測不能、と同じ操作で 2 つを読んだ）。未対応の経路（`data.query` ほか）は「観測不能」と述べる。
- **監査 6・8**: 証拠ストアは取得（`fetchedTurn`）と使用（`usedBy`）を分け、`turnSources` は使ったターンで返す。出典の同一視は `canonicalizeUrl` の鍵で完全一致（`?id=dem` と `?id=landcover` は別）。`evidence_used` は親が出典を使った最初の時刻として記録される。

## 2. 検査

`tests/atlas-completion-verdict-checks.test.mjs`（A〜C と正規表現）・`-eval-`・`-evidence-`・`-held-`（各監査項目の合格条件）。`tests/atlas-live-stream.spec.js` ②③ は候補が経過に出て回答の場所に出ないことを見る形に更新。
