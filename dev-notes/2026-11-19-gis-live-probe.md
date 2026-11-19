---
title: 実在の STAC / OGC API / COG に実接続して測り、失敗の理由を応答から名指すようにした
date: 2026-11-19
newsen: Atlas now says why a public data source could not be read — blocked by the host's CORS policy, a server's own error text, or a sign-in page — instead of a generic failure.
newsjp: Atlas が、公開データの読み込みに失敗したとき、CORS 不許可・サーバ自身のエラー文・ログイン画面への転送など、理由を具体的に述べるようになりました。
---

〈依頼〉総合技術評価 P0。COG 範囲読み・投影対応・OGC API Features・STAC 検索は偽サーバと生成データでしか検証されておらず、実在サービスでの成功率が未測定。

重複確認: PR #1241（`feat/gis-data-supply`・`js/gis-remote.js`）は**発見**（カタログへの問い合わせ）で、`gis-cog.js` / `gis-ogcapi.js` / `gis-geotiff.js` は触らない。
本件は**取得**側だけ。`s3://`→https の導出は #1241 の `inspect` にも在るので、マージ後に向こうが `gis-cog.js` の `checkUrl` を呼ぶ形へ寄せられる（今回は触らない）。

## 1. 実測（2026-11-19・Node の fetch から・本番と同じ `readItems` / `readWindow`）

計器: `node scripts/gis-live-probe.mjs`（供給元は `scripts/gis-live-targets.json` のデータ。供給元ごとの分岐は無い）。東京近傍の窓 64×64。

| 供給元 | 段 | 結果 | 備考 |
|---|---|---|---|
| Copernicus DEM（S3 COG, WGS84） | 窓読み | OK 7.8 s・`all` | 64×64 でこの時間＝`requests` が多い（別件） |
| ESA WorldCover（S3 COG） | 窓読み | OK 3.1 s・`all` | |
| Earth Search `sentinel-2-l2a` | 検索→`asset:red`→窓読み | OK・UTM(EPSG:32654)・`all` | 検索は `partial`（next あり）と正しく申告 |
| Earth Search `cop-dem-glo-30` | 検索→`asset:data`→窓読み | **修正前 `url-not-https`（資産は `s3://`）→ 修正後 OK** | |
| Planetary Computer `sentinel-2-l2a` | 検索 OK／資産読み FAIL | 409 `PublicAccessNotPermitted`（署名が要る） | 修正後はサーバの言葉が出る |
| USGS Landsat（landsatlook） | 検索 OK／資産読み FAIL | **修正前 `range-unsupported`（誤診）→ 修正後 `http-status` 200・ログイン画面（ers.cr.usgs.gov）へ転送** | 認証が要る |
| Digital Earth Australia | 検索 OK | `partial`・next あり | |
| NASA CMR-STAC LPCLOUD | 検索 OK | `collections` 付きで 1 s。**collections 無しの bbox 検索は 25 s（旧の測定では 500）** | 上流が重い |
| pygeoapi demo / Environment Canada / NRW / BGS | OGC items OK | いずれも `partial`（next あり）と申告 | |
| GNOSIS Map Server | 401 | サーバの言葉で断る（鍵が要る） | |

## 2. ブラウザ（本番オリジンから実 fetch・Range 付き）

| 宛先 | 結果 |
|---|---|
| Earth Search / Planetary Computer / DEA / CMR / pygeoapi / Environment Canada（検索・items） | 読める（CORS 許可） |
| **Copernicus DEM・ESA WorldCover の S3 バケット** | **`Failed to fetch`。Node では読めるのにブラウザでは読めない**。`no-cors` では opaque＝ホストは応答しているが `Access-Control-Allow-Origin` が無い（CORS 不許可） |
| USGS landsatlook の STAC 検索 | `Failed to fetch`（同じく CORS 不許可） |

⚠ **Node で通った＝ブラウザで通る、ではない。** 供給元の公開 COG の一部はページから読めない。これはクライアントでは直せない
（相手のヘッダ）。直せるのは**理由を正しく名指す**こと。中継は費用・濫用・SSRF の判断が要るので提案に留める（下）。

## 3. 直した構造

- `js/gis-http.js`（新）: `fetch-failed` に **`corsBlocked`**（`no-cors` HEAD が opaque ＝到達できるが読めない。Node は opaque を返さないので本物の通信失敗は誤って CORS とは言われない）、`http-status` に **サーバ自身の言葉 `serverSaid`** と別オリジンへの **`redirectedTo`**。HTML の 200 は「Range 非対応」ではなくログイン画面（`http-status`）。`gis-geotiff.js`（`readUrl`）と `gis-ogcapi.js`（STAC/OGC）が同じ判定を使う。
- `gis-cog.js`: **`s3://bucket/key` を https へ導出**（AWS の定義による導出・ドット付きバケットは path 形）。`source.derivedFrom` に元の綴りを残す。`gis-atlas.js` の `url:` 入口も `s3://` を受ける。
- （POST の next は #1248 が先に直したので、こちらでは触らない。）
- 画面の文（`map-ui.js` / `gis-panel.js`）に上の 3 つを出す。

完全性の申告は元から機能していた: 検索・items は next が在れば `partial`（実測 7 供給元すべて）、窓が全部ファイルの内側で解像度も足りるときだけ `all`。

## 4. 検査

`tests/gis-live-diagnosis-checks.test.mjs`（5 件・オフライン）。実接続の計器は CI で走らせない（外部サービスの機嫌で赤くなるため）。

## 5. 未了・提案

- **CORS 不許可の公開 COG を読む手段は無い**。選択肢: 呼び出し専用の Range 中継 Edge Function（許可ホストの目録・サイズ上限・濫用対策が要る＝費用と安全の判断で、利用者の承認事項）。
- 署名付き URL（Planetary Computer の SAS）は取得も署名もしない。匿名の署名 API が在るが供給元専用の手順になる（STAC の `auth` 拡張を述べる供給元が現れたらそこから導く）。
- Copernicus DEM の 64×64 窓が 7.8 s かかる理由（リクエスト数・チャンク配置）は未調査。
- 日付変更線をまたぐ窓は従来どおり未対応。
