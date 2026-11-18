---
title: URL の COG を Atlas から窓ごとに読めるようにした（readUrl に初めて呼び手がついた）
date: 2026-11-19
newsen: Atlas can now analyse a Cloud Optimized GeoTIFF straight from a web address, fetching only the part of the file your area needs.
newsjp: Atlas が、Web 上の Cloud Optimized GeoTIFF をアドレスから直接分析できるようになりました。必要な範囲の部分だけを取得します。
---

〈依頼〉 外部評価（GIS 基盤）の第 1 優先「COG 読み込みの接続」。完了条件は、URL から取得した格子が GIS に
登録され、Atlas が分析・描画まで使えること。

## 0. 測った

`js/gis-geotiff.js` の `readUrl` は定義のみで呼び手 0（`gis-foundation-refine` の未解決 §6 と同じ）。

## 1. 変更

- `js/gis-cog.js`（新）: URL＋窓＋解像度 → `levelFor` → `readRegion` → `warp.resample(nearest)` → 格子の契約＋`coverage`。
- `js/gis-atlas.js`: `data.gis` の入力に `url:https://…`。格子の枠だけ・窓は述べさせる・登録して `provenance.kind='url-raster'`。
- `js/atlas-cap-data.js`: planner への案内に `url:` を追加（渡されていない能力は使われない）。
- 文書: `docs/GIS-CORE.md` §1.4c・`docs/FILES.md`。

## 2. 検査

`tests/cog-url-connect-checks.test.mjs`（4 本）: Range で全体の半分未満しか取らない・値の出所の地面が窓と一致・
外側は NaN・http/資格情報/非 4326/404 を名前で断る・`url:` が登録され `rasterMask` の鎖に入る。

## 3. 未了（次）

- 投影座標系の COG（多くの公開 COG は UTM / 3857）は `cog-crs-not-4326` で断る。bbox の CRS 変換＋`to4326` が次。
- 画面（パネル）側の入口は未追加。Atlas 経由のみ。
- 本番での実 COG（CORS・Range）の実測は未実施（本番検証で）。

## 4. 起動費用（`check:perf` の天井を上げた理由）

遅延チャンク `atlas-cap-runs` 853.4 → 857.8 kB（+4.4 kB）。`js/gis-cog.js`（窓の読み取り）と `js/gis-atlas.js` の
`url:` 入口がこのチャンクに入る。分析で URL の格子を読んだときだけ読まれ、起動時の経路には載らない。
`perf-budget --update` が上げたのはこの 1 行だけ。

## 5. CI で落ちたもの

読者向けの文が無かった 4 コード（`url-not-https`・`url-has-credentials`・`url-invalid`・`cog-crs-not-4326`）を
`js/gis-panel.js` に足した（en+jp。`tests/geo-gis-datasets-checks.test.mjs` が全コードに文があることを測る）。
