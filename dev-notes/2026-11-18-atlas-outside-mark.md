---
title: Atlas の外部内容の印を「そのターン」から「その言葉が入力に残っている間」へ——要約・計画・作業文脈を通って次のターンに届いても確認が出る。承認はモデルの再呼び出しではなく読者のボタン
date: 2026-11-18
newsen: When Atlas has read a web page or outside data, sending, publishing or deleting something now asks you with Run and Don't buttons for as long as that content is still part of the conversation, not only in the same turn.
newsjp: Atlas がウェブページや外部データを読んだ後は、その内容が会話に残っている間、送信・公開・削除などの操作の前に「実行」「やめる」ボタンで確認するようになりました（同じターンの中だけでなく）。
---

〈依頼〉docs/SECURITY-ARCHITECTURE.md §8 の 16（security-review-nov の 25 で最優先）を閉じる。外部内容の印が 1 ターンで消え、要約や履歴に乗って次のターンへ運ばれると失われる。(1) 出自を履歴・要約に運ぶ (2) 外向き送信・公開・破壊的操作の確認をモデルの出力に依らずコードで決める。読み取りだけの操作に確認を足さない・Atlas の能力を削らない。

## 0. 測った

- 印は `js/atlas-agent.js` `runTurn` の `turn.externalContentSeen` 1 つ。立つのは ① `ingests:'external'` の結果 ② `reply.webUsed` ③ 添付——どれも**このターン**の出来事。`js/atlas-console.js` `recordTurn` は Atlas の回答（180 字）を `_hist` に `Atlas: …` として積み、次のターンの `composeInput` が丸ごと読む。印は積まれない。
- 次のターンへ Atlas の言葉を運ぶ器は 3 つあった: `_hist`、Atlas が宣言した計画（`js/atlas-plan.js` `promptBlock`、毎ターン入力の末尾）、作業文脈の `topic`（`analyze` / `mapReport` の引数の 140 字）。地名台帳（`js/atlas-geo-ledger.js`）は解決済みの識別子で、文ではない。
- **承認の穴は 16 番の文面より深かった。** `_confirmedBy` は「確認を出した後のターンで、モデルが同じ呼び出しをもう一度出したら `confirmed:true`」——コメント自身が「読者の返事の語は読まない。yes と言ったかは Atlas の読み」と書いていた。印を履歴に運ぶだけだと、要約に乗った注入文が確認を出させ、同じ注入文がその承認もできる。

## 1. 印は入力の性質（`composeInput` の `outside`）

器ごとに「印のあるターンが書いたか」を持たせ、判定は**全部の器がモデルの入力になる 1 か所**＝`composeInput` で行う。履歴の行は `o`（`recordTurn` がターン記録の `externalContentSeen` から書く・本文は読まない）、計画は `declare(args, {outside})` → `carriesOutside()`、topic は `_wctx.topicOutside`。`composeInput` は**予算で残した**履歴だけを数え（落とした行は前に無い）、`requestOutside` / `tailOutside` と合わせて `outside` を返す。console のモデル接続が `reply.contextOutside` として載せ、`runTurn` は `webUsed` と同じく印を立てる（事象 ④）。

- 印は減衰しない: 印のあるターンが書いた行も印を持つので、要約が要約を書き継いでも残る。消えるのは、その言葉が入力から出たとき（48 行の窓・予算・巻き戻し・新しい計画で語が全部置き換わったとき）。
- 履歴の `{t,s}` → `{role,content}` の写像は `AGENT.historyItems` に移した（node の検査がブラウザと同じ写像を走らせるため）。

## 2. 承認は読者の押下（`_confirmPress`）

`needs_confirm` の結果に「実行」「やめる」の 2 ボタン（`js/atlas-results.js`・その operation id に結ぶ）。保留中の呼び出しは `_confirmWait` に operation id で置き、「実行」が押されたときだけ `confirmed:true`・source `atlas-confirm` で実行する。押下（実行・取りやめ）は IntMap 自身の行として履歴に残る。**モデルの経路（runActions）は `confirmed` を渡さない**——`_confirmedBy` は消した（引き継ぎ: 押下）。方針文（`js/atlas-policy.js` CONFIRMATION）も「承認はボタン。同じ呼び出しを繰り返しても承認ではない」に。旧 `atlas.input.confirm`（9 言語）は凍結の規則どおり残し、新しい文は en + jp。

- 能力は減っていない: 何も拒否しない。確認が出るのは 'explicit' 行と `data-effect` が outward / destructive の操作だけで、印の無い入力・UI のボタン・確認不要の行は以前と同じ。

## 3. 検査

`tests/atlas-outside-mark-checks.test.mjs`（実物の loop・composer・計画・登録表・kernel を走らせる）: ① 残した分だけ数える ② **回帰**——research.brief の文が回答の要約に入り、次のターン（読者の新しい語には何も無い）と、さらにその次でも view.inspect が `needs_confirm` ③ 印の無い履歴・予算で落ちた行・確認不要の操作は尋ねない ④ 計画の印 ⑤ 同じ呼び出しの再発行は承認にならず、ボタンは operation に結ばれ、`confirmed:true` は押下の 1 か所だけ。`contextOutside` の行を外すと ② と ⑤ が落ちることを確かめた。`tests/atlas-console-boundary-checks.test.mjs` C⑦ の `_confirmedBy` を名指す照合を更新。
