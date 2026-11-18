---
title: 回答の下のツールの文——公開した修正が本番で不活性だった（completion の値の取り違え）
date: 2026-11-19
---

## 報告

直前の修正（`2026-11-18-atlas-answer-surface`）が本番に出たあと、利用者が実際の地震の依頼の返信を貼った。回答の下に、同じ
「地震波 — …」「到達時刻には地点が必要です…」「移動先: Tokyo, Japan」と、それらを「 · 」でつないだ 1 行が、まだ出ていた。

## 原因

「Atlas が最終回答を書いたか」の判定を `ai.__atlCompletion === 'answered'` と書いていた。`'answered'` は `js/atlas-agent.js` の
**`stopped`** の値で、`completion` が取るのは `'none'`／`'partial'`／`'complete'` の 3 つだけ。判定は一度も真にならず、
成功結果の文を外す処理も、失敗の行を消す処理も、本番では**一度も働いていなかった**。

## なぜ検査も本番検証も見逃したか

- 新しい検査は部品（`forReader`）を直接呼び、フラグ `done` を自分で立てて測っていた。**判定の入力を作る側の値**は測っていなかった。
- 本番検証も部品（`dispatch` と `forReader`）を測り、実ターンはログイン要で未確認だった。部品が動くことは、部品を呼ぶ条件が
  成り立つことの証拠ではない。利用者が実ターンを貼って初めて見つかった。

## 直したこと

- 判定を `TRES.written(say, completion)` に出し、`'complete'`／`'partial'` のとき真にする（`'none'` と、実行前に書かれた `say`
  ＝ completion がまだ無い場合は偽）。
- 検査 ⑦: 判定の入力を、`js/atlas-agent.js` の `const completion = …` の宣言から取り出した値の集合で動かす。集合が変わったら赤。
  `'answered'` を completion として読む綴りは赤。
