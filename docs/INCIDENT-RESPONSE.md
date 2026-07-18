# Incident response (production)

A short runbook for when production is broken. Optimised for a solo maintainer: **restore
service first, investigate second.**

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

- **Actions → “Rollback (production, Pages)” → Run workflow → enter the last known-good tag
  or SHA** (e.g. `v2026.07.18-R133`). See [`docs/RELEASE.md`](RELEASE.md#rollback).
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
| What's live? | `window.INTMAP_BUILD`, `/-build-info.json` |
| Roll back (gated) | Actions → Rollback → tag/SHA |
| Roll back (Git) | `git revert <sha> && git push` |
| Verify prod | `PROD_URL=… npx playwright test --config playwright.prod.config.js` |
| Repro locally | `npm run serve` |
