---
title: 領域を持つ名前は 1 つの規則で消える（国名・政体名・行政区分名）／Objects の不透明度が全種類で効く
date: 2026-11-27
newsen: Province names now disappear once you zoom inside the province, like country names, and the Objects Opacity slider now changes areas, lines, points and labels visibly from 0 to 100 percent.
newsjp: 州・県の名前も、国名と同じく、その領域の内側までズームすると消えます。Objects の不透明度は、面・線・点・ラベルのすべてで 0〜100% が見た目として変わり、100% では濃く表示されます。
---

〈依頼〉 領域を持つラベルは領域が表示範囲を満たしたら消す／Objects の不透明度が効かない・幅が小さい・最大でも薄い。個別対応でなく規則で。

## 1. ラベル
国名（`fitCountryNames`）と歴史の政体名（`_fitEraNames`）が同じ判定を別々に持っていた。`js/country-extent.js` に `gone(items)`（`[{key, box}]` → 消す key の集合。`viewShare` ≥ `NAME_GONE_SHARE`）と `applyGone`（filter への書き込み。他モジュールが filter を書き換えたらそれを新しい base として採る）を置き、国名・政体名・州/県名が全部これを通る。州/県名（`ofm-admin1`）は今までどこにも規則が無かった。領域は同梱の `admin1-world.json.gz`（Atlas・警報パックと `data-door` で 1 回の読みを共有）の各単位の `homeExtent`。z4 未満・レイヤー非表示の間は読まない。名前の一覧は持たない。閾値の定数は変えていない（1・設計値）。

## 2. 不透明度
原因は塗りの基準値の掛け算が painter ごとに違ったこと（測量の面 0.16・アップロード 0.22・Atlas の面 0.32・合成図形 0.2・汎用 0.4）。100% が最も薄い 0.16 で、10〜100% が数百分の一しか動かなかった。`js/object-opacity.js` が唯一の意味を持つ: 線・点・ラベルは値そのまま、面の塗りは 0〜`FILL_AT_FULL`(0.85)。全 painter（測量・アップロード・Atlas 面・合成図形・汎用レイヤー〔symbol の text/icon も〕）がそれを通る。未設定の塗りは従来の見た目のまま、スライダーはその位置（`alphaFromFill`）から始まる。スライダー下限は 0.1→0。パネルと Atlas の `object` 能力は同じ `IntMapObjects.set` を通る。

## 検査
`tests/label-fade-opacity-checks.test.mjs`、`tests/label-fade-opacity.spec.js`（実ブラウザ: 仏の国名が z8 で消え z3 で戻る・東京の都名・面の opacity が 0.1/0.5/1 で動く）。
