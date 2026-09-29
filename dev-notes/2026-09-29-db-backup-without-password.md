---
title: DB の暗号化バックアップが初めて取れた——保存した DB パスワードを使わず、アクセストークンから使い捨てのログインを作る／pg_dump の版をサーバに合わせる／使い捨てロールから postgres に切り替える
date: 2026-09-29
---

〈依頼〉多面的な監査の続き。secret の登録で、DB のパスワード入りの接続文字列を用意する手間があった。

## 0. 測った

- Supabase CLI は、アクセストークンだけで DB に入る（Management API に使い捨ての login role を頼む：
  「Initialising login role...」）。同じ仕組みをバックアップに使えば、DB のパスワードを secret に置く必要がない。
- 実際に CI で走らせると、ここまで一度も走らなかった後段の不具合が 2 つ順に出た:
  ① `pg_dump: aborting because of server version mismatch`（サーバ 17.6・ランナーのクライアント 16.15）
  ② 使い捨てロールのままでは `permission denied for schema auth`（`read_only:false` でも同じ）。
- `db-backup.yml` は secret 不在で一度も実行されたことが無かったので、①②は最初から在った。

## 1. 直したもの

1. `scripts/db-login-url.mjs`（新規）: `POST /v1/projects/{ref}/cli/login-role` と pooler 設定から、300 秒で失効する
   接続文字列を作り、マスクして `$GITHUB_ENV` に渡す。`PG_DUMP_ROLE=postgres` も渡す。
2. `scripts/backup-db.sh`: `PG_DUMP_ROLE` があれば `pg_dump --role` で切り替える（CLI と同じ）。
3. `db-backup.yml`: 必要な secret は `SUPABASE_ACCESS_TOKEN` と `BACKUP_GPG_PASSPHRASE` の 2 つに。
   `pg_dump` はサーバの版を訊いてから PGDG で同じ版を入れる（版を書かない）。
4. `docs/BACKUP-RESTORE.md`: `SUPABASE_DB_URL` は不要と記録。

## 2. 検査

`feat/db-backup-without-password` で `db-backup.yml` を実行して success（run 36504002746）。成果物
`db-backup-36504002746` 5,439,361 B（暗号化済み・チェックサム付き）。`tests/backup-and-deploy-as-code-checks` 緑。
