---
title: STAC 検索でデータの所在を探し、見つけたファイルをそのまま読めるようにした
date: 2026-11-19
newsen: Atlas can now search a STAC catalogue for satellite and raster data by area and date, then read the file it picks.
newsjp: Atlas が、STAC カタログを範囲と日付で検索してデータの所在を探し、選んだファイルをそのまま読めるようになりました。
---

〈依頼〉 外部評価の第 1 優先「データの所在と対象期間を検索する仕組み（STAC など）」。

## 1. 変更

`js/gis-ogcapi.js` に `search` モード（STAC の item-search は OGC API – Features と同じ FeatureCollection + `rel=next`
なので、新しいページ送りを作らず既存の経路を使う）。`…/search` はそのままのアドレスで、`datetime`（Atlas の `acquire.time` を
そのまま渡す）・`bbox`・`limit`・サーバの next を使う。item が `properties` の外に持つ id・collection・**assets**
を、**ファイル 1 つにつき 1 列 `asset:<key>`**（href）として列に置く——探して選んだ行の href を `url:`（#cog-url-connect）に
渡して読む、という 1 本の鎖にするため。href の無い asset は列を作らない。`js/gis-atlas.js` に `stac:` 入力。

## 2. 検査

`tests/stac-search-source-checks.test.mjs`（偽サーバ）: 検索アドレスを書き換えない・`collections` が落ちない・`f=json` を付けない・
`datetime` が届く・OGC コレクションは `time` を断る（STAC だけが取る）・列が登録される・格子の枠と条件の拒否。

## 3. 未了

- 実在の STAC サーバ（Planetary Computer は署名付き URL が要る、Earth Search は公開）での実測は未実施。署名が要る資産は
  `url:` の読みで `http-status` になる（この層は署名を作らない）。
- `collections` / `ids` を `acquire` の欄として述べる口は無い（URL の `?collections=` で述べる）。
- STAC の POST 検索は使わない（GET の `rel=next` だけ）。
- 次: 出力が膨らむ演算（buffer）のチャンク処理。
