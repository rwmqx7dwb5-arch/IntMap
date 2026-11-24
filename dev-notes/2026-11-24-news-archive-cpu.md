---
title: ニュース取り込みが止まっていた——履歴の書き写しが毎 run 全出来事を組み直していた
date: 2026-11-24
---

## 何が起きたか

本番の `news-ingest-tick`(20 分ごとの全段)が、2026-11-24 08:40 UTC を最後に `news_ingest_runs` へ記録を残さなくなった。
cron は `succeeded`(pg_net へ投げただけ)だが、関数は `WORKER_RESOURCE_LIMIT`(HTTP 546)で落ちていた。

## 測ったこと(本番・同じ cron の仕組みで段ごとに 1 回ずつ)

- `fetch` 単独 15.6 秒で成功、`locate` 130 秒、`assign` 12 秒、`link` 2.5 秒、`entities` 1.5 秒、いずれも単独では成功。
- 全段、`link`+`entities`+`prune`、`prune` 単独は 546。`link`+`entities` は成功。
- `prune` を単独で走らせた最初の 1 回は成功(archive の対象 1,394 件・約 7 秒)。assign が出来事を約 2,000 件足した後の `prune` は 546。

⇒ 原因は `prune` の中の履歴への書き写し(`stageArchive`)。run の CPU が「直近 72 時間の出来事の数」に比例していた。
取り込みの滞留(未処理の記事 4,547 件)と出典の追加で出来事の数が約 6,000 に膨らんだ日に、Edge Function の CPU 上限へ当たった。

## 直し方(構造)

- 履歴の行が出来事の最後の記事より後に書かれているなら飛ばす(書き写すものが増えていない)。
- 残りは古い順(記事が先に消えるもの)に 1 run 1,000 件まで。次の run が続きを引き取る。規則は `pendingArchive`(`_shared/news-history.js`)に置き、テストが同じファイルを評価する。
- `news_ingest_runs.notes` に `archive_skipped_current` `archive_deferred` `backfill_days` `backfill_rows` `backfill_oldest` `backfill_error` を足した。遡り(backfill)の結果は応答にしか出ず、0 行のとき理由を run の記録から読めなかった。

## 失効条件

`ARCHIVE_PER_RUN = 1000` は観測(1,394 件で通り約 6,000 件で落ちた)から置いた。Edge Function の CPU 上限が変わったとき、または `buildArchiveRow` の 1 件あたりの費用が変わったときに見直す。

## 本番での手当て

調査のために本番で `locate` `assign` `link` `entities` `prune` を段ごとに 1 回ずつ手動で走らせた(cron と同じ `net.http_post`・秘密は DB の外へ出していない)。
その結果、滞留していた記事が処理され、遡りは 2026-10-25 から 2026-11-23 までの 30 日分(531 行)を `news_event_history` へ書いた。

## 直した後に本番で見つけた穴(同日・続報)

最初の版は「古い順に 1,000 件」だったが、本番で `archive.considered 3472・skipped_current 504・deferred 1968・archived 0` になった。
1 媒体だけで世界グラフの名前も含まない出来事は履歴の行が作られない(`buildArchiveRow` が null)ので、いつまでも「記録が無い」側に残り、古い順の枠を占めて、後ろの出来事に順番が回らなかった。
⇒ 行が作られるかを先に知る手は無い(世界グラフとの照合が費用の主役)ので、`pendingArchive` を次のように直した: 2 媒体以上(手元の欄で決まる)を新しい順に先に取り、残りは `cap` の窓を run ごとに 1 つ進めて回す(`slot` は 20 分の枠番号)。状態を持たずに、数回の run で全部が 1 度は調べられる。テストが「窓を回すと全件を調べる」「1 run が cap を超えない」を評価する。
