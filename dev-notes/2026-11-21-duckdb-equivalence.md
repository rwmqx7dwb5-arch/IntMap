---
title: 大規模エンジン(DuckDB Spatial)は IntMap と同じ答えか — 全ペアで測り、同値な入力の範囲を述べる
date: 2026-11-21
---

〈依頼〉 総合技術監査。`2026-11-20-gis-worker-columnar` が残した「同じ答えだとは測っていない」を測る。同値な範囲だけを大規模処理の標準経路の候補にする。

## 測ったこと
`scripts/gis-engine-equivalence.mjs`（DuckDB は `@duckdb/node-api` を製品の外に入れて `DUCKDB_MODULE` で指す。製品の依存ではない）。各クラスの (left, right) の**全ペア**を、
IntMap の対の述語を書く唯一の場所 `relateBlock` と DuckDB の `ST_Intersects/ST_Within/ST_Contains` に同じ座標で訊いた。

| クラス | intersects | within | contains |
|---|---|---|---|
| 内部の点／凸多角形（300 点×3 面） | 同じ | 同じ | 同じ |
| 辺・頂点の上の点 | 同じ | 同じ | 同じ |
| 辺を共有／同一の面どうし | 同じ | 同じ | 同じ |
| 穴・線・長い辺（大圏と平面） | 同じ | 同じ | 同じ |
| 180 をまたぐ面（経度 170..190） | **違う**（IntMap だけ 3 件） | **違う**（3 件） | 同じ |
| 180 で分けた MultiPolygon | 同じ | **違う**（±180 上の点 2 件） | 同じ |
| 極を含む環 | 同じ | **違う**（緯度 90 の点 1 件） | 同じ |

違いは全部「IntMap のほうが日付変更線・極の規則で『入っている』と答える」側。平面の DuckDB は答えを落とす。**境界上の扱いは同じだった**（閉集合・開集合の食い違いは出なかった）。

## 構造
- `js/gis-engine-domain.js` の `planarEquivalent` / `outsidePlanarDomain`: 経度が (-180,180)・緯度が (-90,90) の外にある座標を 1 つでも含む入力は範囲外（理由 `seam` / `pole`）。
  述語は `intersects / within / contains` のみ（`nearer-than` は IntMap が測地 km・DuckDB が度で、同じ演算ではない）。上限ではなく**範囲**で、理由を `stats.engineDeclined` に出せる形で返す。
- `tests/duckdb-equivalence-checks.test.mjs`: 測った表をケースのまま持ち、違った幾何は必ず範囲外・同じだったクラスは必ず範囲内。`DUCKDB_MODULE` があれば script も走らせ、
  「違うクラスは ±180 か極だけ」を実エンジンで確かめる（無ければ skip。緑には数えない）。
- 述語と答えの実装は変えていない（台帳 `ops-13` / `geom-4` は不変）。

## まだやっていないこと（標準経路にはまだなっていない）
測れたのは「同じ範囲」までで、**エンジンそのものは製品に入っていない**。残り: ① DuckDB-Wasm と Spatial 拡張の配信（拡張の初回 11 s・CSP）② ライセンス表記 ③ 結果を runner の形（features・stats・provenance）へ戻す写し
④ サーバ側 native/PostGIS（環境が無く未計測）。これらが入れば `registerEngine` の `accepts` が `planarEquivalent` を呼ぶだけで、範囲外は自動で既存 GIS に戻る。
失効条件: DuckDB Spatial の述語の意味が変わる／IntMap の日付変更線・極の規則が変わる（script が両方を 1 回で測り直す）。

## 起動予算（check:perf）で上げたもの
- **async チャンク `atlas-orchestrate` の天井を 82.4 → 96.1 kB（+13.7 kB）に上げた**。これだけが超えた行で、`perf-budget.mjs --update` は超えた行しか書かない。
- **何を買ったか**: この PR の変更（`js/gis-engine-domain.js` は入口から読まれず、どの塊にも入らない）ではなく、main に入った Atlas の統合知識層（#1280）が `atlas-orchestrate` に載ったぶん。main の CI は merge 後に天井を記録するが、
  それまでの間に出た PR が全部 `Gates 2/3` で赤くなるので、先に実測まで上げる。
- **失効条件**: main の perf-ceiling が同じ行を記録したら、その値が正本（この行はそれに置き換わる）。

## 製品からの到達（main への着地時に追加）
`js/gis-ops.js` が `engineDomain()`（`js/gis-engine-domain.js` を必要になったときに読み込む）を `registerEngine` と並べて公開する。`gis-core` に同梱すると起動予算を 4.4 kB 超えたので遅延読み込みにした。カーネルの版は ops-14 のまま（答えは変わらない）でハッシュだけ記録し直した。登録するエンジンの `accepts` は日付変更線・極の規則を写さずこれに訊く。入口から読まれないモジュールは `check:static` の split 規則が拒むため。
