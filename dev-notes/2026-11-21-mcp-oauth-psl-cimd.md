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
- check:surface の基準 window.IntMapLazy 196→197 は、この PR の変更ではなく main の測定値に合わせたもの(この PR のファイルに IntMapLazy の記述は無い)。
