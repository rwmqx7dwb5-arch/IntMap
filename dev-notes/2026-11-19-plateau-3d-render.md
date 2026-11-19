---
title: PLATEAU 3D Tiles を実ブラウザで描画して測る spec を足した（描画確認の未実施を解消）
date: 2026-11-19
newsen: A browser test now actually draws Tokyo's PLATEAU 3D city model on the globe engine and measures tiles, triangles, memory and frame time.
newsjp: 東京の PLATEAU 3D 都市モデルを3D地球儀で実際に描画し、タイル数・三角形数・メモリ・フレーム時間を測るブラウザテストを追加しました。
---

〈依頼〉 外部評価「PLATEAU 3D Tiles の実描画を測る spec が無い（あるのは源を読む検査だけ）」への対応。`2026-11-19-cesium-3dtiles-perf.md` §2 が「実ブラウザでの描画確認は未実施」と書いていたもの。

## 1. 足したもの

`tests/plateau-3d-render-cesium.spec.js`。Cesium で `IntMapBeta.plateauToggle(true)` → カメラを東京駅上空 650 m・俯角 40° に置き、エンジン自身の `tilesetInfo` / `render.sceneStats` / `render.instrumentFrames` から読む。主張: 内容が読み込み済みのタイルが 1 以上・選択三角形が 1 以上・フレームが測れている・最悪フレーム 5 s 未満・どの tileset も `error` を持たない・コンソール／pageerror が無い。
**FPS の下限は主張しない**（CI は GPU 無しのソフトウェア GL。数は記録するだけ）。`api.plateauview.mlit.go.jp` に GET で届かなければ **skip して理由を言う**（空の画面で通さない）。
⚠ このホストは HEAD に 404・GET に 200 を返す。プローブは GET。

## 2. 実測（2026-11-19・この開発機・Chromium・ソフトウェア GL 相当・ヘッドレス）

| 項目 | 値 |
|---|---|
| tileset 登録数 | 23（全区。tileset.json はすべて取得できた） |
| 内容が読み込み済みのタイル | 7 |
| 選択された三角形 | 7,081 |
| タイルメモリ（`totalMemoryUsageInBytes` 合計） | 約 93 MB |
| JS ヒープ | 約 188 MB |
| `scene.render` の CPU 時間 | 36 フレーム・p50 14 ms・p95 約 179 ms・最大約 477 ms |

読み方: p95/最大はタイルの解析・テクスチャのアップロードが入ったフレームで、安定時の中央値は 14 ms。**GPU 時間ではなく CPU の submit 時間**（`instrumentFrames` の定義どおり）。実機 GPU の FPS は測っていない。測れたのは「読み込み・選択・描画が起きる」ことまで。スクリーンショットでの見た目の確認（屋根・壁の質感）は spec にしていない。

## 3. 測っていないこと

- 実 GPU での FPS、モバイル、23 区を同時に見た時の最悪メモリ。
- 高さの基準（ジオイド）。建物が地形から浮く／沈むかは未測定のまま（`heightOffset` は 0）。
