---
title: PMTiles（ベクタ v3）を直接読む——全体をメモリに載せず、ヘッダ・ディレクトリ・必要なタイルだけをバイト範囲で取る。ファイル取り込みは先頭 7 バイトで判定して readBytes の天井より前に抜け、URL は COG と同じ range 機構に乗る
date: 2026-11-20
---

〈依頼〉PMTiles の直接読み込み（PRODUCT.md・07-map.md に「まだ読めない」とあった）を、必要範囲のみ取得できる形で実装する。

## したこと

- `js/gis-pmtiles.js`（新規・依存なし）。ヘッダ 127 B、root/leaf ディレクトリ（gzip・varint）、仕様の Hilbert タイル ID、Mapbox Vector Tile の
  protobuf 復号を自前で持つ。供給は `js/gis-geotiff.js` が定めた「バイト範囲の供給」契約（`{size, read(off,len)}`）を**そのまま使い**、URL は
  `httpSource` に乗る（range 機構の 2 つ目の実装を作らない）。
- 窓の読み: `open().window({bbox, zoom, maxTiles})`。ズームは呼び手が述べなければ `maxTiles`（既定 256）に収まる最大。`stats` が zoom・tiles・requests・
  `clipped:true` を名乗る（低ズームは簡略化された図、縁を跨ぐ地物は片）。
- `js/geo-import.js`: `file.slice(0,7)` が `PMTiles` なら `readBytes` の天井より前に抜け、Blob を供給として窓を読む（数 GB のアーカイブを断らない）。
- 拒否は `pmtiles-*` の 11 コード（画像タイル・brotli/zstd・version≠3・切れ・矛盾・窓が大きすぎる…）。文面は `js/map-ui.js`、
  `tests/gis-pmtiles-checks.test.mjs` ⑦ がコード集合の一致を測る。取り込み後の通知にズームとタイル数を載せる。

## 測ったこと（テスト）

fixture はテスト内で書く（バイナリはコミットしない）。タイル ID は Hilbert 曲線の性質（各ズームで全単射・連続 ID は隣接・z1 の順 1,2,3,4）で検算し、
書き手と読み手が同じ誤った規則で一致する循環を避けた。1 タイルの窓は 16 タイルのアーカイブ（>48 KB）の半分未満のバイトしか供給に要求しない。
leaf ディレクトリ経由と root 直結で同じ答え。外環と穴は穴のまま。

## 残したもの（消せる条件つき）

- 地図へ PMTiles を**タイル源として直接**載せる経路（現状は取り込んだ地物をレイヤーに載せる）。消せる条件: MapLibre の protocol ハンドラを
  `archive.tile()` に結ぶこと。
- Atlas の `url:` 入口からの PMTiles。消せる条件: `js/gis-remote.js` が `pmtiles:` を `readUrl` に渡すこと。
- brotli / zstd は拒否（ブラウザに標準の展開器が無い）。
