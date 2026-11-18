---
title: Chronos の技術監査が指した 3 件——西暦 0〜99 年の期間が拒否される・現在の国境との比較が丸ごと飛ばされる・歴史形状が無い年に現代の国がハイライトされる
date: 2026-11-19
newsen: Atlas can now compare a past year with today's borders, accepts periods inside AD 1–99, and no longer paints today's country over a past year whose border record has no shape for it.
newsjp: Atlas が過去の年と現在の国境を比較でき、西暦 1〜99 年の期間も受け付け、過去の年の国境記録に形が無い国を現在の国の形でハイライトしなくなった。
---

〈依頼〉 外部の Chronos・歴史地図・時空間 GIS の技術監査（2026-11-19、main `4e7275f`）の指摘を、できるだけ全部直す。

## 0. 実コードで確認したこと
監査の記述のうち、コードで再現できたものだけを直した。

| 指摘 | 確認 | 扱い |
|---|---|---|
| `changesPeriod` が `Date.UTC(year…)` で年 0〜99 を 1900+year と読む | 再現（50 → 1950。「50→100」が empty-period で拒否） | 修正 |
| `time.changes` は片端が `modern:true` だと政体の比較を丸ごと飛ばす（1914→現在が比較されない） | 再現（`atlas-cap-time.js` の `!r0.borders.modern && !r1.borders.modern`） | 修正 |
| Atlas の国ハイライトが、過去の年で歴史形状が無いと現代ポリゴンに落ちる | 再現（`atlas-console.js` `highlight`） | 修正 |
| GIS 演算の出力が第 1 入力の時間宣言だけを継ぐ | 確認（ベクタ。ラスタは `rasterOutTime` が統合済み） | **今回は直さない**（下） |
| 時刻を証明できない供給が `partial` で通る | 確認（`time-not-established`） | **今回は直さない**（下） |

## 1. 何を直したか
1. `js/atlas-reasoning.js` `changesPeriod`: 比較の物差し `k()` を `setUTCFullYear` で作る（chronos.js・gis-datasets.js・hist-scale.js が既に述べている落とし穴と同じ形）。
2. `js/year-book.js`: `modernPolityRows` を追加。現在の国ポリゴンを、国境記録の行（`en`・`name`・`km2`・`bbox`）と同じ形にする。`readYear` は `opts.modernRows` のときだけ現代側にも `largest` を付ける（他の読み手は `modern: true` のまま変わらない）。`pageDeps` に `modernGeo` と `countryNameEn` を足した。
3. `js/atlas-cap-time.js` `time.changes`: 両端に `modernRows: true` を渡し、現代側があっても `diffPolities` を走らせる。**答えは「現代側は現在の国のポリゴンを英語名で対応づけた」「改称・分裂・統合は消滅＋出現の組として現れる」「面積の差は描かれた面積の差で、誰がどの土地を持っていたかの差ではない」と述べる**（en + jp）。
4. `js/atlas-console.js` `highlight`: 地図が過去を描いていて時代の記録に形が無い国は、現代ポリゴンで塗らず、塗らなかったと報告する（`any` が偽のまま）。ライブ日付では `_eraActive()` が偽なので何も変わらない。

## 2. 何が同じだけ働いているか
消した能力は無い。比較は以前は「両端が歴史」のときだけ答えたが、いまは現代側でも答える（加算）。ハイライトは、過去の年に現代の形を事実として描く経路を 1 本閉じた（Compare 画面の同じ譲りは別画面の方針なので触っていない）。

## 3. 直さなかったもの（理由）
- **GIS 演算の時間宣言の統合（ベクタ）**: ラスタは「どの入力が形だけを借りたか」を各ランナーが `shapeOnly` で申告するから統合できる。ベクタの各演算にその申告は無く、2 つ目の入力が単なるマスクの演算でも期間を括ってしまう／null にしてしまうと正しい連鎖（timeWindow など）が壊れる。各演算が申告を持つ設計が先。
- **時刻不成立の供給を分析から弾く規則**、**valid time / transaction time の統一モデル**、**1914 年ヨーロッパの検証済み国境・人口・鉄道の結合例**、**政体 ID の時間付き追跡**: いずれも新しいデータ・設計を要する別の仕事で、今回の範囲（実装の欠陥を直す）を超える。
- 歴史的鉄道の 1900 年以降の「年代不明は存在した」仮定は、結果に推定割合を記録する既存の仕様どおりで、欠陥ではなく精度の限界。

## 4. 検証
`tests/hist-audit-fixes-checks.test.mjs`（評価する検査）: 期間 50→100 が通る・99→10 は拒否・現代ポリゴンが行になり `diffPolities` が差を出す・ハイライトの guard が現代ポリゴン参照の前にある。既存の `atlas-reasoning-checks` は緑。
