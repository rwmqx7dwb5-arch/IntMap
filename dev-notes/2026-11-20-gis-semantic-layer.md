---
title: データの意味の層（Geospatial Semantic Layer）——列・指標が現実で何を意味し何と比べてよいかを持ち、data.gis の演算前に比較・結合の妥当性を警告する
date: 2026-11-20
newsen: A semantic layer states what a column means (scope, border basis, date meanings, aggregation, join keys, terms) and warns before data.gis runs a join or aggregation that is not meaningful from what the data states.
newsjp: 列・指標の意味（対象の範囲・数えた境界・日付の意味・集計規則・結合キー・条件）を持つ層を足し、data.gis が意味上おかしい結合・集計を実行する前に警告するようにした。
---

〈依頼〉 外部監査（2026-11-20）の指摘: CARTO の Semantic Models に相当する、列の意味・指標定義・結合条件を機械可読にして Atlas に渡す層。既存の `gis-datasets`（型・単位・量・時間）、`gis-units`、`data-governance`、レシピの系譜はそれぞれ情報を持つが、「その列が現実で何を意味し、どのデータと比較可能か」を共通に扱えなかった。例の誤り: 現在の国境で数えた人口系列を当時の国境の形へ結ぶ（Maddison、`2026-11-19-spatiotemporal-1914.md`）。

## 何を足したか
1. **`js/gis-semantics.js`**（新規・`window.IntMapGisSemantics`）。facet は scope（行が何の測定か）・basis（数えた境界: present-day / as-of-time）・time（observed / target / published / acquired と、登録簿が検証した `valid`）・granularity・aggregation・keys・terms・constraints。各 facet は `stated` / `derived`（`from` が出所）/ `unstated`。**述べていないことは推測で埋めない**。
2. **導出できるものは導出**（手書き一覧なし）: buffer の半径はレシピ（`radiusKm`）から、格子の大きさは `grid` から、basis は系譜（`provenance.inputs`）を通して、条件は `data-governance.read`、列の集計の可否は `gis-units.aggregations`、「コードに見える列」は列型付けの `padded` の証拠から。導出できない「何を測るか」は供給側が `declare()` か `provenance.semantics` で述べる（形が悪ければ名前つきで拒否し、半端に適用しない）。
3. **`check(step)`**: 実行前の警告。`present-day-basis-on-historical-shapes`（Maddison 型）・`basis-differs`・`time-periods-disjoint`・`join-key-kinds-differ`・`join-key-kind-unstated`・`scope-differs`・`aggregation-refused|needs-weight`（量が禁じる集計）・`aggregation-contradicts-declared-rule`・`declared-constraint`。**`comparable(a,b)`** は 2 列を並べてよいか（量・basis・時間）。
4. **Atlas の扉**（`data.gis` は同じ扉、新しい capability 行は増やさない）: 実行結果に `semantic.warnings` が載る／`semantics:true`＋op なし＝記述（未記述の facet 一覧つき）／`semantics:true`＋op＝**確認だけで実行しない**／`strict:true`＝caution で `semantic-mismatch` により拒否（呼び手の選択）。

## 何が同じだけ働いているか（削除なし）
警告は結果を変えない（op の出力は check の有無で同一。テスト ⑦）ので保存済みレシピの再実行は変わらず、`gis-units`・`gis-ops` は無編集、したがって kernel ではない（`NOT_A_KERNEL` に理由つきで登録）。既存編集は `gis-core.js`（mount と verified 一覧）・`gis-atlas.js`（run の前後）・`atlas-cap-data.js`（schema に `semantics`/`strict`、doc 1 断片）・ゲートの台帳（`global-surface-baseline` ・`geo-gis-datasets` の「パネルは読まない」申告）に限る。

## 限界（正直に）
- **既存の同梱データはまだ何も述べていない**。Maddison 等の供給側が `provenance.semantics` を述べるまで、その警告は `unstated` として出るだけで `present-day-basis-…` は出ない（暗黙の埋めはしない設計）。供給側ごとの宣言は次の仕事で、供給側の声明であって本層の推測ではない。
- 警告は列の型・量が述べられている範囲のみ。`join` 以外の 2 入力 op は time/basis/scope を見るが、キーの照合は `join` だけ。
- 宣言は side store（セッション内）。`gis-project` への保存・再開は未対応（`provenance.semantics` で述べたものは記録とともに残る）。

テスト: `tests/gis-semantic-layer-checks.test.mjs`（9 本）。`check:static`・`check:docs`・`check:archfiles`・`check:surface`・`check:datagov`・`check:capabilities`・`check:catalog`・`check:agents`・`check:i18n`、`geo-gis-datasets`・`atlas-gis`・`layer-boot-graph`・`shell-gis-upload-raster`・`time-spatial-base` の各テストを通した。

## perf の天井

`gis-core` の async チャンクが 622.7 kB → 640.2 kB、async gzip が 4745.6 → 4772.4 kB に上がった。増分は意味の層（`js/gis-semantics.js`）と `gis-atlas.js` の警告配線そのもので、`data.gis` の演算前に比較・結合の妥当性を返す能力の対価。起動時の経路（boot）には載らない。`perf-budget --update` が上げた 2 行だけを `tests/perf-baseline.json` に書いた。
