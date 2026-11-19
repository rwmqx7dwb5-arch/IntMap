---
title: PLATEAU の建物が地面から約37m浮いていたのを実測で見つけて直し、3D Tiles の総メモリに上限を付けた
date: 2026-11-19
newsen: Tokyo's PLATEAU 3D buildings were floating about 37 m above the ground on the globe; they now sit on it, and total 3D-tile memory is capped.
newsjp: 東京の PLATEAU 3D 建物が地面から約37m浮いていたのを直しました。3Dタイル全体のメモリにも上限を付けました。
---

〈依頼〉 総合技術評価 P1「3D は動くが、実測で品質が分かっていない」への対応。

## 1. 計器

`tests/plateau-render-quality-profile.spec.js`（`-profile`＝通常実行・予算の外。`IM_PROFILE=1 npx playwright test <file>`）。視点ごとに初回描画時間・フレーム時間の分布・タイル／三角形／バイト・JS ヒープを記録し、別テストで建物の底面と地面の高さを比べる。`IM_MOBILE=1` で 390x844・DPR3・モバイル UA・CPU 4 倍スロットルの携帯相当。
**測れないことを成功にも失敗にもしない**: WebGL の描画器名を読み、ソフトウェア描画（SwiftShader）なら `fpsClaim: null`（FPS を主張しない）。測れなかった視点は `observed:false`。ヒープは `performance.memory` がヘッドレスで 1,000,000,000 に丸められる（実測）ので CDP の `JSHeapUsedSize` を使う。

## 2. 実測（2026-11-19・この開発機・SwiftShader＝CPU 描画・フレーム時間は FPS ではない）

| 視点 | 修正前 タイルメモリ | 修正後 タイルメモリ | 修正後 p50 フレーム(CPU submit) | 初回内容まで |
|---|---|---|---|---|
| 東京上空 2500m | 183 MB | 121 MB | 214 ms | 16 s（網待ち） |
| 東京低空 650m | 364 MB | 56 MB | 272 ms | 0.9 s |
| 23区を広く 9km | 503 MB | 207 MB | 160 ms | 1.3 s |
| 携帯相当 上空／低空／広域 | — | 58／29／8 MB | 252／4429／254 ms（4 倍スロットル・SwiftShader） | 38 s／1 s／0.7 s |

⚠ 修正前後でタイル数・選択が毎回違う（網の到着順）。修正前 503 MB が 384 MB の per-dataset 予算を超えていたことが問題の観測。実 GPU の FPS・実機スマホは測れていない（この環境に GPU が無い）。

## 3. 高さの一致（実測して直した）

- PLATEAU の建物の底面（タイル境界の最下点）は楕円体上 **37.3〜40.1 m**。地面（地形なしのグローブ・Terrarium の地形ともに海面基準）は 0〜3 m。**建物は約 37 m 浮いていた**。`heightOffset` が 0 で、「測れていないので入れない」と書いてあった箇所。
- 東京のジオイド高 約 36.7 m（JGEOID2011）を `PLATEAU_HEIGHT_OFFSET_M = -36.7` に（`js/plateau-cities.js`・計測値と失効条件つき）。修正後の底面は **1.1〜3.8 m**（東京の地盤の実標高と整合）。東京以外の都市を足すときは都市ごとの値にする（失効条件に記載）。
- ⚠ **地形あり（terrain-dem）での底面対地面の直接比較は測れていない**: `sampleTerrainMostDetailed` が自作プロバイダで null を返した。途中の `globe.getHeight` は読み込み途中で信用できない値（24 m、-2,582 m）だったので採らない。Terrarium が海面基準である前提での整合のみ。残課題。

## 4. メモリの直し

`cacheBytes` は tileset ごとで、選択中のタイルは追い出されないため 23 区を同時に見ると合計が膨らんだ。`_governTilesets()`（`js/cesium-engine.js`）が合計を 384 MB（携帯 128 MB。エンジンが既に選んでいた per-dataset 値を合計に適用）に抑える: 超えたら全 tileset の screenSpaceError を段階的に（最大 4 倍）上げ、60% を下回れば戻す。各 tileset のキャッシュも予算を数で割って配る。結果は上表。起動予算には触れない（Cesium エンジンの非同期チャンクの中の変更）。

## 5. 検査

`tests/cesium-3dtiles-perf-checks.test.mjs` の「ジオイド補正を入れない」検査を「補正は計測値と失効条件つきの 1 定数」に書き換えた（原則は同じ: 推測値を入れない。実測値は入れる）。
