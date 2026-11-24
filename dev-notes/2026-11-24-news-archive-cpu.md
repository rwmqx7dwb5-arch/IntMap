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

## 3 つ目: locate が run の壁時計を使い切っていた(同日・続報)

#1397 の後も定期の取り込みは記録を残さなかった。全段を手動で走らせると 504 `IDLE_TIMEOUT`(無通信 150 秒)。`locate` 単独は 143 秒(240 件・12 batch を順に待つ・1 batch 約 11 秒)で、fetch・assign などを足すと 150 秒を超える。
出典を足したあと(61 本→67 本の feed・1 run の新着が増えた)locate が毎 run 上限の 240 件まで使うようになったのが引き金で、以前の run は 18〜41 秒だった。

直し: ① `locate` の batch を `LOCATE_PARALLEL = 4` 本ずつ同時に投げる(採否の判定・「AI が見た」の印の押し方は変えない) ② 既定の予算を 240 秒から 140 秒へ。段は `budget.left()` を見て止まるので、予算がプラットフォームの 150 秒より長いと「まだ時間がある」と信じたまま殺される。
失効条件: 提供元の同時実行上限・プラットフォームの無通信上限が変わったとき。

## 4 つ目: 段を 1 本の body にまとめると 1 つの worker が持たない(同日・続報)

#1401(locate を並列・予算 140 秒)の後、locate は 143 秒から 33 秒になり assign の滞留も消えたが、全段の body は 546 のままだった。本番で段の組み合わせを 1 つずつ測った(同じ `net.http_post`):

| body | 結果 |
|---|---|
| fetch / locate / assign / prune 単独 | 200(10 秒 / 33 秒 / 11 秒 / 18 秒) |
| locate+embed | 200 |
| embed+assign+link+entities | 200 |
| link+entities+prune | 200 |
| fetch+locate | 546 |
| locate..prune | 546 |
| embed+assign+link+entities+prune | 546 |
| 全段 | 546 |

⇒ 1 つの worker は段のあいだにメモリを手放さず、合計で上限に当たる。ticks が 08:40 UTC 以降 `news_ingest_runs` へ何も残さなかった理由もこれ(落ちる run は記録を書く前に死ぬ)。
直し: job を 4 本に分ける(`20261128100000_news_ingest_stage_split.sql`): tick=`fetch`(:00/:20/:40)・locate=`locate,embed`(:04…)・assign=`assign,link,entities`(:08…)・prune=`prune`(:16…・summarise が :13 を使う)。段の順序と 20 分の周期は同じ。`SCHEDULE`(1 日の要求数の天井)は段の和が同じなので数は変わらず、`edge-spend-and-models` の検査が migration とこの表の一致を見る。
失効条件: Edge Function のメモリ上限が変わったとき、または各段の保持量が変わったとき(組み合わせを測り直す)。
