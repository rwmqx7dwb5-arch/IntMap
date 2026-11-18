---
title: 投影座標系（UTM・Web メルカトル等）の COG も窓ごとに読めるようにした
date: 2026-11-19
newsen: Atlas can now read web-hosted Cloud Optimized GeoTIFFs in projected coordinate systems such as UTM, not only lon/lat files.
newsjp: Atlas が、Web 上の投影座標系（UTM など）の Cloud Optimized GeoTIFF も、経緯度のファイルと同じように読めるようになりました。
---

〈依頼〉 `cog-url-connect` の未了（多くの公開 COG は UTM / 3857 で、`cog-crs-not-4326` で断っていた）。

## 1. 変更

`js/gis-cog.js`: 窓の周（各辺 32 分割）を `fromWgs84` でファイルの CRS へ運んで箱を作り（弯曲する辺を 4 隅で測らない）、
窓の中央から 1 画素ぶん動かした距離でファイルの単位での画素の大きさを求めて overview を選び、`readRegion` →
`gis-warp.js to4326` → `resample(nearest)`。`coverage` の `inside` は窓の箱がファイルの内側かで判定し、外へ出る
ときは読めた部分の経緯度の範囲を `served` にする。`cog-crs-not-4326` は消した（役目は上の経路が引き継ぐ。
拒否の文も `gis-panel.js` から外した）。

## 2. 検査

`tests/cog-url-connect-checks.test.mjs` ⑤（UTM 54N・100 m 画素）。⚠ **独立した証人を 1 つ置いた**: 中央経線 141°E は
UTM の定義で easting 500000 なので、その窓の画素の easting が 500000 付近にあることを `gis-crs.js` を使わずに測る。
そのほか、読んだ画素の地面が窓と 0.002° 以内で一致・全体を落とさない・窓が外へ出れば `partial` で外側が NaN。

## 3. 未了

- 日付変更線をまたぐ窓（窓を ±180 で割って両側を読む）。
- 回転した（北が上でない）ファイルは `readRegion` が名前で断る（`region-out-of-range` / rotated-model）。
- 本番での実 COG（CORS・Range）の実測。
