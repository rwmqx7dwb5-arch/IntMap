---
title: Cesium のズーム下限が緯度に従っていなかった——MapLibre 6 の globe は minZoom + log2(cos 緯度) で締め、Cesium は素の minZoom で 4 か所締めていたので、80°N では MapLibre より約 2.5 段手前で止まった
date: 2026-09-29
---

〈依頼〉多面的な監査の続き（`2026-09-28-cesium-globe-drag` の「残っている問題」）。

## 0. 測った

MapLibre 6 の globe（`vertical_perspective_transform.ts` 682 行）は `clamp(zoom, minZoom + getZoomAdjustment(0, lat), maxZoom)`
で締める。`getZoomAdjustment(0, lat) = log2(cos lat)`（Web Mercator の端 ±85.0511° で制限）。ズームの数は Mercator の
縮尺なので、同じ見かけの地球は極に近いほど小さい数になる。Cesium 側は `_minZoom` そのままで
`js/cesium-engine.js` の 2 か所（カメラの適用・範囲に合わせる）と `js/cesium-input.js` の 2 か所（正規化・ズーム）で締めていた。
80°N・minZoom 3 で、MapLibre の床は 0.47、Cesium は 3。

## 1. 直したもの

`CesiumView.minZoomAt(lat)` を 1 つ置き（globe のときだけ `+ log2(cos lat)`、平面と不明な緯度は素の minZoom）、
4 か所の締めが全部それを読む。`getMinZoom()` は MapLibre と同じく素の値を返す。

## 2. 検査

`tests/cesium-min-zoom-latitude-checks.test.mjs`: ① 同梱の maplibre-gl のソース（`globe_utils.ts`）を esbuild で束ねて
`getZoomAdjustment` を取り、10 の緯度で `minZoomAt` が 1e-12 以内で一致、平面と NaN は素の値 ② エンジンと入力に
素の `_minZoom` で締める箇所が残っていない。
