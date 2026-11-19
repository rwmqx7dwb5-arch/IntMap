---
title: 100 万点の buffer を、ヒープに載せずに完走させる — 結果を平らなチャンクで持つ
date: 2026-11-19
---

〈依頼〉 `gis-scale-bench` が壁と名指した buffer の出力（100 万点で約 7 GB の見込み）を、ブラウザの停止・メモリ不足なしに
完走させる。既存の高速な全配列経路は残し、大規模用の経路を足す。

## 0. 実測（node 24・Windows・`scripts/gis-scale-bench.mjs --worker`・点 5 km・乱数は固定種）
⚠ 同じ機械で他セッションが走っていた（時間は揺れる）。外挿はしていない。

| 100 万点の buffer | 旧経路（全配列） | 新経路（チャンク） |
|---|---|---|
| 所要 | 234 s | **93 s** |
| heap（終了後 / ピーク） | +7,006 MB（12 GB 上限を足して完走。既定上限では落ちる） | +383 MB / **512 MB**（既定上限） |
| RSS ピーク | （未計測） | 1,715 MB（出力 65 M 位置 × 16 B ≒ 1.04 GB が typed array） |
| 主スレッド占有 | 243 s | **27 s** |
| 最長停止 | 14 s | 0.7 s |
| 出力 | 100 万行 | 100 万行・65,000,000 位置・584 チャンク |

比較: 100 万点の `spatialJoin`（点 × 400 区域・既存経路・変更なし）は 26 s・ピーク heap 511 MB・RSS 626 MB。
### 0.1 連鎖: buffer の出力（チャンク）を spatialJoin（within・区域は 16〜400 枚の格子）へ
| 点数 | 所要 | heap ピーク（100 ms 標本・ゴミを含む） | RSS ピーク | 最長停止 | 主スレッド占有 |
|---|---|---|---|---|---|
| 13 万 | 120 s | 2,454 MB | 2,918 MB | 2.5 s | 64 s |
| **100 万** | **2,861 s（約 48 分）** | 2,641 MB | 2,945 MB | **43.8 s** | 1,577 s |

完走する（65 M 位置の buffer をチャンクのまま結合して 100 万行をチャンクで返す）。heap のピークは 13 万点と 100 万点で
ほぼ同じ＝**件数でなく群の大きさで決まる**。ただし ⚠ **最長停止が件数とともに伸びる（2.5 s → 43.8 s）原因は特定していない**
（buffer 単体は 0.7 s なので、結合の群の処理のどこかに件数に比例する同期の仕事がある）。結合そのものの費用は
既存 op のもの（多角形 1 件あたり約 1.2 ms）。

10 万点以下は閾値（800 万位置）以下なので従来の経路のまま（10 万点＝約 680 万位置）。

## 1. 何をしたか
- `js/gis-packed.js`: 幾何を `Float64Array` に平らに並べる codec（unpack で 1 バイトも違わない。3 次元・
  GeometryCollection などは `odd` に原形のまま残す＝拒まず、変えない）と、結果を入力順のチャンク（殻＋packed）で
  持つ store。閾値は観測と失効条件つきで同じ file に置いた。
- worker（`src/gis-buffer-worker*.js`）に `pack` モード: 答えを圧縮して**転送**で返す（複製をやめる）。
  拒否（`ok:false`）だけは位置で添字づけてそのまま返す。
- `js/gis-ops.js` `runBuffer`: 推定出力が閾値を超えるとき `runBufferChunked`。塊は入力の連続範囲（順序を保つ）、
  worker が無い・死んだときは**全配列へ戻らず**本スレッドで同じカーネルが塊ごとに計算（経過時間で譲る＝中止が効く）。
  js/gis-packed.js は必要になったときだけ動的 import（読み込めない loader ではチャンク経路が無いだけ）。
- `js/gis-datasets.js`: `add({chunked})`。型・列・幾何種別は stubs（座標を見ない）で**測る**。`features()` は
  1,600 万位置までは配列を組み、超えれば `too-large-to-materialize`（OOM でなく名前のある拒否）。`chunks()` が 1 塊ずつ。
- チャンクを入力にできる op: `filter` / `spatialJoin` / `nearestJoin`（左の行が互いに独立）。群（約 200 万位置）ごとに
  走らせて連結。統計は和（`max*` は最大）。それ以外は収まる間は配列にして走り、超えれば `input-too-large-for-op`
  （パネルに 5 言語の文）。
- 書き出し: `IntMapGisExport.writeAsync`（GeoJSON を Blob で塊ごとに組む。1 文字列は V8 の上限で作れない。
  経過時間で譲る）。パネルの保存ボタンはチャンクのレコードでこちらを使う。
- `scripts/gis-scale-bench.mjs`: peak heap / RSS のサンプリング、`bufferJoin`（buffer の出力を spatialJoin へ）。

## 2. 検査
`tests/gis-scale-checks.test.mjs`（9 本）。閾値を `globalThis.IntMapGisScale` で下げ（検査だけが使う口）、**同じ入力の全配列経路と
JSON で 1 バイトも違わない**ことを、本スレッド計算・実スレッド worker・filter・spatialJoin（first/all・複数群の継ぎ目）・
書き出し（pretty/compact）で測る。codec は全形状と -0。拒否・中止も。GIS 系 704 本が緑。

## 3. 踏んだもの
- シェルの二重引用符の中のバッククォートが命令置換され、リポジトリ直下に日本語名の屑ファイルが出た（消した）。
  置換は `node -e` でなく Edit で。
- `gis-datasets.js` / `gis-ops.js` を data: URL で読む検査がある → 静的 import をやめ、datasets は store に問い、
  ops は動的 import。
- 鍵: ops の hash は版を上げず記録し直した（既存の大きさの答えは 1 バイトも変わらない）。`gis-packed.js` は NOT_A_KERNEL。
- 組み替えた子の `features` 順序: 殻に `geometry:null` を残して key の位置を保つ（JSON 全文一致のため）。

## 4. 未了（隠さない）
- ⚠ 連鎖の最長停止 43.8 s の原因（上の 0.1）。次の仕事: 群ごとの処理の中で件数に比例する同期区間を計測して特定する。
- 100 万点の結果は外部メモリに約 1 GB 残る。OPFS/IndexedDB へ逃がす経路は無い（`js/gis-worker.js` は
  タブの目安を約 1.5 GiB と述べている）。次の仕事。
- 本番ブラウザ実機での実測は無い（node のみ）。
- `check:docs` はこのチェックアウトに `data/hist-eras.js` が無く落ちる（環境。本件と無関係）。

## 5. 配布の天井（`tests/perf-baseline.json`）を上げた理由
`gis-core` の遅延 chunk が 582.1 → 590.6 kB（+8.5 kB・チャンク経路と書き出しと拒否の文）、新しい遅延 chunk `gis-packed`
（4.0 kB gzip 前の値）、遅延の合計 gzip が 4,709.6 → 4,736.7 kB。**起動時（EAGER）の行は動かしていない**（`gis-ops` が
`gis-packed` を必要になったときだけ動的 import する）。`--update` は build に約 40 分かかり、その間に main が動いて拒まれるので、
CI の実測値を見て手で書いた（main の天井に増分だけ足して async.gzip 4,859,500 B・gis-core 612,000 B。main の天井は他の作業でも動くので、足したのはこの変更の分だけ）。
