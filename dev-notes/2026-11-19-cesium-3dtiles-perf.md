---
title: 3D Tiles の受け皿を Cesium に足し、東京23区の PLATEAU 3D 都市モデルを重ね、Cesium の描画時間を測れるようにした
date: 2026-11-19
newsen: On the 3D globe engine, a new layer overlays Japan's PLATEAU building models (roofs, walls, textures) over Tokyo's 23 wards, and the ?perf=1 readout now measures the globe engine too.
newsjp: 3D地球儀エンジンで、国土交通省 PLATEAU の建物モデル（屋根・壁・テクスチャ）を東京23区に重ねるレイヤーを追加しました。?perf=1 の計測も3D地球儀エンジンに対応しました。
---

〈依頼〉 外部の技術監査（描画エンジンと3D地球儀）を受けて「できるだけ全部やって」。

## 0. 監査の主張を実コードで確かめた

- Cesium アダプタに `instrumentFrames` / `sceneStats` は無かった（共有窓口が false / null を返し、`?perf=1` は縮退）。**事実**。
- `Cesium3DTileset` の使用は `js/` に 0 件。**事実**。
- 高さ基準: Cesium の建物押し出しは `heightReference` 無し（楕円体からの絶対高）。ジオイド変換は無い。**事実**。ただし東京で +36 m ずれる、は監査の推測で未測定。
- ベクタ上限: `MAX_TILES=64`・`CACHE_MAX=320`・`MAX_INFLIGHT=8`（固定）、`12000` features/layer・`320` labels（`cesium-engine.js`）。**事実**。

## 1. 入れたもの

- `capabilities.tiles3d`（Cesium だけ true）と `layers.addTileset/removeTileset/setTilesetVisible/hasTileset/tilesetInfo`。MapLibre は false で「できない」と答える。
- Cesium の `render.instrumentFrames`（`scene.render` を 1 回だけ包む）と `render.sceneStats`（タイル数は私有の surface から読み、取れなければ 0 でなく null）。`?perf=1` が 3D Tiles の件数・三角形数・バイト数と、ベクタの上限値も出す。
- レイヤー `beta-dl-plateau3d`: 東京23区（JIS 13101–13123）の `-bldg-lod2-texture-latest` を PLATEAU データカタログから読む。URL はカタログの一覧（306 都市に建物 3D Tiles）で実在を確かめ、`access-control-allow-origin: *` を実測。推測した URL は 404 だったので使っていない。
- 出典・通信の台帳: `scripts/outbound-hosts.json`・Privacy §4（en/jp）・`DATA_SOURCES`。利用条件は PLATEAU サイトポリシー（CC BY 4.0 互換と同ページに記載）。

## 2. やらなかったこと（と理由）

- **Google Photorealistic 3D Tiles**: API 鍵と課金が要る。利用者の判断事項。
- **ベクタ描画の上限の引き上げ**: 上限が実際に欠落を起こす場面を測っていない。まず HUD に出した。上げるなら実測してから。
- **ジオイド補正**: PLATEAU の高さの基準を実データで確かめていない。`heightOffset`（既定 0）の口だけ用意し、値は推測で入れない。
- **PLATEAU-Terrain / 高精度 DEM の地域切り替え、WebGPU**: 未着手。
- **実ブラウザでの描画確認**: 他チャットの dev サーバが 5 本あり preview を起動できず未実施（下記）。

## 3. 検査

`tests/cesium-3dtiles-perf-checks.test.mjs`（能力表 3 か所・アダプタの 7 メンバ・フレーム計測の単一ラッパ・null と 0・23 区・ホスト台帳）。`check:engine` `check:types` `check:datagov` `check:i18n` `check:archfiles` `check:static` ほか。
