---
title: 取得済みの本文と出典を子AIに届け、回答単位の計測を成果の実態で測る
date: 2026-11-26
internal: AI の内部の受け渡しと運用計測の修正で、利用者に見える画面の変化はない
---

〈依頼〉 Atlas の子AIが証拠ストアの資料を読み直しても本文と出典が届かない欠陥と、回答単位の計測 3 件の定義の欠陥。

## 1. 子AIに届かなかった本文と出典
- 原因: 読み直し（`web.evidence`）の答えは `exec`（親には `observed` として渡る結果）にあり、`html` は画面用の短い通知。子AI用の橋
  （`js/atlas-console.js` の `runReadCapability`）は `html` と `meta` だけを返し、`exec` を捨てていた。**「結果が持ち帰られなかった」型**（`one-pass-or-a-reason.md` §2）。
- 直し: 橋が `exec` を返し、`js/atlas-delegate.js` が子AIの入力に `RESULT:` として載せる（自分の参照で切るので本文の長さに隠れず、残りは
  `read_step` で読める）。資料の記録は出典の一覧を本文より前に並べ替え（切られても出典が残る）。`js/atlas-orchestrate.js` の capability 課題も `exec` を `data` に載せる。
- 回帰: `tests/atlas-evidence-to-child-metrics-checks.test.mjs` — 実際の `web.evidence`・実際のストア・コンソールから持ち上げた橋・実際の子AIの
  ループを評価し、固有の目印と出典 URL が子AIの次のモデル入力に載ること（橋の修正を外すと赤になることを確認）。

## 2. 計測（`js/atlas-turn-metrics.js`・migration `20261201090000`）
- 最初の有用な結果: 送信から、操作が**画面に出した**値・表・地図（`meta.produced` か実描画）まで。操作が無ければ最終回答が出た時刻、何も出なければ NULL
  （`useful_shown=false`・別集計 `no_useful_rate`）。固定入力 2 件（操作ゼロ 8 秒→0 秒、失敗後の計画→4.2 秒で成果あり）を回帰に。
- 根拠付きの所見: 判定を `findingBasis`（`js/atlas-job-core.js`）1 か所に。出典を挙げた／原文・値も持つ／最終回答が出典を名指す、の 3 つ。
- 成功 1 件当たりの費用: 同じ課題（`task_key`＝未完了の後の同じ問いは最初の試行の鍵を引き継ぐ。問い自体は保存しない）の全試行の原価
  （`ai_delegation_journal` の親・子・検索の全行。root_key が同じ）÷ 成功した課題の数。`cost.traced_rate` を併記。失敗したターンも行を残す（`recordFailure`）。
- 旧い行は `metrics_version=1` のまま、新しい図からは除外（意味の違う数を平均しない）。
- 親AIの待ち時間用の口: `markTurn('evidence_arrived')` / `markTurn('evidence_used')`（初回のみ・ms）。実装は別セッションが呼ぶだけ。

## 3. 検査
`npm run check:static` ほか触った主題のゲートと pgTAP（`supabase/tests/55_atlas_turn_metrics_test.sql` を新定義に更新）は PR の CI。

## 4. 本番検証（公開 sha 1db7b40d・#1445 を含む）
- 橋（`runReadCapability` → 課題の `data`）: モデルを介さない `kind:"capability"` の課題で `web.evidence {ref:ev1}` を実行 → 親の次の入力の
  `data.exec.web.evidence` に本文（156 文字）と出典 URL が載り、web 検索（task=web_search）0 回、最終回答にも本文と出典が出た。本番で `exec` が運ばれている。
- 計測: 新しい 3 行が `metrics_version=2`・`useful_shown` が真偽・`first_useful_ms` が送信からの待ち（操作の無い「こんにちは」は答えが出た時刻と一致）・
  `task_key`・`evidence_arrived_ms`（資料取得時に記録）が入り、質問・回答・URL を持つ列は無い。
- **測れなかったこと**: モデルが動かす worker（`kind:"worker"`, tools=[web.evidence]）に `RESULT:` と本文が載る場面。許可一覧には web.evidence が入り、
  案内文も正しく（残り回数の制限なし）、親の経路は本文を受け取れたが、worker のモデルが 3 回とも `calls` を返さず「呼び出せなかった」と報告した。
  橋ではなく worker モデルの挙動（system の「findings JSON のみ返す」と prompt の「calls を返す」の食い違いが仮説・未検証）。次の課題として別に扱う。
- `claims_cited/evidenced/backing` は本番では 0 のまま（worker が資料を読めず所見が出なかったため）。数え方は回帰テストで確認済み。
