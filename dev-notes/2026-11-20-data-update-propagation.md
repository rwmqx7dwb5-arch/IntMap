---
title: 上流データが更新されても、それから作った分析がどれか分からなかった——更新の検出と依存グラフをつなぎ、作り直す候補を上流順に出して再実行できるようにした
date: 2026-11-20
newsen: When an upstream dataset changes, IntMap can now name the analyses built from it, in the order they must be redone, and re-run the GIS steps once each.
newsjp: 上流データが更新されたとき、それから作られた分析を、作り直す順番つきで特定し、GIS の手順を 1 回ずつ再実行できるようになった。
---

〈依頼〉 総合技術調査（2026-11-20）の「更新の検出はあるが、更新時に関連分析を更新できる範囲が狭い」への対応。依存グラフ（Evidence Graph）と再計算のトリガ側に絞る。

## 0. 状態確認
- 更新日時・周期・上流の指紋は PR #1319（OPEN）、GIS の再実行パイプラインは #1308（OPEN）で、どちらも main に無い。この作業は main の `js/evidence-graph.js`（`impact` / `staleness` / `wouldStale`）だけに乗せた。両 PR とは触るファイルが重ならない。
- 欠けていたのは橋: 「版が変わった」という観測を受け取り、グラフに訊き、候補と順序を返し、再実行の結果を記録する層。

## 1. 作ったもの（`js/data-impact.js`・純粋）
- `diffObserved(graph, observed)` — 観測した版のうち、グラフの現在版と食い違うものだけを更新にする。知らない元データは `unknown`（更新ではない）。
- `planRefresh(graph, updates)` — 動かす前に読むだけ。影響先を上流順（最長経路の深さ）に並べ、`rerun`（GIS 演算＝レシピを再生できる）と `review`（回答の数値・指標・モデルの推論＝読み直し）に分ける。版が分からない元データが何かを養っているなら `unwatched`（更新を検出できない、と述べる。「更新なし」にしない）。
- `applyUpdates` — 版を進めたあと `staleness()` で実際に stale になった集合を取り、計画との過不足（`mismatch`）を返す。2 つ目の「何が古いか」の規則を持たない。
- `executePlan(plan, runner)` — 上流順に 1 回ずつ。失敗した入力を読む下流は `blocked`（古い入力で新しい日付の答えを作らない）。再試行はしない。何を走らせるかは runner（呼び出し側）が決める。

## 2. 実データでの実測
企業 533 社のプロファイルの工場拠点 1,173 点 → `grid`（300 km 正方格子）→ `aggregate`（count）＝産業集積。拠点の版が動く（2 点追加・1 点閉鎖）と、候補は `grid` → `aggregate` の 2 本（`mismatch` 空）。本物の GIS 演算で再実行して成功し、新しい出力は current、古い出力は stale のまま残る（履歴であって上書きではない）。`tests/data-impact-checks.test.mjs` ④。

## 3. 範囲外（理由つき）
- Atlas の能力表への登録: `js/atlas-cap-data.js` / `js/gis-atlas.js` は #1319・#1308 が同時に変更中で、衝突と二重の能力を避けるため、両者が入ってから 1 本で足す。runner を注入する形にしてあるので、能力側は薄い。
- 上流の指紋（#1319）から `observed` を作る配線も同じ理由で後続。
- 永続化（Supabase）は Evidence Graph 自体が未実装のため触っていない。
