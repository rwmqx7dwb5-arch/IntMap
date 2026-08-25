# Releasing IntMap

## The pipeline

```
work branch → Pull Request → CI (green) → staging check → merge to main → deploy → post-deploy smoke
                                                                                        ↓ (if broken)
                                                                                     rollback
```

**Current state (as of R144): production publishes via the CI-gated GitHub Actions workflow**
(`.github/workflows/deploy.yml`). Pages **Source = “GitHub Actions”** and the repo variable
**`ENABLE_PAGES_DEPLOY = true`** are both set, so every push to `main` runs build → static
checks → hermetic browser tests → **build the site with Vite and publish `dist/`** (#R175; it
published the exact committed tree via `git archive HEAD` until then) → post-deploy smoke
against the live URL. Confirm a deploy landed with
`curl -s https://rwmqx7dwb5-arch.github.io/IntMap/build-info.json` — its `sha` must equal
`git rev-parse origin/main`. (The older “Deploy from a branch” default is no longer in use; if
`ENABLE_PAGES_DEPLOY` is ever unset the jobs skip green and Pages would fall back to it.)

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
> ⚠ **This is a PR-preview option, not production.** Production is served by **GitHub Pages**;
> nothing sits in front of it. That matters for security because the response headers GitHub
> Pages cannot set (`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`,
> `X-Content-Type-Options`, a header-form CSP) stay unset in production —
> MEASURED 2026-08-20, see `docs/SECURITY-ARCHITECTURE.md §6/§8`. If IntMap is ever moved
> behind Cloudflare **for production**, those headers become settable and should be set.
Free, per-PR preview URLs, and it does **not** touch GitHub Pages or production:

1. Sign in at <https://dash.cloudflare.com/> → **Workers & Pages** → **Create** → **Pages**
   → **Connect to Git** → pick this repo.
2. Build settings: **Framework preset = None**, **Build command = `npm ci && npm run build`**,
   **Build output directory = `dist`**. Save.
   > ⚠ Since #R175 the site is a **Vite build**. Serving the repository root (`/`) would ship the
   > un-bundled sources, which is not the site — the page comes up blank. Whatever previews the app
   > must build it first, exactly as `deploy.yml` does.
3. Cloudflare now builds every branch/PR to a `https://<hash>.<project>.pages.dev` URL.

Any non-production origin (a `*.pages.dev` host, or `?staging=1`, or a
`<meta name="intmap-staging">`) shows a **“STAGING / TEST BUILD”** ribbon so a preview can
never be mistaken for production. Production never shows it.

> Staging safety: IntMap only writes to Supabase for signed-in actions (feedback, AI, saved
> news). **Do not sign in on a staging build** — it shares the production Supabase project,
> so a signed-in write would hit production data. Browsing/among logged-out use is read-only
> and safe. A separate paid Supabase project is **not** required.

## Production deploy

- **Active (current):** `deploy.yml` runs on push to `main` (Source = GitHub Actions,
  `ENABLE_PAGES_DEPLOY = true`), re-runs static + browser tests, then runs `npm run build` and
  publishes **`dist/`** plus a `build-info.json` stamp, and finally runs the post-deploy smoke
  against the live URL.
- **(#R175) What is published is now a BUILD, not the repo tree.** `dist/` is the Vite output:
  one hashed, minified, code-split bundle per entry, the CSS extracted and hashed, and the
  root static assets (`sw.js`, `admin.html`, `data/`, the Köppen rasters, the flag webfont, the
  Google verification file) copied verbatim by the `intmap-copy-static` plugin in
  `vite.config.js`. The deploy asserts `dist/index.html` and `dist/sw.js` exist before
  uploading, so an empty or half-copied build fails the job instead of blanking the site. The
  browser gate that runs just above it tests a build of the same commit, so nothing reaches
  production that the tests did not see.
- **If a deploy ever needs to be reasoned about offline:** `npm ci && npm run build` from the
  deployed commit reproduces `dist/` byte-for-byte apart from the content hashes.
- **Fallback:** if `ENABLE_PAGES_DEPLOY` is unset, `deploy.yml` skips green and Pages reverts to
  “Deploy from a branch”. The steps below are how the gated path was turned on (kept for reference).

### Enabling the gated deploy (already done — kept for reference)

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

## The ten minutes after a deploy

GitHub Pages serves **`Cache-Control: max-age=600` on every response** — `index.html`, `sw.js`
and the content-hashed, immutable assets alike. Measured 2026-08-25; the header does not vary by
file type, which is how we know it is GitHub’s policy and not something this repo sets. Pages has
no per-file header control (no `_headers`, no `.htaccess`), so **you cannot ask for `no-cache` on
the document.**

The consequence is structural, not a bug in the deploy: for up to ten minutes after a release, a
returning reader’s browser may answer the navigation from its own HTTP cache with the **previous**
`index.html`. That document names `assets/main-<previous hash>.js`, which the new deploy no longer
has — so the entry 404s and **nothing boots**. Observed in production on 2026-08-25:
`window.__imBuild === 'R451'` with `IntMapConsole` and `IntMapAtlasAgent` both `undefined`.

`index.html` recovers from this itself (`__imDocStale()` — see `Architecture.md` §1.1): it catches
the entry’s load failure, re-fetches the document past the cache, and reloads **once** if the
server’s copy names a different entry. So:

- **A blank page reported in the ten minutes after a release is expected to self-heal on the
  reader’s next load.** Ask whether it persists; if it does, it is not this.
- **The post-deploy smoke cannot see this failure.** Playwright starts from a cold profile with an
  empty HTTP cache, so it always gets the fresh document. A green post-deploy run says nothing
  about readers holding a warm cache — the regression tests for that are `tests/r462-checks.test.mjs`.
- **When verifying a deploy by hand, a hard reload hides it.** Load the site normally first if what
  you want to know is what a returning reader gets.
## Which build is live?

- `window.INTMAP_BUILD` — the human-readable build stamp (e.g. `2026-07-18-R133`), visible
  in the Bug Report diagnostics.
- `/build-info.json` at the site root (written by the gated deploy) — the exact commit
  `sha`, `ref`, `runId`, and `builtAt`.

## Tagging known-good releases

> ⚠ **MEASURED 2026-08-20: this repository has ZERO tags.** `git tag` prints nothing, and no
> release has ever been tagged, so every example of the form `v2026.07.18-R133` in this file
> and in `INCIDENT-RESPONSE.md` is a *format illustration*, not something you can roll back to.
> **Roll back by commit SHA** — that always exists. Tagging is still worth doing; it is just
> not something to rely on in an incident until the first tag is actually pushed.

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
2. Enter the **known-good commit SHA** (there are no tags in this repo yet — see the warning
   above).
3. The workflow refuses anything that does not resolve to a real commit in this repo, checks
   it out, decides which SHAPE that commit is, and publishes accordingly.

⚠ **STEP 3 USED TO PUBLISH THE SOURCE TREE, AND SINCE #R175 THAT IS NOT THE SITE.** The job ran
`git archive <sha> | tar -x -C _site`, which was correct while the repo root *was* what Pages
served. On any commit from #R175 onward that tree's `index.html` ends in
`<script type="module" src="/src/main.js">` — a 404 on Pages and a blank page. The rollback
that exists for the worst ten minutes of a deploy would have replaced a broken site with no
site at all. It now:

- runs the **same `npm ci && npm run build`** the deploy does, at the rolled-back commit, and
  publishes `dist/` — when that commit has a `vite.config.js` and a `build` script;
- falls back to `git archive` **only** for a pre-#R175 commit, recognised by having an
  `index.html` at the root and no `vite.config.js` — the shape where that was the right answer;
- **refuses by name** anything that is neither, rather than deploying a tree of unknown shape.

The shape it chose is recorded in `build-info.json` (`"shape": "vite" | "static"`) alongside the
sha, so "what did the rollback actually publish" is answerable after the fact.

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
