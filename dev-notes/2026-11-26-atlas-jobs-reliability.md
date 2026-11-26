---
title: 永続ジョブ——検索つき worker を 100 秒で切らない・429 は待って同じ要求を出す・空いた枠ですぐ始める・上限超過は待ち行列・画像を運ぶ・AI 利用台帳を本番に揃える
date: 2026-11-26
newsen: Background research jobs now wait in a queue instead of being refused, let searching workers run to the end instead of cutting them short, and ride out a busy AI provider by waiting.
newsjp: バックグラウンドの調査は、上限を超えても断られず順番待ちになり、Web 検索つきの調査は途中で切られず最後まで走り、AI の混雑時は待って再開します。
---

〈依頼〉 調査役が 2026-11-26 の `main` で見つけた 7 件（永続ジョブと AI 利用台帳）を 1 本の PR で直し、本番まで。**着手前に各件を再現し、再現しないものは理由を記録して外す。**

## 0. 再現したか

| # | 所見 | 判定 | 根拠 |
|---|---|---|---|
| 1 | worker が非ストリームで 100 秒に切られる | **再現（コードで確定）** | `atlas-jobs/index.ts` の `timeoutMs: 100_000`。検索つき worker は実測 110 秒（`2026-11-25-atlas-delegation-efficiency.md`）。この関数は 202 を返したあと背景で走るので、時計はプラットフォームの壁時計（`EDGE_WALL_CLOCK_MS`） |
| 2 | 429 が 1 回で `provider_quota` → `refused` | **再現** | `callModel` が 429/402 を一律 `provider_quota`。分類（`classifyGemini`）は ai-proxy の中にしか無かった |
| 3 | タスクが 3 件ずつの波 | **再現** | `ready.slice(0, TASK_CONCURRENCY)` を `Promise.all` で待つ。波の最も遅い 1 件を待つ |
| 4 | 上限超過は拒否 | **再現** | `atlas_job_create` が `user_active_limit`／`busy` を返す |
| 5a | `images` を運べない | **再現** | `planJob` が `images_unsupported_on_server`。`callModel` は `input_text` だけ |
| 5b | `maxOutput` を運べない | **再現しない（外した）** | `atlas-jobs/index.ts:222` は既に `maxOutput: true` を渡し、`outputTokens()` が `max_output_tokens` に使う。`output_size_unsupported_on_server` はそれを渡さない runner（別の host）にだけ向く。`dev-notes/2026-11-25-worker-reach.md:33-34` の記述は `images` についてだけ正しかった |
| 5c | `research.brief` の費用が親ターンのキーで記録される | **再現しない（外した）／同じ規則の漏れは再現** | `research.brief` 系は `callKey`（`dctx.turnKey` があれば子のキー）で既に子に記録される。ただし同じく「モデルに訊く能力」の `web.search`（`atlas-cap-web.js`）と `research.longform` は常に `K._curTurnKey` を使い、worker が呼んだ検索が親ターンに積まれていた。規則を 1 ファイル（`js/atlas-model-call-key.js`）に出して 3 者で共有。`geo_verify`（ジオコード内部）は能力の入口ではなく利用者のターンの中の処理なので親のまま |
| 6a | ターン鍵の無い返金が日をまたぐと翌日の行から引かれる | **再現（読みで確定）** | `refund_ai_turn(…,'')` → `refund_ai_usage` は常に今日の行 |
| 6b | テーブル所有者が正の `count` を自由に書ける | **再現** | CHECK は負の値しか止めない |
| 6c | 本番の `increment_ai_usage`／`refund_ai_usage` が baseline と本文違い | **再現（本番の関数本文を読んだ）** | 下 |
| 7 | サーバ側 `web.fetchFile`・ラスタの twin | **やらなかった**（余力が無かった。任意の Python/SQL は費用・安全の判断が要るので触っていない） | |

### 本番で読んだ台帳（2026-11-26、`pg_get_functiondef`・`information_schema`）

| | repo（baseline） | 本番 |
|---|---|---|
| `increment_ai_usage` の戻り | `(used, allowed)` | `(allowed, used, lim)` |
| 日付 | `current_date` | `(now() at time zone 'utc')::date` |
| search_path | `''` | `'public'` |
| `refund_ai_usage` | `count - 1` | `count - 1` ＋ `updated_at = now()`、UTC の日付 |
| テーブル `ai_usage` | `updated_at` 列なし・`usage_date` の既定が `current_date` | `updated_at` 列あり・既定が UTC の日付 |

`consume_ai_turn` は列を名前で読むので両方で動いていた。**`supabase db reset`（と pgTAP）が見ていたデータベースは製品が動くデータベースと違った。** データベースの TimeZone は UTC なので日付は同じ日。

## 1. 何を変えたか

**時計とリース（1）。** worker の要求の窓は、この呼び出しの開始からの残り（`providerBudgetMs(true, 開始, 今)`）。要求のあいだ runner が `keepLease` でリースを自分で更新する（リース 150 秒の 1/3 ごとに checkpoint）ので、リースを長くせず、死んだ runner の引き継ぎは 150 秒のまま。

**429（2）。** 分類を `supabase/functions/_shared/ai-quota-class.js` に出し、ai-proxy（`classifyGemini`）と atlas-jobs の両方が読む（写しではなく同じ関数。ai-proxy 側の文言は変えていない）。課金・支出上限・日単位は即 `refused`（`provider_quota`）。分単位・一般の 429 は Retry-After（本文かヘッダ。無ければ 20 秒）だけ待って同じ要求をもう一度。2 回の試行には数えず、待ちの合計は 1 タスク 2 分まで（観測: 分単位の制限は約 1 分で明ける＝ai-proxy の分類の記述。失効: プロバイダの制限が変わったとき）。待ちは `task.rate_wait` に残す。使い切れば `refused`／`provider_rate_limit`（再開できる）。

**波ではなく枠（3）。** `runJob` は枠（`TASK_CONCURRENCY`＝3）が空いた瞬間に、入力の揃ったタスクを始める。時間切れは「新しく始めない」だけで、走っているものは終わらせてからリースを手放す。取消・停止スイッチは、走っているものを終わらせてから 1 回で終わらせる。

**待ち行列（4）。** `atlas_job_create` は上限を数えず常に `queued`。`atlas_job_claim` が走る数（利用者 2・全体 20）に空きがあるときだけ待機中のジョブを取る——走っているジョブ（放した・リースが切れた）は常に引き継ぐ／古い順／上限いっぱいの利用者のジョブは飛ばす／取り合いは 1 本のアドバイザリロックで直列。ジョブが終わると関数が続きの tick を打つ（`atlas_jobs_waiting()`）。`atlas_job_resume` も同じ列に戻す。`user_active_limit`／`busy` は誰も返さない（ページの文言の 2 行は形式上の削除）。待ち行列の上限は設けない：作成のたびに利用者の日次 AI 利用枠を 1 消費するので、列はそれで抑えられる。

**画像と出力量（5）。** worker のタスクの `images`（添付名か `@view`）を、ページ（`jobs.start`）が実データに解いて一緒に送る（`imageSourceOf` を `research.delegate` と共有。解けない名前は名指しで拒否＝黙って落とさない）。関数が検証（種類・1 タスク 4 枚・全体 12 MB＝ai-proxy と同じ値、テストで同値を固定）して `atlas_job_tasks.images` に置き（ページの読み取りは列を明示するので載らない）、runner がそのタスクの要求にだけ付け、プロンプトに「image N = 名前」と述べる。名前があるのに無い画像は「見ていない」と言わせる。見積もりには 1 枚 1,500 トークン（観測: OpenAI の視覚入力の説明。確定は決済）。`jobs.start` のスキーマに `images`・`maxOutput` を足したので、Atlas が頼める。

**台帳（6）。** 1 本の migration（`20261201110000_ai_ledger_alignment.sql`）で、本番の定義を repo の定義にし（列・既定・関数。search_path は他の台帳関数と同じ `''`）、鍵の無い返金は課金した日へ（`refund_ai_usage_on`。課金した日は `openTurn` が呼び出しの前に取って返し、ai-proxy の `ask.ts` が返金に渡す）、`count` はこれらの関数の中でしか変わらないようにした。仕組みは関数の `set intmap.ai_ledger = 'rpc'`（呼び出しの間だけ有効）と、行を書いたあとに見る AFTER トリガ——**CHECK が先に答えるので負の値は従来どおり 23514**。手で直す人は同じトランザクションで `set local intmap.ai_ledger = 'admin'` と言う（道は閉じていない・声に出すだけ）。`seed.sql` と pgTAP 17 は手で書くので、そう言う。

## 2. 検査

`tests/atlas-jobs-reliability-checks.test.mjs`（13 本）——枠の再充填・時間切れ・429 を待つ・待ちの予算・hard quota・分類・リース更新と停止・関数の窓（100_000 の不在）・待ち行列の SQL の形・返金の日・台帳 migration の形・画像が子に届く・画像の上限が ai-proxy と同じ。pgTAP: `52`（作成は拒否しない・待ち行列の ⑧）、`17`（手で書けない・書き終えたあとも鍵が残らない・日を名指す返金）。⚠ このマシンは Docker が止まっていて `supabase test db` は CI で走る。

## 3. 残したこと

- 7（サーバ側 `web.fetchFile`・ラスタの twin）。
- `geo_verify` の費用キー（ターンの中の処理）。
- 25 行の負の行を 0 に揃える migration は、依然として過去の本番データを書き換える判断なので入れていない（`2026-10-01-ai-usage-ledger-sign.md`）。
