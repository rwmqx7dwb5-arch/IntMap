---
title: セキュリティ点検を常設にする——security.yml を毎日にし、予定実行の赤を 1 件の Issue へ、Dependabot alerts・セキュリティ更新・非公開の脆弱性報告を有効化、CodeQL の未対応 7 件を仕分け
date: 2026-11-16
newsen: The security page now says IntMap checks the libraries it sends to your browser against published vulnerabilities every day, not every week. Security problems can also be reported privately through GitHub.
newsjp: ブラウザに届けるライブラリと公開の脆弱性情報との照合を、毎週から毎日にしました。セキュリティ上の問題は GitHub からも非公開で報告できるようになりました。
---

〈依頼〉総点検（#1130）を一度きりの大掃除で終わらせず、監査の能力を開発・運用に常設する（範囲は一任）。

## 0. 測った（2026-11-16）

| 何 | 結果 |
|---|---|
| `security.yml` の予定実行 | 毎週月曜だけ。赤は Actions の一覧に出るだけで、誰にも届かない |
| main に載っている勧告 | 予定実行ではなく、無関係な PR #1129 の「Dependency advisories」が赤くなったことで初めて見えていた（DOMPurify） |
| Dependabot alerts / security updates / 非公開の脆弱性報告 | 3 つとも無効（`SECURITY-ARCHITECTURE.md` §9 が「運用者の手作業」として 10-03・10-08 から残していた） |
| 有効化の直後 | Dependabot alerts が DOMPurify の勧告 3 件（critical 1・high 1・low 1、runtime）を即座に出した——#1136 が扱っているもの |
| CodeQL の open alert | 7 件（high 4・medium 3）。#R801 の仕分けの後に積もったもの |
| セキュリティページの文 | 「毎週」と手で書かれていた——頻度は cron が持つ事実 |

## 1. 直したもの

- **`security.yml` を毎日（02:47 UTC）に**、予定実行の concurrency グループ名を `weekly` → `scheduled`。
- **`Scheduled security watch` job**: 予定実行のときだけ、両方の走査 job の後に（失敗しても）走り、npm audit の赤・CodeQL の未完了・
  main 上の high/critical の code-scanning alert のどれかがあれば `status:security-advisory` の Issue を 1 件開く／書き換える、
  緑で閉じる。機構はバックアップと配備が共有する `scripts/ci-incident-issue.cjs`（写さない）。手順書は `INCIDENT-RESPONSE.md` §10。
- **リポジトリ設定**: Dependabot alerts・Dependabot security updates・Private vulnerability reporting を API で有効化し、読み直して確認。
  `SECURITY.md`・`SECURITY-ARCHITECTURE.md` §9/§10 の「無効」の記述を現状へ。
- **セキュリティページの頻度は cron から読む**（`scripts/org-pages.mjs` `cronCadence`）。日次でも週次でもない cron なら頻度を述べない。
- **CodeQL 7 件**:
  - `scripts/serve.mjs` 未検証のリダイレクト（medium）——**本物**。#R801 は先頭の `/` を畳んだが、`/\data` は残り、ブラウザは
    `/\host` を `//host` と読む。Location を検査済みの区画から組み直す。
  - `scripts/elections/hk.mjs` 二重デコード（high）——**本物**（データの正確さ）。`&amp;lt;` が `<` になっていた。1 回で解く。
    同じ行の「不完全な複数文字の除去」（high）は同じ式への指摘で、出力は文字データ。
  - `scripts/icon-glyphs.mjs` `</script >` に当たらない正規表現（high）——開発用の走査器。閉じタグの属性・空白を許す。
  - `tests/data-outside-git-checks.test.mjs` `.` だけのエスケープ（high）——試験の中。全メタ文字をエスケープ。
  - `scripts/companies/manifest.mjs` `']'.replace(/^/, '')`（medium）——何もしない置換。形式上の削除。
  - `supabase/functions/news-ingest` stack-trace（medium）——**誤検出**。返すのは `error.message` だけで、呼び出し元は秘密で認証された
    cron。merge 後に理由を付けて dismiss する（#R801 と同じ判断）。

## 2. 残したもの・しなかったこと

- 本番の不審アクセス検知（Edge Function のログからの 401/403/429/5xx の急増）は今回入れていない。ログ API の保持は 1 日で、
  閾値の根拠（`no-ad-hoc-hardcoding.md` §4）になる観測がまだ無い。
- 定期の包括監査（予約したエージェントの実行）は料金が発生するので、利用者の判断に回した。

## 3. 検査

`tests/security-watch-checks.test.mjs`（4 件）: 日次の cron と watch job の形・ページの頻度が cron と一致・`/\data` 等 5 通りの
リダイレクトが自ホストに留まる・香港の読み手が 1 回で解く。段 1: `check:static`・`check:docs`・`check:i18n`。
