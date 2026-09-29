---
title: AI を呼ぶ経路を全部 1 つの台帳で数え・測る——ai-proxy は使用量を 1 か所も読まず、Anthropic 経路は cache_control が 0 件、monitor-run の「今すぐ実行」は利用者の AI 枠を通らなかった。枠の扉と費用の記録を _shared/ai-ledger.js と _shared/ai-usage.js に 1 つずつ置き、両方の関数が同じものを呼ぶ
date: 2026-09-29
---

〈依頼〉構造改革「AI を呼ぶ経路は全部、同じ 1 つの台帳で数え・測る」。監査の実測 4 点から。

## 0. 測った

- **費用が測られていなかった。** `supabase/functions/ai-proxy` と `_shared/` で、プロバイダの `usage` を**読む**コードは 0 件（唯一の `usage` は Anthropic の web 検索回数 `usage.server_tool_use`）。台帳（`ai_usage`・`ai_turns`）とプロジェクトの天井（`spendCeiling`）が数えていたのは**リクエスト**で、プロバイダが請求するのは**トークン**。1 ターン（最大 `TURN_MAX_CALLS` = 12 呼び出し）の費用も、prompt cache の命中も、どこにも数として無かった。
- **Anthropic 経路にキャッシュの印が無かった。** `callAnthropicTurn` / `callAnthropic` に `cache_control` が 0 件。コードの既定 provider は anthropic。system＋道具の固定部分（約 7k トークン）は 1 ターンの全呼び出しで同一なのに、Anthropic は印の無い先頭をキャッシュしないので毎回全額。OpenAI は `prompt_cache_key` を既に送っていた。
- **monitor-run の「今すぐ実行」が AI 枠を通らなかった。** `ai-proxy` は `consume_ai_turn` で課金するが、`monitor-run` は一切触れない。free の上限は監視 5 本（`monitor_limit`）× 手動クールダウン 30 秒（`MANUAL_COOLDOWN_MS`）＝ **1 時間に 600 回**の手動実行が可能で、各回がプロバイダを呼べた（400 の縮退で 2 リクエスト）。止めるのはプロジェクト全体の天井だけ。⚠ 監視の UI 入口は撤去済み（`docs/AREA-MONITORS.md`）なので、この経路に着くのは **API を直接叩く呼び手だけ**——つまり正当な利用ではなく濫用の形でしか使われない経路だった。
- **プラン表とアカウント解決が ai-proxy の中にあった。** 2 つ目の呼び手が同じ枠を使うには写すしかなかった（写した時点で規則が 2 つになる）。
- **rate-limit の鍵。** `_shared/rate-limit.js` の `callerKey` は `x-forwarded-for` の先頭。ただし routing-relay の注記に 2026-09-26 の本番実測があり、偽の XFF は**新しいバケツを買えなかった**（プラットフォームが本当のアドレスを先頭に置く）。監査の「先頭を偽れる」は、この実測の範囲では成り立たない。

## 1. 直したこと

- `_shared/ai-usage.js`（純関数・Deno 非依存）
  - `normalizeUsage(provider, answer)` → `{input, cached_read, cache_write, output}`。`input` はキャッシュの読み書きを**含まない**全額の入力（OpenAI・Gemini は全体からキャッシュ分を引く、Anthropic は元から分かれている）。`output` は推論を含む。**使用量ブロックが無い応答は 0 ではなく null**（観測できなかったは費用ゼロではない）。
  - `usageMeter()` — 1 リクエストで読んだ全応答（フォールバック・再試行・後で空として拒んだ応答も）を足し、使用量を述べなかった応答を `unmetered` として別に数える。
  - `withPromptCache(body)` — 道具の末尾と system の末尾に `cache_control: {type:"ephemeral"}`。既存の印は保ち、4 個を超えない。呼び手の body は書き換えない。**モデルが読む中身は同一**（上限でも能力の変更でもない）。
- `_shared/ai-ledger.js` — `PLAN_LIMITS`（ai-proxy から**移しただけ**、数は不変）・`accountFor`（`profiles.plan` と `DEV_USER_IDS`）・`openTurn` / `refundTurn` / `settleTurn` / `recordUsage`。台帳が答えないときは `LedgerUnavailable` を投げる（fail-closed。DB の文言は運ばない）。`recordUsage` は `EdgeRuntime.waitUntil` があれば応答の後で書く。
- migration `20260929120000_ai_usage.sql`（非破壊）— `ai_usage` と `ai_turns` に `input_tokens` / `cached_read_tokens` / `cache_write_tokens` / `output_tokens` / `provider_calls` / `unmetered_calls` を既定 0 で追加。書き手は `record_ai_usage` 1 つ（SECURITY DEFINER・`search_path=''`・service_role のみ）。**`count`（枠）には触れない**。`ai_turns` は 1 日で掃かれ返金で消えるので、消えない記録は `ai_usage`（アカウント×日）。
- `ai-proxy` — 枠の消費・返金・確定を台帳の扉経由に。全 provider の応答の直後に meter へ足し、成功でも失敗でも最後に 1 回 `record_ai_usage`。Anthropic の 2 経路で `withPromptCache`。429 の形・`TURN_MAX_CALLS`・`TURN_TTL_S`・能力・回答は不変。
- `monitor-run` — 「今すぐ実行」は **AI の段に達したときだけ**、run id をターン鍵（`monitor:<runId>`・1 回）にして `openTurn`。拒否ならプロバイダに 1 本も送らず、snapshot・diff・証拠を保ったまま `quota_exceeded`（UI の既存の状態名・既存の 5 言語の札）。台帳が答えなければ fail-closed（`ai_failed`＋`error_category: quota_unavailable`）。報告を確定できたら settle、AI 失敗・根拠の無い出力・報告の書き込み失敗・例外なら返金。費用は cron・手動とも**監視の所有者**の行に記録。
- `callerKey(req, verifiedUid)` — 鍵の決定を 1 関数に。Auth サーバーで検証済みの UUID なら `uid:<uuid>`、でなければ従来のアドレス。UUID でない値・検証していない `sub` は使わない（呼び手が選べる文字列は要求ごとの新しいバケツ）。アドレスが `uid:` を綴っていたら `unknown`（アカウントの鍵を名乗れない）。`atlas-embed` が uid を渡すように、`client-errors` はアドレスの読みを共有の `callerAddress` に。

## 2. 否定した見立て・変えなかったもの

- **定期実行（cron）を所有者の枠に数えるか——変えていない（論点として残す）。** 今は cron も「利用者の代わりに AI を呼ぶ」経路だが、数えると、所有者が Atlas で枠を使った日に**予定された報告が黙って止まる**。止めているのは監視の本数（free 5）・間隔の下限 30 分・プロジェクトの天井（`monitor-run:global:day`）で、1 アカウントあたり最大 5 本 × 1 日 48 回（間隔 30 分）＝ 240 回。費用は所有者の行に記録するようにしたので、判断に要る数はこれから溜まる。決めるのは利用者。
- **XFF を信用しない方向（末尾を取る等）へ変えるか——変えていない。** 上の 2026-09-26 の実測が反証。
- **無認証の relay で JWT を検証して uid を鍵にするか——しない。** `verify_jwt = false` の relay は全レイヤーの poll の経路で、要求ごとに Auth への往復を足すことになる。検証していない `sub` を鍵にするのは XFF より悪い。
- **会話の末尾にも印を付けるか（段階的キャッシュ）——今回はしない。** 依頼の範囲は system と道具。1 ターンの後半の呼び出しでさらに効くはずだが、書き込みは 1.25 倍なので、`cache_write_tokens` の実測を見てから。
- `monitor_runs.ai_tokens_in` / `ai_tokens_out`（#R141 から在るが一度も書かれていない列）は使っていない——費用の正本は台帳 1 つ。

## 3. 検査

`tests/ai-one-ledger-checks.test.mjs`（9 本）——純関数は import して評価、`ai-proxy` と `monitor-run` は子プロセスで `Deno.serve` と `fetch` を差し替えて**評価**する（ソースを読まない）。① 3 社の正規化と null ② 送られた Anthropic の body に印が 2 つ・中身は同一 ③ 手動実行が consume→provider→commit→settle の順、枠切れでプロバイダ 0 本・`quota_exceeded`・データ保持、台帳沈黙で fail-closed、cron は消費せず費用だけ所有者へ ④ 鍵。変異（手動実行の課金を外す・Anthropic の印を外す・失敗時の記録を外す）で該当の 3 本が赤くなることを確かめた。
綴りで旧構造を固定していた 4 本（`atlas-ai-proxy-models`・`security-logic`・`process-doc-facts-claims`・`backend-edge-hardening`）は、規則の新しい置き場（`_shared/ai-ledger.js`）を読むように合わせた。pgTAP `13_ai_usage_ledger_test.sql` が列・関数の権限・`count` 不変・加算を確かめる。

## 4. 配備

Edge Functions: `ai-proxy`・`monitor-run`・`atlas-embed`・`client-errors`（`_shared/rate-limit.js` を import する他の relay は鍵の値が変わらないので任意だが、共有部品を変えたので `--all` で揃えるのが既定の作法）。migration を先に適用すること（`record_ai_usage` が無いと記録は best-effort で黙って失敗する——応答は壊れない）。
