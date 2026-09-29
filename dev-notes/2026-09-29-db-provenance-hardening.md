---
title: コミュニティ投稿の著者名と投稿時刻を DB が書く・公開バケットの一覧用ポリシーを外す——監査 5 項目のうち 2 つを実装、1 つは既に閉じていた、1 つは前提が実装と違った
date: 2026-09-29
---

〈依頼〉DB 監査の 5 項目: ① community の INSERT が表全体への付与で著者名・投稿時刻を偽れる
② 投稿画像と avatar_url が任意の https を許す（閲覧者の IP が第三者へ） ③ 公開バケットに SELECT
ポリシーがあり匿名で一覧できる ④ news_event_* の SECURITY DEFINER が `search_path = public`
⑤ これらの構造検査。

## 0. 測った

- ① `20260722100000_security_r155.sql` の `grant insert, update, delete on public.community_posts to
  authenticated`。#R801 が UPDATE だけを列単位にした。INSERT のポリシーは `user_id = auth.uid()` だけで、
  `author_name`・`created_at` は何とも照合されていなかった。クライアント（`js/community-board.js`
  `cmAddPost`、`js/community.js` `cmComment`）は `author_name: HOST.user.name` を送る。その名前は
  `profiles.display_name`、無ければ `User-` ＋ id の英数字先頭 5 字（`js/auth-ui.js` `refreshCurrentUser`）。
- ② 画像は Storage に上げていない。投稿画像は `compressImage` の `data:image/jpeg`、アバターも data URL。
  「自前 Storage の公開 URL だけを受ける」は、クライアントに無い設計への制約になる。
- ③ 3 つのバケットを読むのは Edge Function 3 本だけで、全部 `/storage/v1/object/public/…`
  （RLS を見ない）。書込は service key（RLS を迂回）。`.list(`・`/object/list`・storage-js は
  `js/` にも `supabase/functions/` にも無い。⇒ SELECT ポリシーが足していたのは一覧だけ。
- ④ **監査の読み違い。** `20260918090000` §4 が DO ブロックの `ALTER FUNCTION` で 8 本を `''`、
  埋め込み 3 本を `extensions` に固定済み。本体は全部 schema 修飾されている。
  `set search_path = public` が見えるのは作成時の migration だけで、今の値ではない。
  `09_r801_security_audit_test.sql` がすでに `pg_proc` で測っている。

## 1. 直した（`supabase/migrations/20260929100000_db_provenance_hardening.sql`）

- `tg_community_stamp_provenance`（BEFORE INSERT・SECURITY DEFINER・`search_path=''`）を 2 表に付けた。
  service_role と JWT の無いセッション以外は、`author_name` を `profiles_public.display_name` から
  （無ければクライアントと同じ `User-` 規則。長さは #R155 の上限 120 で切る）、`created_at` を `now()` から
  書き、`edited_at` を null にする。リクエストが言った値は読まない。
- INSERT を列単位の grant にした。posts は `user_id, author_name, title, body, img, lat, lng, category`、
  comments は `post_id, user_id, author_name, body, parent_id`（クライアントが送る列そのもの）。
  `author_name` を残したのは出荷済みのクライアントが送るから。値はトリガが決める。
- 3 つのバケットの SELECT ポリシーを**名前で** drop した。ループで「公開バケットの SELECT ポリシー」を
  全部消さないのは、このプロジェクトが他のアプリと共有されているから（mgmt / passkeys）。
  ⚠ `DROP POLICY` は `docs/MIGRATIONS.md` の破壊的変更に入る。

## 2. 選ばなかったもの

- ② の実装。代わりに `docs/SECURITY-ARCHITECTURE.md` §8 の 13 に残存リスクとして書いた。塞ぐなら
  `img` / `avatar_url` に「null か `data:image/(png|jpeg|webp|gif);base64,`」の CHECK（`NOT VALID`）。
  DB が受け付けるものを変えることになるので、決めてもらう。
- ④ を `CREATE OR REPLACE` で本体ごと写し直すこと。既に正しい状態を 2 か所目に持つことになる。

## 3. 検査

- `supabase/tests/12_db_provenance_hardening_test.sql`（CI の Database checks で走る。Docker が
  止まっているので、このマシンでは走らせていない）:
  ① search_path の各要素が `''`・末尾の `pg_temp`・または `public` でなく anon/authenticated が CREATE
  できない schema であること（`has_schema_privilege`）② 公開バケットに一覧用の SELECT ポリシーが無いこと
  ③ 偽った名前・未来の時刻が、本物の grant と本番相当の包括 grant の両方で上書きされること
  ④ INSERT できる列がクライアントの送る列ちょうどであること。
- `tests/db-provenance-hardening-checks.test.mjs`: 全 migration を順に**再生**して、その最終状態で
  ①〜④を測る。grant/revoke・関数の作成/drop/alter・トリガ・バケット・ポリシーを文として解釈し、
  #R801 の DO ブロック内の `ALTER FUNCTION`（`foreach … in array` ＋ `execute format`）も解釈する。
  INSERT に触れる動的 GRANT/REVOKE が現れたら、見えないまま通さずに落ちる。クライアントの送る列は
  2 つの insert 経路の行リテラルから読む。変異 7 種（policy を残す・表全体の grant・列を落とす・
  `coalesce(new.author_name, …)`・AFTER トリガ・`search_path = public, pg_temp`・
  `coalesce(new.created_at, …)`）が全部赤になることを確かめた。
- ⚠ `supabase/tests/05_r155_security_test.sql` の `has_table_privilege('authenticated','public.community_posts','insert')`
  は、列単位 grant では false を返す（`has_table_privilege` は列権限を数えない）。
  `has_any_column_privilege` に替える必要がある（この作業の担当範囲外だったので、統合時に直す）。
