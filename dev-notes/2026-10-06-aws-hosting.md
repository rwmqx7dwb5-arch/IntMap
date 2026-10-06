---
title: 配信先を GitHub Pages から AWS（S3 + CloudFront）へ移す準備——構成をコードに、公開ジョブは AWS の設定が入るまで休眠
date: 2026-10-06
internal: 本番は Pages のままで、読者に見える変化はない。AWS アカウントができてから並行公開→切り替えの順に進む
---

〈依頼〉 Pages の 1 GB 上限と商用利用の規約に対して配信先を調べて提案（利用者は AWS を選択、ドメイン `intmap.app`
を Route 53 で取得、CloudFront 定額 Pro、旧アドレスは転送ページとして残す、`DECISIONS.md` の「外部バケットを
採らない」を改めることを承認）。アカウント作成・支払い・ドメイン契約は利用者の作業なので、リポジトリ側を先に用意した。

## 0. 測った

- `dist/` 1,028,746,955 B・15,899 ファイル（隔離した作業場で `npm run build`、151 秒）。25 MiB 超が 3 本
  （`data/hist-admin1.js` 41.5 MB ほか）。2026-09-30 の 8,321 ファイルから 6 日でほぼ倍。
- 本番 Pages の応答ヘッダを拡張子ごとに `curl -sI`: 全応答に `Access-Control-Allow-Origin: *` と
  `Cache-Control: max-age=600`。`.gz` は `application/gzip`（Content-Encoding なし）、`.tle`・`.pbf`・`.bin` は
  `application/octet-stream`、`.geojson` は `application/geo+json`。表は `scripts/aws-publish.mjs` の `CONTENT_TYPES`。
- CloudFront が自動で圧縮するのは 1,000〜10,000,000 B だけ（AWS の文書）。それを超えるテキストは 6 本で、
  gzip 済みで置くと上げる量は 1,028 MB → 911 MB。

## 1. 決めたこと

- **1 つのオリジンのまま移す。** データは相対パスで 213 行から読まれ、`data/hvt` の Range 読み・Service Worker の
  オフライン保存・CSP・テストが同一オリジンを前提にしている。データだけ別ホストにすると全部の書き換えが要る。
- 応答ヘッダは「あるべき値」ではなく **Pages が送っていた値**にする。未知の拡張子は推測せずに公開を止める
  （最初の試運転で `.svg`・`.wasm`・`.gif` が止まり、それぞれ実測して足した）。
- 全 15,899 ファイルを毎回上げ直さない。バケットに前回の目録（`_publish/manifest.json`）を置き、中身かヘッダが
  変わったものだけ上げる。消すのは 7 日より古いものだけ（前の版のページがまだ前のチャンクを求めうる）。
- 「本番を古い版へ戻さない」判定は `pages-publish-guard.mjs` のものを import して使う（写さない）。
  何が本番かはバケットの `build-info.json` を S3 から直接読む（CDN 経由だと遅れる）。

## 2. 入れたもの

`infra/aws/certificate.yaml`（us-east-1 以外では作れない）・`infra/aws/hosting.yaml`（非公開 S3・OAC・CloudFront・
Function・OIDC ロール・`PointDns=true` のときだけ DNS）・`scripts/aws-publish.mjs`・`ci.yml` の `aws` ジョブ
（`vars.AWS_PUBLISH_ROLE_ARN` が無い間はスキップ）。手順は `docs/RELEASE.md`「AWS（S3 + CloudFront）での配信」。

## 3. まだやっていないこと

AWS 側は 1 度も作っていない（アカウントが無い）。テンプレートは YAML として読めることと中身の不変条件しか
確かめていない——`cloudformation deploy` で初めて AWS に検証される。切り替え（`CUSTOM_DOMAIN`・Pages の転送
ページ・Supabase Auth の URL）は別の PR。AWS CLI の winget インストールは UAC の確認が取り消されて失敗した
（終了コード 1602）。

## 4. 検査

`tests/aws-hosting-checks.test.mjs`（型の表・キャッシュと圧縮の規則・差分と削除の計画・build-info の欄が Pages の
printf と一致・テンプレートの不変条件・実ビルドの全ファイルの型）と、`tests/ci-build-once-checks.test.mjs` に
「`aws` ジョブは `pages` と同じ門を待つ」を足した。
