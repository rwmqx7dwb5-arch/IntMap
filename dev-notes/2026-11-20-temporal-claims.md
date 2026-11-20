---
title: 2 つのレイヤーを同じ時点で比べるとき、組み合わせが 1 つの時点について 1 つのことを述べているかを判定する
date: 2026-11-20
newsen: Atlas can now tell whether two layers can really be compared at one date — flagging a different date, a different resolution, or units drawn on different borders.
newsjp: 2 つのレイヤーを同じ日付で比べてよいかを Atlas が判定できるようになりました。日付のずれ・粒度の違い・国境の引き方の違いを示します。
---

〈依頼〉 各データが「どの時点について何を述べているか」を保ったまま時間軸で比較・結合する（年合わせだけでは足りない）。

## 現状（読んだ正本）
`docs/architecture/07-map.md` §7.4・world-at-time の節。層ごとの「この瞬間を典拠が述べるか」(`verdict`: stated/carried/unstated/unknown) は既にある。GIS の結合は `provenance.geoBasis` と期間の継承（spatiotemporal-join）で既に守られている。**穴は層と Atlas の側**: 2 層を並べたときの判定が無く、宣言に「粒度」も「単位の引き方」も無かった。

## 足したもの
- `js/layer-time.js` `align(A, B, at)`: 閉じた語彙 `unknown → unjoinable → basis-mismatch → skewed → basis-unverified → coarsened → aligned`。理由は `a-carried`・`grain-differs`・`basis-silent` など。
- 宣言に任意の `grain`（典拠が自分で述べた解像度のみ）と `geoBasis`（GIS と同じ語彙＋ `present`＝現在の国境）。`validate` は著者(`by`)の無い `geoBasis`・読めない `grain` を拒む。
- 宣言した層: 世界銀行（P1Y・現在の国境）、Maddison `dl-pop`（P1Y・現在の国境）、`cb-borders`/`cb-countries`/`cb-admin1`（その日の国境）。**述べていない層は述べないまま**——片方だけが述べる組は `basis-unverified`（沈黙は一致ではない）。
- `IntMapLayerTime.align(idA, idB, when)` と Atlas `time.coverage` の `compare:[id…]`（全組の判定を返す）。
- 回帰 `tests/temporal-claims-checks.test.mjs`。

## 測ったこと／残すこと
1914-07-01 の Maddison 人口 × `cb-countries` は `basis-mismatch`（GIS 側が測った Alsace-Lorraine 約 190 万と同じ形）。
未宣言の層（企業拠点・都市人口の粒度など）は意図的に未宣言。典拠が述べる cadence を確かめてから `grain` を足す（推測で埋めない）。
