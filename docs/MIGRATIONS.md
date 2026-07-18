# Database migrations

Every database change is a migration file in [`supabase/migrations/`](../supabase/migrations),
reviewed in a PR, tested locally + in CI, and applied to production **manually** (never
auto-applied on merge). This page is the procedure.

## Prerequisites (one time)

- **Supabase CLI** (`supabase --version`) and **Docker Desktop running** (the local stack
  needs it). Nothing else touches production without the secrets below.
- Local stack: `supabase start` (first run pulls images). Stop with `supabase stop`.

## The everyday flow

```
work branch → migration → local rebuild → RLS/permission tests → PR → CI green
           → review the change → back up prod → manual apply → prod smoke test
```

`main` merges do **not** apply migrations to production. Applying is a separate, deliberate step.

### 1. Create a migration

```bash
supabase migration new short_description
# → supabase/migrations/<timestamp>_short_description.sql   (edit it)
```

Write forward SQL. Prefer additive, idempotent statements (`create table if not exists`,
`create or replace function`, `drop policy if exists` then `create policy`). Keep destructive
changes out unless intended (see below).

### 2. Rebuild locally from scratch and test

```bash
supabase db reset          # drops local DB, re-applies ALL migrations + seed.sql
supabase test db           # runs the pgTAP RLS/permission tests (see RLS-TESTING.md)
```

`db reset` must succeed from an empty database, and every test must pass. If you added a
table, add its RLS tests in the same PR — see [`RLS-TESTING.md`](RLS-TESTING.md#adding-tests-for-a-new-table).

### 3. Check for drift (read-only)

```bash
supabase db diff --schema public      # after a reset, this must print NOTHING
```

Empty output = the migrations fully describe the schema. Non-empty = you changed the DB
without a migration; capture it: `supabase db diff -f my_change` writes the missing migration.

### 4. PR

Open a PR from your work branch. **CI → "Database checks"** rebuilds the DB, runs the drift
gate, the RLS/permission tests, and a backup→restore roundtrip — all on a throwaway local
database, no secrets, no production access. It must be green.

### 5. Apply to production (manual, gated)

Only after review + a fresh backup:

```bash
# a) BACK UP FIRST (see BACKUP-RESTORE.md) — managed backup or:
#    Dashboard → Database → Backups → (verify a recent one / take one)
# b) See exactly what will run:
supabase link --project-ref vpekfwdpurzejrrmacac      # prompts for the DB password (a SECRET)
supabase db diff --linked --schema public             # read-only: prod vs your migrations
# c) Apply:
supabase db push                                       # applies pending migrations to prod
# d) Prod smoke test: load the site, log in, post a community item, submit feedback.
```

`supabase link` / `db push` need the **database password** (Dashboard → Settings → Database).
It is a secret — type it into the CLI prompt; never paste it into chat, a file, or a commit.

## Making the baseline authoritative

The baseline was reconstructed from code, so reconcile it with production **once**, read-only:

```bash
supabase link --project-ref vpekfwdpurzejrrmacac
supabase db diff --linked --schema public > prod-vs-baseline.sql   # READ-ONLY
```

- **Empty** → the baseline matches prod. Mark it as already-applied so `db push` won't try to
  run it against the existing schema:
  ```bash
  supabase migration repair --status applied 20260718090000
  ```
- **Non-empty** → it lists where prod differs (often the three hardening items in the baseline
  header — see below). Review each; apply the ones you want with the gated flow above, and/or
  fold real prod-only objects into the baseline. Do **not** blindly run the diff against prod.

Delete `prod-vs-baseline.sql` afterward — it can contain schema details you don't want committed.

## Security-hardening items in the baseline

The baseline enforces three properties that production may not have yet (they'll show up in the
diff): (1) `profiles` email/is_admin not world-readable, (2) no self-escalation of
`is_admin/is_pro/plan`, (3) `ai_usage` writable only via service_role RPCs. Applying them is
**non-destructive** (adds a view, tightens a policy, narrows grants) but changes behavior, so
apply them deliberately with the gated flow and a prod smoke test. See
[`DATABASE-INCIDENT.md`](DATABASE-INCIDENT.md) → "RLS / 権限ミス".

## Destructive changes — extra care

A migration is **destructive** if it contains any of: `DROP TABLE`, `DROP COLUMN`,
`ALTER ... TYPE`, adding `NOT NULL` / `UNIQUE` to a populated column, bulk `UPDATE`/`DELETE`,
`DISABLE ROW LEVEL SECURITY`, `DROP POLICY` (without an immediate re-create), replacing a
function, or `DROP INDEX`.

For any of these:
1. **Take a fresh backup** and verify it restores (`BACKUP-RESTORE.md`).
2. State the blast radius in the PR (what data/permission is affected, how to detect breakage).
3. Provide the recovery path (one of the three below).

## Rollback strategy

Not every migration needs a reverse migration. Classify:
- **Safely reversible** → write a follow-up forward migration that undoes it (e.g. drop a
  column you added). Preferred.
- **Forward-fix** → the bug is a wrong policy/grant/function; ship a new migration that
  corrects it. Most cases.
- **Restore required** → data was lost/corrupted. Restore from backup into an isolated DB,
  extract the good rows, and re-import. See [`BACKUP-RESTORE.md`](BACKUP-RESTORE.md) and
  [`DATABASE-INCIDENT.md`](DATABASE-INCIDENT.md).

## When a production `db push` fails midway

1. Read the error — Postgres names the failing statement.
2. `supabase migration list --linked` shows which migrations are marked applied.
3. If the DB is in a bad state, restore from the backup you took in step (a). Do not improvise
   destructive fixes on prod.
4. Fix the migration on a branch, re-test locally (`db reset` + `test db`), re-PR.
