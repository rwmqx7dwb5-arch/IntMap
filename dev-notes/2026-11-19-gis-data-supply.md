---
title: 地理空間データの供給網——世界のカタログを発見し、リモート COG を欲しい窓だけ読む（外部監査の P0/P1 のうち実装できた部分）
date: 2026-11-19
newsen: Atlas can now search the world's open data catalogues for datasets covering a place and period, import their items, and read just the window you need from a remote Cloud-Optimised GeoTIFF. Results never claim to be everything that exists.
newsjp: Atlas が世界のオープンデータカタログ（STAC・OGC API）から場所と期間に合うデータセットを探し、アイテムを取り込み、リモートの COG から必要な窓だけを読めるようになりました。結果は「供給元が持つもの」を述べ、世界の全部だとは主張しません。
---

〈依頼〉外部の技術監査（IntMap の地理空間データ基盤・データ供給網）の指摘を、できるだけ全部やる。

## 0. 監査の主張を実コードで確かめた

| 監査の主張 | 実際 |
|---|---|
| `readUrl()` の呼び出し元が 0 件 | **正しい**（`js/gis-geotiff.js`。開発記録 2026-11-18 も同じ）。今回の `cog()` が最初の呼び手 |
| `coverageOf()` が all / partial / sample を分ける | 正しい。判定は `js/gis-sources.js`。ただし**登録されたレイヤーでしか使えなかった**（`entryFor` が `list()` を通る）ので、外部カタログには使えなかった → `coverageOf` を API として公開して同じ判定を使う |
| Atlas のカタログは内部登録のみ | **正しい**。発見の手が無かった |
| 供給能力の監査 `auditCapabilities` | あるが 1 id ずつで、全体を 1 回で見る表が無かった → `capabilityTable()` |
| ベクタ全件のメモリ保持・世界規模の分割保存基盤が無い | 正しい。**今回は実装していない**（下の §4） |

## 1. 足したもの

- `js/gis-remote.js`（`window.IntMapGisRemote`）— STAC API と OGC API – Features の発見（`discover`）・検査（`inspect`）・取得（`acquire`、ベクタのデータセット）と、リモート COG の部分読み（`cog`）。カタログは `CATALOGS` というデータで、実行時に `add()` で足せる。
- Atlas の能力 `data.gisRemote`（`discover`/`inspect`/`acquire`/`cog`/`catalogs`/`add`/`sources`）。`js/gis-atlas.js` の `remote()`。
- `IntMapGisSources.capabilityTable()` と `coverageOf` の公開。
- 外部通信の開示: `scripts/outbound-hosts.json` と `data/connection-ledger.json`、プライバシー §4（en/jp）、`DATA_SOURCES` に 4 行（`js/reference-data.js`、説明は `pages.en.js` / `pages.ja.js`）。

## 2. 守ったこと（監査の「証明できないものは不明」を値にした）

- 完全性は 3 つの主張に分けた（供給元が窓の全部を返した／供給元の範囲が窓を覆うと述べている／世界の全部）。1 つ目は `coverage`（既存の判定）、2 つ目は `evidence`、3 つ目の `worldCompleteness` は**常に `unproven`**。
- 応答しなかったカタログは `answered:false` と理由で出す（空の一覧と混ぜない）。
- ライセンスは述べられたまま。述べが無ければ `provenance.license` は欄ごと無い（`open` と読まない）。
- 宛先は https の公開宛先だけ（`url-not-public`）。Range を無視するサーバは `range-unsupported`。400 万画素超は `region-too-large`。

## 3. 実測（2026-11-19、Node から。ブラウザではない）

| 対象 | 結果 |
|---|---|
| 5 カタログの `discover`（キャッシュ無し） | 全部が応答。コレクション数 9 / 140 / 793 / 104 / 45。NASA は 9 ページで合計 17 秒（`complete:true`） |
| Earth Search `cop-dem-glo-30`（東京の窓）の `inspect` | 資産は `s3://` で、https は**導出**と明記。COG と判定 |
| `acquire`（STAC・5 件）/ MSC `hydrometric-stations`（161 件中 30 件） | 前者 `all`、後者 `sample` / `limit-truncated` と報告 |
| `cog`（Copernicus DEM 36.8 MB、0.1° 角、幅 100 画素） | 概観の段（level 1）を読み、2 リクエストで 181×181 画素。解像度に届いたと報告 |
| MSC の `/collections/{id}` の 1 回目 | Node の fetch が 1 度だけ `fetch failed`。再実行で成功 → 一過性の失敗は `fetch-failed` として返り、「無い」にはならなかった |

⚠ **CORS**: Copernicus DEM のバケットは Range に答えるが `Access-Control-Allow-Origin` を返さない（curl で Origin を付けて確認）。**ブラウザからは読めず、画面の無い実行環境からは読める**。ブラウザでは `fetch-failed`。回避に中継（`fetch-relay`）の許可リストを広げることは、今回はしていない（Edge Function の配備を伴う別の判断）。

## 4. やっていないこと（構造の追加であって、この延長ではない）

- 世界規模のベクタを分割して保存・検索する基盤（GeoParquet・DuckDB・PostGIS）。`features()` は配列を返す契約のまま。
- 長時間・大容量の解析を画面と切り離す非同期ジョブ、解析結果の永続キャッシュ。
- 供給元の優先順位・品質の機械可読な統合、時空間の統一モデル（存在した時点／観測した時点／公開した時点／取得した時点）、対象の安定識別子。
- `governance-ledger` の 205 件の未申告の解消。
- Planetary Computer の資産は署名（SAS）が要るものが多く、`needsSigning` を述べるだけで署名の取得はしていない。

## 5. 門

- `tests/gis-data-supply-checks.test.mjs`（38 件、ネットワークに触れない。偽の fetch と、このテストの中で組んだタイル構造の GeoTIFF）。
- 既存の門で直したもの: `check:docs`（能力 249→250）、`check:archfiles`、`check:datagov`（outbound-disclosed）、`atlas-gis-checks`（`gis-remote.js` を NOT_A_KERNEL に理由つきで）。
- ⚠ 外部通信の門は `git ls-files` を母集団にしているため、**新しい js ファイルは `git add` するまで見えない**。また `credit` というキー名を持つ object の URL は「リンク」と見なされて素通りする（今回 `operator` に改名して門に見せた）。
- `check:surface`: `window.IntMapGis` と `window.IntMapLazy` の読みが 1 件ずつ増えた（`data.gisRemote` の `run`。`data.gisExport` と同じ作法）。`--update` で記録。

## 6. 消したもの・引き継いだもの

何も消していない（加算のみ）。
