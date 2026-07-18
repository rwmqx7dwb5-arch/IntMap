# Releasing IntMap

## The pipeline

```
work branch → Pull Request → CI (green) → staging check → merge to main → deploy → post-deploy smoke
                                                                                        ↓ (if broken)
                                                                                     rollback
```

Today production publishes automatically from the `main` branch (GitHub Pages “Deploy from
a branch”). The workflows in `.github/workflows/` add a **CI-gated** path on top of that,
which becomes active only after you opt in (see [Enabling the gated deploy](#enabling-the-gated-deploy)).
Until then, nothing about publishing changes.

## Normal change flow

1. **Branch**: `git checkout -b feature/xyz`.
2. **Commit** your change.
3. **Open a Pull Request** to `main`. This triggers **CI** (`ci.yml`): static checks +
   the hermetic browser smoke + internal QA. The PR cannot be considered ready until CI is
   green.
4. **Staging check** (see below).
5. **Merge to `main`** once CI is green and you have eyeballed staging.
6. **Deploy** runs (either the existing branch publish, or the gated `deploy.yml` if
   enabled) and the **post-deploy smoke** verifies the live site.

## Staging check

You have two options; use whichever fits the change.

**A. Built preview from CI (zero setup, always available).**
Every PR’s exact bytes are smoke-tested in CI. To eyeball the UI, check out the branch and
serve it locally — identical to what CI serves:

```bash
git checkout feature/xyz
npm run serve       # http://127.0.0.1:4173/
```

**B. Live staging URL (recommended for UI-heavy changes) — Cloudflare Pages.**
Free, per-PR preview URLs, and it does **not** touch GitHub Pages or production:

1. Sign in at <https://dash.cloudflare.com/> → **Workers & Pages** → **Create** → **Pages**
   → **Connect to Git** → pick this repo.
2. Build settings: **Framework preset = None**, **Build command = (empty)**,
   **Build output directory = `/`**. Save.
3. Cloudflare now builds every branch/PR to a `https://<hash>.<project>.pages.dev` URL.

Any non-production origin (a `*.pages.dev` host, or `?staging=1`, or a
`<meta name="intmap-staging">`) shows a **“STAGING / TEST BUILD”** ribbon so a preview can
never be mistaken for production. Production never shows it.

> Staging safety: IntMap only writes to Supabase for signed-in actions (feedback, AI, saved
> news). **Do not sign in on a staging build** — it shares the production Supabase project,
> so a signed-in write would hit production data. Browsing/among logged-out use is read-only
> and safe. A separate paid Supabase project is **not** required.

## Production deploy

- **Default (today):** merging to `main` publishes via GitHub Pages “Deploy from a branch”.
- **Gated (after opt-in):** `deploy.yml` runs on push to `main`, re-runs static + browser
  tests, publishes the **exact committed tree** plus a `build-info.json` stamp, then runs
  the post-deploy smoke against the live URL.

### Enabling the gated deploy

This is the one settings change that upgrades you from “auto-publish on push” to
“publish only after tests pass”. Do it once:

1. **Settings → Pages → Build and deployment → Source → “GitHub Actions”.**
2. **Settings → Secrets and variables → Actions → Variables → New repository variable:**
   - Name: `ENABLE_PAGES_DEPLOY`  Value: `true`
   - (optional) `PROD_URL` = your production URL if it is not
     `https://rwmqx7dwb5-arch.github.io/IntMap/`.

Until both are set, `deploy.yml` / `rollback.yml` skip every job (green no-op) and the
branch publish keeps working. See [`docs/MONITORING.md`](MONITORING.md) for what to check
after enabling.

## Post-deploy verification

`deploy.yml`’s final job runs `playwright.prod.config.js` against the live URL:
HTTP 200, app shell present, no uncaught exceptions, layer UI built, `INTMAP_BUILD`
reported. It retries to absorb GitHub Pages propagation lag. A transient upstream API
failure does not fail it (only IntMap’s own breakage does).

## Which build is live?

- `window.INTMAP_BUILD` — the human-readable build stamp (e.g. `2026-07-18-R133`), visible
  in the Bug Report diagnostics.
- `/-build-info.json` at the site root (written by the gated deploy) — the exact commit
  `sha`, `ref`, `runId`, and `builtAt`.

## Tagging known-good releases

Tag a commit you have verified in production so you can roll back to it by name:

```bash
git tag -a v2026.07.18-R133 -m "known-good: ops baseline"
git push origin v2026.07.18-R133
```

Optionally create a GitHub Release from the tag (**Releases → Draft a new release**).

## Emergency fix (hotfix)

1. Branch from `main`: `git checkout -b hotfix/<thing>`.
2. Make the minimal fix; `npm test` locally.
3. PR → CI green → merge → deploy → post-deploy smoke.
   If it cannot wait for review, still let CI run — it is fast.

## Rollback

If a deploy turns out to be broken, redeploy the last known-good commit/tag. This requires
the gated deploy to be enabled.

1. **Actions → “Rollback (production, Pages)” → Run workflow.**
2. Enter the **known-good tag or SHA** (e.g. `v2026.07.18-R133`).
3. The workflow refuses anything that does not resolve to a real commit in this repo, checks
   it out, republishes that exact tree, and runs the post-rollback smoke.

`workflow_dispatch` is restricted by GitHub to users with write access, and the input can
only ever be an existing commit — so rollback cannot publish arbitrary/injected code.

> Rollback reverts the **frontend only**. It does not undo Supabase schema or data changes.
> See [`docs/INCIDENT-RESPONSE.md`](INCIDENT-RESPONSE.md).

## Manual steps summary (GitHub UI)

| Goal | Where | What |
|------|-------|------|
| Turn on CI-gated deploy | Settings → Pages | Source = GitHub Actions |
| Turn on CI-gated deploy | Settings → Secrets and variables → Actions → Variables | `ENABLE_PAGES_DEPLOY=true` |
| Require CI before merge | Settings → Branches → Branch protection | see [`docs/RELEASE.md` GitHub settings](#branch-protection-optional) |
| Roll back | Actions → Rollback | Run workflow, enter tag/SHA |

### Branch protection (optional but recommended)

**Settings → Branches → Add branch ruleset / protection rule** for `main`:

- Require a pull request before merging.
- Require status checks to pass → select **CI / Static checks** and **CI / Browser smoke +
  internal QA**.
- Require branches to be up to date before merging.
- Do not allow force pushes; restrict deletions.

On a personal/free plan some enforcement (e.g. required reviews on your own repo) may be
limited — the checks above are the ones that matter and are available.
