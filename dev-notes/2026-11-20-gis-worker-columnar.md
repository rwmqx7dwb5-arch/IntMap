---
title: spatialJoin の対を Worker へ・行を列で持つ・必要な行だけ取る・大規模エンジンへ渡す戸 — DuckDB 実測つき
date: 2026-11-20
---

〈依頼〉 総合技術監査 P1(5.1/5.2)。#1288 の後に残った ① 主スレッド占有（100 万点 join で約 97 s）② 100 万行の殻（プロパティ）の常駐
③ 表示に要る結果だけの取得 ④ GeoParquet 列指向・空間索引・事前絞り込み・メモリ超過の分割処理（DuckDB-Wasm/Spatial・サーバ側）を実測で比べ、
既存 GIS で処理する仕事と大規模エンジンへ渡す仕事を選べる構造にする。既存 GIS は捨てない。

⚠ 計測の注意: 他セッションが走る共有機。同じ構成でも run ごとに 2〜3 倍揺れる（同じ 100 万点の buffer が 105 s / 263 s / 366 s）。
下の A/B は**同じ手順を同じ機械で続けて**測った値で、外挿はしていない。長い run はセッション中断で何度か消えたので、比較は 25 万点で取り直した。

## 1. 実測
### 1.1 spatialJoin の対を Worker へ（`scripts/gis-scale-bench.mjs --worker --spill [--join-inline]`・node 24・点 5 km の buffer → join・400 区域）
| | join を本スレッドで（`--join-inline`） | 対を worker へ（既定） |
|---|---|---|
| 25 万点: join 所要 | 39.9 s | **15.8 s**（2.5 倍） |
| 25 万点: join 中の主スレッド占有 | 17.9 s | 12.9 s |
| 25 万点: join 中の最長停止 | 1.27 s | 0.82 s |
| 100 万点（点だけ・buffer 無し）spatialJoin | 22.2 s | 17.0 s（主スレッド占有 7.2 → 7.8 s） |
| 100 万点 buffer → join（機械が重い時間帯）join 所要 | 825 s / 占有 474 s / 最長停止 37 s | 583 s / 占有 275 s / 最長停止 14.8 s |
| 100 万点 buffer → join（静かな時間帯・本スレッドのみ） | 122 s / 占有 87.5 s / 最長停止 2.8 s | （この時間帯の worker 側は中断で取れていない） |

読み方（隠さない）: **対の述語を移しても主スレッド占有は 1/10 にはならない。** 25 万点で 17.9 → 12.9 s。残りは本スレッドの
候補の収集（索引）・退避した塊の読み戻しと位置の展開（`reader.next` が 1 位置 108 B の入れ子配列を作る）・worker へ送るための再 pack・
出力行の組み立て・退避。つまり #1288 で述語の箱判定を入れた後、**対そのものはもう主因ではなかった**。表示の応答（最長停止）は下がっているが、
「97 s の占有を数 s にする」は達成していない。次の一手は、退避した塊の packed をそのまま worker へ渡し bbox を packed から取る（unpack→pack の往復を消す）こと（未着手）。

### 1.2 殻（プロパティ）を列で持つ
100 万行・7 プロパティ（id・v・_bufferKm・_bufferSteps・_areaKm2・zone・_joinPartners）の殻: **行オブジェクト 160 MB → 列 8 MB**（node 24・`gc()` 後の heapUsed 差・
`compactShells`）。join の出力は matched 行と unmatched 行でキーの有無・トップ階層のキー順が違う（`{type,geometry,properties}` と `{type,properties,geometry}`）ので、
列は「キーの和集合＋行ごとの存在ビット」と「キー順の変種」で持つ。25 万点の join 出力の殻は **10 MB（1 行 40 B）**。
⚠ `stubs()`（登録時の 1 回の測定）は行オブジェクトを一時的に作るので、**登録の瞬間のピークは残る**（常駐ではなく一時）。測定を塊ごとに畳む（`describeFields` の逐次化）は未着手。

### 1.3 表示に要る行だけ
`rec.attributeRows(from, count)`: 結果が `features()` を拒む大きさ（`too-large-to-materialize`）でも、重なる塊の殻だけから行（プロパティ・geometry は null）を返す。
位置は 1 つも読み戻さない・他の 99 万 9,800 行を作らない。属性表（`js/gis-panel.js`）は `features()` が拒まれたとき最初の 200 行をこれで描き、総数は record の `count`
（以前は空の表）。

### 1.4 大規模エンジンの比較（同じ 100 万点 × 400 区域・within・`DuckDB` は scratch で別途導入）
| 実装 | 所要 | 備考 |
|---|---|---|
| IntMap の spatialJoin（本スレッド） | 22.2 s | 結果は features 100 万行・heap 約 360 MB |
| IntMap（worker で対） | 17.0 s | |
| DuckDB-Wasm 1.33（blocking・node）+ Spatial | **6.9 s** | Spatial 拡張の取得・読込 **11.2 s**（初回）。Wasm 単一スレッド。拡張なしの箱結合は 59 s（入れ子ループ） |
| DuckDB native 1.x + Spatial | **1.1 s**（2 回目 0.9 s） | 結果を parquet へ 0.9 s・先頭 200 行 0.09 s |
| 〃 `memory_limit=128MB` | 1.4 s | 超過分は DuckDB が自分で分割・退避（結果も同じ 100 万） |
| GeoParquet 列指向の窓走査（x,y の範囲 + 1 列）| 0.2〜0.5 s | 述語を述語の外へ押し出せる（必要な列と窓だけ読む） |
結論: **処理の規模が 100 万を超える結合・集計は大規模エンジン（ブラウザなら DuckDB-Wasm、サーバなら native/PostGIS）が 3〜20 倍速く、メモリ超過も自前で処理する。**
ただし**同じ答えだとは測っていない**: DuckDB の述語は平面で、IntMap は閉集合の DE-9IM に日付変更線・極の規則を載せている（境界上・±180°・極の図形で
答えが違いうる）。buffer は IntMap が測地・DuckDB は度の平面で、**同じ演算ではない**。だから既定にはせず、無言にもしない（下の戸）。

## 2. 構造
- **`GG.relateBlock(rights, lefts, cands, predicate, maxKm)`**（`js/gis-geometry.js`）: 対の述語を書く**唯一の場所**。ページも worker も同じ関数を呼ぶ
  （`geomKernel(deps)` が worker 側の kernel）ので、答えがスレッドに依存する余地が無い。台帳 `ops-13` / `geom-4` は **HASH ONLY**（述語・許容・拒否は不変）。
- **spatialJoin**（`js/gis-ops.js`）: 先頭 64 行を本スレッドで測り、残りの射影が 1 s（`JOIN_CARRY_FLOOR_MS`・thread 起動が約 0.5 s の観測）を超えるときだけ
  worker を使う。候補（索引・右の行順）はページ側、対は worker（左の図形を pack して transfer・候補は Int32Array 2 本・右の集合は lane に 1 回）。
  ブロックは `W.planBlocks` の予算で切り、**古いブロックから書く**ので出力順は入力順。壊れた答え・死んだ thread は**同じ kernel で本スレッドが計算し直す**（落とさない）。
  取り消しは thread を終わらせる（同期ループは中止できない）。`runMapped` は群をまたいで thread と右の集合を 1 回だけ起動・送信する。`stats.worker` が「どちらが走ったか」を述べる。
- **`js/gis-packed.js`**: `compactShells` / `expandShells`（列の殻）・`attributeRows`・`shellBytes`。対応できない塊（キー順が違う・オブジェクト値・geometry が殻に残る）は**行のまま**持つ。
- **エンジンの戸**（`registerEngine` / `engines` / `opts.engine`）: `'local'`（既定＝この GIS）/ 登録名 / `'auto'`（`accepts` が是の最初のもの）。選択は**記録**される
  （`stats.engine`・`provenance.computedBy`）。エンジンが辞退・例外のときは**同じ step を既存 GIS へ戻し** `stats.engineDeclined` に理由を残す。**既定では何も登録しない**——
  既存の答えと同じ答えを返すと測れたエンジンがまだ無く、保存した recipe の数が変わってはならない（`KERNEL_VERSION` の理由）。

## 3. 検査
`tests/gis-worker-columnar-checks.test.mjs`（19 本）: ① 5 つの述語・基数で **worker 経由 = 本スレッドの行が JSON で一致**（実 `worker_threads`）② 嘘の worker（形の違う答え）→ 本スレッドが計算し直し同じ表
③ thread が起動できない／取り消し ④ `relateBlock` = 個別の述語 ⑤ 殻の往復（-0・NaN・Infinity・null・混在・存在しないキー・キー順の変種・拒否する形）
⑥ `attributeRows`（塊をまたぐ・退避した塊・範囲外・登録 record）⑦ エンジンの戸（既定 local・未知名の拒否・名指し/auto・記録・辞退/例外の戻し）。既存 `gis-scale-*` 18 本も緑。

## 4. 未了（隠さない）
- 1.1 の注意のとおり**主スレッド占有は大きくは下がっていない**。unpack→pack の往復を消す（packed のまま worker へ・bbox は packed から）は未着手。
- ブラウザ実機（OPFS・IndexedDB・実 Worker・Safari）は未検証。node の `worker_threads` で代替。
- 登録時の一時ピーク（`stubs()`）と `describeFields` の逐次化、殻の退避は未着手。
- DuckDB は scratch で測っただけで製品には入っていない。入れるなら: ① 述語の同値性を境界・日付変更線・極で測る ② Spatial 拡張の配信（11 s）と CSP ③ ライセンス表記 ④ 結果の
  provenance。サーバ側 PostGIS は未計測（環境が無い）。

## 5. 起動予算（check:perf）で上げたもの

- **async チャンク `gis-core` の天井を 622.7 → 632.9 kB（+10.2 kB）に上げた**。これだけが天井を超えた行で、
  `perf-budget.mjs --update` は超えた行しか書かない（他の行は動いていない）。
- **何を買ったか**: spatialJoin の対を worker へ運ぶ経路（`relateBlock` の共有・運ぶ塊の組み立てと取り消し）、
  殻を列で持つ codec（`compactShells` / `expandShells` / `attributeRows`）、大規模エンジンへ渡す戸（登録・選択・辞退の記録）。
  どれも利用者に届く能力（主スレッドの停止の短縮・100 万行の殻 160 MB → 8 MB・表示する行だけの取得・エンジンの切替）の実装で、取り戻せる重複ではない。
- **失効条件**: packed のまま worker へ渡す案（§4）が入れば再組み立ての経路が減るので、その時に測り直す。
- 起動時（eager）の増分は band の内。`async.raw` は main を取り込んだ後は band の内（+11.5 kB）で、CI の赤は main の新チャンクが重なった瞬間のものだった。
