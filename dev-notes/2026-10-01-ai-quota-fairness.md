---
title: AI の 1 日の天井を、新しいアカウントが使い切れないようにする——ai-proxy の 3,000 要求は全員が 1 つのバケットから取り、約 17 アカウントで尽き、尽きると全員の AI が止まった。7 日未満のアカウントは全体の 1/3 の取り分から先に取り、残り 2,000 は新規がいくら来ても届かない。誰の上限も下げていない
date: 2026-10-01
---

〈依頼〉利用者承認済み（2026-10-01）。監査の実測「ai-proxy は 1 日の全体上限 `GLOBAL_PER_DAY`=3000 回で、達すると全員の AI が止まる。アカウントを量産すれば 1 日分を使い切れる」を、「少数のアカウントが全員の分を使い切れない」構造にする。既存の正当な利用者の上限を下げない・Atlas の手数と能力を縛らない。CAPTCHA は鍵が要るのでしない（報告のみ）。

## 0. 測った

**数え方（コードから）**
- アカウントごと: `PLAN_LIMITS`（`_shared/ai-ledger.js`）free 10 / plus 50 / pro 200 / unlimited 1,000,000 **turn/日**。管理者（`DEV_USER_IDS`）は消費しない。用語解説は別の枠 `GLOSS_PLAN_LIMITS` free 60 / plus 300 / pro 1,000。
- 1 turn は `consume_ai_turn` が**最初の要求だけ**課金し、同じ turn 鍵で最大 `TURN_MAX_CALLS` = 12 要求まで無料で続く。だから free の 1 日の上限は 10×12 + 60 = **180 要求**。
- 全体: `ai-proxy:global:day`（3,000）は**提供元への要求 1 本 = 1 単位**（フォールバック・再試行も各 1）。管理者の呼び出しも含む。連続補充のトークンバケット（3000/86400 毎秒）。
- 台帳: `ai_usage`（アカウント×日）に `count`（枠）と、2026-09-29 から `input_tokens` / `cached_read_tokens` / `cache_write_tokens` / `output_tokens` / `provider_calls` / `unmetered_calls`。`ai_turns`（アカウント×turn）に `calls` と同じトークン列。

**本番（`supabase db query --linked`、読み取りのみ・集計だけ）**
- アカウント 56（作成 2026-05-31〜07-21。**過去 30 日の新規 0**・全員メール確認済み・`profiles.plan` は全員 free）。
- AI を課金されたことがあるのは 16 アカウント。**うち 14 は作成当日に初めて使った**（残り 2 は 14 日・37 日）。2 日以上使ったのは 1 つだけ。
- 1 日の最大: 新規（作成 7 日未満）9 アカウント・16 turn（1 日）。作成日の最大 28 件（1 日）、p90 は 3。
- `ai_turns` の 1 turn あたり要求数: 中央値 1〜3、最大 12。最も混んだ日 2026-09-17 は 43 turn・114 要求。
- **最後の AI 利用は 2026-09-18**。トークン列は 1 行も値を持たない（記録が始まってから本番で AI が呼ばれていない）。`relay_rate_buckets` に `ai-proxy:global:day` の行も無い（天井が出荷されてから一度も取られていない）。

## 1. 決めたこと

作られて **7 日未満**（`NEWCOMER_AGE_DAYS`、`auth.users.created_at` から）のアカウントは、提供元への 1 要求ごとに **まず `ai-proxy:newcomer:day` から**、次に `ai-proxy:global:day` から取る。取り分は全体の **1/3**（1,000）。

- **2,000 は新規アカウントの数に関係なく届かない**（share を先に取り、拒まれたら全体には触れない）。
- 取り分を**分数**で持つので、`AI_PROXY_GLOBAL_PER_DAY` で全体を動かせば取り分と予備も一緒に動く。`AI_PROXY_NEWCOMER_PER_DAY` で直接動かせる（全体を超えない。超える値は「予備 0」と正直に述べる）。
- 拒否は `provider_quota`（`meta.ceiling:"newcomer_day"`・503）＋払い戻し。画面の文言は既存の `provider_quota` の札（「あなたの IntMap 無料利用枠とは別です」）で足り、**新しい文字列は無い**。
- 作成日が読めない・未来の日付は**新規**扱い（「古い」は日付という根拠が要る主張で、狭い方へ倒す）。
- **migration 不要**（`relay_take` は任意の scope 名を受け付ける。`20260918100000` の設計どおり）。

**上限を下げていない**: `GLOBAL_PER_DAY`・`PLAN_LIMITS`・`GLOSS_PLAN_LIMITS`・`TURN_MAX_CALLS`・`TURN_TTL_S` は不変。7 日以上のアカウントは以前と同じ 1 つのバケット（容量 3,000）だけから取る——検査が容量まで確かめる。取り分 1,000 は、記録上最も混んだ新規の日（16 turn、全部 12 要求でも 192）の 5 倍、free の新規 5 アカウントが上限まで使う量。

## 2. 採らなかった候補と理由

- **全体を下げる／上げる**: 下げれば正当な利用が先に死ぬ（one-pass-or-a-reason §3）。上げても「N アカウントで尽くせる」は同じ。
- **過去の利用で重みづけ**: 2 日以上使ったアカウントが 1 つしかなく、重みの根拠になる履歴が無い。1 回使えば作れる履歴は新規の取り分の中で安く作れる。
- **トークン（費用）で数える**: トークン列は本番でまだ 1 行も埋まっていない。費用は答えを読んだ後にしか分からず、送る前の判定には見積もりが要る。記録が溜まってから決めることとして残す。
- **CAPTCHA**: Supabase Auth は hCaptcha / Turnstile を受け付けるが、提供元のサイト鍵・秘密鍵が要る運用設定。今回はしない（`docs/SECURITY-ARCHITECTURE.md` §8 の 14）。

## 3. 残るもの

- 新規の束は **他の新規アカウント**のその日の AI を止められる（古いアカウントのは止められない）。
- 1 週間寝かせたアカウント約 12 個（2,000 ÷ 180）なら予備も尽くせる。値段を上げる次の手は CAPTCHA。

## 4. 実装

- `_shared/ai-provider.js` — `shareCeiling({ fn, share, of, perDay, env })` と `shareEnvName`。share を先に取り、通れば全体の `take` の結果（受領証）を返す。share の拒否は新しい `ProviderFail` の code `share_ceiling`。DB が答えなければ閉じる。
- `_shared/ai-ledger.js` — `cohortOf(createdAt, now)`・`NEWCOMER_AGE_DAYS`（観測・失効条件・正本を定数の横に）。
- `ai-proxy` — `NEWCOMER_SHARE` と `NEWCOMER_CEILING`、`SPEND.shares`。要求の meter に「この要求が取る天井」を持たせ、`providerCall` の 5 か所へ meter を渡す（meter はもともと全呼び出し口に届いている 1 つの物なので、2 本目の引数を各所に足さない）。`share_ceiling` を `provider_quota` / `newcomer_day` に写す。
- ⚠ 同時に別の作業が ai-proxy の旧プロトコルの分岐を撤去している。こちらが触ったのは天井・台帳まわりと `providerCall(…)` の呼び出し 5 行だけ。

## 5. 検査

`tests/ai-quota-fairness-checks.test.mjs`（7 本）——`cohortOf` と `shareCeiling` は import して評価、`ai-proxy` は子プロセスで `Deno.serve` と `fetch` を差し替えて**評価**し、`relay_take` の答えを**バケットごとに**選ぶ。3 社 × {通常の task・protocol-2 の Atlas turn・用語解説} で、取り分が尽きた新規は提供元へ 0 本・全体のバケットに触れず・払い戻し、同じ瞬間の 1 年前のアカウントは全体だけから取って答えを得る。変異（`providerCall` が meter の天井を読まない／OpenAI の呼び出し口だけ meter を渡さない）で該当が赤くなることを確かめた。
