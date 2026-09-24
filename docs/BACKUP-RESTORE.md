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
SHA-256 checksum → metadata → uploaded as a **7-day, encrypted** artifact.

### ⚠ Without its secrets the run is RED — not a green skip

**A run that took no backup is a failed run.** If `SUPABASE_DB_URL` or `BACKUP_GPG_PASSPHRASE` is
missing, the first step ([`scripts/ci-require-secrets.sh`](../scripts/ci-require-secrets.sh)) fails
with one `::error::` per missing name, and the `status:backup-failing` issue opens and **says which
secret is missing** (its body is rewritten by every red run and it closes itself on the next green one).

Until 2026-09 this workflow skipped and reported success instead. MEASURED 2026-09-24, run
35975392869: it printed that it was not running, the run was green — as every night had been — and
no backup had ever been taken, while [`INCIDENT-RESPONSE.md`](INCIDENT-RESPONSE.md) sent a reader in a
data-loss incident to 「the newest backup」. The rule now covers every workflow, not just this one:
`tests/backup-and-deploy-as-code-checks.test.mjs` finds every job in `.github/workflows/` that
reads a secret and **executes** its gate with the secret empty; a gate that exits 0 fails the test.

## 一度だけの登録（secret）— **ここが正本**

Everything below is typed by the repository owner into GitHub once; no agent can do it for you,
because the values are secrets. **Where:** Repo → **Settings → Secrets and variables → Actions →
New repository secret**. Type the value there yourself — never into chat, a file, or a commit.

| Secret | Used by | What it is | Where to get it |
|---|---|---|---|
| `SUPABASE_DB_URL` | `db-backup.yml` | Postgres **session-pooler** URI. The password inside makes the whole string a secret. | Supabase Dashboard → **Connect** (or Settings → Database) → Connection string → URI → **Session pooler**: `postgresql://postgres.<ref>:PASSWORD@aws-…pooler.supabase.com:5432/postgres` |
| `BACKUP_GPG_PASSPHRASE` | `db-backup.yml` | The **only** key to the backups. Lose it → they are unrecoverable. Leak it → encryption is defeated. | Generate one (`openssl rand -base64 32`), store it in your password manager **first**, then here. |
| `SUPABASE_ACCESS_TOKEN` | `supabase-deploy.yml` (deploy + nightly drift) | A Supabase personal access token. MEASURED 2026-09-25 (CLI 2.106.0): `link`, `db push`, `migration list` and `functions deploy` all ran with it alone — no database password needed. | <https://supabase.com/dashboard/account/tokens> → **Generate new token** (name it e.g. `intmap-github-actions`). |

Confirm each once it is set:

1. **Actions → "DB backup (encrypted)" → Run workflow** → green, with a `db-backup-*` artifact.
2. **Actions → "Supabase deploy" → Run workflow → mode `drift`** → the log prints the table from
   `scripts/release-state.mjs`. Green means production matches `main`; red with a table means it
   does not (that is information, not a setup error — see [`MIGRATIONS.md`](MIGRATIONS.md)).

Until they are set, each of those runs is red and an issue names the missing secret. That is the
intended state of an unconfigured repository, not a fault to silence.

### Encryption & integrity

- Cipher: GPG symmetric **AES-256**. The dump is encrypted **before** it leaves the runner.
- The **encryption key is the passphrase**, kept only in GitHub Secrets / your password
  manager — **never** stored next to the ciphertext. Lose it → backups are unrecoverable.
  Leak it → encryption is defeated. Treat it like the DB password.
- Each backup ships a `.sha256` checksum and a `.meta.json` (timestamp, schemas, sizes,
  `pg_dump` version, migration head) — no data, no secrets.

### What `pg_dump` does NOT fully capture

Auth provider config/secrets, redirect URLs, email templates, project API keys, the vault secrets
the cron jobs read, and (server-side) Storage bucket configuration. For a full auth/storage recovery,
use a **managed** backup. Record dashboard-only settings in [`MIGRATIONS.md`](MIGRATIONS.md).
(The `pg_cron` **job definitions** are no longer dashboard-only: migration
`20260925090000_cron_jobs_as_code.sql` creates them. Their secrets live in vault — `refresh_news_secret`,
`monitor_run_secret`, `news_ingest_secret` — and a job whose secret is absent posts nothing.)

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
