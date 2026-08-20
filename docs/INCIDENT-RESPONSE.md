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
> [`DATABASE-INCIDENT.md`](DATABASE-INCIDENT.md).

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
