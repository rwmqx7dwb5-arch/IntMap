---
title: Atlas の回答の下に内部資料が出る・脚注番号が数字を割る・表の名前が壊れる、を構造で直した
date: 2026-11-26
newsen: Atlas answers no longer print raw calculation results and the full list of data tables under the answer, source marks no longer split a number from its unit, and computed tables name their rows by the country or place instead of a counter.
newsjp: Atlas の回答の下に計算結果の生データやデータ表の一覧が並ぶことがなくなり、出典番号が「40[1]か国」のように数字と単位を割ることもなくなりました。計算した表の行名も、連番ではなく国名や地名になります。
---

〈依頼〉 本番検証で見つかった 1 つの回答（世界銀行の人口上位 40 か国）の全文を精査し、見つかった欠陥を、出た経路だけでなく構造で直す。

| 欠陥（本番の実測） | 原因 | 直し方 |
|---|---|---|
| 「40[1]か国」「11[1]月11[1]日」「1,463,865,525[2]人」 | `linkNumbers` が数字の末尾に印を差す。日本語の数量は単位と一体 | 印は数字の属する句の終わり（空白・句読点・括弧）に 1 回。同じ句の数字は 1 つの印にまとめる |
| 回答の下に「計算が完了しました result = {…}」の生 JSON | compute.run のカードが `result` を開いた `<code>` で出し、カード自体も回答の本文に積まれた | 値は名前・形・件数の要約＋閉じた `<details>`。モデルへは `meta.compute` が `details` で全部届く。カードは `meta.working` を宣言し、Atlas が回答を書いたあとは「成果物・調査結果」の折りたたみへ（既存の `_interim` の仕組みに乗せた） |
| データ表 26 件の列説明が丸ごと出る・英語注記が 3 回 | `data.query {list:true}` が一覧をカードに直書き。1 ファイル 3 表が同じファイル単位の注記を持つ | 一覧も `meta.working`。ファイル単位の注記は最初の表で 1 度だけ |
| 名称列が全行「<題名> · top40 1/2/…」 | `name` を持たない行を題名＋連番で名づけた | 行が持つ最初の文字列（国名）で名づける。文字列が無い行だけ題名＋連番 |
| 「判定方法 · …40 · 件の元レコード → 40 · 件を評価」 | 数と単位語の間に「·」 | 数と単位を 1 句に。「X — X」の同語反復も解消 |
| 「能力の呼び出し … web.render×5」が 3 回 | run ごとのカードが 3 枚（ブリッジ付きの run は再利用しない設計） | 3 枚とも `working` の折りたたみへ |

## 確かめたこと
- `tests/atlas-result-delivery-checks.test.mjs` ⑨〜⑫（修正前の `js/` では落ちる）。
- 見送ったもの: ブリッジ付き run を再利用しない設計（副作用のある能力を呼ぶため意図的）。`openDataAnswer`・`gisRemote discover`・`gisOverture plan` のカードが同じ形かは未確認。

## 起動費用
`atlas-console` チャンクの天井を引き上げた（1445.3 kB → 実測 1452.9 kB）。理由: 作業の途中経過を宣言する `meta.working` の読み取り、計算カードの要約、行の名づけ、一覧の注記の重複除去、脚注の句末配置が `atlas-console` の側に入ったため。読者に見える欠陥を直す機能で、遅延読み込みの塊が増えた分だけ。起動時の同期読み込みではない。
