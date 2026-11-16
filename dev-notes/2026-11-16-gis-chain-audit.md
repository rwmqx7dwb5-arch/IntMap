---
title: GIS の連鎖を 4 つの内部課題として実際に通し、止まった 3 か所を構造で直す——表示していない気温は画素ごとに 1 依頼、描かれていない点レイヤーは格子扱い、プロジェクトは Atlas から届かなかった
date: 2026-11-16
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

**未解決（判断が要るもの）:**

- **人口の格子がどこにも無い。** `dl-popgrid` は GIBS の GPW 画像タイルで値を持たず、`layer:` の供給元にならない。一方で Atlas の
  手引き（`map.drawDataset` の doc）は「施設から5km圏を作り、統合し、その範囲の人口を集計」を例に挙げている——**約束しているのに
  実行できない**。値を持つ人口格子（GHSL・WorldPop・GPW の値版など）の追加はデータソースの変更（出典・利用規約・営利利用の条件）
  なので、着手前に確認する。`js/layer-time-decl.js` は WorldPop と書くが実装は GPW で、これも同じ判断で揃える。
- **Atlas 夜間評価は 2026-10-17 以降 1 回も測っていない**（secret `ATLAS_EVAL_REFRESH_TOKEN`・`ATLAS_EVAL_SECRET_WRITER` が無い）。
  どちらも本人のログインと本人の PAT が要る（`docs/TESTING.md`「Atlas evaluation」手順 3・4）。
