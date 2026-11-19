---
title: データの発見——世界のカタログに「この場所・期間を覆うと述べているコレクション」を訊く（取得は別セッションの url:/ogc:/stac: に委ねる）
date: 2026-11-19
newsen: Atlas can now ask the world's open data catalogues which datasets state that they cover a place and period, with each one's licence as stated, and says which catalogues did not answer.
newsjp: Atlas が世界のオープンデータカタログに「この場所と期間を覆うと述べているデータセット」を問い合わせ、各ライセンスをそのまま示し、応答しなかったカタログも明示するようになりました。
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

## 0b. 同じ監査から別セッションが先に取得側を入れていた（merge 時に発覚）

main に `gis-cog.js`（`url:`、投影 COG 含む）・`gis-ogcapi.js`（`ogc:`／`stac:`）が入っていた。私の `acquire`／`cog` は**二重実装**になるので削り、
新規性のある部分だけを残した（`.agents/rules/substance-over-form.md`: 届く先が同じ入口は統合する）。`discover`/`inspect` は
`ogc:`/`url:` の ref を返して既存の扉へ案内する。引き継いだ能力は失っていない（取得は main 側が同じだけ働く）。

## 1. 足したもの（残したもの）

- `js/gis-remote.js`（`window.IntMapGisRemote`）— `discover`・`inspect`・`catalogs`・`add`。カタログは `CATALOGS` というデータ。
- Atlas の能力 `data.gisRemote`（`discover`/`inspect`/`catalogs`/`add`/`sources`）。
- `IntMapGisSources.capabilityTable()` と `coverageOf` の公開。
- 外部通信の開示: `scripts/outbound-hosts.json`・`data/connection-ledger.json`・プライバシー §4（en/jp）・`DATA_SOURCES` 4 行。
## 2. 守ったこと（監査の「証明できないものは不明」を値にした）

- 完全性は 3 つの主張に分けた（供給元が窓の全部を返した／供給元の範囲が窓を覆うと述べている／世界の全部）。1 つ目は `coverage`（既存の判定）、2 つ目は `evidence`、3 つ目の `worldCompleteness` は**常に `unproven`**。
- 応答しなかったカタログは `answered:false` と理由で出す（空の一覧と混ぜない）。
- ライセンスは述べられたまま。述べが無ければ `provenance.license` は欄ごと無い（`open` と読まない）。
- 宛先は https の公開宛先だけ（`url-not-public`）。

## 3. 実測（2026-11-19、Node から。ブラウザではない）

| 対象 | 結果 |
|---|---|
| 5 カタログの `discover`（キャッシュ無し） | 全部が応答。コレクション数 9 / 140 / 793 / 104 / 45。NASA は 9 ページで合計 17 秒（`complete:true`） |
| Earth Search `cop-dem-glo-30`（東京の窓）の `inspect` | 資産は `s3://` で、https は**導出**と明記。COG と判定 |
| MSC の `/collections/{id}` の 1 回目 | Node の fetch が 1 度だけ `fetch failed`。再実行で成功 → 一過性の失敗は `fetch-failed` として返り、「無い」にはならなかった |


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

## 7. 性能の天井を上げた理由（`check:perf`）

遅延チャンクだけが増えた（起動時の行は動いていない）: 新しい async チャンク `gis-remote`（12.5 kB）と、`atlas-console` の
`data.gisRemote` の説明文（+5.7 kB raw）。async の合計は raw 14076.6 kB・gzip 4733.9 kB に上がった。Atlas で発見を頼んだときだけ読まれる。

`gis-core` +6.7 kB（`capabilityTable()` と `remote()` の扉）、`legal-text` +2.2 kB（プライバシー §4 の開示文 en/jp）も同じ理由で上げた。
どれも遅延チャンクで、起動時の行は動いていない。

`atlas-cap-runs` +4.9 kB（`data.gisRemote` の `run`）と `gis-core` +3.9 kB（`capabilityTable()`・`remote()`）。main の天井を取り込み直した後の再測定で、遅延チャンクだけ。
