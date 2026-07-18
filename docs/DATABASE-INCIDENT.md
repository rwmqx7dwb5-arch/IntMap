# Database incident runbook

Calm, numbered steps for database emergencies — written to be followed by a beginner under
stress. **Golden rules:** (1) stop the damage before fixing; (2) never restore a backup
straight onto production — restore into an isolated copy first; (3) take a fresh backup before
any risky fix; (4) write down what you did.

Where to click: Supabase **Dashboard → SQL Editor** (runs privileged SQL), **Settings →
Database** (password, connection), **Settings → API** (keys). Backups: see
[`BACKUP-RESTORE.md`](BACKUP-RESTORE.md). Migrations: [`MIGRATIONS.md`](MIGRATIONS.md).

---

## 1. Accidental DELETE (rows/table gone)
1. **Stop.** If a script/job is running, stop it. Don't run more DELETEs.
2. Note WHAT is gone and roughly WHEN it happened (you'll restore to just before).
3. **PITR (Pro):** Dashboard → Database → Backups → **Point in Time** → pick a time a minute
   before the delete → restore into a new project/branch, **not** over prod.
4. **No PITR:** take the newest backup (`BACKUP-RESTORE.md`), restore it into a local isolated
   DB (`scripts/restore-test.sh`), confirm the rows are there.
5. Export only the missing rows and re-insert them into prod via SQL Editor. Verify counts.
6. Prod smoke test. Write up the cause.

## 2. Accidental UPDATE (wrong values written)
1. Stop the source of the change.
2. If it was a migration/bulk update, you know the query — figure out the previous values from
   a backup.
3. Restore a pre-incident backup into an **isolated** DB, read the correct values there.
4. Correct prod with a targeted `UPDATE ... WHERE id IN (...)`. Never a blanket update.
5. Verify a few rows by hand; smoke test.

## 3. RLS misconfiguration (data too open OR app broke)
- **Too open** (anon/other users can read what they shouldn't): this is also a leak — see §4.
  Fix by re-applying the correct policy from the baseline, e.g.:
  ```sql
  alter table public.<t> enable row level security;   -- never leave RLS off
  -- re-create the intended policy from supabase/migrations/…_baseline.sql
  ```
- **App broke** (legit users get 0 rows / permission denied): a policy is too strict or a grant
  is missing. Reproduce locally (`supabase db reset && supabase test db`), fix in a migration,
  apply with the gated flow.
- Always end by running the pgTAP tests locally so you know the fix is correct
  ([`RLS-TESTING.md`](RLS-TESTING.md)).

## 4. Permission leak (someone can access data they shouldn't)
1. **Contain first.** Tighten the offending object immediately in SQL Editor (enable RLS /
   restrict the policy / revoke the grant) using the correct definition from the baseline.
2. Confirm it's closed: run the relevant checks from `01_rls_matrix_test.sql` mentally or
   locally.
3. Assess exposure: which table, which columns (PII?), for how long. `profiles.email`,
   `feedback`, `bug_reports`, `donations` are the sensitive ones.
4. If real user PII was exposed, note it for a disclosure decision. Ask the maintainer.
5. Add/adjust a pgTAP test so this exact leak can never regress.

## 5. Migration failed (during `db push`)
1. Read the Postgres error — it names the failing statement.
2. `supabase migration list --linked` — see which migrations are marked applied.
3. If prod is now half-changed and broken, **restore from the backup you took before pushing**
   (you did take one — step (a) in `MIGRATIONS.md`). Don't hand-patch prod destructively.
4. Fix the migration on a branch, `supabase db reset && supabase test db` until green, re-PR.

## 6. Database unreachable
1. Is it prod or your machine? Check **Dashboard → Project home** (is the project paused?
   Free projects pause after inactivity → click **Restore/Resume**).
2. Check **status.supabase.com** for a provider incident.
3. App-side: the site degrades gracefully (news falls back to live RSS; community shows an
   error). No deploy needed — it recovers when the DB returns.
4. If it's a bad connection string in a secret, fix the secret; don't commit connection strings.

## 7. Backup failing (the `status:backup-failing` issue opened)
1. **Actions → "DB backup (encrypted)"** → open the failed run → read the failing step.
2. Common causes: rotated DB password (update `SUPABASE_DB_URL`), project paused (resume it),
   `pg_dump` version skew (the runner installs `postgresql-client` fresh — rarely an issue).
3. Re-run the workflow. A green run auto-closes the issue.
4. Meanwhile, take one manual backup (`scripts/backup-db.sh` locally) so you're covered.

## 8. service_role key leaked
The `service_role` key bypasses RLS — treat a leak as a full-data compromise.
1. **Rotate immediately:** Dashboard → **Settings → API → Rotate** the `service_role` key
   (and the JWT secret if offered). This invalidates the leaked key.
2. Update the key wherever it's legitimately used: **Edge Function secrets** (`supabase secrets
   set SUPABASE_SERVICE_ROLE_KEY=…`) and any CI secret that holds it.
3. Purge it from wherever it leaked (rotate first — don't rely on deletion). If it was ever in
   git, rotating is the fix; scrubbing history is secondary.
4. Review recent DB activity for anything done with the old key. Consider PITR to a pre-leak
   point if data was tampered.

## 9. Suspected unauthorized access
1. **Rotate secrets** as in §8 (service_role, DB password: Settings → Database → Reset).
2. **Auth:** Dashboard → Authentication → review recent sign-ins/users; disable signups
   temporarily if needed; revoke suspicious sessions.
3. **Assess:** what could the access reach? If only the anon key, RLS limited them to public
   data + their own rows. If service_role or the DB password, assume full access → §8 + PITR.
4. Take a forensic backup (so evidence isn't lost), then restore/clean as needed.
5. Document the timeline; decide on user disclosure with the maintainer.

---

### After any incident
- Confirm **RLS is enabled on every table** (`00_structure_test.sql` proves this locally).
- Add a test that would have caught it.
- Note the cause + fix in `DEV-NOTES.md`.
