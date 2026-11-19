---
title: 100 万点の buffer → spatialJoin を 48 分から 3.4 分へ — 述語の箱判定・結果の退避（OPFS/IndexedDB）・1 塊ずつの読み戻し
date: 2026-11-20
---

〈依頼〉 `2026-11-19-gis-million-points` の未了 3 つ: ① 大規模結果の OPFS/IndexedDB への退避と部分読み込み ② spatialJoin の
48 分と長い主スレッド停止を、実測で原因を特定して構造で桁を下げる ③ 演算連鎖で全体を毎回実体化しない。

## 0. 実測（node 24・Windows・`scripts/gis-scale-bench.mjs --worker [--spill]`・点 5 km・乱数は固定種）
⚠ 他セッションが走る機械（時間は揺れる）。外挿はしていない。

| 100 万点 → buffer → spatialJoin(within, 400 区域) | 前 | 後（`--spill`） |
|---|---|---|
| 所要 | 2,861 s（約 48 分） | **205.6 s（約 3.4 分・13.9 倍）** ※buffer 単体 104 s を含む |
| 最長停止 | 43.8 s | **1.7 s** |
| 主スレッド占有 | 1,577 s | **97 s** |
| 外へ出た塊 | 無し | buffer 584 塊中 435・join 出力 33 塊中 25 |
| heap 残（終了後）/ 標本ピーク | 約 +1 GB の外部メモリが残る / 2,641 MB | +550 MB（殻＝行のプロパティ）/ 1,527 MB |
| RSS ピーク | 2,945 MB | 2,332 MB（worker 4 本の heap を含む。⚠ 大きくは下がっていない） |

小さい点数（同じ 2 段・既定の閾値で chunk 経路）: 13 万点 120 s → **22 s**（最長停止 2.5 → 0.3 s）。2 万点（本スレッド主占有 6.7 → 1.8 s）。
退避なしの 100 万点（最適化後・退避の実装前に測った）: 467 s（機械が重かった）。⚠ 退避は主に**常駐の位置データ**を減らすためで、速度のためではない。

## 1. 原因（計測で特定）
`--cpu-prof` を 2 万点の連鎖に当てた: 主スレッドの大半が **`containsR` → `boolOpR('difference')` → polygon-clipping の掃引**。
すなわち **全ペアで平面の掃引を走らせていた**。ペアのほとんどは「65 角形が 1 区域の中に丸ごと入っている」という一番単純な場合。
索引（`candidateSource`）は既にあり候補は 1 区域前後で、索引が足りなかったのではない。1 ペア約 1.2〜4 ms × 100 万 ≒ 48 分の大半。
「最長停止が件数とともに伸びる」のは、同じ掃引と heap の GC の重なりと推定する（塊の大きさは 200 万位置で一定。掃引を減らした後に 43.8 s → 1.7 s へ下がったことが根拠で、停止の内訳を個別に測ってはいない）。

## 2. 何をしたか
- **`js/gis-geometry.js`**: `intersects` / `contains`（＝`within`）の前に、掃引を呼ばずに決められるペアを決める（`faceOf` / `reach`）。
  ① 図形の箱がその区域のどの辺にも触れない（余白 1e-7°）⇒ 箱は連結なので平面の 1 つの面の中 ⇒ 位置 1 つの偶奇が全体の内外。
  ② 箱が辺に触れても、辺から余白以上離れた位置が内に 1 つあれば intersects は真、外に 1 つあれば contains は偽。
  ③ 区域の箱と素に離れていれば外。**証明が成り立たないところは決めず、従来どおり掃引へ**（辺が箱に届く・±180°/極の近く・半周以上の幅・
  位置でない座標・GeometryCollection・辺 4,096 超の区域の②）。区域ごとの箱は `WeakMap` に覚える。⚠ 決して「境界」とは答えず、許容は読まない。
- **`js/gis-packed.js`**: 退避。重いほう（parts + xy）だけを `encodeBody` で 1 つの `ArrayBuffer` にして backend へ（OPFS → IndexedDB →
  無し）。殻・型バイト・`odd` は常駐（`stubs` / `typeOf` / 行数が読み戻し無しで正確）。`settle()`（古い塊から・最新は残す）、
  `chunkAsync(i)`、`dispose()`、`spillError`。`limits()` に `residentBytes`（既定 256 MiB）と、検査・bench だけが使う `backend` 注入。
- **`js/gis-datasets.js`**: `rec.chunksAsync()` / `rec.spilled()` / `rec.release()`。`remove()` が `release()` を呼ぶ。
- **`js/gis-ops.js`**: `runMapped` が `chunksAsync()` で 1 塊ずつ読み戻し、出力の塊ごとに `settle()`。`runBufferChunked` も塊ごとに `settle()`。
- **`js/gis-export.js`**: `writeChunkedGeoJson` が `chunksAsync()` を使う。
- **`scripts/gis-scale-bench.mjs`**: `--spill`（node には OPFS が無いので 1 塊 1 ファイルの backend）、`bufferMs` / `bufferSpilled` / `joinSpilled`。

## 3. 採らなかったもの（理由）
- **中間を登録せずに融合する連鎖**: `js/gis-project.js` が再生するのは `{op, inputs, params}` だけで、消えた中間を名指す段は再生できない。
  直すには保存形式の改訂が要り範囲を超える。代わりに 2 段ともレシピとして登録し、**メモリに全体を持たない**（位置は外へ・join は 1 塊ずつ）ことで
  「毎回全体を実体化しない」を満たした。
- **spatialJoin の Worker 化**: 本件の実測では主スレッド占有が 97 s／最長停止 1.7 s まで下がり、応答は既存の経過時間の譲り（`ctx.tick`）で保てている。
  Worker 化はジオメトリ kernel と区域一覧の転送が要る別の大きな仕事で、**未着手**（下の未了）。
- **索引の新設**: 既にある（`gis-index.js`）。足りなかったのは索引ではなく、候補 1 件ごとの判定の費用。

## 4. 検査
`tests/gis-scale-spill-checks.test.mjs`（5 本）: ① 述語の箱判定 × 掃引を **1 万超のペア**で両方訊いて判定・拒否が一致（`IntMapGisNoFace`）。
**変異で確認**: `inParts` の判定を反転 → 落ちる／余白を 0 → 落ちる。② 退避した塊の往復が JSON で一致・同期の戸が `chunk-spilled`・dispose で全削除。
③ 書けない backend は退避せず `spillError`。④ 消えた塊 `chunk-lost`・大きさの違う塊 `chunk-corrupt`。⑤ 退避した buffer → join → 書き出しが
全配列の連鎖と JSON で一致・`remove()` で塊が消える。既存 `gis-scale-checks`（9 本）・kernel 台帳（ops / geometry は **HASH ONLY**）緑。

## 5. 未了（隠さない）
- ⚠ 本番ブラウザ実機（OPFS・IndexedDB・Safari の createWritable）での実測は無い（node の fs backend で代替）。OPFS / IndexedDB の backend は
  コードがあるだけで、ブラウザでは未検証。
- ⚠ 区域の辺にかかる図形（数 %）は従来の掃引。`nearer-than`・`nearestJoin` は述語が違い未対応。
- ⚠ 殻（プロパティ）は常駐（100 万行で約 +550 MB）。これも退避する案はあるが `stubs()` が全行のプロパティを要る。
- spatialJoin の Worker 化。
