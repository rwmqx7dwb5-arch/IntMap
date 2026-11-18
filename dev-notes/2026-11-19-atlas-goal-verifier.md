---
title: Atlas の完了を、答え手とは別に依頼から読む（独立した検証）
date: 2026-11-19
newsen: Atlas now double-checks that what it produced actually covers what you asked for, and finishes missing parts before answering.
newsjp: Atlas が、依頼した内容を実際に満たしているかを別の目で確かめ、足りない部分を補ってから答えるようになりました。
---

〈依頼〉外部監査（2026-11-19）の P0「完了判定がモデルの自己申告だけに頼っている」への対応。

## 0. 測った

`unmetOf()` は `answer_mode` と Atlas 自身の計画だけを照合する。何も宣言しない回答、または依頼が地図を求めたのに「text」と宣言した回答は、何とも照合されず `complete` になる（`tests/atlas-completion-agent-checks.test.mjs` が「宣言も計画も無い回答は complete」を仕様として固定している）。

## 1. 直し方

依頼文をコードが読む設計（キーワード判定）は `no-ad-hoc-hardcoding` が禁じるので採らない。代わりに **答え手とは別の 1 回のモデル呼び出し**（task `atlas_verify`）に、依頼とターンの記録（何が作られ、どの操作が成功・失敗したか）を見せ、満たされていない部分を挙げさせる。

- `js/atlas-agent.js`: `opts.verify` を足した。ゲートが通した最終回答に 1 ターン 1 回だけ呼ぶ。unmet があれば型付きの注記として Atlas に **1 回**返す（拒否ではない。Atlas は操作するか、不要と理由を添えて答え直せる）。注記のあとに操作が 1 件も無ければ `unmet` に `{kind:'goal'}` が残り `completion:'partial'`。
- **観測できなかったことは未達ではない**: 失敗・タイムアウト・不正な応答は `null`＝`trace.goalCheck:'unobserved'` で、ターンは従来どおり受理される。
- `supabase/functions/ai-proxy/tasks/atlas_verify.ts`: サーバ所有の schema・低 effort・出力 500 トークン。ターンの鍵（turnId）に乗るので 2 つ目の質問にも 2 回目の課金にもならない（`TURN_MAX_CALLS` 12 の内）。
- `js/atlas-goal-verify.js`: 検証の組み立て（pure・モデル呼び出しは注入）。
- 憲法 §5 との関係: コードは Atlas の代わりに決めず、判断は別のモデルの読みに置く。Atlas の手・知識・道具の上限には触れない。

## 2. 残り

本番での挙動（余計な注記を出さないか・遅延）は未測定。`atlas_verify` の本番配備後に測る。Edge Function の配備は merge 後の CI が行う。

## 3. 検査

`tests/atlas-goal-verifier-checks.test.mjs`（ループの 3 件＋検証器 1 件）、`tests/atlas-ai-proxy-models-checks.test.mjs`（json タスク一覧に追加）。

## 4. 予算

`atlas-console` の非同期チャンクの天井を上げた（1024.2 → 1032 kB 前後）。独立検証の呼び出しと、先に入った期限切れ取り消しの signal 結合が `js/atlas-console.js` に載るため。検証の組み立て本体は別ファイル（`js/atlas-goal-verify.js`）に置いてあり、console に足したのは配線だけ。
