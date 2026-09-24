# Database migrations

Every database change is a migration file in [`supabase/migrations/`](../supabase/migrations),
reviewed in a PR, tested locally + in CI, and applied to production **by
[`.github/workflows/supabase-deploy.yml`](../.github/workflows/supabase-deploy.yml) when the PR
merges** — `supabase db push`, but only when its dry run would apply exactly the migrations that
push added (see [Why `db push` is guarded](#why-db-push-is-guarded--the-history-is-not-reconciled)).
This page is the procedure.

## Prerequisites (one time)

- **Supabase CLI** (`supabase --version`) and **Docker Desktop running** (the local stack
  needs it). Nothing else touches production without the secrets below.
- Local stack: `supabase start` (first run pulls images). Stop with `supabase stop`.

## The everyday flow

```
work branch → migration → local rebuild → RLS/permission tests → PR (auto-merge) → CI green
           → merged → supabase-deploy.yml: guarded db push → changed functions → prod smoke test
```

⚠ **A merge to `main` applies the migrations that merge added.** Review and back up **before**
you open the PR with auto-merge — for a destructive migration (below), open it without `--auto`,
take the backup, then merge by hand.

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
supabase test db           # runs the pgTAP RLS/permission tests (see DATABASE.md)
```

`db reset` must succeed from an empty database, and every test must pass. If you added a
table, add its RLS tests in the same PR — see [`DATABASE.md`](DATABASE.md#adding-tests-for-a-new-table).

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

### 5. Apply to production

**Normally nothing to do: the merge applies it** (`supabase-deploy.yml`; the run log prints the
dry run and what was pushed). If that run is red it applied nothing — read its `::error::` line.

**By hand** (emergency, or while the history is being reconciled) — only after review + a fresh backup:

```bash
# a) BACK UP FIRST (see BACKUP-RESTORE.md) — managed backup or:
#    Dashboard → Database → Backups → (verify a recent one / take one)
# b) See exactly what will run:
supabase link --project-ref vpekfwdpurzejrrmacac      # prompts for the DB password (a SECRET)
supabase db diff --linked --schema public             # read-only: prod vs your migrations
# c) Apply — see "Why not db push" below:
supabase db query --file supabase/migrations/<the one file> --linked   # one atomic begin/commit
supabase migration repair --status applied <version>                   # record it as applied
# d) Prod smoke test: load the site, log in, post a community item, submit feedback.
```

`supabase link` / `db push` do **not** need the database password when a Supabase access token is
logged in (MEASURED 2026-09-25, CLI 2.106.0: the CLI mints a temporary login role). If it ever
prompts for one, type it into the prompt; never paste it into chat, a file, or a commit.

## Why `db push` is guarded — the history is not reconciled

`supabase db push` applies **every** migration the remote has not recorded, and the remote has
never recorded the baseline (`20260718090000`), because production already had that schema before
the file existed. So an unguarded `db push` would try to re-run the whole baseline against a live
database. That is why `scripts/supabase-deploy.mjs` runs `db push --dry-run` first and pushes only
when the pending set **equals** the migrations the merge added; anything else is red with nothing
applied. **By hand, apply one file at a time** — `supabase db query --file … --linked` runs it
through the Management API in a single begin/commit — then record it with
`supabase migration repair --status applied <version>`. Verify first by temporarily swapping the
file's `commit;` for `rollback;`.

MEASURED 2026-09-25 (read-only, `supabase migration list --linked` and `db push --dry-run`): the
dry run refuses outright, because production records two versions that are not in this repository
(`20260722000000` mgmt, `20260722120000` passkeys — another application's tables sharing the
project), and seven local versions are unrecorded. Until that is reconciled, the automated push is
red for every new migration and the nightly drift job is red. The reconciliation for the baseline is
this, read-only:

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
[`INCIDENT-RESPONSE.md`](INCIDENT-RESPONSE.md#database-incidents) → "RLS / 権限ミス".

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
  [`INCIDENT-RESPONSE.md`](INCIDENT-RESPONSE.md#database-incidents).

## When a production `db push` fails midway (by hand or from `supabase-deploy.yml`)

1. Read the error — Postgres names the failing statement.
2. `supabase migration list --linked` shows which migrations are marked applied.
3. If the DB is in a bad state, restore from the backup you took in step (a). Do not improvise
   destructive fixes on prod.
4. Fix the migration on a branch, re-test locally (`db reset` + `test db`), re-PR.
