---
title: ワークスペースの表をその場で編集・再分析・保存できるようにし、同じ操作を Atlas の能力にする
date: 2026-11-21
newsen: The workspace table is now editable in place — values, columns, filters, undo — with the map, chart and figures following, a one-click "ask Atlas to redo" that hands Atlas exactly what you changed, and a saved-workspaces list. Atlas can make the same edits itself.
newsjp: ワークスペースの表をその場で編集できます(値・列・フィルタ・元に戻す)。地図・グラフ・数字が連動し、「Atlas で再分析」で変更点をそのまま Atlas に渡せ、保存済み一覧から開き直せます。同じ編集は Atlas からも行えます。
---

〈依頼〉Atlas が出した分析結果(表・グラフ・地図)を、利用者が編集 → 連動 → 再分析 → 保存 → 再読込できる環境として完成させる。編集は Atlas からも同じ能力として呼べること。

## 実測した欠け(#1338 時点)

選択・フィルタ・パラメータ・保存/復元はあった。**値も列も編集できず**、変えた内容を Atlas に渡す道が無く、保存済みの一覧に利用者が触れる入口も無かった。データ層(`IntMapData`)には値の編集・列の追加/改名/削除・取り消し(#R738)が既にあったが、Atlas の能力にもボードにも繋がっていなかった。

## 何を足したか(書き込みはデータ層のもの。ボードは入口だけ)

- `js/board-edit.js`(純関数): セルの型解釈(数値列は数値か拒否)、列を使う部品の特定と改名の伝播、**開いた時点との差分**、Atlas へ渡す差分文、データ層の拒否理由の言い換え。差分は**記録ではなく計算**(行を開いた時点の写しと比べる)なので、二度編集しても取り消しても正しい。
- `js/board.js`: 表に「編集」モード(セルが入力欄・列の追加/改名/削除・元に戻す/やり直す)、見出しに「Atlas で再分析」と「保存済み」(開く/削除)。インラインのボードは**起動のたび台帳に登録し直す**(復元時に前回の編集が台帳に残って別の行へ書くのを避ける)。列の改名はグラフ・指標・フィルタごと伝播し、改名の取り消しは伝播も戻す。使われている列の削除は部品名つきで拒否。GIS 処理の結果の表は「作り方と食い違う」と名前つきで拒否(データ層の規則)。
- Atlas: `board.edit`(cells / addColumn / renameColumn / removeColumn / filter / undo / redo。`where` で「この列がこの値の全行」を指せる)と `board.delta`(利用者が何を変えたか)。**表の編集と同じメソッドを呼ぶ**ので入口は 1 つ。dispatch・schema・catalogue・registry に同時登録。
- 再分析: ボードの `reanalyze()` が差分文を `IntMapConsole.run` に渡す。Atlas 側は `board.delta` で同じ数字を読める。

## 検証

`tests/workspace-editing-checks.test.mjs`(規則・能力宣言)、`tests/workspace-editing.spec.js`(編集→合計が変わる→数値列に文字は拒否→取り消し/やり直し→列の追加/改名/拒否→Atlas 能力で同じ編集→フィルタ→差分→再分析が Atlas に届く→保存→ページ再読込→復元で編集が残り差分も保たれる)。

## 統合したもの

#1338 は main と衝突し perf-budget が赤だったので、その先端に main を取り込んだ上でこの PR に載せた(#1338 の内容は全部ここに含まれる)。

## 予算
`check:perf` の天井を `--update` で引き上げた(async raw/gzip、atlas-cap-runs・atlas-console チャンク)。理由: `board-edit.js`・編集 UI・能力 2 本の追加と、#1338 と main の増分。能力は削っていない。`tests/durations.json` に新 spec の実測 11 秒を足した。

## 実測で見つかった欠陥(spec が捕まえた)
- インラインのボードは、台帳(lazy モジュール)が読み込まれる前に開くと台帳に載らず、編集が「データが無い」で拒否された → `B.prepare()` が台帳を読み込んで登録し直す。
- 差分が列の改名を追えず、改名後の編集を落としていた → 改名の履歴(保存・復元も)で元の列と突き合わせ、改名は「列が 1 つ消えて 1 つ増えた」ではなく改名として述べる。

## 範囲外(記録)

データセットに支えられたボード(`data.dataset`)の編集は、その台帳の規則(GIS 処理の結果は不可、取り込みデータは可)に従う。保存されるのは台帳側の仕様(`gis-project`)で、インラインのボードのように行を抱えて保存はしない。
