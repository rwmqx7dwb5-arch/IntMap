# Incident response (production)

A short runbook for when production is broken. Optimised for a solo maintainer: **restore
service first, investigate second.** For a **security** incident (below), the order flips:
**contain first.**

---

## Security incident (suspected compromise / vulnerability exploited) — #R138

Use this when the problem is a **security** one, not an outage: a secret may have leaked, an
XSS is firing in the wild, a user is reading/writing another user's data, `refresh-news` is
being abused, or an Edge Function is being hit maliciously. See the model in
[`SECURITY-ARCHITECTURE.md`](SECURITY-ARCHITECTURE.md).

**S0 — Classify (what kind?)**
- **Secret leak** — a `service_role` key, a provider API key, `REFRESH_SECRET`, or DB password
  appeared somewhere public/logged. *(The Supabase publishable/anon key `sb_publishable_…` is
  **public by design** — do NOT emergency-rotate it; it changes nothing and breaks clients.)*
- **XSS / data exposure in the app.**
- **Auth / RLS bypass** — someone accessed data they shouldn't.
- **Edge-Function abuse** — cost spike / DB churn from `ai-proxy` or `refresh-news`.

**S1 — Contain (minutes, before investigating)**
- **Leaked `service_role` / DB password** → **rotate immediately** in Supabase (Settings →
  API / Database); this invalidates the old key. Re-set Edge-Function secrets. Assume anything
  it could reach was reachable.
- **Leaked provider AI key** → revoke/rotate it in the provider console; `supabase secrets set`
  the new one.
- **Leaked `REFRESH_SECRET`** → `supabase secrets set REFRESH_SECRET=<new>` and update the cron
  header. (To take news refresh **fully offline** right now: **unset** `REFRESH_SECRET` — the
  function is fail-closed and will refuse every request.)
- **ai-proxy abused** → it already requires a JWT + per-user daily quota; to hard-stop, unset
  the provider key (returns 502) or lower `PLAN_LIMITS`/redeploy; consider revoking the abusing
  user's sessions (Supabase → Auth → Users).
- **XSS confirmed live** → treat session tokens as compromised for anyone who viewed the
  payload; ship the output-encoding fix (§4 of the architecture doc) and, if data was exposed,
  consider forcing re-auth (rotate the JWT secret / sign out users).
- **RLS bypass** → tighten the policy in a migration + add a pgTAP attack case; if a specific
  grant is the hole, revoke it.

**S2 — Eradicate** — land the real fix on a branch → `npm test` green (add the regression test:
XSS payload, auth assertion, or pgTAP case that reproduces it) → PR → CI → merge → deploy.

**S3 — Recover & disclose** — verify the fix in production; if user data was exposed, notify
affected users; coordinate disclosure per [`SECURITY.md`](../SECURITY.md). **Never** post a
secret value in the issue/PR/notes.

**S4 — Record** — append to `DEV-NOTES.md`: what was exploited, root cause, blast radius, the
fix, and the **test/check added** so it cannot recur silently.

> A committed-secret leak also has a DB-specific runbook in
> [`INCIDENT-RESPONSE.md`](INCIDENT-RESPONSE.md#database-incidents).

---

## 0. Triage (30 seconds)

- **Is it IntMap, or an upstream provider?** If only one data layer (news, tiles, weather)
  is failing, it is probably an external API — not a production incident. See the error
  classification in [`docs/MONITORING.md`](MONITORING.md).
- **Is the whole app down / blank / erroring on load?** That is an incident → continue.

## 1. Confirm the outage

- Open the production URL yourself.
- Check **Actions → Uptime (production)** — is there an open `status:prod-down` issue?
- Check Sentry (if enabled) for an error spike.
- Note the symptom (blank screen, JS error, 404, slow) and the current
  `window.INTMAP_BUILD`.

## 2. Relate it to the latest release

- **Actions → Deploy (production, Pages)** — when was the last deploy? What commit
  (`build-info.json` `sha`)?
- If the outage started right after that deploy, treat the deploy as the cause until proven
  otherwise.
- `git log --oneline -10 main` — what changed.

## 3. Roll back if a bad deploy is likely

Do not debug on production. Restore the last known-good build:

- **Actions → “Rollback (production, Pages)” → Run workflow → enter the last known-good commit
  SHA.** ⚠ **There are no tags in this repository** (measured 2026-08-20: `git tag` prints
  nothing), so `v2026.07.18-R133`-style names are a format illustration and will be *refused* —
  use a SHA. The workflow rebuilds that commit with Vite and publishes `dist/`; it no longer
  publishes the raw tree, which since #R175 is not the site. See
  [`docs/RELEASE.md`](RELEASE.md#rollback).
- If the gated deploy is not enabled yet, roll back with Git instead:
  ```bash
  git revert <bad-commit>        # safe, keeps history
  git push origin main           # branch publish redeploys the reverted tree
  ```
  (Or `git checkout <good-sha> -- index.html` for a single-file regression, commit, push.)

> Rollback restores the **frontend only**. It does **not** undo Supabase schema/data
> changes. If the incident involved a DB migration, reverse that separately and deliberately.

## 4. Verify production recovered

- Wait for GitHub Pages propagation (usually < 1–2 min).
- The rollback/deploy workflow runs the **post-deploy smoke** automatically — confirm it is
  green.
- Or run it yourself:
  ```bash
  PROD_URL=https://rwmqx7dwb5-arch.github.io/IntMap/ npx playwright test --config playwright.prod.config.js
  ```
- Confirm the uptime issue auto-closed (or close it manually after verifying).

## 5. Investigate the root cause

- Reproduce locally: `npm run serve` on the bad commit, open the console, watch
  `window.__imErrors`.
- Reproduce in a test: add a failing case to `tests/` that captures the breakage, so CI
  catches it next time.
- Use the Sentry stack trace / the Playwright trace from the failed run if available.

## 6. Fix and verify on staging

- Branch, fix, `npm test` locally.
- Open a PR → CI green → eyeball on staging ([`docs/RELEASE.md`](RELEASE.md#staging-check)).

## 7. Re-release

- Merge to `main` → deploy → post-deploy smoke green.
- Tag the new known-good build (`git tag -a v… -m …; git push origin v…`).

## 8. Record cause + prevention

Append a short note to `DEV-NOTES.md` (and/or the incident issue):

- **What broke** and the user-visible symptom.
- **Root cause.**
- **How it reached production** (what the tests missed).
- **Prevention** — the test/check added so it cannot recur silently.

## Quick reference

| Need | Command / place |
|------|-----------------|
| Is it up? | Actions → Uptime, or open the URL |
| What's live? | `window.INTMAP_BUILD`, `/build-info.json` |
| Roll back (gated) | Actions → Rollback → **commit SHA** (no tags exist) |
| Roll back (Git) | `git revert <sha> && git push` |
| Verify prod | `PROD_URL=… npx playwright test --config playwright.prod.config.js` |
| Repro locally | `npm run serve` |

---

## Database incidents

The site being up says nothing about the data being right. These are the database-side
runbooks — numbered so you can jump straight to the one that matches the symptom.
Backups and isolated restore: [`BACKUP-RESTORE.md`](BACKUP-RESTORE.md).
Where to click: Supabase **Dashboard → SQL Editor** (runs privileged SQL), **Settings →
Database** (password, connection), **Settings → API** (keys). Backups: see
[`BACKUP-RESTORE.md`](BACKUP-RESTORE.md). Migrations: [`MIGRATIONS.md`](MIGRATIONS.md).

---

### 1. Accidental DELETE (rows/table gone)
1. **Stop.** If a script/job is running, stop it. Don't run more DELETEs.
2. Note WHAT is gone and roughly WHEN it happened (you'll restore to just before).
3. **PITR (Pro):** Dashboard → Database → Backups → **Point in Time** → pick a time a minute
   before the delete → restore into a new project/branch, **not** over prod.
4. **No PITR:** take the newest backup (`BACKUP-RESTORE.md`), restore it into a local isolated
   DB (`scripts/restore-test.sh`), confirm the rows are there.
5. Export only the missing rows and re-insert them into prod via SQL Editor. Verify counts.
6. Prod smoke test. Write up the cause.

### 2. Accidental UPDATE (wrong values written)
1. Stop the source of the change.
2. If it was a migration/bulk update, you know the query — figure out the previous values from
   a backup.
3. Restore a pre-incident backup into an **isolated** DB, read the correct values there.
4. Correct prod with a targeted `UPDATE ... WHERE id IN (...)`. Never a blanket update.
5. Verify a few rows by hand; smoke test.

### 3. RLS misconfiguration (data too open OR app broke)
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
  ([`DATABASE.md`](DATABASE.md#rls--permission-testing)).

### 4. Permission leak (someone can access data they shouldn't)
1. **Contain first.** Tighten the offending object immediately in SQL Editor (enable RLS /
   restrict the policy / revoke the grant) using the correct definition from the baseline.
2. Confirm it's closed: run the relevant checks from `01_rls_matrix_test.sql` mentally or
   locally.
3. Assess exposure: which table, which columns (PII?), for how long. `profiles.email`,
   `feedback`, `bug_reports`, `donations` are the sensitive ones.
4. If real user PII was exposed, note it for a disclosure decision. Ask the maintainer.
5. Add/adjust a pgTAP test so this exact leak can never regress.

### 5. Migration failed (during `db push`)
1. Read the Postgres error — it names the failing statement.
2. `supabase migration list --linked` — see which migrations are marked applied.
3. If prod is now half-changed and broken, **restore from the backup you took before pushing**
   (you did take one — step (a) in `MIGRATIONS.md`). Don't hand-patch prod destructively.
4. Fix the migration on a branch, `supabase db reset && supabase test db` until green, re-PR.

### 6. Database unreachable
1. Is it prod or your machine? Check **Dashboard → Project home** (is the project paused?
   Free projects pause after inactivity → click **Restore/Resume**).
2. Check **status.supabase.com** for a provider incident.
3. App-side: the site degrades gracefully (news falls back to live RSS; community shows an
   error). No deploy needed — it recovers when the DB returns.
4. If it's a bad connection string in a secret, fix the secret; don't commit connection strings.

### 7. Backup failing (the `status:backup-failing` issue opened)
1. **Actions → "DB backup (encrypted)"** → open the failed run → read the failing step.
2. Common causes: rotated DB password (update `SUPABASE_DB_URL`), project paused (resume it),
   `pg_dump` version skew (the runner installs `postgresql-client` fresh — rarely an issue).
3. Re-run the workflow. A green run auto-closes the issue.
4. Meanwhile, take one manual backup (`scripts/backup-db.sh` locally) so you're covered.

### 8. service_role key leaked
The `service_role` key bypasses RLS — treat a leak as a full-data compromise.
1. **Rotate immediately:** Dashboard → **Settings → API → Rotate** the `service_role` key
   (and the JWT secret if offered). This invalidates the leaked key.
2. Update the key wherever it's legitimately used: **Edge Function secrets** (`supabase secrets
   set SUPABASE_SERVICE_ROLE_KEY=…`) and any CI secret that holds it.
3. Purge it from wherever it leaked (rotate first — don't rely on deletion). If it was ever in
   git, rotating is the fix; scrubbing history is secondary.
4. Review recent DB activity for anything done with the old key. Consider PITR to a pre-leak
   point if data was tampered.

### 9. Suspected unauthorized access
1. **Rotate secrets** as in §8 (service_role, DB password: Settings → Database → Reset).
2. **Auth:** Dashboard → Authentication → review recent sign-ins/users; disable signups
   temporarily if needed; revoke suspicious sessions.
3. **Assess:** what could the access reach? If only the anon key, RLS limited them to public
   data + their own rows. If service_role or the DB password, assume full access → §8 + PITR.
4. Take a forensic backup (so evidence isn't lost), then restore/clean as needed.
5. Document the timeline; decide on user disclosure with the maintainer.

---

#### After any incident
- Confirm **RLS is enabled on every table** (`00_structure_test.sql` proves this locally).
- Add a test that would have caught it.
- Note the cause + fix in `DEV-NOTES.md`.
