---
title: Atlas の個々の能力: 入力の門を能力自身のスキーマから導き、観測器の嘘を直し、出典と未到達機能を足した
date: 2026-11-26
newsen: Atlas can now save the route on screen as a GPX or GeoJSON file and draw the elevation profile of a line with its numbers. Weather and country rankings state which supplier they came from.
newsjp: Atlas が、画面の経路を GPX / GeoJSON として保存でき、線の標高断面を数値つきで描けるようになりました。天気や国別ランキングの回答に、どの提供元の数字かが載ります。
---

〈依頼〉 調査役が 2026-11-26 の main で見つけた 7 件（入力判定・観測器・出典・未到達機能）を 1 本で。各件を再現してから直した。

## 1. `hasTarget` の手書き引数名表 — 再現した・能力のスキーマから導いた

`resolveInputs` が見ていたのは種別ごとの綴りの表（`place/from/to/…`）で、スキーマが「これで足りる」と言い、文書もそう書く呼び出しを `needs_input` にしていた。
再現（レジストリを実際に組み、各能力に「スキーマの `required` と `anyOf` の 1 枝」を渡す）: `data.volcano {name}`・`data.heritage {name|id}`・`news.company {company}`・`news.category {category|q}`・`data.exploreRelated {target|name}`・`map.isolateCountry {on:false}`・`map.outline {on:false}`・`panel.streetView {on:false}`・`sim.pandemicRun {days}`・`sim.earthquake {epicentre}`・`sim.radiation {source}`・`data.satelliteCompare {dateA,dateB}`・`map.elevationHighlight {around}` が拒まれていた。

直し方は表に名前を足すのではなく、門を**スキーマから導出**: `required` が全部在り、`anyOf` の 1 つの組が全部在れば足りる。`hasTarget` は消えた（行の 10 列目は「何を訊くか」の種別だけを持つ）。`tests/atlas-capability-inputs-checks.test.mjs` が全能力で「スキーマが足りると言う全集合が通る・空の呼び出しは訊く」を測る。

**再現しなかったもの**: `time.lifeAtPlace {from}` — `from` は日付で、スキーマは地点（`place` か `lat,lng`）も要求する。地点が無いので訊くのが正しい。外した。

## 2. `layers.toggle` の観測器

旧: 可視スタイルレイヤー集合か DOM 数の差だけで判定し、差が無いとチェックボックスを off→on で再発火し最大約 7 秒待って「描画を確認できなかった」と言った。
新: **描いた当人に訊く**。`js/layer-state.js` が箱ごとに持つ要求の結果（loading / ok / failed / unobserved / nodata）が答え。失敗なら失敗（観測された事実・レイヤー自身の文言）、`nodata` はそう述べる、`ok` か画面の差があれば確認済み、記録も差も無ければ**確認できなかった**＝status `unobserved`（`partial/no_change` ではない）。再発火は廃止。記録の無いレイヤーは 1.5 秒で見切る（旧 約 7 秒）、要求中のレイヤーは 12 秒まで待つ。ターンオフは何も待たない。

## 3. 観測器 `none` で可視の書き込みをする 14 能力

新観測器 `shown`: 開いているパネル・オブジェクト台帳・可視レイヤー・時計・カメラの前後を読み、動いたなら completed（動いたものを述べる）、動かなければ `unobserved`（`partial` ではない）。14 行（`board.compose/restore/edit`・`community.browse`・`data.sanctions`・`data.unVote`・`data.borderCrossings`・`layers.electionSwing`・`learn.quest/daily`・`model.run`・`navigation.stop`・`time.yearbook`・`view.openShared`）を載せ替えた。⚠ 既にパネルが開いている再呼び出しは `unobserved`（「見えた変化が無い」）になる——ループは繰り返しを「既に済んでいる」と答える。

## 4. 未知の引数

`sim.rfCoverage` の `power`（dBm）: 文書にあるのにスキーマも run も無視していた。スキーマへ足し、`IntMapLOS.setParams` に送信出力の引数を足した（パネルの `los-tx` と同じ 0..60 dBm、状態に `txDbm`）。
同じ形が `time.territoryChange` にもあった: run が読む `drawNameOnly`・`estimateOnly` がスキーマに無かった。
仕組み: ① 全 221 の文書化された引数形のトップレベル名がスキーマの property であることを測る検査（`atlas-capability-inputs ④`・0 件）② 実行器が、スキーマに無い引数を**拒まず**（run が読む綴りは動き続ける）`observed.unknownArgs` で述べる。
**残した測定**: run が `a.<名前>` と読むのにスキーマに無い名前が 9 能力にある（`knowledge.remember: statement`・`knowledge.recall: ref`・`map.pin: name,summary,note,text,src,when`・`map.tool: action,from,to,via,alt,ref,aircraft`・`panel.streetView: at,location`・`panel.showcase: example,name`・`panel.tour: name`・`research.delegate: comparability`・`system.command: cmd`）。内側の `a` を拾う偽陽性を含みうるので、スキーマへ足すと R783 ① の「全欄を埋める」検査の入力が変わる——次の人が 1 つずつ確かめて足す。

## 5. 出典

- `data.rank` ほか: `D.metricSource` はどこにも束縛されておらず、出典は常に「the Countries statistics record」だった。値を実際に刻んだ供給元（`js/country-figures.js` の `figure().src`）を、寄与した行から集めて述べる。
- 天気: `IntMapWx.point` が応答に `_src`（Open-Meteo / MET Norway）を刻むのを読み、結果の `meta.provenance` に載せた（`weatherProvenance`）。提供元が応答に無ければ述べない。
- 単位換算・丸めた数: 「120万人」「3.1 million」を `万/億/兆/千/thousand…billion` の尺度語つきで読み、**書かれた精度で**値と等しいときだけ [n]。
- 夜間 deep `atlas-cited-answers ①`: **原因を特定できていない**（手元で旧コードでも現コードでも再現しないと前の記録にある。ここでも再現せず）。spec は既に印が画面に出るまで待つ形に直っている。来夜も赤なら製品側の競合を疑う、の記録を引き継ぐ。

## 6. 未到達だった製品機能

- `map.elevationProfile`（新）: Measure/Draw ツールと同じ `_profileFromCoords` を呼び、パネルが描いた数値（長さ・最低・最高・登り・下り・標本数）を結果に持つ。`_openProfilePanel` が `{samples,dist,els}` の Promise を返すようにした（既存の呼び出し元は無視する）。
- `routing.export`（新）: 経路パネルの GPX/GeoJSON ボタンと同じ `_routeExport` が書くファイルを、`file.create` と同じカード（保存を押すまでダウンロードしない・共有の `fileCardHtml`/`offerFile`）で渡す。読み戻して点数を述べる。
- `js/opening-hours.js`: `js/geopolitics-core.js` が読み、`atlas-cap-data` の geopolitics 経由で届く。外した。
- `js/wiki-lookup.js`: 地図の名前ラベルのポップアップの Wikipedia ボタン専用で、同じ記事は `research.placeProfile` と web で届く。外した。
- `js/building-info.js`: **届かない**。3D 都市の建物は Cesium の `drillPick` が画面座標で拾い、緯度経度から建物を拾う API がエンジンに無い。今回は足していない（次の仕事: エンジンに lngLat→建物の pick を足してから `data.buildingInfo`）。
- 計器: `node scripts/feature-inventory.mjs --unreached`（`unreachedFromAtlas`）。窓に global を出す製品モジュールのうち、どの `js/atlas-*.js` も名指さないものを列挙する。2026-11-26 の実測: 635 モジュール中 114。**門ではなく読む一覧**（別の経路で届くものも載る）。

## 7. 撤回済み notebook.*

`notebook.list/open/compare` は `proofCode` を返すだけの実体ではない。run 全体（一覧・開く・比較）が `NOTEBOOK_SHOWN` のスイッチの後ろに実装として残っており、オーナーが 2026-10-04 に「機能だけ残す」と述べた可逆な非表示。消すと復元の能力が減るので**形式上の削除ではない**。残した。

## 8. 新しい global 参照と起動予算

- `check:surface`: `window.IntMapRouting`（+1・`routing.export`）と `window._profileFromCoords`（+2・`map.elevationProfile`）は、`js/app-body.js` が window に出すだけで import できる持ち主モジュールが無い（`routing()`／`_profileFromCoords` はそこで組まれる）。`IntMapLayerState` は import に替えて増やさなかった。上の 2 つは `--update` で台帳へ。
- `check:perf`: eager が +3.3 kB raw（レジストリの生成行 2 行と `shown` 観測器・`schemaDemandMet`）。新しい能力 2 つと観測器の分であり、起動時のリクエスト数・モジュール数は 0 の増加。天井を `--update` で上げた。
- 実際に上がった天井は eager ではなく遅延チャンク `atlas-cap-runs`: 1125.6 kB → 1134.4 kB（+8.8 kB）。買ったもの: `map.elevationProfile`・`routing.export` の run、共有のファイルカード、`layers.toggle` の読み替え。起動時のリクエスト数・モジュール数は増えていない。
