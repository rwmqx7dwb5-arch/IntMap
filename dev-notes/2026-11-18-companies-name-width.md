---
title: Companies と Countries の行——社名の欄が最低限の幅を保ち、時刻は折り返す／国カードの値に年と並べて出典
date: 2026-11-18
newsen: Company and country names in the Companies and Countries lists stay readable when a live quote time is shown, and the country card names the source of each figure beside its year.
newsjp: Companies と Countries の一覧で、ライブ株価の時刻が出ても社名・国名が読める幅を保つように。国カードの各数値に、年と並べて出典を表示。
---

〈依頼〉本番検証（build dcd32a0）で見つかった退行: 1440×900・ダークで、ライブ株価の時刻（「2026-11-18 01:14」）が Companies の行に入ると社名の欄が 34 px まで縮み、「Apple」「Microsoft」「NVIDIA」が「A…」「Mi…」「N…」になる。1 件の幅を足すのではなく、行の列の取り方として直す。あわせて、国カード本体に値ごとの出典が無い点を判断して扱う。

## 0. 測った（ローカル build・時刻を全行に入れて）

行 351 px（デスクトップ）／358 px（390 px 幅の携帯）の内訳: 順位 28・丸印 16・ロゴ 30・**社名 43**・値 93・詳細 56、列間 11 px×5。値の欄は「$3.02T」と改行しない時刻（`.co-asof` は `white-space:nowrap`、親の `.stat-val` も nowrap）で 93 px から縮めず、縮められる唯一の欄だった社名（`.stat-main{flex:1;min-width:0}`）が残りを全部失っていた。推測（丸印と詳細ボタンで詰まった）は半分正しい——2 列が足されて列間が 2 つ増えたうえで、時刻が値の欄を最小幅に固定していた。

## 1. 直したもの（行の規則・`css/intmap.css`）

- 社名の欄に床: `.stat-row` の `--stat-name-min`（5.5rem＝88 px）を `.stat-main` の `min-width` に。15 px semibold の 9 文字（「Microsoft」約 75 px）が収まる幅。長い名前は従来どおり省略記号で、行の title に全文。
- 値の欄が先に譲る: `.stat-val .co-asof` を折り返し可に——欄が足りないときだけ日付と時刻が 2 行になる（欄に余裕があれば 1 行のまま）。
- 列間 11 → 8 px（11 は列が 4 つだった頃の値）。
- 実測（同条件）: 社名 88 px・値 63 px・はみ出し 0。Countries の行も同じ `.stat-row` なので同じ規則が効く。

## 2. 国カードの出典

国カードの「(年)」を「(年 · 出典)」に（`GDP (2023 · World Bank)`、`人口 (2024 · Natural Earth)`）。年と出典は `js/country-figures.js` の `figure` が値と一緒に運んでいたもので、カードは年しか読んでいなかった。出典を述べた書き手のいない値（平均寿命・インターネット普及率）は年だけ——誰も述べていない出典を名乗らない。

## 3. 検査

`tests/companies-name-width.spec.js`: デスクトップのダーク・ライトと携帯幅で、全行に時刻を入れた Companies の一覧の社名の欄が床（ページの計算済みスタイルから読む）以上・行がはみ出さない・Apple / Microsoft / NVIDIA が全文。Countries の携帯幅も同じ規則。`tests/countries-companies.spec.js` は国カードの GDP の行が「(年 · World Bank)」を出すことを確かめる。
