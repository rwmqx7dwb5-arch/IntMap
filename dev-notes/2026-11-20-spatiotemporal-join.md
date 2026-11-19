---
title: 時空間 GIS の完成——全ての 2 入力演算が時間の条件と継承を 1 つの規則で扱い、行ごとの期間を持つ入力を時刻で絞って結合でき、現在国境基準の系列を当時の国境へ結ぶ結合は警告を来歴に残す
date: 2026-11-20
newsen: GIS joins, nearest joins, aggregates and overlays can now match on time as well as place or key, each result row carries the period of the pair it came from, and joining a series built on today's borders to rows drawn as they were is recorded as a warning.
newsjp: GIS の結合・最近傍結合・区域集計・重ね合わせが、場所やキーだけでなく時間も含めて照合でき、結果の各行がその組の期間を持ち、現在の国境で作られた系列を当時の国境の行に結ぶと警告が記録される。
---

〈依頼〉 外部監査（2026-11-20）の指摘: `intersect`/`union` だけが 2 入力から有効期間を導き、`join`・`spatialJoin`・`aggregate` は第 1 入力の期間を写すだけで、行ごとに期間が違うデータは時刻で絞って結合できなかった（`dev-notes/2026-11-19-spatiotemporal-1914.md` §5 が「直さなかったもの」に挙げていた）。

## 0. 何が欠けていたか（コードで確認）
- 第 1 入力の期間を写す: `join`・`spatialJoin`・`nearestJoin`・`aggregate`（`timeJoin` は時間だけで照合するが出力の期間は第 1 入力のまま）。
- 時間を条件にできるのは `timeJoin` と `timeWindow` だけ。キーの結合は右の重複キーを**常に**拒む（`join-right-not-unique`）ので、同じ国コードの行が期間ごとにある系列（帝国とワイマールが両方 DEU）はキーで結べなかった。
- 現在国境基準の系列と当時の政体の行は同じコードで結べてしまい、何も言わなかった（前記録 §3 が約 1.9 百万人の差を実測していた）。

## 1. 何を足したか
1. `js/gis-ops.js` `makeTimeKit`: **1 つの規則**。走者が入力の役割（`shape` / `attribute`）を述べる——op ごとの表は無い。出力は述べた入力の期間の重なり。期間を述べない `attribute`（CSV の統計表）は期間を狭めず `timeRule.unstatedAttributes` に名指される。期間を述べない `shape` なら出力の期間も述べない。
2. 5 つの op（`join`・`spatialJoin`・`nearestJoin`・`aggregate`・`timeJoin`）が同じ時間条件 `when`/`at`/`from`/`to`/`ends` を持つ。`nearestJoin` は**候補を絞ってから**最近傍を取る。`join` は時間条件があるとき、条件を通った行が複数のときだけ重複を拒む。
3. 行ごとの軸（`instant`/`interval`）を持つ入力があると、出力の各行が組の期間を `_validFrom`/`_validTo`（半開）に持ち、出力はそれを軸として宣言する（`timeWindow` がそのまま使える）。`intersect` も同じ。
4. `provenance.geoBasis`（`IntMapData.declareGeoBasis`）と、組ごとの検査。固定年が相手の行の期間に入らなければ `provenance.warnings` に `geo-basis-mismatch`。述べていないことは一致ではなく `geo-basis-unverified`。結合は**止めない**（差を見たい用途がある）。
5. `js/gis-atlas.js` `datasetRow` が `warnings`・`timeRule`・`geoBasis` を planner に渡す。
6. `KERNEL_VERSION` を `ops-14` に。検査 `tests/spatiotemporal-join-checks.test.mjs`（18 件。1914 年ヨーロッパの帝国行 × 2020 国境の人口系列を含む）。

## 2. 何が同じだけ働いているか
消した能力は無い。時間条件を付けない呼び出しは従来と同じ行・同じ列（行ごとの軸の入力があるときだけ 2 列が足される）。変わるのは結果が**述べる期間**だけ（第 1 入力の期間 → 入力の期間の重なり）。

## 3. 直さなかったもの
- `relate`・`voronoi`・`profile`・`reach`・`compareZones` の期間（`profile` は内部で `aggregate` を呼ぶが時間条件の引数を通していない）。1 入力しか形を出さない op は第 1 入力のままでよいが、上の 5 つは別の仕事。
- `union` の行ごとの軸（3 種類の部分 `a∩b`/`a−B`/`b−A` で期間の導き方が違う）。`row-wise` と述べて規則を適用していないと言う。
- Maddison など実データへの `geoBasis` の付与（宣言の入口のみ。どの読み込み経路がどの基準かは各取り込みの仕事）。
