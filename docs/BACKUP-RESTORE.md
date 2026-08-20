# Backup & restore

Goal: if the database is ever lost or corrupted, we can get it back. Two layers, in priority
order — **managed backups first**, a **self-hosted encrypted dump** as a free fallback.

## Targets & objectives

- **Back up:** everything in `public` (all user data, functions, triggers, policies, grants),
  plus `auth` (users) and `storage` (metadata) for completeness.
- **RPO** (max data loss): ~24h with the daily job; near-zero with managed PITR.
- **RTO** (time to start recovery): a few hours — restore into an isolated DB, verify, then
  cut over.
- **Retention target:** last 7 daily backups; ideally 4 weekly. GitHub artifacts do 7-day
  retention natively; weekly/4-generation is better served by managed backups or external
  object storage (see limits).

## Layer 1 — Supabase managed backups (primary)

Check what your plan gives you: **Dashboard → Project → Settings → Add ons / Database →
Backups**.

- **Free plan:** no automated backups. → Layer 2 (below) is your safety net; consider
  upgrading if the data matters.
- **Pro plan (~$25/mo):** daily backups + **Point-in-Time Recovery (PITR)**. This is the best
  RPO/RTO with zero secrets in GitHub. If you can, enable PITR here.

Managed backups restore **auth and storage faithfully** — the parts a plain `pg_dump` can't
fully reproduce. Prefer them for a real recovery.

## Layer 2 — self-hosted encrypted `pg_dump` (free fallback)

[`.github/workflows/db-backup.yml`](../.github/workflows/db-backup.yml) runs
[`scripts/backup-db.sh`](../scripts/backup-db.sh) daily: `pg_dump` → **GPG AES-256** →
SHA-256 checksum → metadata → uploaded as a **7-day, encrypted** artifact. It is **DORMANT**
(each run skips) until you add two secrets, so it never fails an empty repo.

### Activate it (your manual steps)

1. **Get the DB connection string.** Dashboard → **Settings → Database → Connection string →
   URI**, choose the **Session pooler**. It looks like
   `postgresql://postgres.<ref>:PASSWORD@aws-...pooler.supabase.com:5432/postgres`.
   The `PASSWORD` in it makes the **whole string a secret**.
2. **Add it as a GitHub secret.** Repo → **Settings → Secrets and variables → Actions → New
   repository secret** → name `SUPABASE_DB_URL`, value = the URI. (You type it here yourself —
   do not paste it into chat or a file.)
3. **Generate an encryption passphrase** (e.g. `openssl rand -base64 32`) and store it in your
   password manager. Add a second secret `BACKUP_GPG_PASSPHRASE` = that passphrase.
4. Done. Confirm: **Actions → "DB backup (encrypted)" → Run workflow**. A green run with a
   `db-backup-*` artifact means it's live. A failure opens a `status:backup-failing` issue.

### Encryption & integrity

- Cipher: GPG symmetric **AES-256**. The dump is encrypted **before** it leaves the runner.
- The **encryption key is the passphrase**, kept only in GitHub Secrets / your password
  manager — **never** stored next to the ciphertext. Lose it → backups are unrecoverable.
  Leak it → encryption is defeated. Treat it like the DB password.
- Each backup ships a `.sha256` checksum and a `.meta.json` (timestamp, schemas, sizes,
  `pg_dump` version, migration head) — no data, no secrets.

### What `pg_dump` does NOT fully capture

Auth provider config/secrets, redirect URLs, email templates, project API keys, the `pg_cron`
schedule, and (server-side) Storage bucket configuration. For a full auth/storage recovery,
use a **managed** backup. Record dashboard-only settings in [`MIGRATIONS.md`](MIGRATIONS.md).

## Verify a backup restores (drill) — §10

**Never restore into production.** Restore into a throwaway local database and check it.
[`scripts/restore-test.sh`](../scripts/restore-test.sh) refuses any non-local target unless you
set `ALLOW_NONLOCAL=1`.

```bash
supabase start                                   # a local, isolated Postgres
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
  'drop database if exists intmap_restore_test; create database intmap_restore_test;'
GPG_PASSPHRASE='<your passphrase>' \
  ./scripts/restore-test.sh path/to/intmap-<UTC>.dump.gpg \
  "postgresql://postgres:postgres@127.0.0.1:54322/intmap_restore_test"
```

It verifies the checksum, decrypts, restores, and asserts the key tables have rows, **RLS is
still enabled**, and policies/functions came back — printing `RESULT: PASS` or failing
non-zero. Record how long it took (that's your practical RTO). CI runs this same roundtrip on
synthetic data on every DB PR, so the pipeline itself is always known-good.

## Recovering production (real incident)

See [`INCIDENT-RESPONSE.md`](INCIDENT-RESPONSE.md#database-incidents) for the full runbook. In short:
1. **Stop the bleeding** (identify and stop whatever is deleting/corrupting).
2. **Restore into an isolated DB** (never straight onto prod) and verify.
3. If PITR is available, prefer restoring prod to a timestamp **just before** the incident.
4. Otherwise, extract the good rows from the isolated restore and re-import the minimum needed.
5. Prod smoke test; then document what happened.

## Never do this

- ❌ Commit a dump, an encrypted dump, or the passphrase to the repo (`.gitignore` blocks
  `*.dump*`, `/backups/`; `git` history is forever if you force it).
- ❌ Store the passphrase in the same place as the encrypted dump.
- ❌ Restore a backup directly onto production to "test" it.
- ❌ Put `SUPABASE_DB_URL` or `service_role` anywhere except GitHub Secrets / your password
  manager. Never in chat, code, or CI logs.
