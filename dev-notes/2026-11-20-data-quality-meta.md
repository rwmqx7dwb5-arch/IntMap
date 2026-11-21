---
title: データの自己記述（対象時点・範囲・測り方・細かさ・完全性・精度）と周期の根拠の種別・上流の指紋・時点の食い違い警告を足した——推定は推定と名乗り、未申告は未申告のまま残した
date: 2026-11-20
---

〈依頼〉総合技術監査（2026-11-20）5.12。`docs/DATA-GOVERNANCE.md` に「まだ届いていない」と書かれていたもの——推定に依存する更新周期・
上流の変化の検出不足——を実際に減らし、Atlas が分析の前に各データの時点・範囲・測り方・細かさ・完全性・精度・周期を機械可読に参照して、
時点の食い違い（2020 年の人口と 2025 年の行政区画など）を結合の前に警告できるようにする。

## 0. 何を変えたか
1. **周期の根拠に種別 `kind`**（measured / stated / derived / estimate）。`scripts/lib/upstream-cadence.mjs` の 34 本と、builder に直書きされた
   25 本すべてに足した。`basisProblem` は ⑴ `kind` が無い ⑵「estimate」で始まる文が estimate でない ⑶ estimate と名乗るのに文が言わない
   ⑷ measured なのに測った日付が無い、を拒む。規則 `cadence-estimates` が推定の件数を毎回印字する。
2. **推定を実測へ置き換えた（2026-11-20 に測った）**: tzdb（GitHub のタグ: 2025 に 3 回・2026 は 11 か月で 6 回）、OpenHistoricalMap（分単位の
   replication の state.txt が応答）、Pleiades（エクスポートの Last-Modified が前日）、World Bank WDI（`lastupdated` 2026-11-11・1 回だけの観測）。
   **残る推定は `estimate` のまま**（Wikidata・JPL SBDB/Horizons/衛星・SIMBAD・Smithsonian GVP・USGS 惑星地名）——公式な更新間隔の文書が見つからない、
   または 1 回の観測では間隔にならないため。測れていないものを測ったとは書かない。
3. **上流の指紋**（`scripts/upstream-change.mjs`、`data/upstream-fingerprints.json`）。builder の宣言から**発見した** 87 URL（うち 86 が尋ねられる）のそれぞれに、
   サーバが述べる検証子（ETag・Last-Modified・Content-Length）を記録し、現在と比べる。実測: 58 件が初回記録・19 件は検証子を述べない API（`unprobeable`）・
   9 件はこの走者が見られなかった（`unobserved`——うち 3 件は基底 URL で 404/400 を返すもの）。**見られなかったものは changed でも unchanged でもない**。
   本体のハッシュは取らない（日付を埋め込む本体は毎回違い、165 MB を毎晩取るのは探針でない）。夜間用に `--fail-on-change`。
4. **`describes.*` の 6 欄**（`period`・`extent`・`method`・`resolution`・`completeness`・`accuracy`）を `FACETS`／`SPELLINGS`／`read`／`account` に足した。
   供給者の陳述だけで、述べていなければ理由つきの未申告。**書いたのは根拠を builder 自身が持つ 2 束だけ**（Maddison: 1850–2018・168 コード・2011 年国際ドル・
   国×年・±1 の丸め差 15 件／CRUST1.0: 全球・1°×1°・時間に依存しないモデル）。残り 220 の主題は**未申告のまま**で、台帳の `undeclaredFacets` が増えたのはこのため
   （新しい 6 欄 × 全主題の分から述べた 2 束の分を引いた数。main 取り込み後の実測は主題 227・欄 3839）。⚠ 台帳の `undeclared` が 205 から全主題へ増えたのも同じ理由で、「出自を述べていない」が増えたのではない
   （これまで出自をすべて述べていた 17 主題が、新しい欄で初めて数えられた）。
5. **Atlas**: `gisRemote` に `action: "facts"`（`data/data-facts.json` を返す。`ref` に複数渡すと時点の突き合わせ）。`data/data-facts.json` は
   builder の宣言から `data-governance.mjs --update` が生成し、規則 `facts-current` が突き合わせる。
6. **時点の食い違い警告**: `temporalMismatch`（`js/data-governance.js`）。閾値は無く、重ならない組と差を述べるだけ。GIS の複数入力の演算は
   `provenance.timeMismatch` に載せ、`datasetRow()` が planner へ運ぶ。述べていない入力は `unstated` で、合っているとは言わない。拒否も補正もしない。

## 1. 構造として直したもの・直さなかったもの
- 台帳の「出自を述べていない」と新しい `describes.*` の未申告が**同じ台帳の同じ数**に入る。分けるべきかもしれない（出自は義務、記述は能力）が、今回は
  同じ `account()` の欄としてそろえた。`describes.*` を台帳から外すなら、`ledgerFrom` が `integrity.*` と同じ扱いにする変更が要る。
- 残り 220 主題の `describes.*` は、**上流の文書に当たってからでないと書けない**（推測で埋めない——[[intmap-data-must-not-claim-an-author-it-lacks]]）。
  優先は Atlas が結合しやすい人口・経済・境界の束（WDI・HDR・Natural Earth・admin1・CShapes）。
- builder の上流のうち、ETag も Last-Modified も述べない API（Wikidata SPARQL・Overpass・SIMBAD TAP など）は**今も変化を見られない**。`unprobeable` と記録するのみ。
- 夜間の CI（`ci.yml` の `upstream` ジョブ）への `--fail-on-change` の組み込みは、初回の記録が済んだこの PR の後に行う（今夜の初回で全件 `changed` にならないため
  記録を先にコミットした）。

## 2. 測ったこと
- `node --test tests/data-facts-checks.test.mjs`（時点の食い違い・種別・指紋の比較・台帳の形）。
- `npm run check:datagov`（新規則 `describes-stated`・`cadence-estimates`・`upstream-watched`・`facts-current`）。

## 3. ⚠ 途中で踏んだ穴
- 単引用符の文字列に `publisher's` と書き、`upstream-cadence.mjs` 全体が構文エラー→静的に読む門が「読めない宣言」を 1 件出した。門は無言で緑にせず `unreadableDeclaration 1` を出したので見つかった。

## 4. 並行した変更との関係
main 取り込みで `js/gis-ops.js` に別の PR（spatiotemporal-join）の `provenance.warnings`／`timeRule`／`geoBasis` が入った。あちらは「その組が同時に存在したか」を述べ、
こちらの `provenance.timeMismatch` は「入力の述べた対象時点が重なるか」を述べる——別の問いで、`datasetRow()` は両方を運ぶ。kernel 版は main の ops-14 に揃え、ハッシュだけ更新した。
`data/upstream-fingerprints.json` 自身にも周期の宣言が要り（門が指摘）、「誰も周期を決めていない」ので `estimate` と書いた。

## 5. 天井を上げた理由（check:perf）
遅延チャンク `data-governance` は 9.2 kB → 約 12.2 kB。`describes.*` の 6 欄の語彙・`spanOf`・`temporalMismatch` が同じ部品に入ったため。
起動時（eager）には載らず、`gisRemote` の facts と GIS の複数入力演算が読み込んだときだけ取られる。`tests/perf-baseline.json` の該当行だけを 12300 にした。
`facts` の読み取りは `jsonWithin`（期限つき）に直した（`fetch-deadline-layer-checks` ⑤ が、期限の無い fetch を 1 件拾った）。

## perf: atlas-orchestrate の天井を 82.4 → 96.1 kB へ

`atlas-orchestrate` 非同期チャンクは CI で 96.1 kB と測られ天井（82.4 kB）を超えた。**origin/main 自身の先頭（381b9331）の Gates 2/3 が同じ 96.1 kB で同じ check:perf 落ちをしており、増分は main 側の drift であって本 PR 起因ではない**（本 PR の js 変更は gis-atlas・data-governance・gis-ops の小さな差分で、このチャンクの大きさは main と同一）。起動時（eager）には載らない。`node scripts/perf-budget.mjs --update` で該当行だけを上げた。main の CI が先に上げた場合は merge が同じ行を main 側に寄せる。
