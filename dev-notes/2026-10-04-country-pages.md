---
title: 国別の入口ページ——「<国名> 地図」「<国名> 人口 地図」「<国名> 歴史 地図」で探す人を、その国を開いた地図へ連れてくる静的ページを全 252 の国と地域に（en / ja）。国の集合・行・ライセンス条件は公開 API、枠はアプリの国の検索、地域は歴史地図の入口、出来事はこの日の歴史地図の索引から読み、書き起こさない
date: 2026-10-04
newsen: Country pages — one page for each of 252 countries and territories that opens the map on it, with its population density, the historical maps of its region and its open data
newsjp: 国別の入口ページ——252 の国と地域それぞれに、その国で地図を開き、人口密度・その地域の歴史地図・オープンデータへつなぐページ
---

〈依頼〉「修正でなく商品開発・マーケティング・営業」。静的な入口は 2 つ（歴史地図の検索入口＝地域 × 年、この日の歴史地図＝暦の日）。
3 つ目の軸「国」を足す。

## 0. 測った（着手前）

- **国で探す人の入口が無かった。** 地図の状態はアドレスの断片（`#v=…`）にあり検索エンジンに届かないので、「日本 地図」で
  IntMap の地図を日本で開いたものは、どこからも見つけられなかった。
- **国の集合と国ごとの行は既にあった。** `scripts/public-api.mjs` の `countryUniverse()`（Natural Earth admin-0、252 コード、
  全コードに `NAME_JA` あり）と `countryFile()`（提供されるデータセットの国ごとの行と、その条件）。提供 37・不提供 51（実測）。
  国ごとの表は 7 本（airports・country-facts・health・language・mobility×2・religion）。**人口は提供されるデータセットに無い**
  ——人口は地図のレイヤー（`dl-popgrid`、共有リンクが運べる）で見せる。
- **国の枠もアプリが既に持っていた。** `js/country-extent.js` `homeExtent`——遠い属領を含めない国そのものの枠で、日付変更線を
  またぐ国は 180 を越える 1 つの区間（実測: ロシア 26.94〜191.01、フィジー 174.59〜181.78）。全体の min/max（`fullExtent`）では
  ロシアは経度 360°、米国は 358.9° になり枠にならない。
- **戦争記録の位置つき出来事 655 件**のうち、点と多角形の包含で国の輪郭に入るのは 608 件（89 か国）。残り 47 件は海上など。
  同じ日・同じ地点に別の出来事が 2 件ある（1941-06-22 ベラルーシ）——同一視の鍵に名前まで要る。

## 1. 作ったもの

- `scripts/country-pages.mjs`（生成器と `countryPagesPlugin`）・`scripts/country-pages-text.mjs`（en + jp の文）。
  `countries/<code>/`・`ja/countries/<code>/`・一覧 `countries/`・`ja/countries/`（各言語の名前順、`Intl.Collator`）・
  `sitemap-countries.xml`（`sitemap-index.xml` に追加）。殻・head・ナビ・JSON-LD・sitemap は `history-pages.mjs` のもの
  （`sitemap` を生成器名つきで export した）。
- 各ページ: 国の枠の地図・人口密度の地図、基本データ 4 項目（カードと同じ項目とラベル、出典とライセンスを併記）、
  輪郭が入る地域の歴史地図（全球の枠は何も言わないので除く）、輪郭の中の出来事（その日のページへ）、提供されるデータセットごとの
  ライセンス・条件・表示する出典と `api/v1/countries/<CODE>.json`。
- `api/v1/countries.json` の各国に `page`（en / ja）。紹介・授業・組織向けページのフッタと歴史地図のハブから一覧へ。
- 匿名集計: `entry` に `countries`（`maxDims` 10 → 11）、管理画面の札。**Edge Function `usage-count` の変更**（要配備）。

## 2. 判断

- **ライセンスはこのファイルが決めない。** 節は `countryFile` が運ぶ（＝提供される）データセットのものだけ。検査は
  `data/country-facts.json` をサイトに無いことにして、基本データとその札が全ページから消えることを実際に確かめる。
- **現代の国を歴史上の政体と同一視しない**（historical-verification）。歴史地図は「この輪郭が入る地域の地図」とだけ言い、
  出来事は「今日の輪郭の中の地点に日付のある」と言う。
- **Atlas には足さなかった。** Atlas の国（`data.countryCard`）は `countryStats` の `ADM0_A3` で国を持ち、ページのコードは
  `ISO_A3_EH` 優先（例: 南スーダン SDS / SSD）で、URL を返すには対応表が要る。Atlas の読者は既に地図の上にいて、
  入口ページは検索エンジンから来る人のためのもの——返す相手がいない能力になる。必要になれば `countryPath` を
  ブラウザ側の 1 か所に移して両方から使う。
- データセットの説明文（`about`）は載せなかった。カタログの `about` は出典名で引く言い回しで、国ページのタイルには
  別のデータセットの説明が当たる（実測: airports に country-facts の説明）。

## 3. 測った（後）

- 252 の国と地域 × 2 言語 ＋ 一覧 2 ＝ 506 ページと sitemap 1 本（507 ファイル）。ビルド内の生成 3.6 秒。
- dist の増分（ビルドで実測、圧縮前）: `countries/` 2,827,263 B・`ja/countries/` 3,148,186 B・`sitemap-countries.xml` 216,508 B、計 約 6.2 MB
  （1 ページ平均 約 11.8 kB。大半は共通の head とライセンス・出典の行）。起動時に読まれるものは増えていない（静的ページはアプリから読まれない）。
- **`check:perf` の `dist.total` の天井を上げた**——main の天井 874,804,005 B に、上の実測の国別ページ 6,191,957 B だけを足して **880,995,962 B**。理由は国別ページそのもの（検索から入る扉は 1 ページずつの静的 HTML でしか作れない）。⚠ このマシンのビルドは main の計測より約 2 MB 大きく出たが、その差はこの差分のものではないので天井に入れていない（帯 3.7 MB の内側。CI の計測が main と同じ環境で読む）。
