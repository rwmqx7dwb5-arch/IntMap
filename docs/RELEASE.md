# Releasing IntMap

## The pipeline

```
work branch → Pull Request (auto-merge on green) → CI (green) → squash merge to main
   → ci.yml on main:      build once → gates + browser tier on that build → (all green) publish
                          that same dist/ → post-deploy smoke             ↓ (if broken) rollback
   → supabase-deploy.yml: changed Edge Functions + added migrations        (only if supabase/ changed)
```

**There is no staging gate.** A PR is opened with auto-merge (`AGENTS.md` §5.1), so the moment CI
turns green is the moment the change reaches production — site, Edge Functions and migrations alike.
Everything that must be verified is verified **before** that: in the PR's CI, locally on the built
site, and (optionally) on a PR preview. What is checked **after** is production itself — the
post-deploy smoke, and the round's production verification.

**Current state: production publishes at the end of `main`'s own CI run**
(`.github/workflows/ci.yml`, jobs `build` → … → `pages` → `post-smoke`). Pages **Source =
“GitHub Actions”** and the repo variable **`ENABLE_PAGES_DEPLOY = true`** are both set, so every
push to `main` runs: **build the site with Vite once** (the `build` job) → the declared gates, the
regression suite and the core browser tier, all on that one build → **only if all of them are
green, publish that same `dist/`** (the `pages` job) → post-deploy smoke against the live URL.
(`dist/` since #R175; it published the exact committed tree via `git archive HEAD` until then.)
A red `main` run publishes nothing — the site stays on the last green commit until a later push
(or a re-run of the failed jobs) goes green. A newer push to `main` cancels the older run,
publish included, so an older commit can never overwrite a newer one; the newer run publishes
both. Confirm a deploy landed with
`curl -s https://rwmqx7dwb5-arch.github.io/IntMap/build-info.json` — its `sha` must equal
`git rev-parse origin/main`. (The older “Deploy from a branch” default is no longer in use; if
`ENABLE_PAGES_DEPLOY` is ever unset the jobs skip green and Pages would fall back to it.)

## Normal change flow

1. **Work in a worktree** on its own branch (`node scripts/worktree.mjs new <slug>` — `AGENTS.md` §6).
2. **Verify before the PR**: the gates for what you touched, then `npm test` once; look at the
   built site locally (below).
3. **Commit, push, open the PR with auto-merge**: `gh pr merge --squash --auto --delete-branch`.
   **CI** (`ci.yml`, plus `db.yml` which the ruleset requires) runs static checks, the hermetic
   browser tiers and the database rebuild. Nothing merges red.
4. **Green = merged = released.** `main`'s CI run (`ci.yml`) re-checks the merged tree, and when
   it is green publishes the site it built and runs the **post-deploy smoke** against the live
   URL (about ten minutes after the merge); if the change touched `supabase/`, `supabase-deploy.yml`
   deploys it (below). Only a red run needs you back.
5. **Production verification** of the round happens at the start of the next round
   (`AGENTS.md` §5.1; `node scripts/worktree.mjs verified` records it).

## Looking at a change before it merges

**A. The built site, locally (zero setup, always available).**
Every PR’s exact bytes are smoke-tested in CI. To look at the UI yourself, serve the build from
the worktree — identical to what Pages serves:

```bash
npm run serve       # http://127.0.0.1:4173/ (a worktree gets its own port)
```

If a change needs a human to look before it lands, open the PR **without** `--auto` and merge by
hand after CI and the look. That is the exception, not the flow.

### Optional: PR preview

**B. Live preview URL (recommended for UI-heavy changes) — Cloudflare Pages.**
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
   > must build it first, exactly as CI's `build` job does.
3. Cloudflare now builds every branch/PR to a `https://<hash>.<project>.pages.dev` URL.

Any non-production origin (a `*.pages.dev` host, or `?staging=1`, or a
`<meta name="intmap-staging">`) shows a **“STAGING / TEST BUILD”** ribbon so a preview can
never be mistaken for production. Production never shows it.

> Staging safety: IntMap only writes to Supabase for signed-in actions (feedback, AI, saved
> news). **Do not sign in on a staging build** — it shares the production Supabase project,
> so a signed-in write would hit production data. Browsing/among logged-out use is read-only
> and safe. A separate paid Supabase project is **not** required.

## Production deploy

- **Active (current):** `ci.yml` publishes on a push to `main` (Source = GitHub Actions,
  `ENABLE_PAGES_DEPLOY = true`). Its `build` job runs `npm run build` **once for the whole run**
  and hands `dist/` (with `.perf/build-report.json`) to the gate shard that reads the build and to
  every browser machine as an artifact; on `main` it also assembles the Pages artifact — `dist/`
  plus a `build-info.json` stamp whose `runId` is that CI run. The `pages` job publishes it only
  after `build`, «Static checks», «Regression suite» and «Browser smoke + internal QA» all
  succeeded, then `post-smoke` tests the live URL. Nightly and dispatched CI runs never publish.
  «Migrations rebuild + RLS/permission tests» (`db.yml`) is a separate workflow and cannot be
  waited on; it is required on the PR, which is where a migration is judged.
- **Why `main` is tested again after the merge.** The ruleset's required checks are not
  «strict» — a PR need not be up to date with `main` to merge — so two PRs green on their own can
  merge into a tree no PR run saw. `main`'s CI run is the one place that tree is checked, and it
  is now also what decides whether it ships (`DECISIONS.md`).
- **Manual re-publish:** `deploy.yml` has only a **Run workflow** button now. It re-publishes
  `main`'s current commit with its own build and static gates (no browser tier). Use it when a
  green `main` did not reach Pages; `tle-refresh.yml` dispatches it after a bot merge, because a
  push made with `GITHUB_TOKEN` starts no workflow. It is not a way around a red `main`.
- **(#R175) What is published is now a BUILD, not the repo tree.** `dist/` is the Vite output:
  one hashed, minified, code-split bundle per entry, the CSS extracted and hashed, and the
  root static assets (`sw.js`, `admin.html`, `data/`, the Köppen rasters, the flag webfont, the
  Google verification file) copied verbatim by the `intmap-copy-static` plugin in
  `vite.config.js`. The deploy asserts `dist/index.html` and `dist/sw.js` exist before
  uploading, so an empty or half-copied build fails the job instead of blanking the site. The
  browser tier serves **the same build** the `pages` job publishes (one artifact, not a rebuild),
  so nothing reaches production that the tests did not see.
- **If a deploy ever needs to be reasoned about offline:** `npm ci && npm run data:pull && npm run build`
  from the deployed commit reproduces `dist/` byte-for-byte apart from the content hashes.
- **Some of `data/` is not in git (data-outside-git).** `data/border-detail/` and `data/hist-eras.js` are named
  by `data-assets.json` — the sha256 of their content and the GitHub Release asset that carries it —
  and the build job fetches them first (`.github/actions/data-assets`, cached by the manifest's hash).
  `vite.config.js` copies them into `dist/` as bytes (`dereference`), and `check:assets` fails a
  `dist/` that lacks a set, holds different bytes, or holds a link. See "Dataset releases" below.
- **Fallback (not the current state):** if `ENABLE_PAGES_DEPLOY` is ever unset, the `pages` job in
  `ci.yml` and `deploy.yml` skip green and Pages reverts to “Deploy from a branch”. That is the stop switch, not how it publishes today.

### How the gated deploy was turned on (done 2026-07-18 — kept for reference)

> **Nothing to do here: both settings are already in place, and the gated path above is what runs.**
> This records the one settings change that upgraded the repo from “auto-publish on push” to
> “publish only after tests pass”:

1. **Settings → Pages → Build and deployment → Source → “GitHub Actions”.**
2. **Settings → Secrets and variables → Actions → Variables → New repository variable:**
   - Name: `ENABLE_PAGES_DEPLOY`  Value: `true`
   - (optional) `PROD_URL` = your production URL if it is not
     `https://rwmqx7dwb5-arch.github.io/IntMap/`.

Until both are set, `ci.yml`'s `pages` job and `deploy.yml` skip (green no-op), `rollback.yml` is red, and the
branch publish keeps working. See [`docs/MONITORING.md`](MONITORING.md) for what to check
after enabling.

## Supabase: Edge Functions and migrations

[`.github/workflows/supabase-deploy.yml`](../.github/workflows/supabase-deploy.yml) is to
Supabase what `ci.yml`'s `pages` job is to Pages — except that it runs on the push itself and
does not wait for `main`'s CI run. On a push to `main` that changes
`supabase/functions/**`, `supabase/migrations/**` or `supabase/config.toml`,
[`scripts/supabase-deploy.mjs`](../scripts/supabase-deploy.mjs):

1. reads the push's diff;
2. applies the migrations the push **added** with `supabase db push` — **only if** `db push
   --dry-run` would apply exactly those. Production's history does not record the baseline
   (`MIGRATIONS.md`), so an unguarded `db push` would re-run it against the live database; any
   other pending version makes the run red with nothing applied and no function deployed;
3. deploys the functions whose directory changed — **all of them** when `_shared/` or
   `config.toml` changed (`verify_jwt` lives in `config.toml`; #R806's fix was a config-only
   change) — with `supabase functions deploy <name> --project-ref … --use-api`. The roster is
   `config.toml`'s `[functions.*]`; a changed directory without a header is refused, not deployed
   with default settings.

**Nightly**, the same workflow's `drift` job runs `node scripts/release-state.mjs --edge --db --check`:
deployed function source vs `main`, byte for byte, and the remote migration history vs
`supabase/migrations`. Drift **or an unmeasurable plane** is red. Each job keeps one issue
(`status:supabase-deploy-failing`, `status:supabase-drift`) that names the cause and closes on green.

It needs one repository secret, `SUPABASE_ACCESS_TOKEN` — registered once, see
[`BACKUP-RESTORE.md`](BACKUP-RESTORE.md#一度だけの登録secret-ここが正本). Without it both jobs are red
and say so. **Manual** `supabase functions deploy` stays available for emergencies
([`AGENT-SETUP.md`](AGENT-SETUP.md) §9).

## Post-deploy verification

`ci.yml`’s `post-smoke` job (after `pages`, on `main` only; `deploy.yml` has the same job for a
manual re-publish) runs `playwright.prod.config.js` against the live URL:
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
- **A tab left open across a release loses its not-yet-fetched lazy chunks** (Pages keeps no
  previous assets). The reader gets a pressable prompt: «a new version» when the server’s
  `__imBuild` differs from the tab’s, «part of IntMap could not be downloaded — reload to retry»
  when it does not (`Architecture.md` §1.1; `tests/stale-tab-chunks-checks.test.mjs`). A report of
  one feature dying after a release, with that prompt on screen, is this and is cured by the reload.
- **The post-deploy smoke cannot see this failure.** Playwright starts from a cold profile with an
  empty HTTP cache, so it always gets the fresh document. A green post-deploy run says nothing
  about readers holding a warm cache — the regression tests for that are `tests/shell-index-document-checks.test.mjs` (#R465).
- **When verifying a deploy by hand, a hard reload hides it.** Load the site normally first if what
  you want to know is what a returning reader gets.
## 本番はいま、どの組み合わせで走っているか（**3 面まとめて**）

> ⚠ **`main` が緑であることは、本番がその `main` で走っていることを意味しない。** IntMap は
> 3 つの独立した配備単位でできている——静的サイト（Pages）、Edge Functions（Supabase）、
> DB（migration）。`npm test` はチェックアウトを測るのであって、配備された先を測らない。

```bash
node scripts/release-state.mjs          # 3 面を測る（npm run release:state）
node scripts/release-state.mjs --check  # 食い違いなら exit 1 / 測れなければ exit 2
node scripts/release-state.mjs --diff <function>   # その関数の実際の差分
```

判定は**配備されたソースを取り寄せて中身で**行う（`supabase functions download`）。
⚠ **時刻は同一性を答えない**——merge の前に worktree から deploy すれば、正しく配備されていても
「コミットのほうが新しい」に見える。実測 2026-09-16 では、コミット時刻は 17 本すべてを
「古い」と呼び、中身で測ると**違っていたのは 7 本**（`ais-feed` は 1 バイトも違わなかった）。

> **MEASURED 2026-09-16、この道具が最初に測った本番**: Edge 17 本中 7 本がリポジトリと別の
> ソースで走っていた。うち `monitor-run` / `news-ingest` / `refresh-news` は Atlas persona の
> `workspace` 段落を持たない版＝**挙動が違う**（`ai-proxy` だけが新しい版だった）。7 本を
> deploy して 17/17 一致にした。静的サイトは一致。**DB は local 7 本が remote に無く、
> remote 2 本が local に無い**（`docs/DATABASE.md` のベースライン再構築の経緯を読むこと）。
> ⚠ この履歴の食い違いが解消されるまで、`supabase-deploy.yml` は新しい migration を**流さずに赤で止まる**
> （`db push --dry-run` が「その push が足したもの」以外も流すと言うため）。nightly の drift job も赤のまま。

## Which build is live?

- `window.INTMAP_BUILD` — the human-readable build stamp (e.g. `2026-07-18-R133`), visible
  in the Bug Report diagnostics.
- `/build-info.json` at the site root (written by the gated deploy) — the exact commit
  `sha`, `ref`, `runId`, and `builtAt`.

## Tagging known-good releases

> ⚠ **Since data-outside-git the repository DOES have tags — `data-<set>-<sha12>` — and none of them is a
> release of the site.** They exist only to carry dataset assets (see "Dataset releases" below) and
> point at whatever `main` was when the dataset was published. Do not roll back to one. What
> follows about known-good tags is still true: there are no `v…` tags.
>
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

## Dataset releases (`data-<set>-<sha12>`)

Datasets too large to keep in git (data-outside-git) are GitHub Release assets of this repository, one Release
per content: the tag and the asset name carry the first 12 hex of the content's sha256, and
`data-assets.json` records the full content sha256, the asset's own sha256 and its size. Why a Release
and not LFS or an external bucket: `DECISIONS.md`.

- **Publishing** a regenerated set: `node scripts/data-assets.mjs materialize <set>` (only for a
  linked directory set — the store is read-only), run the generator, then `npm run data:publish <set>`.
  It packs deterministically, creates the Release with `gh`, **reads the asset back from its public
  URL** and only then rewrites the manifest. Commit the manifest in the round's PR; the CI cache key
  changes with it, so the first run after it downloads once.
- ⚠ **Never delete a `data-*` Release or its tag.** Every commit whose manifest names it — including
  every commit a rollback might target — needs it to build.
- The Releases are **pre-releases**, so the repository's "latest release" is never a dataset
  (measured: `--latest=false` alone still made the first one "Latest" — GitHub had no other to pick).
  A pre-release's asset URL downloads exactly like any other.

## Emergency fix (hotfix)

1. Branch from `main`: `git checkout -b hotfix/<thing>`.
2. Make the minimal fix; `npm test` locally.
3. PR with auto-merge → CI green → merged → `main`'s CI green → `pages` (and `supabase-deploy.yml` if
   `supabase/` changed) → post-deploy smoke. Never skip CI — it is the only gate before production.

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

**The datasets come from the ROLLED-BACK commit's own `data-assets.json`, fetched by that commit's
own `scripts/data-assets.mjs`** — so the rollback publishes the bytes that commit was built and tested
with. A commit from before data-outside-git has no manifest and carries its data in git; the fetch is skipped for it.

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
| Require CI before merge | Settings → Branches → Branch protection | see [`docs/RELEASE.md` GitHub settings](#branch-protection-optional-but-recommended) |
| Roll back | Actions → Rollback | Run workflow, enter tag/SHA (red if `ENABLE_PAGES_DEPLOY` is off) |
| Supabase deploy + backup | Settings → Secrets and variables → Actions → Secrets | the three secrets in [`BACKUP-RESTORE.md`](BACKUP-RESTORE.md#一度だけの登録secret-ここが正本) |

### Branch protection (optional but recommended)

**Settings → Branches → Add branch ruleset / protection rule** for `main`:

- Require a pull request before merging.
- Require status checks to pass → select **CI / Static checks** and **CI / Browser smoke +
  internal QA**.
- Require branches to be up to date before merging.
- Do not allow force pushes; restrict deletions.

On a personal/free plan some enforcement (e.g. required reviews on your own repo) may be
limited — the checks above are the ones that matter and are available.
