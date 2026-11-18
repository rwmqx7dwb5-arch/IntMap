---
title: 管理者 MFA の migration が本番で 7 件のポリシーを見つけて停止していた——本番の手書きポリシーの形（auth.uid() 裸・= true・IN）を block 3 が知らなかった
date: 2026-11-19
---

〈依頼〉 PR #1227 のあとも Supabase deploy が別のエラーで赤い。管理者 MFA の migration（`20261118130000_admin_needs_mfa_session.sql`）が 7 件のポリシーを検出して止まり、22 個の Edge Function が配備されていない。

## 0. 測った
- run 44380412457: block 4（番人）が `ERROR: admin-origin: these policies still decide admin rights without public.is_admin()` で停止。`db push` は 1 つの migration を 1 トランザクションで流すので、block 1〜3 の効果も残らず、本番は何も変わっていない（サイトは稼働したまま）。
- 本番の `pg_policies` を読み取り専用で引いた。7 件は 3 つの形で、block 3 の正規表現はどれも知らなかった。リポジトリの migration にはこの 7 件の名前も形も無い（本番で手書きされたもの）ので、`supabase/tests/50` では原理的に見えなかった:
  - `(auth.uid() IN ( SELECT profiles.id FROM profiles WHERE (profiles.is_admin = true)))` — `Allow admins to delete any post|comment`
  - `(EXISTS ( … profiles p WHERE ((p.id = auth.uid()) AND (p.is_admin = true))))` — `posts|comments admin delete`・`reports admin read`
  - `(EXISTS ( … WHERE ((p.id = auth.uid()) AND p.is_admin)))` — `feedback_select_admin|feedback_delete_admin`（`auth.uid()` が `( SELECT auth.uid() AS uid)` で包まれていない）

## 1. 直した
- block 3 のパターンを広げた: `auth.uid()` は裸も sub-select も、フラグは裸も `= true` も、さらに `auth.uid() IN (select profiles.id … )`。番人（block 4）は変えていない——番人が正しく止めたので、緩めない。
- 本番に対して、新しいパターンを **SELECT だけ**で走らせ、`is_admin` を含む全 35 ポリシーを確かめた: 7 件は `public.is_admin()` になり、既に `is_admin()` を呼ぶものは触られず、`(auth.uid() = user_id) OR …` のような OR 付きも括弧が対になったまま書き換わる。
- `tests/fix-admin-mfa-leftover-policies-checks.test.mjs`: migration 自身の正規表現をファイルから取り出し、本番の deparse した文字列そのもの（上の 7 件）に当てる。
- この migration は本番に未適用（記録済みでない）なので、新しい migration を足さず同じファイルを直した。

## 2. 引き継ぎ
- 失効条件: migration が本番に適用されたら、検査の文字列は履歴になる。
- 限界: 検査は ARE を JS の RegExp に写して走らせている。同じ構文の範囲に収めているが、PostgreSQL での実際の置換は上の SELECT で確認した。`supabase db reset` / `supabase test db` はこの環境の Docker 有無に依る。
