---
title: Atlas の回答に、実行した道具の結果から出典を結ぶ——本文の数字の [n]・線の出自カード・回答の Cite・ノートとブリーフィング
date: 2026-11-16
newsen: Atlas answers that used IntMap's tools now end with their sources: the table column, border record or map credit behind them, with licences, where each border comes from, and a ready citation. A number gets [n] only when it equals a value a tool returned.
newsjp: IntMap の道具を使った Atlas の回答の下に「この回答の出典」が付きました。表の列・国境の記録・地図の出典をライセンスつきで並べ、線の出自と引用文をすぐ開けます。本文の数字は道具が返した値と等しいときだけ [n] で結ばれます。
---

〈依頼〉 組み合わせ案「出典を引ける AI 回答」: Atlas の回答の数字や地図の線ごとに、既存の出自カードと Cite を自動で付け、
報道や授業でそのまま根拠として使える回答にする。AI に出典を書かせない。調査ノートと回答の書き出しにも出典を載せる。

## 0. 測った（着手時の事実）

- 道具のループの回答は、Atlas の文の下に各道具の描画（HTML）を連結するだけで、**結果に出典の欄が無く**、本文の数字と出典を結ぶものは何も無かった。
  `js/atlas-results.js` の `evidenceRefs` は書く者も読む者も 0。出典を ID で結ぶ仕組み（`js/atlas-evidence.js`）は分析回答（`analyze`）の経路だけ。
- 横断クエリは列ごとの出典を**画面の文**としては持っていた（`methodHtml`）が、データとしては列と結ばれていなかった。
- 「この数字はどこから来たか」はカードではなく、出典一覧とレイヤー副文のライセンス 1 行（`js/data-governance.js`）。線の出自はカード（`js/border-provenance-card.js`）。
- 調査ノートは非表示（`NOTEBOOK_SHOWN = false`）。利用者に確認し、**非表示のまま**記録と Markdown に出典を載せる方針にした。
  数字の結び方も確認し、**コードが値で照合**（一致しない数字には何も付けない）に決まった。

## 1. 直したこと

- **出典は結果が述べる**: 能力の結果 `meta.provenance`（`{kind, what, source, licence?, values?, at?, date?}`）。実行器は `meta` を返信まで運ぶ（`js/atlas-executor.js` 10）ので、
  新しい経路は要らなかった。横断クエリは印字した数値列ごとに、測った出典（無ければ表の記録）と行の値を述べる（`js/atlas-query.js` `provenanceOf`）。
  `time.borderSource` はカードと同じ記録名を en/jp で述べる。
- **`js/atlas-answer-sources.js`（新）** が一覧を作る: 結果の `meta.provenance`＋（回答が地図を変えたときだけ）描かれた国境の記録と地図の出典表記（`js/map-cite.js` `citeNow` を再利用）。
  本文の数字は**書かれた精度で返った値と等しいときだけ** [n]。日付・時刻・ラテン文字に付いた数・1 桁・リンクとコードの中は読まない（1 桁の理由は定数の註）。
  線の行から境界の出自カード、一覧から回答の Cite（`references` を再利用・題＝質問・出典表記＝一覧の全出典）。出典表記は一覧に見える文として出るので、**コピーにも載る**。
- **`citeNow` は描画中の国境を待つ**（`IntMapTimeBorders.settled()`）。spec の 1 回目で実測: Atlas の答えは `time.travel` の描画が
  終わる前に書かれ、その瞬間の `citeNow` は「国境は描かれていない」と答えて結果が固定された（一覧に線の行が 0）。共有パネルの Cite タブにも同じ穴があった。
- 調査ノートの記録に `provenance`・`credit`（値は持たない・http(s) 以外の URL は捨てる）、Markdown 書き出し、ブリーフィングにも同じ一覧。

## 2. 載せなかったもの（次の人へ）

- **天気**: `IntMapWx.point` の結果はどの提供元（Open-Meteo か MET Norway か）が答えたかを持たないので、出典を述べると誤りうる。提供元を結果に載せてから足す。
- **国別統計の順位・色分け**（`data.rank` など）: 指標の定義（`js/atlas-metrics.js`）に出典が無い。`metricSource` も束縛されていない。指標に出典を持たせるのが先。
- 「120万人」のように**単位を換えて丸めた数**は照合しない（一致しないので印が付かない＝正直な欠落）。

## 3. 費用

- 遅延読み込みの `atlas-console` チャンクが **1530.0 kB → 1548.8 kB（+18.8 kB）**。増えた分は `js/atlas-answer-sources.js` そのもの（照合・一覧・Cite の欄と CSS）。
  `tests/perf-baseline.json` のその 1 行だけを上げた。起動時の束（eager）は変わらない。地図側の半分（`js/map-cite.js`・境界の出自カード）は押したときと回答が書き終わったときに読む動的 import のまま。

## 4. 検査

- `tests/atlas-cited-answers-checks.test.mjs`: 実物のクエリエンジンが列の出典と値を述べる／数字の照合（日本語に付いた数・精度・1 桁・名前・リンク・実体参照）／
  出典の無い項目を作らない／一覧の注記と線のボタンと Cite／ノート・Markdown・ブリーフィング。
- `tests/atlas-cited-answers.spec.js`: ai-proxy だけを演じた実際のターン（火山の表を検索＋1900 年へ）で、返った値に [n]・作った数に無印・1900 年の国境の記録とライセンス・
  線のカード・回答の Cite・コピー対象。
