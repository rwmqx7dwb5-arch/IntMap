---
title: 数値の出自が 1 呼び出し・1 セッションで途切れていた——元データから回答の数値までを辿れ、入力の更新で影響先を調べられる Evidence Graph の第 1 スライス
date: 2026-11-20
newsen: Atlas answers and GIS results now keep a lineage graph, so a figure can be traced back through the GIS steps to the source data, and the figures affected by a data update can be listed before it is made.
newsjp: Atlas の回答の数値と GIS の結果が系譜グラフを持つようになり、数値を GIS の手順をさかのぼって元データまで辿れ、データ更新で影響を受ける数値を更新の前に調べられる。
---

〈依頼〉 外部監査（2026-11-20）の「出自が分散していて全工程を遡れない」への対応。呼び出し中の Evidence Registry は維持し、長期保存する Evidence Graph を足し、GIS 演算の結果と Atlas 回答の数値から元データまで遡れる縦串を作る。

## 0. 測ったこと
- `js/atlas-evidence.js` は 1 呼び出し（最大 40 レコード×12 事実）で呼び出しが終わると消える。GIS の `lineage()`（`js/gis-datasets.js`）はセッション内。`data-governance` は条件だけ。どれも「入力が変わったら何が古くなるか」には答えない。
- 回答の数値が GIS の結果から来ても、回答側に GIS の節への参照が無く、鎖が回答で切れていた。

## 1. 変えたこと
- `js/evidence-graph.js`（純粋・DOM なし）: 節は **source**（元の事実・版は追記のみ）と **derived**（IntMap/AI が作ったもの。入力と**その時点の版**、計算 `{op, opVersion, params}`、出力の指紋を持つ）。derived の id は内容アドレスなので同じ導出は同じ節（冪等）。入力が節でなければ拒否（`unknown-input`）。版が分からない source は `unversioned`（時計で埋めない）。問い: `trace` / `impact` / `staleness`（鎖の先まで）/ `wouldStale`（更新前に影響先を調べる）。`snapshot`/`restore` で JSON に往復。
- `js/evidence-graph-record.js`: `bindGis`（`IntMapData.subscribe('add')` から、取り込み/レイヤー読みは source、演算出力は `gis_op` derived。入力は `provenance.inputs`、版は `ops-N`）と `recordAnswer`（回答の数値の claim → 引いた registry レコードの source 節。`graphRef` を持つ記録は GIS 節へ直接つなぐ）。記録が述べる値と一致する数値は `answer_number`、どの記録にも無い数値は `ai_inference`、何も引かない数値は node にせず `uncited` として数える。**モデルが書いた URL/id は節を作らない**（registry に無い id は `unresolved`）。
- `js/atlas-evidence.js`: レコードに `graphRef`（コードが入れる）を足しただけ。`js/atlas-answer-pipeline.js`: 監査の後に `recordAnswer` を 1 回呼ぶ（失敗しても回答は失敗させない）。

## 2. 直していないもの（理由）
- **Supabase への永続化は入れていない。** 利用者ごとの表は `00_structure_test.sql` の表一覧・アカウントデータ台帳・RLS テストに同時に載せる必要があり、スライスを大きくするため。いまは `snapshot()/restore()`（プロジェクト保存への載せ先は別作業）。ノード形は `world_graph_*` と同じく `ref` 鍵＋ jsonb で写せる。
- 取り込みの GIS データセット id は `ds-N`（セッション局所）なので、source の同一性は `provenance.layer/url/source/file` を鍵にし、無いときだけ `session:<id>`。版は provenance が述べる etag/version、無ければ（件数・列・幾何の有無・範囲）の指紋で、**中身の完全一致ではない**。
- GIS の結果を回答の `appFacts` へ `graphRef` 付きで渡す呼び出し側（atlas-cap-research 等）は未接続。`sharedEvidenceGraph().refOfDataset(id)` が渡す値。
- ニュース evidence・Notebook・世界オブジェクトの claims との接続は次スライス（atlas-memory / semantic-layer の近傍のため接点を作っていない）。

## 3. 検査
`tests/evidence-graph-checks.test.mjs`（実際の dataset レジストリと registry で、元データ→buffer→aggregate→回答の数値の鎖、版更新後の stale、冪等、snapshot）。

## perf 天井を上げた理由

`atlas-console` チャンクが 1051.8 → 1061.2 kB（+9.4 kB）、`dist.assets` が 21446.3 → 21560.0 kB。
増えたのは Evidence Graph の 2 モジュール（`evidence-graph.js` / `evidence-graph-record.js`）が回答パイプラインの
チャンクに入ったため。回答の数値を元データまで遡る能力の代価で、遅延読み込みにはしない（回答ごとに呼ぶ）。
