---
title: データガバナンス台帳の未申告を減らした——裏づけのある欄だけを埋め、planets の索引を生成側に足した
date: 2026-11-19
newsen: The data provenance ledger lists 49 fewer unstated facts, and the planet texture folder now carries its own licence and listing.
newsjp: データ出自の台帳で、未申告の項目が 49 件減り、惑星テクスチャのフォルダが自身のライセンスと一覧を持つようになった。
---

〈依頼〉 外部評価が「台帳の未申告が多い」と指摘（実体照合で正しい）。実データと上流の記述に基づいて減らす。推測で書かない。

## 0. 測った（`node scripts/data-governance.mjs --report`）

- 台帳 `counts`: undeclared 205 subject / 2630 facet / shardsWithoutIndex 1。
- 内訳: ビルダー宣言側 109 subject・1269 facet、バンドル自身（in-band）側 96 subject・1361 facet。
- 欠け方の多い順（facet 数）: integrity.rows/missing/outOfRange/duplicates 各 202、retrievedAt 199、asOf 199、integrity.schema 185、licenceUrl 178、generatedAt 158、licence 155、paidBy 152、attribution 135、publisher 125、url 103。

## 1. 減らしたもの（2630 → 2581、shard 1 → 0）

- `data/planets/`（JPEG 9 枚）に索引が無かった。**生成側**（`scripts/build-planet-data.mjs`）が `data/planets/index.json` を書くようにした: Solar System Scope の宣言（GOVERNANCE の同じリテラル）と、ビルドが測った 1 体ごとの一覧。`generatedAt` は、今回取得したなら今回の時刻、取得していない（`--skip-textures`）なら前回の `prev.built`——今日の日付を他人の書いたバイトに被せない。現物は現在の `data/planets.json` の値から作った。
- 既に述べている条件の `licenceUrl` を、その条件の正式 URL で補った（cshapes / hist-admin-surveys-nc / npp / on-this-day / osm-sparse。CC・ODbL の正式 URL）。
- 裏づけのある欄だけ埋めた:
  - GeoNames 3 本（gazetteer / gazetteer-phone / histcities-homonyms）の条件を `scripts/lib/upstream-cadence.mjs` の `GEONAMES_TERMS` に 1 か所にまとめ、3 本から展開（ダンプのヘッダが述べる CC BY 4.0・`js/reference-data.js` の行 `GeoNames` と同じ値）。以前は 2 本が「写しを作ると二重の綴りになる」として黙っていた。
  - Slab2: USGS ScienceBase のリリース。条件は `js/reference-data.js` が既に公開している値（Public domain・クレジット不要）。出版者を USGS とした。
  - hist-admin1 の 3 階層: OpenHistoricalMap は CC0（同ビルダーのヘッダが測定済み）。
  - Glottolog 別名: 同ファイルの `GLOTTOLOG_STAMP` が述べる CC BY 4.0・支払う行の名前。

## 2. 減らせなかったもの（理由）

- **integrity.\*（約 1000 facet）・retrievedAt・asOf・generatedAt（約 550）**: ビルド時に上流を取って測らないと言えない値。ビルダーが `measureQuality` で数えた結果を述べる仕組み（`scripts/lib/gov-stamp.mjs`）は既にあるが、各ビルダーを実走させる（上流を取り直す）必要があり、ここでは現物から推測して書かない。
- **バンドル自身の記述（in-band）96 subject**: 書き手はビルダーで、バンドルのバイトを書き換えるには再ビルドが要る。バンドルとビルダーは別 subject であり、一方が他方の代わりにならない（ゲートの設計）ため、宣言から写して緩めていない。
- **publisher / url / licence が空の約 40 ビルダー**: 上流の条件を `js/reference-data.js` や builder 内で確認できなかったもの（例: UNDP HDR、Smithsonian GVP、WHO DON、AWS Terrain 由来、NOAA）。調べないまま書かない。
- **複数上流の記録（subcables など）**: 上流ごとに条件が違い、1 つの `licence` を主張すると誰も述べていないことになるため残した。
- **precedence（rank/over、約 50 facet）**: どの上流が勝つかの判断が要る。各ビルダーの採用順を読んで決めるべきで、ここでは決めていない。

台帳は緩めていない（`--update` で縮めただけ）。
