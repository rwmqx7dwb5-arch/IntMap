---
title: Atlas の AI リクエストが「どう進んだか」を数える——所要時間・提供元リクエスト数・モデル連鎖の移動・失敗コード
date: 2026-11-19
---

〈依頼〉Atlas 実行基盤の点検で最上位の弱点——成功ターンの所要時間・モデル fallback・再試行の段数がどこにも残らず、サーバのログは失敗時の `console.error` だけ（`ask.ts`）。劣化に気づく経路が無い。**観測を足すだけで、手数や上限を下げず、Atlas の判断を縛らない**（CONSTITUTION §5・one-pass-or-a-reason §1）。回答の評価・採点は範囲外。

## 1. 足したもの

- `supabase/functions/_shared/ai-ledger.js` に `healthRows()`（純関数）と `recordHealth()`（best-effort・`EdgeRuntime.waitUntil`）。
- `ai-proxy/ask.ts` の `answer()` が提供元へ行ったリクエストごとに 1 回、成功でも失敗でも書く。`providerCall()`（全提供元リクエストの唯一の入口）が `meter.attempt()` を呼んで段数を数え、`providers/openai.ts` の `FALLBACK_CHAIN` の移動点が `meter.fallback(to)` を呼ぶ。
- 書き先は**既存の匿名カウンタ `usage_counts`**（`record_usage_counts`）。新しいテーブル・migration・RPC は無い。メトリクス `ai_request`（ok か型付きエラーコード）・`ai_wall`（所要時間の範囲）・`ai_rungs`（1 リクエストが要した提供元リクエスト数）・`ai_fallback`（連鎖が移った先）・`ai_incomplete`（回答が終わらなかった理由）。
- 個人を特定する値は引数に無い（ユーザー ID・ターンキー・プロンプト・回答・IP・日より細かい時刻）。ブラウザは書けない（`usage-count` は `shape.js` の宣言だけ受ける）。1 メトリクス 1 日 32 種までは `record_usage_counts` の既存の上限。
- `docs/MONITORING.md` §2b2。回帰は `tests/ai-one-ledger-checks.test.mjs` に 5 本（成功・失敗コード・連鎖の移動・カウンタ停止でも回答が変わらない・行の形）。

## 2. 退けたもの

- **提供元が返したモデル名と依頼したモデル名の違い = fallback** とする案: 提供元は日付付きスナップショット名（例 `gpt-5-2025-…`）を返すので、毎回「fallback」になる。連鎖が実際に動いた地点で数える。
- **新テーブル（ターン単位の時間・段数）**: 点検メモの案 A。日次の度数分布で劣化の検知には足り、PII の面積が増えない。ターン単位の列が要るなら `ai_turns` は掃除される足場なので、それ自体を別途考える。
- 手数・時間の上限、リクエスト全体の期限（案 C）、評価の自動化は範囲外。

## 3. まだ観測していないもの

- クライアント側で終わったターン（transport / time_budget）はサーバに届かないので数えていない（点検メモ弱点 2 の前半）。`usage-count` の `atlas` と `answered` の差は引き続き手がかり。
- `atlas-embed` と gloss lane の観測。
