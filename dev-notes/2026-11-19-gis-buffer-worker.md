---
title: buffer を別スレッドで走らせる — 出力が入力の数千倍になる演算を主スレッドから外す
date: 2026-11-19
---

〈依頼〉 `2026-11-19-gis-scale-bench` が壁と名指した `buffer`（10 万点で約 19 秒・約 720 MB）を、答えを変えずに
Worker へ。能力・精度（`steps` 既定 64）は下げない。

## 0. 出発点（node 22・主スレッド・このマシン・同じ種）

| N | ms | heap | 主スレッドの占有 |
|---|---|---|---|
| 1 万 | 3,145〜4,096 | +73 MB | 2,336 ms |
| 10 万 | 34,154〜57,298（機械の負荷で揺れる） | +716 MB | 23,912 ms |

1 地物あたりの出力位置数: 点 1→65、100 頂点の多角形 101→447、60 頂点の線 60→503。

## 1. 何を作ったか
- `src/gis-buffer-worker.js`（module worker）・`src/gis-buffer-worker-client.js`（pool）・
  `src/gis-buffer-worker-window.js`（`window` の殻。geodesy と幾何 module が先に評価されるよう最初に import）。
- **答えの実装は 1 つ**: worker は `makeGisGeometry().worker.kernelFunction()`（= ページのカーネルを建てる
  `geomKernel`）を `{clipper, geodesy}` 付きで建て、`call` 口から `bufferKm` を呼ぶ。ページが呼ぶ
  `bufferKmR` と同じ関数なので「走ったスレッドで答えが変わる」余地が無い。
- `js/gis-ops.js` `runBuffer` が `bufferOffThread` を先に試し、行の組み立ては従来どおり 1 本の loop。
  運べた地物はカーネルの答えを持ち、運べなかった地物（予算を超える 1 地物）は同じカーネルをここで呼ぶ。
  運べなかった塊があれば運んだ分も丸ごと捨てて全部ここで計算する（`validate` の前例）。
  `stats.worker` に `used: N of M features` / `not-used: <理由>`。
- 既存の Blob worker（`js/gis-worker.js`）に載せなかった理由は `js/gis-geometry.js` の冒頭が実測で述べている
  （sweep line は bare specifier、chunk は指紋付き URL で、Blob worker は両方 import できない）。
  `src/` に置くのは `new URL(…, import.meta.url)` を bundler が出せる唯一の形だから（`src/dem-worker-client.js` と同じ）。
  client は `gis-ops` が遅延 import するので起動費は増えない。

## 2. 測った（同じ機械・同じ種・`--worker`）
| N | ms | 主スレッド占有 | スレッド | heap |
|---|---|---|---|---|
| 1,000 | 494（主のみ 508） | — | 1 | +7 MB |
| 1 万 | 1,261〜1,582（主のみ 3,145〜4,096） | 455 ms（主のみ 2,336） | 4〜5 | +71 MB |
| 10 万 | 9,745〜9,876（主のみ 34,154） | 4,861 ms（主のみ 23,912） | 8〜9 | +698 MB |

- 主スレッドの占有 **約 80% 減**、所要 **約 3.5〜6 倍**。heap は出力そのものの大きさで、スレッドを足しても増えない
  （`planBlocks` の予算が全レーンの合計に掛かる）。
- 下限 `BUFFER_CARRY_FLOOR = 100,000`（推定出力位置・約 1,500 点）: 1,000 点では起動と複製の返送が稼ぎと
  釣り合った（494 vs 508 ms）。pool を使い回せば下がる。
- 残る主スレッドの仕事は面積の列（`areaKm2` — 面積の規則は 1 つに保つため worker へは移していない）と、
  結果の複製の受け取り。

## 3. 検査
- `tests/gis-buffer-worker-checks.test.mjs`: **実スレッド**（`node:worker_threads` が `src/gis-buffer-worker.js`
  そのものを走らせる）で、継ぎ目・極・MultiPoint・穴・線・null 幾何を含む 1,700 件が主スレッドの答えと
  1 バイトも違わない（許容幅 0）／スレッドを作れないとき理由付きで同じ表／下限未満は起動しない／中止。
  `Worker` を web API に見せる殻は `tests/helpers/gis-buffer-worker-node.mjs`。
- `tests/gis-buffer-worker.spec.js`: bundle された worker を実ブラウザで同じ比較。
- 比較器の自己欺瞞を 1 件潰した: 最初の版は `ops.run` の戻り値の `features`（存在しない）を JSON 化して両辺
  `"undefined"` で一致していた。登録された dataset の行を読み、空なら落とす。

## 4. 踏んだもの
- **TDZ**: 新しい `const` が、ファイルの下方で宣言される `VALIDATE_BYTES_PER_POSITION` を factory の初期化中に
  読み、`gisCore` が「Cannot access before initialization」で建たなかった（実ブラウザの spec で観測）。
  関数の中で呼び時に読む形にした。
- `KERNEL_VERSION`（`ops-11`）は上げない: 答えは 1 バイトも変わらない（検査で測った）。ハッシュだけ記録し直す。
- **ゲートの動き（名指しで）**: ⑴ `check:surface` — worker が `self.IntMapGeodesy` を読む 1 本が増えた
  （14→15）。`js/geodesy.js` は module の export を持たず `window` に出すだけの script なので、worker は
  殻（`window = globalThis`）を先に置いて副作用 import し、同じ global から読む。baseline を更新した。
  ⑵ テスト予算 — `tests/gis-buffer-worker.spec.js` は実測 5.0 s（1 boot・worker 起動を含む）で、校正（この
  機械の 1 秒 ≈ CI の約 2 表秒・前例 #R451）を掛けて **11 を `tests/durations.json` に入れ**、全体の天井を
  **5,250 → 5,261（+11）**。deep tier は 168 → 169 本（文書の件数も実体に合わせた）。
- **配布資産の天井**: `dist.assets` の天井を 21,801,070 → 21,961,000 B（+約 156 kB）に上げた。主な中身は module worker
  `gis-buffer-worker`（85 kB — polygon-clipping と幾何カーネルを worker の bundle に持つ）と遅延 client（1.4 kB）。
  起動時（EAGER）の行は動かしていない（worker は buffer を実行したときにだけ取りに行く）。
  `--update` は origin/main が進むたびに拒まれる（40 分の build の間に main が動く）ので手で書いた。
