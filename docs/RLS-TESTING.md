# RLS & permission testing

We don't just check that "RLS is on" — we prove that the wrong person **cannot** read or write
the wrong row. The tests are pgTAP SQL in [`supabase/tests/`](../supabase/tests), run by
`supabase test db`.

## Subjects (who the tests impersonate)

| Subject | How | Represents |
|---|---|---|
| `anon` | `set local role anon` | A logged-out visitor. |
| user **A** | role `authenticated`, JWT `sub = 111…1` | A normal logged-in user. |
| user **B** | role `authenticated`, JWT `sub = 222…2` | Another user (isolation target). |
| **admin** | role `authenticated`, JWT `sub = 333…3` (is_admin) | A moderator. |
| `service_role` | `set local role service_role` | The Edge Functions (bypasses RLS). |

The synthetic users + data come from [`supabase/seed.sql`](../supabase/seed.sql).

## What is tested (files)

- **`00_structure_test.sql`** — every table exists, **RLS is enabled on all 15**, key
  PKs/FKs exist, and `profiles_public` does not leak `email`/`is_admin`.
- **`01_rls_matrix_test.sql`** — the isolation matrix (§7.3): anon can't read PII tables; A
  can't read/update/delete B's rows; A can't self-escalate `is_admin`/`plan`; A can't
  write/inflate `ai_usage`; non-admins can't read feedback/reports; author-or-admin post
  moderation; service_role bypass.
- **`02_functions_test.sql`** — the AI-quota RPC actually enforces the limit and refunds; every
  SECURITY DEFINER function is `security definer` with a pinned `search_path`; the RPC EXECUTE
  and the `profiles` column-UPDATE grants are exactly as intended.

## How the checks work (so a failure is readable)

A blocked **read** returns 0 rows (not an error); a blocked **write** is either `DENIED`
(missing grant or RLS `WITH CHECK` → SQLSTATE 42501) or `ROWS:0` (RLS `USING` filtered every
row). The matrix runs each statement **as the impersonated role** via two `SECURITY INVOKER`
helpers that stash the outcome, then asserts as the superuser:

```
_sel(key, sql)  → the scalar returned, or 'DENIED' / 'ERR:<sqlstate>'
_dml(key, sql)  → 'ROWS:<n>' affected, or 'DENIED' / 'ERR:<sqlstate>'
```

So a failing line reads like: `A CANNOT make itself admin ... got 'ROWS:1'` (expected
`'DENIED'`) — telling you exactly which subject did what it shouldn't.

## Run it locally

Needs Docker running.

```bash
supabase start
supabase db reset                       # apply migrations + seed
# pgTAP is a TEST-only extension (not shipped to prod). Install it on the local DB once:
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "create extension if not exists pgtap with schema extensions;"
supabase test db                        # runs every *_test.sql
```

## Run it in CI

**Actions → "Database checks"** does exactly the above on every PR/push that touches
`supabase/**`, on a throwaway local DB with no secrets. It also runs the drift gate and a
backup→restore roundtrip. It **fails closed**: if the database can't be set up, or any
assertion fails, the job is red — there is no "skipped so it passed" path.

## Reading a CI failure

1. Open the failed **Database checks** job → the **RLS + permission tests (pgTAP)** step.
2. pgTAP prints TAP: look for `not ok N - <description>`. The description names the subject
   and action; the `got '...'` vs expected value tells you whether it was a missing/extra grant
   (`DENIED` vs `ROWS:1`) or an RLS row-visibility problem (`0` vs `1`).
3. Reproduce locally with the block above, fix the policy/grant in the migration, re-run.

## Adding tests for a new table

When a PR adds a table, add its protection tests in the **same PR** (CI reminds you only if you
break an existing guarantee, so be disciplined):

1. Add synthetic rows for it in `seed.sql` (owned by A and by B, so isolation is testable).
2. In `01_rls_matrix_test.sql`, add for the new table: anon read (allowed/denied as designed);
   A reads own (`> 0`); A reads B's (`0`); A updates/deletes B's (`ROWS:0` or `DENIED`); any
   admin-only read (`0` for A, `> 0` for admin).
3. In `00_structure_test.sql`, bump `plan(N)` and add `has_table` + the RLS-enabled `ok(...)`.
4. `supabase db reset && supabase test db` until green, then PR.
