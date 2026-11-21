---
title: 行政区分の人口を日付・決定方式・存続期間つきで持つ——都道府県を人口で色分けできなかった（同梱の第 1 級境界 4,515 に数値が無かった）。Wikidata の人口の記述を 4 種のキーで取り込み、Atlas geo.regionStat で表と色分け
date: 2026-11-20
newsen: Ask Atlas to colour prefectures, states or regions by population: each figure carries the date it was stated for and how it was determined, and years the source does not state are refused instead of guessed.
newsjp: 都道府県・州・地域を人口で色分けできるようになりました。数値には「いつのものか」と「どう決めたか」が付き、出典に無い年は推測せずに断ります。
---

〈依頼〉日本の都道府県・市区町村、米国の州・郡、欧州 NUTS 等の統計を、時間と定義が分かる形で実データから結び、Atlas・地図から色分け・分析できるように。歴史行政区分との結合は年だけで合わせない。

## 測ったこと（2026-11-20）

Wikidata Query Service で P1082 を持つ単位: P300（ISO 3166-2）30,703 記述／4,702 単位、P605（NUTS）14,271／1,429、P882（FIPS）23,551／3,753、P429（JIS）6,284／1,976。
記述には P585（時点）と P459（方式）が付く。生成結果: 75,592 記述、iso3166-2 4,671・nuts 1,532・us-fips 3,751・jp-jis 1,977 単位、方式 170 種。
東京都は 2005/2010/2015 が「国勢調査」、2020・2022 は方式が述べられていない（null のまま。方式を補わない）。

## したこと

- `scripts/build-admin-stats.mjs` → `data/admin-stats.json.gz`（659 KB）。キーごと・コード接頭辞ごとに分割して問い合わせる（1 回で全部は時間切れ）。
  失敗の実測 2 件: 方式ラベルの問い合わせを GET で送ると URL 長で 414（POST に）、「値不明」の方式が QID でなく genid の URI で来て 400（QID のものだけを方式とする）。
- `js/admin-stats.js`: `table` / `valueAt` / `definitionAt` / `boundaries`。年に記載が無ければ拒否、許容年を述べたときだけ最寄りでズレを名乗る、日付の無い記述に年を与えない、
  単位の存続期間の外は拒否、方式・年の混在を申告。
- Atlas `geo.regionStat`（`js/atlas-cap-geo.js`）。第 1 級は `draw:true` で同梱境界に ISO 3166-2 で結んで 5 分位の色分け。他の 3 種は表（境界が無いので描けないと述べる）。
- `tests/admin-stats-checks.test.mjs`: 実ファイルで日本 45 以上の都道府県・東京の値と日付、境界への結合（日本 45 以上・米国 50 以上）、合成単位で拒否・許容・存続期間・混在。

## 残したもの（消せる条件つき）

- **歴史境界への結合そのもの**: 番人（`definitionAt`）は在るが、歴史行政区分（js/hist-*）の単位と QID で結ぶ読み手は未実装。消せる条件: 歴史の単位が Wikidata QID を持つこと（持たないものは結べないと述べる）。
- NUTS・米国の郡・日本の市区町村は境界を同梱していないので表のみ。NUTS の分類改定（2013/2016/2021）をまたぐ比較は、単位の存続期間では見えない——年を述べて引くこと。
- 決定方式が述べられていない記述が新しい年ほど多い（東京 2020・2022）。出典に無いものは補わない。
- 出典: 既存の Wikidata（CC0 1.0）の行がそのまま当てはまる（新しい出典は足していない）。

## グローバル経由の読み 2 件（check:surface の台帳を更新）

`window.GeoJSONUpload`（5→6）と `window.IntMapAtlasAdmin1`（1→2）を `js/atlas-cap-geo.js` の geo.regionStat が読む。前者は地図へレイヤーを載せる唯一の入口（js/map-ui.js の中にあり、他の Atlas 能力も同じ経路）、
後者は同梱境界の索引（1 セッション 1 つ。import で別インスタンスを作ると同じ 7.5 MB から索引を二度組むので、既存の 1 つを読む）。どちらも所有者が export を持つまで台帳で受ける。

## ガバナンス台帳（check:datagov の ledger-shrinks）

`data/admin-stats` と `scripts/build-admin-stats.mjs → data/admin-stats.json.gz` は台帳で undeclared 207→209 に増える。出自（publisher・url・builtBy）と cadence はビルドの GOVERNANCE に値として述べてある。
残る facet（権利の licence/licenceUrl/attribution・retrievedAt・schema/rows/missing）は、同じ形の既存 bundle（`data/hdi-series.json` など）と同様に生成物の中に述べておらず、台帳の更新で受ける。
権利は既存の Wikidata（CC0 1.0）の DATA_SOURCES 行に帰属し、新しい出典は足していない。消せる条件: 生成物の冒頭に retrievedAt・licence を述べる形にビルドを直すこと（hdi-series と同時に直す）。

## 拡張(2026-11-21)——NUTS を描き、歴史区分へ識別子で結ぶ
- **NUTS の色分け**: `geo.regionStat` が `kind:"nuts", draw:true, level:1|2|3` で Eurostat GISCO の NUTS 2021 境界（既に `world-packs.js` が使うホスト・`NUTS_RG_20M_2021_4326_LEVL_n.geojson`）を取得し、`AS.nutsBoundaries` が **NUTS_ID と Wikidata の P605 の一致**（名前でなく識別子）で数値に結ぶ。数値の無い境界・境界の無い数値は**数えて返す**（`figuresWithoutBoundary`）、分類は NUTS 2021 一つと明言し、他の版（2013・2016）のコードは「結べなかった」と言う。実測: ドイツの NUTS 2 は Wikidata が人口を述べる単位が 17（NUTS 2021 は 38）。**足りない分を補っていない。**
- **歴史区分との識別子結合**: `AS.historicalAt(bundle, code, year, unit)`。`data/hist-admin-fill.js` の行は鍵として ISO 3166-2 を持つ（`f[10]`）ので、同じコードを述べる統計の単位と**コードで**結ぶ。実測: 鍵 1,096 のうち 1,011（92%）が統計の単位に結べる（行 1,229 のうち 1,127）。年は、統計の単位の存続期間（`definitionAt`）と束自身の述べる設立（`inception`）の**両方**が通すときだけ。⚠ fill 束の輪郭は**現在の輪郭**（`todayOutline`）なので、答えは `outline:'present-day'` と名乗り、1990 年の数値を当時の形でない線の上に載せない。
- **まだ結べていないもの（消せる条件つき）**: OHM 由来の `hist-admin1/2/3`（行は OHM 関係 id を持ち、Wikidata id を持たない）・`recon`（`TUR:Kayseri` 等の出典独自の鍵）・`surveys`（`ristat:1897:55`）は ISO 3166-2 を述べないので統計と**結べない**（名前では結ばない）。消せる条件: それらの行が Wikidata QID か ISO 3166-2 を述べること。UI への配線（`regionStat` が過去年で歴史の輪郭を描く）は**未了**——fill 束は 1.7 MB・recon は 18 MB で、遅延読み込みの設計が要る。
- **米国の郡・日本の市区町村**は境界を同梱しておらず、**境界の出典を新たに足す作業**（利用条件を読む）が要るため表のみのまま。答えは表であることを述べる。
- 検査: `tests/admin-stats-checks.test.mjs` に ⑥ NUTS の結合と数え上げ ⑦ 歴史の結合（コード・存続期間・現在の輪郭）⑧ 実際の fill 束との結合率 を追加。
