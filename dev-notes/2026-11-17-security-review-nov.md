---
title: セキュリティ点検（11 月）——クラスのコードを探る 3 つの扉をサーバ専用に・保留をアカウント単位に・AI 台帳の失敗を成功と言わない・同じ turn の返金競合・DNS 検査の失敗を「無い」と読まない・退会の本文上限・漏洩パスワード保護を有効化
date: 2026-11-17
newsen: Passwords found in known data breaches are now refused at sign-up and password change. Class links and Community maps now go through IntMap's server, which limits how fast one network can try class codes; students still need no account.
newsjp: 既知の漏洩データに含まれるパスワードは、登録時と変更時に受け付けなくなりました。クラスのリンクとみんなの地図は IntMap のサーバを通るようになり、1 つのネットワークからクラスのコードを試せる速さに上限が付きました。生徒のアカウントは引き続き不要です。
---

〈依頼〉セキュリティを総合的に点検。最新のセキュリティ情報も踏まえて。途中で独立監査（GPT）の追加所見 N1〜N4・既知の K1/K2 も統合。

## 0. 測った（2026-11-17）

| 何 | 結果 |
|---|---|
| 前回の総点検（#1130）以降の差分 576 ファイル | 新しい表 7 つは全部 RLS・明示 GRANT。DEFINER は全部 `search_path` 固定。新しい HTML sink は全部 escape 済み |
| 最新の公開情報（10〜11 月） | GitHub の `pull_request_target` 既定ブロック（12-02）——不使用。Supabase の新表の自動公開停止（10-30）——新 migration は明示 GRANT 済み。Supabase CLI v3 の確認プロンプト——CI は 2.106.0 に固定。DOMPurify・maplibre・pdfjs・vite の勧告——全部修正版。10 月の npm 汚染パッケージ——依存に無し |
| `npm audit`（runtime / 全部） | 0 / 0 |
| `output-taint --check`・`check:static`・`test:security` | 一致・緑・31/31 |
| 本番 advisors | 新規は community_map_* 5 関数の search_path 可変（INVOKER・クライアント不可、意図どおり）と `auth_leaked_password_protection` |
| 本番 Auth 設定 | `password_hibp_enabled: false`、`password_required_characters` が空（config.toml は lower_upper_letters_digits） |
| CodeQL open | 5 件（high）。どれも到達可能な悪用ではない |

## 1. 直したもの

| 所見 | 何が起きていたか | 直し方 |
|---|---|---|
| クラスのコードを探れる（N1 を含む） | `class_set_open`・`class_set_submit`（`not_found` と `invalid_name` の差、セット単位の bucket より前）・`community_maps` を anon が PostgREST から無制限に呼べた | 3 本とも `public, anon, authenticated` から revoke し service_role のみ。新 Edge Function `community-class` が呼び出し元ごとの token（HMAC・失敗時は閉じる）をコード照会の前に取る。生徒はログイン不要のまま。学校の共有アドレスは 300 回／10 分（見積もりと失効条件は `shape.js`）。ブラウザは `js/community-class-door.js` だけを通り、直の RPC への fallback は無い |
| 保留の回避 | 保留がコレクション名で一致していたので、改名か「全部」の掲載で戻せた（「全部」は掲載済みなら保留後も載ったまま） | `community_map_held` をアカウント単位に（利用者決定）。目録・系譜・掲載の全経路が同じ述語 |
| 作者名の偽装 | カードの作者名に双方向制御・不可視文字が通った | `list_community_map` が `display_name(…, 40)` を通す（生徒名と同じ 1 規則） |
| AI 台帳が失敗を成功と言う（N2） | `refundTurn`/`settleTurn` が解決済みの `{ error }` を見ず true、settle の SQL false も true | 状態を返す（refunded/held/answered/not_found/error・settled/not_found/error）。失敗は分類コードだけをログ。再試行しない |
| 同じ turn の返金競合（K1） | 最初の試行の失敗が、まだ走っている続きの試行より先に turn を消して返金できた | `ai_turns.inflight`・`attempt_gen`。最後の試行が答え無しで閉じたときだけ返金、遅れた close は別世代に効かない。provider 呼び出し中に行ロックは持たない |
| DNS 検査（N3） | AAAA の失敗（SERVFAIL・timeout）を「AAAA 無し」と読んで通した。期限なし | `NotFound` だけが不在。A/AAAA 並行、1 リクエストの時間予算（`ARTICLE_RULE.timeoutMs`）を DNS・各リダイレクト・取得・本文で共有。予算切れは 503 `upstream_timeout` |
| 退会の本文（N4） | 本文を上限なしで `req.json()` | `delete-account/body.js`：実バイト 1 KiB・5 s・object のみ。拒否は削除の前 |
| `ai-proxy` の Bearer 正規表現 | `/^Bearers+/` は何にも一致しなかった | `/^Bearer\s+/` |
| CodeQL 5 件 | 試験の不完全なエスケープ 2・ledger の script 抽出・CSV の見出し・試験の合成秘密 | 共有 `escapeRegExp`、`scripts/csp.mjs` の `inlineScripts` を共有（旧式はコメント内の `<script>` から本物まで飲み込んでいた）、CSV は `js/csv-cell.js` の `csvText`（数式注入）、合成秘密は理由付き dismiss |
| 漏洩パスワード保護 | 本番で OFF | Management API で ON、読み直して true（Pro プランに含まれる＝追加料金なし） |

## 2. 形式上の削除

- `js/quest-class.js` の `csvText` → `js/csv-cell.js`（国の比較表も同じ 1 規則を使う）。
- `scripts/device-storage-ledger.mjs` の独自の script 正規表現 → `scripts/csp.mjs` `inlineScripts`。
- `community_maps` を GET で呼ぶ経路 → `community-class` が同じ目録を返す（keyset のまま）。

## 3. 残したもの

- DNS rebinding（確認したアドレスと接続のアドレスが違いうる）は塞いでいない——接続先の固定か egress 制御が要る。
- 試行が isolate ごと死ぬと turn は閉じない（返金されず TTL まで残る＝二重返金ではなく 1 回分を返さない方向）。
- `password_required_characters` の本番と config.toml の不一致は運用者の判断に残した（変えると今使えているパスワードが拒まれる）。
- `SECURITY-ARCHITECTURE.md` §8 の 14/15/16/20/22 は優先順位を付けた（§8 item 25）。今回は実装していない。
- `can_approve_pull_request_reviews = true`（必須レビュー無しなので現状は効かない）、usage-count の速度次元を 1 アドレスで埋められる件（公開値は git で照合されるので欠落だけ）。
- 性能: 通常の地図・起動には変更なし（変更はサーバ側と操作時だけ）。目録とクラスは Edge を 1 段通るぶん遅くなりうる——本番で測る。

## 4. 検査

- `tests/security-review-nov-checks.test.mjs`（6）・`-dns-`（9）・`-delete-body-`（10）、pgTAP `48_security_review_nov_test.sql`（カタログで全 overload の EXECUTE、anon/authenticated の実呼び出し拒否、保留の改名・「全部」、K1 の競合・二重返金・キー再利用）。
- 既存の台帳・community・class の試験を新しい形へ（`ai-usage-ledger-sign` ①③・`backend-edge-hardening` R801 ③・`ai-one-ledger`・`wave4-community`）。
- pgTAP 38/39/47 は 3 つの扉を service_role（Edge Function と同じ呼び方）で呼ぶ。38 は「anon が目録を読める」を「読めない」へ、40 字超の作者名は表の CHECK より先に `display_name` が 22023 で拒む。
- `tests/fixtures/atlas-core-split-before.json`：差分は**ログ行だけ**（49 応答）。試験の台帳の stub が状態を返さないので `ai-proxy ledger refund_failed` / `settle_error` が記録されるようになった——答え・ヘッダ・外への要求は 1 件も変わっていない（49 件を項目ごとに比べて確認）。撮影スクリプトは分割前の単一 `index.ts` しか撮れないので、その差分だけを fixture に当てた。
- ⚠ 実装の途中で 1 度誤った：ブラウザの扉を `supabase.functions.invoke` で書いたが、IntMap は SDK の Functions client を束ねていない（`src/supabase-unbundled-stub.js`、`deps-runtime-majors` ④が CI で捕まえた）。`js/feedback.js` と同じ `fetch` に直した。
