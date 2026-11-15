---
title: セキュリティ総点検——投票者とメールの前半が誰でも読めた・退会に再ログインを要求・旧 API キーからの移行・CI の書き込みトークンを第三者コードから離す・バックアップを公開鍵暗号に
date: 2026-10-23
newsen: Who voted on a community post is now private (everyone still sees the total), deleting an account asks you to sign in again if your last sign-in is older than ten minutes, and public profile names are no longer made from e-mail addresses.
newsjp: コミュニティ投稿に誰が投票したかは本人以外に見えなくなりました（合計は従来どおり表示）。退会は、最後のログインから10分を超えていると再ログインを求めます。公開プロフィールの名前をメールアドレスから作ることもやめました。
---

〈依頼〉IntMap のセキュリティを総点検。最新の脆弱性情報や対策も参考に。

## 0. 測った

- 5 領域を並列に読んだ: Edge Functions 21 本と `_shared/`、migration 52 本の最終状態、フロントエンド（sink 734 件・CSP・postMessage・SW）、CI 16 本と供給網（`npm audit`・lockfile・GitHub 設定）、2025-01〜2026-10 の公開情報（各依存の GHSA、Supabase の新 API キー、npm の Shai-Hulud 系・Actions のタグ書き換え、OWASP LLM / Agentic Top 10）。
- 本番を読んだ（書き込みなし）: `supabase db advisors --linked`（警告 33・情報 12。大半は意図して公開している RPC）、grant・cron・`cron.job_run_details`・`relay_rate_buckets`・本番の関数定義。
- Critical/High に当たる欠陥は無かった（認証・IDOR・SSRF・CORS・pwn request・スクリプト注入・タグ pin・秘密の混入はどれも 0）。直したのは Medium 以下と、本番だけに残っていた古い定義。

## 1. 直したもの（構造で）

| 所見 | 何が起きていたか | 直し方 |
|---|---|---|
| 投票者が公開 | anon キーだけで `community_votes(user_id)` 全件が読めた。利用者に見える文は「他の人には合計数だけ」 | 合計は `vote_count` 列（トリガ）、票の行は本人だけ。anon の SELECT を revoke。本番の policy 名が migration と違うので pg_policies から発見して drop |
| 公開名がメールの前半 | 本番の `handle_new_user` が baseline と違い、表示名 = メールの @ の前、最初の登録者を admin に。56 件中 51 件が `profiles_public` から読めた | baseline の定義に置換。既存 51 件はプロバイダ名（49）か null（2）に（利用者承認） |
| client-errors の ReDoS | メール・引用符・topFrame・Safari 規則が 64 KiB で最大 3.7 s。レート制限より前で走る | 連続を 1 回だけ消費する式＋コールバック、逆向き走査。最悪 8.8 ms。旧式と 20,000 件ずつ出力一致 |
| 平文 IP の無期限保持 | `relay_rate_buckets` のキーが平文アドレス、掃除は cron に未登録。IPv6 は /64 内で回せば新バケット | `callerKey` 1 本（HMAC・IPv6 は /64）。`hashedCallerKey` を統合して削除。掃除を毎時 cron に |
| 退会が即時 | トークンと確認文字列だけで削除 | amr の最新 timestamp が 600 秒以内でなければ `reauth_required`（利用者承認）。削除前に管理キーで admin API が通ることを確かめる |
| 旧 API キー依存 | 21 関数が `SUPABASE_SERVICE_ROLE_KEY` 等を各自で読む。旧キーは 2026 年末までに廃止 | `_shared/supabase-keys.js` が唯一の読み手（新キー優先）。Edge の supabase-js 2.45.4 → 2.117.3 |
| ニュースのツールチップ XSS | 十字線・ダッシュボードのピンが RSS の見出し等を生で HTML に | 共通の組み立て関数へ。output-taint が「引数を sink に書く関数」を AST から発見して呼び出しも sink に（新たに見えた国名の生補間など 2 か所も修正） |
| 取り込んだノートの再実行 | ファイルの `replay` と args を信じ、外部内容の印なしで実行（`places.publish` 等が確認なし） | 取り込み・ブリーフィングの手順に `from:'imported'`。再実行時に登録表で判定し直し、印付きで確認機構へ |
| CI の書き込みトークン | bot job が素の `npm ci`、checkout がトークンを `.git/config` に残す | 全 `npm ci --ignore-scripts`、全 checkout `persist-credentials:false`、push は step env の token。static-checks の error 規則（composite action も母集合に） |
| Pages 権限 | deploy / rollback の build が `pages`/`id-token` を継承 | top-level は `contents: read`、deploy job だけ |
| DOMPurify | 3.4.16 に GHSA 3 件（既定設定の呼び出しには非到達） | 3.4.17 |
| バックアップ | auth を含む暗号化ダンプが public repo の artifact（誰でも取得可）、守りはパスフレーズだけ | 公開鍵暗号（`scripts/backup-public-key.asc`）。復号鍵はリポジトリと GitHub の外 |
| 保存期限 | 未ログインの意見・不具合報告と cron 実行履歴（29,380 行・旧 secret の平文を含む）に期限なし | 730 日・14 日の purge cron（利用者承認）。プライバシーポリシー §6 |
| 長さ上限 | img・category・avatar・表示名・bio が無上限 | NOT VALID の CHECK。上限は実測（1100² ノイズの JPEG q1.0 で 4,744,987 字など）から |
| 本番だけの関数 | `set_updated_at` の search_path 可変、`rls_auto_enable` を anon が EXECUTE 可 | 存在するときだけ固定・revoke |
| admin の CSP | connect-src が `https://*.supabase.co`（任意のプロジェクトへ持ち出せる） | このプロジェクトのホストに固定 |
| その他 | radiation-feed の from/to が未エンコード、relay 3 本が port/userinfo を通す、問い合わせメールに `?bcc=` | 入口で正規化、`allowedUpstream()` 1 本、厳格化＋mailto のエンコード |

## 2. 本番で行った運用操作

- `NEWS_INGEST_SECRET` / `REFRESH_SECRET` を回転（関数の secret と vault の両方）。08:40 UTC の cron で refresh-news 200 `ok:true`、news-ingest `last_ok_at` 更新を確認。
- GitHub の Actions 既定トークン権限を write → read（全 workflow が個別に宣言済み）。

## 3. 形式上の削除

- `hashedCallerKey` と client-errors / usage-count の再輸出ラッパー → `callerKey` 1 本が引き継ぐ。
- 各関数の `SUPABASE_SERVICE_ROLE_KEY` / `SB_SECRET_KEY` の個別の読み → `_shared/supabase-keys.js`。
- `community_votes` の Realtime 購読 → posts / comments の `vote_count` UPDATE が同じ再読込を起こす。
- バックアップの `BACKUP_GPG_PASSPHRASE` → 公開鍵。

## 4. 測れなかった・残したもの

- pgTAP 31 と migration はローカルに Postgres が無く、CI が最初の実行。
- 退会の再認証は本番トークンの amr を未実測（仕様と Auth のソースで確認）。管理 API が新 secret key で通るかは deploy 後の本番で確かめる（通らなければ退会は何も消さずに失敗する順序にした）。
- 範囲外で見つけた既存バグ: `js/news-ui.js` の `const GE` が外側の `GE` を隠し、ダッシュボードのピンの hover/click と十字線のタップが一度も結び付いていない（別作業として提案）。news-ingest の embed 段は直近 48 時間ずっと失敗（回転前から）。
- 受容した残存リスクは `docs/SECURITY-ARCHITECTURE.md` §8、運用者の手作業（Leaked password protection の有効化など）は §9。

## 5. 検査

- `tests/security-audit-checks.test.mjs`（13）・`-ci-`（8）・`-db-`（9）・`-frontend-`（7）、pgTAP `31_security_audit_test.sql`。
- 段 1: check:static・check:docs・check:i18n・check:catalog・check:capabilities・check:atlasrepeat・check:surface・check:types、`output-taint --check`（383）。
