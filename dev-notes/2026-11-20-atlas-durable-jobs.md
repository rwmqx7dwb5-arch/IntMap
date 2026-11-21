---
title: 長い仕事がタブを閉じると止まっていた——契約をページの外へ出し、サーバが読み取りの子 AI 仕事を走らせる永続ジョブ基盤の第 1 縦串
date: 2026-11-20
newsen: Atlas research jobs can now keep running on the server after you close the tab; you can follow them, change them or stop them while they run, and each job has a cost cap and an emergency stop.
newsjp: Atlasの調査ジョブが、タブを閉じてもサーバ側で走り続けるようになりました。実行中でも状況を確認し、条件を変え、止められます。1件ごとの費用上限と緊急停止も備えています。
---

〈依頼〉 外部監査（2026-11-20）の指摘: `research.delegate`（`js/atlas-delegate.js`）は実行者がページで、状態は契約・事象記録・再開スナップショットまで。ブラウザを閉じると仕事が止まる。ジョブ ID・状態・依存・進捗・成果物・取消／再開（二重実行なし・冪等）を Supabase に永続化し、サーバ側が読み取り系の子 AI 仕事を走らせ、走行中に会話・条件変更・中止ができ、費用の全体上限と停止スイッチがあること。

## 0. 決めたこと

- **契約を外へ出す**: 契約の正規化・同一性の鍵・循環検出・worker の指示文と答えの形を `js/atlas-delegate.js` から `js/atlas-job-core.js`（import なしの純モジュール）へ移した。ページは再エクスポートで同じ名前を使い続ける（`tests/atlas-delegation-checks` ほか 27 件が無変更で通る）。サーバは `supabase/functions/_shared/atlas-job-core.js`（逐語の写し・`scripts/sync-atlas-job-core.mjs`・`check:static` が照合）を読む。ページとサーバが別々の「契約」を持つ事態を避けた。
- **実行者はリースを持つ者だけ**。`atlas_job_claim`（`FOR UPDATE SKIP LOCKED`）が 1 度に 1 人へ渡し、リースが切れれば次が引き継ぐ。仕事は 1 度しか終われない。死んだ runner が予約したまま決済しなかった費用は使った額として数える。
- **利用者の費用方針（2026-11-20 本人が選択）**: ジョブ新規作成で日次の AI 枠を 1 消費（拒否されたら作ったジョブを即取消）、1 件 $1・利用者あたり同時 2 件・全体 20 件・全体の日次要求数は `spendCeiling`。停止スイッチは表（`atlas_jobs_control.enabled`）とシークレット（`ATLAS_JOBS=off`）の両方。数値は環境で動かせる。
- **サーバが走らせるのは worker（読み取りの子 AI）のみ**。`capability` 型はページ側の道具レーンがサーバに無いので `kind_unsupported` で計画段階で断る（走らせて失敗させない）。プロバイダは OpenAI のみ（他は `provider_unsupported`）。
- **会話は止まらない**: 利用者は RLS 越しに自分の行を読み、`atlas_job_amend`（新しい指示。次の provider 要求の前に runner が読み、契約より優先して worker へ渡る）と `atlas_job_cancel`（次の provider 要求の前に止まる）を呼ぶ。どちらも所有者限定・冪等。
- **再試行は観測された失敗のあとだけ**: 5xx／タイムアウトは 1 度（タイムアウトならウェブなしで `partial`）、形の誤りは理由を名指して 1 度。「確認できなかった」は再試行の理由にしない（`one-pass-or-a-reason`）。

## 1. 何が変わったか

| 層 | もの |
|---|---|
| DB | `supabase/migrations/20261120131000_atlas_durable_jobs.sql`（`atlas_jobs` / `atlas_job_tasks` / `atlas_job_events` / `atlas_jobs_control`、RLS は所有者の select のみ、runner 用 RPC は service_role 限定、取消・変更の 2 RPC は所有者限定、30 日で削除、pg_cron の毎分 tick と日次の掃除） |
| サーバ | `supabase/functions/atlas-jobs/index.ts`（`create`／`tick`）、`_shared/atlas-job-runner.js`（リース・checkpoint・予約と決済・波の実行・結論） |
| 検査 | `tests/atlas-durable-jobs-checks.test.mjs`（15 件）、`supabase/tests/52_atlas_durable_jobs_test.sql`（pgTAP） |

## 2. 残したもの（この縦串の外）

- **Atlas の能力としての入口が無い**——利用者が頼める経路（`research.background` 等）は未配線。能力表・dispatch・SYS・i18n・Atlas の説明に同時に入れる必要があり、別の切り分けにした。到達できる能力にするまでは「基盤」であって利用者向けの機能ではない。
- ページ側の窓口（作る・読む・変える・止める）と結果の表示（ジョブ一覧・進捗カード）。呼び手のない `static-checks` の `split` が拒むので、能力と同時に入れる（最初の版は未配線で落ちたため外した）。
- `capability` 型のサーバ実行（読み取り能力のサーバ側の道具レーン）。

## 3. 検証

（本番での検証結果は下に追記する。）
