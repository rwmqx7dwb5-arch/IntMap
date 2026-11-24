---
title: MCP の OAuth を、公開サフィックス一覧による同一サイト判定と Client ID Metadata Document へ
date: 2026-11-21
newsen: Signing in to external MCP servers now refuses sign-in endpoints that merely share a two-letter domain ending, and uses IntMap's own client document where the service supports it.
newsjp: 外部 MCP サーバへのサインインで、「末尾が同じ」だけの別組織のエンドポイントへ認可情報を送らないようにし、対応するサービスでは IntMap 自身のクライアント文書で接続します。
---


監査 §9.3 の欠陥と MCP 2026-07-28 の移行。

**欠陥**: `js/atlas-mcp-oauth.js` の `siteOf()` は「ホスト名の末尾 2 要素」で同一サイトを判定しており、`a.co.jp` と `b.co.jp`（`a.github.io` と `b.github.io`）を同一視した。メタデータが指す token エンドポイントを発行者の別組織へ向けられても `oauth_endpoint_mismatch` にならず、認可コードと PKCE verifier がそこへ送られる。
**直し方**: 末尾 2 要素の推定をやめ、Public Suffix List（ICANN と private の両方）で登録可能ドメインを求める。データは `scripts/build-public-suffix.mjs` が生成する `js/public-suffix-data.js`（2 ラベル以上・ワイルドカード・例外の 9,028 規則・約 140 KB・MPL-2.0・2026-11-19 版）、判定は `js/public-suffix.js`。失効条件: 一覧は更新されるので、新しい suffix を扱う必要が出たら script を再実行する。IP リテラルと suffix そのものは自身とだけ一致する。
**CIMD**: サーバが `client_id_metadata_document_supported: true` を述べ、使う戻り先が文書の `redirect_uris` と一致するとき、`client_id` を IntMap の文書 URL（ビルドが `mcp-client-metadata.json` を出す・`scripts/site-url.mjs`）にし、登録呼び出しをしない。非対応のサーバ・ローカル/プレビュー origin は従来の動的登録へ戻る（能力は減っていない）。
**検査**: `tests/mcp-oauth-same-site-checks.test.mjs`（co.jp・github.io・ワイルドカード・例外・IP・discover での拒否・CIMD の 3 経路・文書の自己参照）。

## main 追従(2026-11-24)
- #1279・#1304 が main に入ったので、この PR は固有のコミット(OAuth・Public Suffix List・Client ID Metadata Document・コールバック頁)だけを main の上に載せ直した。生成物(台帳・セキュリティ頁・能力表)と文書の件数(能力 273・到達可能 270)は main の実体から作り直した。
- check:surface の基準は main のものをそのまま使う(この PR の変更で window の読み取りは増えていない)。

## 予算の天井(2026-11-24)
main に #1304・#1366 などが入ったあとの CI の Gates 2/3 で、async.raw 14972.5→15204.1 kB(15,569,000 B へ)、async.gzip 5092.7→5165.6 kB(5,289,600 B へ)、atlas-cap-runs 1016.3→1022.0 kB(1,046,600 B へ)、dist.assets 22420.1→22662.6 kB(23,206,600 B へ)が天井を超えた。CI の測定値に合わせて上げた。この PR 固有の増分(OAuth のサインイン流れ・Public Suffix List の規則データ・コールバック頁)と main 側の増分の合計で、能力や規則データを戻せば下がる。

（同日の続き: main に #1343 が入ったあとの CI の Gates 2/3 で、async.raw 15095.5→15259.7 kB（15,626,000 B へ）、async.gzip 5137.3→5186.3 kB（5,310,800 B へ）、dist.assets 22553.8→22718.4 kB（23,263,700 B へ）が天井を超えた。CI の測定値に合わせて上げた。main 側の増分（geo.ml など）の取り込みぶんで、この PR の固有の増分は上の記述のとおり。）
