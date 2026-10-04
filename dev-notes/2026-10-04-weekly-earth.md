---
title: 今週の地球——USGS の M5.5 以上の地震と NASA EONET の自然現象を ISO 週ごとにまとめた公開ダイジェストと、その蓄積する記録（52 週・地震 482・現象 1,799）。週ごとのページ・Atom フィード・sitemap・投稿の下書き・Atlas の weeklyEarth・無人の週次更新
date: 2026-10-04
newsen: New: This week on Earth — every week's large earthquakes (USGS) and natural events (NASA EONET) on a page of their own with a feed, each opening the map where and when it happened.
newsjp: 新しく「今週の地球」を公開しました。毎週の大きな地震（USGS）と自然現象（NASA EONET）を週ごとのページとフィードで読め、どの出来事もその場所とその日の地図で開きます。
---

〈依頼〉修正ではなく商品開発・マーケティング・営業として、検索とフィード購読で人が来て地図へ入る「流入・再訪のエンジン」を
作る。毎週自動で更新される公開ダイジェスト「今週の地球 / This week on Earth」と、その過去の記録。新しい仕組みは作らず、
既存の仕組み（この日の歴史地図の生成器・新着の Atom・無人の定期更新・共有リンク・マイマップ）に乗せる。

## 1. 作ったもの

- **記録** `data/weekly-earth.json`（`scripts/build-weekly-earth.mjs`）: ISO 週ごとに、USGS FDSN の M5.5 以上の地震と
  NASA EONET v3 の自然現象。新しい週が先頭。既にある週は保ち、**暫定の週**（週の終わりから 7 日未満に取ったもの）だけを
  次の実行でもう一度訊く。`GOVERNANCE` に `cadence: 'P7D'` と `autoRefresh` を宣言したので、`scripts/data-refresh.mjs` の
  名簿に載り（`refresh-safe` 緑）、`tle-refresh.yml` の定期ジョブが期限の来たときに週を足して bot PR を出す。
- **読み手** `js/weekly-earth.js`: ISO 週の計算（builder も同じ関数）・文（en + jp）・見出し（最大の地震）・地図のリンク。
- **ページ** `scripts/weekly-earth-pages.mjs`（文 `scripts/weekly-earth-text.mjs`、Vite の `weeklyEarthPagesPlugin`）:
  `weekly/<YYYY>-W<ww>/`・`ja/…`・一覧 `weekly/`・**Atom** `weekly/feed.xml`・`ja/weekly/feed.xml`・`sitemap-weekly.xml`
  （`sitemap-index.xml` に追加）。見た目は歴史地図・この日の歴史地図と同じ head・CSS（`history-pages.mjs` の `shell`）。
  `--queue` は X / Bluesky / Threads の en / jp 下書きを印字するだけ（**投稿しない**）。
- **地図のリンク**: 場所・日（UTC）・題と、**出来事を受け取ったマイマップのピン**（`mm=`）。地震のレイヤー `bx-eq` は
  `share` を持たない生の配信で共有リンクが運べないため、レイヤーを点ける代わりにピンで示した。週全体のリンクは全項目をピンに。
- **Atlas** `time.weeklyEarth`（`weeklyEarth`、`js/atlas-cap-time.js`）: 週（既定は最新）の要約・全項目・ページの URL を返し、
  `open:n` で 1 件、`show:true` で週全体を地図に開く（共有リンクの復元を読み返してから「開いた」と言う）。説明は
  `time.coverage` 節の `at: 27`。
- **入口**: 紹介・組織向けページの足元（`scripts/landing.mjs` `pageLinks`）、設定 ▸ 新着の下のボタン。
- **計測**: `supabase/functions/usage-count/shape.js` の `SITE_PAGES` と `entry` に `weekly`（`maxDims` 10 → 11）、管理画面の札。
  ⚠ **Edge Function `usage-count` の deploy が要る**（受け付ける `entry` の値が増えた。deploy まで `weekly` の行は拒まれる）。
- **出典と規約**: `js/reference-data.js` に EONET の行（`paidBy` と一致）。プライバシー §1（入口のページに「今週の地球」）と
  §4（**ビルド時に**取得して同梱するので閲覧時に USGS・NASA へ何も送らない）を en / jp で。`LEGAL_DATE` を 2026-10-04 に。

## 2. 実測（2026-10-04、初回の実行）

| | |
|---|---|
| 週 | 52（2025-W40 … 2026-W39。2026-W39 は暫定） |
| 地震（M5.5 以上） | 482（USGS は同期間 488 件。差は週の境界外の 6 件——2026-09-28 以降） |
| EONET の現象 | 1,799（洪水 560・海氷 389・嵐 159・山火事 666・火山 25）。位置を示さないもの 175（輪郭だけ） |
| 数えて載せない山火事 | 7,932 |
| ファイル | 569,208 バイト（gzip 74 kB）。読まれるのは Atlas が訊いたときだけ |
| 要求 | 2 件。EONET の 1 年分は 21〜50 秒 |
| 生成ページ | 106 ページ＋フィード 2＋sitemap。週のページ 1 枚 45〜88 kB（gzip 約 14 kB。週全体のリンクが最大 11 kB） |

## 3. 決めた基準（`.agents/rules/no-ad-hoc-hardcoding.md` §4。builder の定数の註に観測・失効条件・正本）

- **山火事の床 10,000 ha**: EONET の山火事 8,609 件（GDACS 6,768 件・中央値 5,842 ha、IRWIN 1,841 件・中央値 1,186 エーカー）。
  全部載せると最大の週が 497 件になり読めない。床で 666 件を残し最大の週 45 件。面積を述べない火事は載せる（「述べない」は「小さい」ではない）。
- **Polygon は位置にしない**: GDACS の洪水の輪郭は軸の順序が混在（180 件中 46 件が明らかに [緯度, 経度]）。推測で置くと
  タイの洪水がインド洋に出る。一覧に載せ、位置は示さないと書く。
- **暫定 7 日**: 推定（USGS の再審査・EONET の情報源の遅れ）。更新の周期と同じ長さなので、暫定の週は次の定期実行で 1 回だけ訊き直される。

## 4. ガバナンス台帳に足したもの（`--update`）と、構造で述べられなかった理由

`data/weekly-earth` と `scripts/build-weekly-earth.mjs → data/weekly-earth.json` の 2 件。後者で述べていない面は
`origin.retrievedAt`・`freshness.generatedAt`・`freshness.asOf`（と未測の integrity 4 つ）。**この 3 つは週ごとの事実**
（各週の `fetched` と `from`/`to`）で、記録の週は別々の日に取られる。ファイル全体の日付を 1 つ書くと嘘になるうえ、
check:datagov が束を in-band の日付で数え、`scripts/data-refresh.mjs` は名簿を git の日付で数える——同じファイルが 2 つの
読み手で違う日付を持つ（data-refresh.mjs 自身が警告している不一致）。前者（束の中の記録）は他の派生束と同じく持たない。
`integrity.schema` は `problems()` を値として述べた。

## 5. 変えた既存の検査（綴りではなく実体に訊くように）

- `tests/marketing-next-checks.test.mjs` ⑨: sitemap の索引を `history-pages.mjs` のソースの綴り（`OTD_SITEMAP].map(`）で
  訊いていた。5 本目を足すと綴りが変わるので、書き出される索引そのもの（`sitemapIndex()` を export）に訊く。
- `tests/marketing-engine-checks.test.mjs` ⑦・`tests/growth-loop-checks.test.mjs`（入口の扉・プライバシーの文）・
  `tests/landing-showcase-checks.test.mjs` ④（ビルドが書く hub）に `weekly` を足した。
- `scripts/atlas-eval/cassettes/rail-request-reached-nothing.json` を `--write` で録り直した（「所要時間 距離」の find が
  `time.*` を全部返すので、新しい `time.weeklyEarth` が末尾に 1 件増えた。それ以外の差は無い）。

## 6. 残したこと

- `usage-count` の deploy（§1）。
- 投稿とフィードの告知は所有者の承認事項（`docs/marketing/README.md` A8）。
- 2025-W40〜W43 の週は EONET の山火事が極端に少ない（数えて載せない数が 55・1・3・6）。上流の記録がそうであって、
  この記録の欠落ではない（同じ要求で W44 以降は数百件）。

## perf の天井

`check:perf` の `dist.total` を main の天井 880,995,962 B に、この回がビルドで足した実測 5,789,779 B（`weekly/` と `ja/weekly/` のページ・フィード・`sitemap-weekly.xml`・`data/weekly-earth.json`）だけを足して **886,785,741 B** に、`dist.data` を同じく `data/weekly-earth.json` 569,301 B だけ足して **745,671,828 B** にした。理由は流入の扉（週ページ）と週の蓄積そのもの。このマシンのビルドと main の計測の差は入れていない。
