---
title: 発見できても取得できなかった公開データを、原則型の中継・署名・再利用・日付変更線で読めるようにした
date: 2026-11-20
newsen: Atlas can now read public elevation and land-cover files that a web page was blocked from reading, sign Microsoft Planetary Computer downloads, and read windows that cross the date line.
newsjp: Atlas が、ブラウザから読めなかった公開の標高・土地被覆データを読めるようになり、Planetary Computer の署名つき取得と、日付変更線をまたぐ範囲の読み込みにも対応しました。
---

〈依頼〉外部監査（2026-11-20）の指摘。`data.gisRemote`（`js/gis-remote.js`）で**発見**できても**取得**できない外部データの穴を塞ぐ。前回の実測（`2026-11-19-gis-live-probe.md`）の障害: ① Copernicus DEM・ESA WorldCover は Range に答えるが ACAO が無く、ページから読めない ② Planetary Computer は署名が要る ③ USGS Landsat は認証転送 ④ NASA CMR-STAC は遅い ⑤ 日付変更線をまたぐ窓は未対応。

## 1. 構造（供給元ごとの分岐は 1 つも無い）

| 部品 | 何をするか | 判断の根拠（コードに供給元は無い） |
|---|---|---|
| `supabase/functions/gis-fetch`（新・`_shared/gis-fetch-policy.js`） | ページが読めないホストを**サーバが読む**中継 | **許可リストではなく原則**: https・既定ポート・資格情報なし・名前が**公開アドレスにだけ解決**（`resolvesPublic`・転送の各ホップも同じ 2 問）・バイト数に上限のあるデータの読み（`range` は 1 回 4 MiB まで・全体取得は 8 MiB まで）・**ページ（text/html）は断る**・URL と範囲以外は何も転送しない |
| 同・費用の上限 | プロジェクト全体 256 MiB/時（`relay_take` `gis-fetch:project-bytes`・**閉じる側に倒れる**）・呼び手 32 MiB/分（ハッシュ鍵・開く側）・**求めたバイト数を上流に触れる前に引く**・停止スイッチ `GIS_FETCH_DISABLED=1`（deploy 不要） | 数の由来と失効条件は policy ファイルに |
| `js/gis-fetch.js`（新） | 3 つの読み手（`gis-geotiff` / `gis-ogcapi` / `gis-remote`）が共有する `fetch` | ① 直接読む ② 直接が**投げ**、かつ `no-cors` の探りが**不透明な応答**（＝ホストは応答するが CORS が無い）を返したときだけ中継（オリジンを覚える）③ 401/403/409 なら署名者で署名して 1 回だけ読み直す ④ それ以外はホスト自身の答え |
| 同・再利用 | 1 MiB 整列チャンクで中継を読み、メモリ（48 MiB LRU）→ Cache API（1 日・256 件）で再利用。**失敗したチャンクは保持しない** | |
| `js/gis-remote.js` `signHref` | 署名 | コレクションの `storage:schemes`（STAC storage 拡張）が置き場を述べ、カタログ登録（**データ**）の `sign:{kind:'azure-sas', token:'…/{collection}'}` が取り方を述べる。無ければ `no-signer` |
| `js/gis-cog.js` | 日付変更線 | 窓が ±180 をまたぐなら（`[170,-20,-170,-10]` でも `[170,-20,190,-10]` でも）継ぎ目で割り、両側を**ファイルの持つ経度**で読んで 1 枚に縫う。片側を持たないファイルは NaN と `window-extends-past-the-file` |
| 失敗理由 | `js/gis-http.js` | 中継の拒否は `explained`（`via-relay: …`・`relay` コード）を運び、**CORS とは言わない**。ホストの言葉（`serverSaid`）・転送先（`x-gis-redirected-to` → `redirectedTo`）・自分の時計切れ（`timeout`）を分ける |

## 2. 実測（2026-11-20・本番 `gis-fetch` を deploy して `node scripts/gis-live-probe.mjs --relay …`）

| 供給元 | 結果 | 備考 |
|---|---|---|
| Copernicus DEM（S3） | **中継で OK 4.3 s・`all`・finite=4096**（前回 Node 直 7.8 s） | 1 MiB チャンクで要求数が減った。ページからは `Failed to fetch` だった |
| ESA WorldCover（S3） | **中継で OK 7.3 s・`all`** | |
| 日付変更線（Copernicus DEM E179 タイルを `[179.5,-16.8,180.5,-16.2]`） | **OK 4.4 s・`partial`・`window-extends-past-the-file`・finite=2048（東半分）** | 西側（W180 タイル）は別 URL なので NaN と申告 |
| Planetary Computer（`sentinel-2-l2a` B04） | **署名して OK 8.7〜11 s・`all`・EPSG:32654** | トークン API も Blob も ACAO:* なのでページから**直接**読める（中継不要）。中継経由（`--relay`）でも署名→再読で OK（CORS と署名が両方要る供給元の経路） |
| USGS Landsat（landsatlook） | **取得不可（原理的）** `http-status`・200・「ページが返った（ログイン画面）」・`redirectedTo: https://ers.cr.usgs.gov/login` | 匿名では読めない（ERS ログイン要）。中継経由でも `upstream_is_a_page` ＋転送先で同じ事実を述べる。Landsat が要るなら Planetary Computer の `landsat-c2-l2`（署名経路）を使う |
| NASA CMR-STAC | `collections` 付き 2.1 s OK／**無し 31 s で 500**（サーバ自身の言葉 `Oops! Something h…` を `serverSaid` で報告） | 上流の問題。`inspect()` は常に `collections` を付ける。25 s の自前時計切れは `timeout` と言う |
| 本番の中継そのもの | 範囲 206 ・`content-range`/`x-gis-total`・ACAO:*・**`CF-Cache-Status: DYNAMIC`（2 回目も 0.7 s の上流時間）** | ⚠ **CDN の共有コピーは無い**。再利用はブラウザごと（メモリ＋Cache API） |
| 拒否 | `http://`・169.254.169.254・範囲 4 MiB 超過 → `not_https`／CF が遮断／`bad_range`。ERS ログイン → `upstream_is_a_page`。PC の無署名 → `upstream_status` 409 ＋ `PublicAccessNotPermitted` | |

## 3. 検査

`tests/gis-remote-fetch-checks.test.mjs`（19 件）: A 中継を**評価して**（Deno.serve 捕捉＋fetch 差し替えの子プロセス）原則を検査——誰も列挙していないバケットを範囲で読む／形・資格情報・ポート・内向き名・過大範囲を**ネットワークと予算の前に**拒否／名前は公開でも解決が内向き・転送が内向きなら拒否／ページは `upstream_is_a_page` と転送先／Range 無視は小さければ 200・大きければ読まない／予算は求めた量を**上流の前に**引き、プロジェクトは閉じる・呼び手は 429・DB 無しも閉じる・停止スイッチが最初。B 共有 fetch——チャンク境界でバイト一致・同じ窓の再読と隣の窓は中継 0 回・再読込（Cache API）でも再利用・失効したものは信じない・死んだネットワークは中継に回さない・中継の拒否は CORS と言わない・ホストの拒否は自身の status と言葉で返る・署名して 1 回だけ読み直す（ループしない）・CORS＋署名の両方。C `signHref`（述べられた置き場だけ・トークンは期限まで保持・既に署名して拒否されたものは再署名しない）／コードに供給元名が無い／自前の時計切れは `timeout`。D 日付変更線（両記法・片側 NaN・全球ファイルは継ぎ目なし `all`・両側とも無ければフラットの拒否）。

## 4. 残したもの・限界

- **Landsat（USGS 直）は読めない**。認証は本来の要件で、中継で回避してはならない（資格情報を預からない）。
- 中継は 1 回 1 MiB 単位で上流に触れるので、**1 つの 512×512 窓で約 6 MiB**（実測の見積り）。256 MiB/時は読み手全員で数百窓/時。本番でこの数に当たったら `GIS_FETCH_PROJECT_MIB_PER_HOUR` を動かす（`budget_exhausted` が読み手の行為で出たとき）。
- 中継の `Cache-Control` は付けたが CDN は共有しない（上記）。共有が要るなら Storage に置く別設計（費用と保持の判断が要る）。
- POST の STAC 検索（CORS 不許可のカタログ）は中継しない（GET のみ）。必要になったら別に判断する。
- PC の署名は初回に `/collections`（約 4 s）を引く。10 分は再利用される。
