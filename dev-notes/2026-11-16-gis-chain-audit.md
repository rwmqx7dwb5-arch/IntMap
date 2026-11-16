---
title: GIS の連鎖を 4 つの内部課題として実際に通し、止まった 3 か所を構造で直す——表示していない気温は画素ごとに 1 依頼、描かれていない点レイヤーは格子扱い、プロジェクトは Atlas から届かなかった
date: 2026-11-16
newsen: Analyses can now count the people living in an area. A 1 km population grid from WorldPop (2000–2020) can be summed over any area you draw or compute. Atlas can also save an analysis, reopen it later, and recompute it after you change one step.
newsjp: 分析で「その範囲に何人住んでいるか」を数えられるようになりました。WorldPop の 1 km 人口格子（2000〜2020 年）を、描いた範囲や計算で作った範囲で合計できます。Atlas は分析を保存して後から開き直し、1 段の条件を変えて計算し直すこともできます。
---

「作れるか」ではなく「いまある実装でどこまで通るか」を測るために、取得 → 加工 → 地図 → 保存 → 条件を変えて再計算、を
4 つの課題として**実ブラウザ（Playwright・ローカルの dist）で**出荷済みの扉（`IntMapGis.atlas`・`IntMapGisProject`・
`IntMapOS.execute`）から通した。⚠ アプリ内のプレビュー枠は非表示だと地図のスタイルが読み込みを終えず
（`whenCanDraw` が返らない）、そこでの「描けない」は環境の所見だった——同じ dist を Playwright で開くと約 1 秒で描ける。

| 課題 | 結果（修正前） |
|---|---|
| ① 表示していない内蔵データを範囲・属性で取得 | 世界遺産は通る（103 件・`all`）。**地震は `bad-param width`**。**気温は 16×16 の窓で 30 秒に Open-Meteo へ 91 依頼・未完** |
| ② 施設 → 距離圏 → 合併 → 人口を集計 → 描画 | buffer・dissolve・描画は通る。**人口の格子は `layer:` に 1 つも無い**（下の未解決） |
| ③ 二時点比較 | 時計は表示と `time.*` に効き、GIS とデータ横断クエリは期間を引数で受ける設計（`js/gis-layers.js` が述べるとおり）。欠陥ではない |
| ④ 保存 → 1 段の条件変更 → 再開 | 手操作の扉は全部通る（save / setParams で下流 3 段を再計算 / load）。**Atlas に能力が無かった** |

直したこと:

- **種類を描画に訊いていた（地震ほか 7 行）。** `js/gis-sources.js` `list()` は供給元を持たない行を、描かれていなければ
  `grid` に落としていた。登録が持つ扉で決める（`IntMapLayers.payloadOf`）。描かれていない点の行は名前の付いた拒否で返る。
- **場を画素ごとに上流へ訊いていた（Open-Meteo の 8 行）。** 登録が窓の扉 `region` を述べ（`IntMapLayers.regionOf`）、
  `supplierFor()` がそれを `supply({region})` の供給元にする。位置を 1 本の URL に 100 個ずつまとめる。自分の場（ECMWF）を
  `measure` と同じ順に先に読み、読めない塊が 1 つでもあれば窓ごと拒む。実測: **3 依頼・約 5 秒**。
  端点・変数・単位の宣言は `_omSpec` 1 か所に寄せ、点の経路と窓の経路が同じ宣言を読む。
- **風の `value` が経路で単位を変えていた。** 場の経路は m/s、Open-Meteo の経路は km/h を同じ欄に入れていた。上流に m/s を
  頼み、文は場の経路と同じ整形（読者の単位）にした——見える文は変わらない。
- **Atlas の `data.gisProject`**（save / list / open / rerun / remove）。プロジェクト層の 1 呼び出しずつで、拒否はそのまま返す。
  永続（IndexedDB）なので risk `persist`、remove と open が読者の物を置き換えるので confirm `explicit`。
- `PRODUCT.md` が「Shapefile はまだ読めない」と書いていた（読み手は #R738 から在る）。形式の正本 `docs/architecture/07-map.md` へ寄せた。

形式上の整理: `_om` の 8 本の `if` 腕は `_omSpec` へ移った（同じ宣言を 2 経路が読む）。`window.Wind`・`IntMapECMWF`・`IntMapWx`・
`fmtWindSpeed` の読みは補助関数 1 つずつに寄せ、新しい経路は読みを増やしていない（`fmtWindSpeed` は 8 → 7）。増えた 2 件（`IntMapLazy`・`IntMapGisProject`）は能力行が遅延
チャンクを開く既存の形で、import にすると `gisCore` が起動経路に載るので `global-surface --update` で記録した。

検査: `tests/gis-chain-audit.spec.js`（Open-Meteo を「複数位置の形だけ答える」スタブにし、依頼数そのものを主張にする。
4 課題を出荷済みの扉で通す）。`tests/geo-gis-sources-checks.test.mjs` の #R763 ① は、行を作る `_omRead` を読むよう向け直した。

**人口の格子（利用者承認のうえで追加）。** `dl-popgrid` は GIBS の GPW 画像で値を持たず、Atlas の手引きが例に挙げる
「施設から5km圏を作り、統合し、その範囲の人口を集計」は実行できなかった。候補を比べた（2026-11-16）:

| 候補 | 条件 | 配信 | 採否 |
|---|---|---|---|
| **WorldPop 1 km（2000〜2020）** | CC BY 4.0（hub.worldpop.org） | WorldPop 自身の ArcGIS ImageServer が任意の窓を Float32 GeoTIFF で返し、本番の origin に CORS を返す（実測） | **採用**——同梱も前処理も要らず、既存の GeoTIFF 読み手でそのまま読める |
| GHSL GHS-POP（1975〜2030） | 欧州委員会の再利用条件（CC BY 4.0 相当。表記が資料間で揺れる） | zip の GeoTIFF。ブラウザから窓で読める配信を確認できなかった | 年代は広いが、配信を自前で用意する必要がある。将来の拡張候補 |
| GPW v4 の値 | CC BY 4.0 | 取得に Earthdata のログインが要る | 不採用 |

`js/population-grid.js`: セルは「その 30″ セルの人数」なので、呼び手が決めた画素寸法で数を返すと粗い窓で合計が狂う。
セルの地面の面積（`js/gis-raster.js` pixelAreaKm2）で割って **人/km²** にし、帯に `quantity`（density）を述べる——区域集計の
`areaIntegral` がそのまま人数になり、素の `sum` は断られる。実測（東京中心部 1,085 km²・2020）: 60×42 で 12,925,966 人、
240×168 で 12,947,591 人（画素寸法によらず 0.2% 以内）。年・セル寸法・最大画像寸法はサービス自身の記述から読む（2000 より前は
`time-not-covered`）。登録は `js/map-ui.js` の `population` 行（描画を持たない）。帯の `quantity` を運ぶため `js/gis-raster.js`
samplerGrid と `js/gis-sources.js` fromSupplierRegion に 1 欄足した（述べない帯は従来どおり。版は据え置きでハッシュだけ記録）。
出典表（`js/reference-data.js` に CC BY 4.0）・プライバシー §4（worldpop.arcgis.com に窓の四隅と年が送られる、en/jp）・外部ホスト台帳・
接続台帳・生成ページを更新した。あわせて `js/layer-time-decl.js` の画像レイヤーの説明を実装どおり GPW に直した（WorldPop と書いていた）。
Atlas の手引き（spatial-analysis）に `layer:population` の使い方を足した。

**未解決:**

- **Atlas 夜間評価は 2026-10-17 以降 1 回も測っていない**（secret `ATLAS_EVAL_REFRESH_TOKEN`・`ATLAS_EVAL_SECRET_WRITER` が無い）。
  どちらも本人のログインと本人の PAT が要る（`docs/TESTING.md`「Atlas evaluation」手順 3・4）。
