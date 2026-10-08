---
title: セキュリティの実測と直し——ロックファイルが自分の依存の下限を破って脆弱な DOMPurify を配っていた（整合の門と勧告の見張りを足す）、秘密の検査が読んでいなかったファイル・2 本目の JWT・運用の資格情報の形、記事の中継の IPv6 判定、埋め込みの見本の送信元検査
date: 2026-10-08
newsen: The security page now says how IntMap checks the libraries it sends to your browser against published vulnerabilities. One library, inside two published advisories, has been updated.
newsjp: セキュリティのページに、ブラウザに届けるライブラリを公開の脆弱性情報と照合していることを追記しました。公開の勧告の対象だったライブラリ 1 つを更新しました。
---

〈依頼〉全権委任（セキュリティも）。報告書ではなく、IntMap を実際に安全にする変更と、それを利用者・学校・報道機関に
説明できる形。既存の門（CSP・出力の taint 台帳・RLS の pgTAP・中継の許可表）は成熟しているので、**門が見ていない所**を
実測で探した。

## 0. 測った（2026-10-08）

| 何 | 結果 | 意味 |
|---|---|---|
| `npm audit`（ロック） | 2 件: `dompurify` 3.4.13（low・本番に配る。Cesium 経由）、`source-map-js` 1.2.1（high・ビルド道具） | 公開の勧告の範囲内の版が入っていた |
| ロックの依存辺 | `@cesium/engine` 26.3.0 は `dompurify: ^3.4.14` を宣言、ロックは 3.4.13 | **ロックが自分の依存の下限を破っていた**。#770（2026-09-26、Dependabot の 3 本組から 1 本を手で戻した）から。`npm ci` は入れ子の範囲を照合しないので CI も配備も通った |
| 誰が見ていたか | `GET /repos/…/vulnerability-alerts` → 404（Dependabot alerts 無効）、`automated-security-fixes` → `enabled:false`。`dependabot.yml` は直接依存の版更新だけ | 推移的な依存の勧告を誰も報告しない |
| 秘密の検査の母集合 | 拡張子の一覧（17 種）だけ。追跡された text のうち 11 本（`.sh` 3・`.ps1`・`.geojson`・`.tle`・`.webmanifest`・`.nvmrc`・`LICENSE` ほか）を読んでいない | 運用スクリプトが読まれていない |
| JWT の判定 | ファイルの**最初の 1 つ**だけ（`match` に `/g` が無い） | 公開キーの後ろの service_role を見ない |
| 運用の資格情報の形 | Supabase の個人アクセストークン（CI の配備に使う）・Stripe の制限キーと webhook 署名秘密・Google OAuth のクライアント秘密・npm トークンが一覧に無い | この製品自身が扱う秘密の形を知らない |
| 記事の中継の宛先判定（`publicAddress`） | IPv6 は先頭のグループと 2 つの綴りで判定。IANA の特殊用途の表と照合すると、6to4（IPv4 を運ぶ）・Teredo を含む `2001::/23`・`100::/64`・`3fff::/20`・`5f00::/16`・`fec0::/10` を「公開」と答えていた | 註は「特殊用途の表」と言い、実装はその一部だった |
| 開発者ページの postMessage の見本 | 受信側が送信元も origin も見ない | 写した埋め込み側が、他の窓の偽の返事を受け取る。同梱の `js/embed-client.js` は両方を見ている |

否定された見立て: SECURITY DEFINER 関数の `search_path`（全 65 本が固定。`public, extensions` の 3 本は service_role 専用）、
GitHub Actions（全リモート Action が SHA 固定・`pull_request_target` 無し・`run:` への式の直挿し無し）、`window.open`（全 10 件
`noopener`）、埋め込み側の受信（`e.source` で親だけ）、`news-ingest` の CodeQL の stack-trace 指摘（秘密で門がある呼び出し元にだけ返る）、
共有の受け口の `location.assign`（同一 origin を確認済み）。

## 1. 直したもの

- **ロックファイル**: `dompurify` 3.4.16・`source-map-js` 1.2.2（registry の integrity）。`npm audit --package-lock-only` は 0 件。
  Cesium が DOMPurify を呼ぶのは `Credit.js` の `sanitize(文字列)` で、勧告の `IN_PLACE` 経路ではない——実害の経路は無かったが、
  依存元が宣言した下限を満たすことが先。
- **`scripts/lock-ranges.mjs`＋`check:static` の規則 `lock-ranges`**: ロックの全依存辺（1,046 本）で、Node の解決規則で引いた版が
  依存元の範囲を満たすかを node-semver の読み（`||`・ハイフン・`^ ~ < <= > >= =`・部分版・x・プレリリース規則）で判定する。
  URL 指定は `resolved` との一致、`npm:` 別名は中の範囲、読めない指定は**拒む**（通さない）。直近 12 版のロックに当てて、
  #770 以降の 5 版だけが同じ 1 辺で赤、それ以前は全部緑（誤検出 0）。
- **`security.yml` に `Dependency advisories (npm audit)`**: ロックを勧告データベースに照会する。ブラウザに配る依存は全深刻度、
  道具は high 以上。毎週と全 PR（必須チェックではない——CodeQL と同じ扱い）。
- **秘密の検査**（`scripts/secret-scan.mjs` に形と判定を移し、`static-checks.mjs` は読むファイルを決める）: 母集合に
  「git が commit しうる全ファイルのうちバイトが text のもの」を足した（従来の集合は 1 本も落とさない）。JWT は全部を見る。
  上の 5 つの形を足した。
- **`publicAddress`（`supabase/functions/_shared/relay-guard.js`）**: IPv6 を 8 グループに読み、IANA の表（取得 2026-10-08）の
  非公開ブロックを接頭辞で拒む。IPv4 を運ぶ形（IPv4-mapped の両表記・NAT64・6to4）は中の IPv4 で判定。
- **開発者ページの見本**（`scripts/landing.mjs` → `developers.html`・`ja/developers.html`）: 受信で `e.source` と `e.origin` を確かめる。
- **セキュリティのページ**: 「ライブラリを既知の脆弱性と照合」の 1 枚（en/jp）。有無は `.github/workflows/` から読む
  （`scripts/org-pages.mjs` `securityFacts().advisoryWatch`）。

## 2. 確かめた

`tests/security-hardening-checks.test.mjs` 10 本——ロックの全辺と、実ロックの全 caret 下限を 1 patch 下げると必ずその辺が赤になること、
範囲の読みを node-semver の答えと照合、実行時に組み立てたトークンと JWT で検査を評価、追跡された text ファイルが全部母集合に入ること、
生成された見本を vm で動かして偽の返事を無視すること、`publicAddress` と `resolvesPublic` の評価、workflow を YAML として読むこと。

## 3. 配備と、承認待ち

- **Edge Function の再配備が要る**: `_shared/relay-guard.js` を読む関数のうち挙動が変わるのは `fetch-relay`（記事の規則）だけ。
- **GitHub の設定（所有者の承認が要る）**: Dependabot alerts と Dependabot security updates を有効にする
  （`docs/SECURITY-ARCHITECTURE.md` §9）。有効になれば npm audit の job は二重の見張りになる。
- `regen` が `tests/output-taint-baseline.json` の `sinks` を 714 → 718 に書いた（main 側の変化。締める方向だけ）。
