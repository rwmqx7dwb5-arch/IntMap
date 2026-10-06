# Releasing IntMap

## The pipeline

```
work branch → Pull Request (auto-merge on green) → CI (green) → squash merge to main
   → ci.yml on main:      build once → gates + browser tier on that build → (all green) publish
                          that same dist/ → post-deploy smoke             ↓ (if broken) rollback
   → supabase-deploy.yml: Edge Functions + migrations changed since the last successful deploy (only if supabase/ changed)
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
publish included — but that alone does not keep production in order: a bot merge made with
`GITHUB_TOKEN` starts no push run, so nothing cancels its parent's run, and the
`pages-production` concurrency group serializes publishes without ordering them. So **every
publishing job runs [`scripts/pages-publish-guard.mjs`](../scripts/pages-publish-guard.mjs)
immediately before the publish**: it reads the live commit from the newest successful
`github-pages` deployment and **refuses (green, with a notice) to publish a commit that is an
ancestor of it**. `rollback.yml` is the one exception, by design. A `workflow_dispatch` of CI on
`main` runs in its own concurrency group, so it cannot cancel the push run that publishes.
Confirm a deploy landed with
`curl -s "$(node scripts/site-url.mjs)build-info.json"` — its `sha` must equal
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
  green `main` did not reach Pages; the bot lander (`.github/actions/land-bot-pr`, used by
  `tle-refresh.yml` and `perf-ceiling.yml`) dispatches it after a bot merge, because a
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
   - (optional) `PROD_URL` = an override of the address the post-deploy smoke and the uptime probe
     use. Without it they use `supabase/functions/_shared/site-origin.js` — the one place the address is written.

Until both are set, `ci.yml`'s `pages` job and `deploy.yml` skip (green no-op), `rollback.yml` is red, and the
branch publish keeps working. See [`docs/MONITORING.md`](MONITORING.md) for what to check
after enabling.

## Supabase: Edge Functions and migrations

[`.github/workflows/supabase-deploy.yml`](../.github/workflows/supabase-deploy.yml) is to
Supabase what `ci.yml`'s `pages` job is to Pages — except that it runs on the push itself and
does not wait for `main`'s CI run. On a push to `main` that changes
`supabase/functions/**`, `supabase/migrations/**` or `supabase/config.toml`,
[`scripts/supabase-deploy.mjs`](../scripts/supabase-deploy.mjs):

1. reads the diff **from the last successful deploy** to the pushed commit — not the push's own
   diff. The base is the `headSha` of this workflow's newest green `push` run (`gh run list`,
   `actions: read`), trusted only if that commit's copy of the script carries the same rule
   (`DEPLOY_BASE_CONTRACT`; a green run under the old rule deployed only its own diff). No readable
   record, or a base that is not an ancestor of the pushed commit → **every function**, and the run
   stays red while `db push --dry-run` still has migrations to apply (it cannot choose them without
   a base, and a green run becomes the next base). MEASURED 2026-10-01: #869 and #874 were red and
   deployed nothing; #878 was green and deployed no function, because #878 changed none —
   `usage-count` was absent (404) and #874's `_shared/` change undeployed until a manual deploy;
2. applies the migrations **added** since that base with `supabase db push` — **only if** `db push
   --dry-run` would apply exactly those. Production's history does not record the baseline
   (`MIGRATIONS.md`), so an unguarded `db push` would re-run it against the live database; any
   other pending version makes the run red with nothing applied and no function deployed;
3. deploys the functions whose directory changed — **all of them** when `_shared/` or
   `config.toml` changed (`verify_jwt` lives in `config.toml`; #R806's fix was a config-only
   change) — with `supabase functions deploy <name> --project-ref … --use-api`. The roster is
   `config.toml`'s `[functions.*]`; a changed directory without a header is refused, not deployed
   with default settings. A declared function that `supabase functions list` does not show is
   deployed whatever the diff says;
4. lists production again and is **red if a declared function is not there** (or if the list cannot
   be read — a green run is the next run's base, so it must not be unconfirmed).

**Nightly**, the same workflow's `drift` job runs `node scripts/release-state.mjs --edge --db --check`:
deployed function source vs `main`, byte for byte, and the remote migration history vs
`supabase/migrations`. Drift **or an unmeasurable plane** is red. Each job keeps one issue
(`status:supabase-deploy-failing`, `status:supabase-drift`) that names the cause and closes on green.

It needs one repository secret, `SUPABASE_ACCESS_TOKEN` — registered once, see
[`BACKUP-RESTORE.md`](BACKUP-RESTORE.md#一度だけの登録secret-ここが正本). Without it both jobs are red
and say so. **Manual** `supabase functions deploy` stays available for emergencies
([`AGENT-SETUP.md`](AGENT-SETUP.md) §9).

## What readers are told — 「更新情報」 (`scripts/whats-new.mjs`)

Every deploy also publishes what changed **for readers**: the build writes `whats-new.json`, `updates.html` /
`ja/updates.html` and the Atom feeds `updates.xml` / `ja/updates.xml` from the `newsen` / `newsjp` lines of the
records in `dev-notes/` (the in-app Settings ▸ 新着 and Atlas's `system.whatsNew` read the same JSON). Nothing is
posted anywhere; readers and feed readers come to it. A change a reader can see gets its two lines in the same
pull request as its record (`.agents/skills/intmap-round/` §3); `node scripts/dev-notes.mjs --check` holds them
to the rules. `docs/architecture/15-ops-quality.md` §15.9.

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
> ソースで走っていた。うち 3 本（その後撤去した旧・地域監視の関数と `news-ingest` / `refresh-news`）は Atlas persona の
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

## Moving the site to its own domain（独自ドメインへの移行）

**ドメインはまだ無い**（2026-10-01 時点。名前は未定・購入は利用者）。この節は、取得した日に
上から順にやる手順書である。

### 1 か所の値

本番のアドレスは [`supabase/functions/_shared/site-origin.js`](../supabase/functions/_shared/site-origin.js)
の **`CUSTOM_DOMAIN`** だけが決める（空＝Pages のアドレス `PAGES_URL`）。そこから導かれるもの:

| 読み手 | 何を導くか |
|---|---|
| Edge Function（`_shared/site-origin.js` を直接または `client-error-shape.js` 経由で import するもの） | 受け付ける `Origin`（`SITE_ORIGINS`＝新旧両方）と、上流に名乗る User-Agent の連絡先 |
| `js/client-error-report.js` | 報告を送るオリジン |
| `index.html`（ビルド時） | `og:url`・`og:image`（`scripts/site-url.mjs` の Vite プラグインが埋める） |
| `dist/CNAME`（ビルド時） | 値があれば出す・空なら出さない（⚠ 下の注を参照） |
| workflow（`ci.yml`・`deploy.yml`・`rollback.yml`・`uptime.yml`） | smoke と uptime の宛先（`node scripts/site-url.mjs`）、公開後の一致検査 |
| `tests/prod-smoke.spec.js`・`scripts/release-state.mjs`・`scripts/atlas-eval.mjs`・`scripts/probe-relay-ladder.mjs` | 本番の URL・Origin・Referer |
| `README.md`・`AGENTS.md`・`.agents/roles/intmap-prod-verifier.md` | `[site:<path>]: <url>` の参照定義（`node scripts/site-url.mjs --write` が描く） |

**正本以外にアドレスを書くと `npm run check:static` が赤になる**（規則 `site-address`。例外は
正本そのもの・`dev-notes/`・`DEV-NOTES-ARCHIVE.md`——過去の記録は「その日のアドレスで測ったこと」
なので書き換えない——と、正本から描かれた `[site:]` 定義だけ。理由は `scripts/site-url.mjs` の冒頭）。
ページはベースパスを前提にしない（`vite.config.js` の `base: './'`・`sw.js` は相対 URL で登録）ので、
`/IntMap/` 配下でもドメインの直下でも同じ `dist/` が動く——`tests/domain-portable-checks.test.mjs` が
1 つのビルドを両方に置いて確かめる。

⚠ **`CNAME` ファイルはドメインを結ばない。** このリポジトリは GitHub Actions の workflow で公開して
おり、その場合 GitHub は「既存の `CNAME` ファイルを無視する」（docs.github.com「Managing a custom
domain for your GitHub Pages site」2026-10-01 に確認）。**結ぶのは Pages の設定（`cname`）**で、
公開のたびに `node scripts/site-url.mjs --pages-agrees <page_url>` が GitHub の答え（`deploy-pages`
の `page_url`）と正本を突き合わせ、食い違えば post-deploy の job が赤になる。

### 旧アドレスはどうなるか（実測）

2026-10-01、独自ドメインを持つ project サイト 2 つ（`jekyll.github.io/jekyll/…`・
`twbs.github.io/bootstrap/…`）で測った: Pages は旧アドレスに **301** を返し、**`/<repo>/` を落とし、
残りのパスとクエリを保つ**（`/jekyll/docs/installation/?x=1` → `jekyllrb.com/docs/installation/?x=1`）。
`#` 以降はブラウザが運ぶ。⇒ 旧リンク・ブックマーク・共有 URL は切れない。
⚠ ただし**オリジンが変わる**ので、オリジンに属するものは新しいアドレスへ移らない:
`localStorage`・IndexedDB・Cache Storage・Service Worker・**ログインのセッション**。読者は新しい
アドレスで一度ログインし直す。アカウントに同期されていない手元だけの状態は旧オリジンに残り、旧オリジンは
301 しか返さないので**取り出す手段が無い**。

### 手順（誰がやるか）

| # | 誰 | やること |
|---|---|---|
| 1 | **利用者** | ドメインを購入する。apex（`example.com`）か subdomain（`www.example.com` 等）かを決める。apex にするなら `www` も設定すると GitHub が両者のリダイレクトを自動で作る。 |
| 2 | **利用者**（GitHub のアカウント設定の画面） | ドメインを**検証**する（Settings → Pages → Verified domains → Add domain）。表示される TXT レコード `_github-pages-challenge-rwmqx7dwb5-arch.<domain>` を DNS に入れて Verify。乗っ取り（takeover）を防ぐためで、TXT は消さない。 |
| 3 | **利用者**（DNS 事業者） | レコードを入れる。**apex**: `A` を 4 本 `185.199.108.153`・`185.199.109.153`・`185.199.110.153`・`185.199.111.153`、`AAAA` を 4 本 `2606:50c0:8000::153`・`2606:50c0:8001::153`・`2606:50c0:8002::153`・`2606:50c0:8003::153`（または事業者が対応していれば `ALIAS`/`ANAME` → Pages のホスト＝`node scripts/site-url.mjs --pages-host`）。**subdomain**: `CNAME` → Pages のホスト（`node scripts/site-url.mjs --pages-host`。パスは付けない）。**ワイルドカード（`*.example.com`）は作らない**。値は docs.github.com から 2026-10-01 に転記したもの——入れる前に公式の頁で確かめる。 |
| 4 | エージェント | Pages にドメインを結ぶ: `gh api -X PUT repos/rwmqx7dwb5-arch/IntMap/pages -f cname=<domain>`。DNS の確認は `gh api repos/rwmqx7dwb5-arch/IntMap/pages/health`。⚠ ここから手順 6 の merge までは公開後の一致検査が赤になる（GitHub はもう新しいアドレスを答え、正本はまだ古い）——間を空けない。 |
| 5 | エージェント | 証明書が出たら HTTPS を強制する: `gh api -X PUT repos/rwmqx7dwb5-arch/IntMap/pages -F https_enforced=true`（出るまで最大 24 時間）。 |
| 6 | エージェント | PR: `site-origin.js` の `CUSTOM_DOMAIN` を `<domain>` にし、`node scripts/site-url.mjs --write` と `node scripts/agent-sync.mjs --write` を走らせ、`npm test` → merge。公開 run の post-deploy が `--pages-agrees` で一致を確かめる。 |
| 7 | エージェント | `site-origin.js` を（直接または `client-error-shape.js` 経由で）import する Edge Function を配備し直す——一覧は `git grep -l -e site-origin -e client-error-shape -- "supabase/functions/*/index.ts"` が出す（迷ったら `--all`）: `supabase functions deploy <name> --project-ref vpekfwdpurzejrrmacac --use-api`。版は `supabase functions list` で確かめる。 |
| 8 | エージェント（Management API の token があれば。無ければ利用者が dashboard で） | Supabase Auth → URL Configuration: **Site URL** を新しい `SITE_URL` に、**Redirect URLs** に新しい `SITE_URL` を足す（旧アドレスは移行が済むまで残す）。API なら `PATCH https://api.supabase.com/v1/projects/vpekfwdpurzejrrmacac/config/auth` の `site_url`・`uri_allow_list`。パスワード再設定とメール変更のリンクは `location.origin + location.pathname` に戻るので、ここが抜けるとリンクが跳ね返される。 |
| 9 | エージェント（同上） | パスキー: Relying Party ID を新しいホスト（`node scripts/site-url.mjs --host`）、Origin を `--origin` にする。⚠ **パスキーは RP ID に結ばれていて、旧ホストで登録されたものは新しいホストでは使えない。** 切り替える前に登録数を数え、0 でなければ利用者に影響を伝える（2026-09-27 の記録では 0 件——`docs/SECURITY-ARCHITECTURE.md` の「Passkeys are enabled on the project」の項）。 |
| 10 | **利用者**（Google アカウント） | Google Search Console に新しいアドレスのプロパティを足す。ドメインプロパティなら DNS の TXT で、URL プレフィックスなら HTML ファイルで確認する——サイト直下には今も `google0266d9db8efbc48c.html` が配られている（`vite.config.js` STATIC_ASSETS）。コンソールが別のファイル名を示したら、そのファイルを足して STATIC_ASSETS に載せる（エージェント）。旧アドレスは 301 なので検索エンジンはそれに従う。（「アドレス変更」ツールがサブパスのプロパティで使えるかは未確認。） |
| 11 | **利用者** | CARTO のアカウントで、basemap キーに申告したドメインを新しいものに変える。キーは申告ドメインに対して発行されるが Referer は強制されない（実測・`js/carto-basemap.js`）ので、変えなくても今日は動く。 |
| 12 | エージェント | 本番検証（`intmap-prod-verifier`）: 新しいアドレスで地図が出る・旧アドレスが 301 で新しいアドレスへ・`og:url` が新しいアドレス・エラー報告が受理される・ログインと再設定メールのリンクが戻ってくる。 |

⚠ **ロールバック**（`rollback.yml`）は、そのコミットが持つ `CUSTOM_DOMAIN` でビルドする。違う値の
コミットに戻すと、Pages の設定は変わらないので一致検査が赤になる——ドメインを跨いで戻すときは
Pages の `cname` も合わせる。

## AWS（S3 + CloudFront）での配信

**決定は [`DECISIONS.md`](../DECISIONS.md)「配信とビルド」の 1 行目**（Pages は 1 GB の上限を超え、規約が
商用サービスを対象外とする）。ドメインは `intmap.app`（Route 53 で取得・管理）、CloudFront は定額プラン Pro。
⚠ **2026-10-06 時点で AWS アカウントはまだ無い**——下の手順の 1〜3 が済むまで `ci.yml` の `aws` ジョブは
スキップ（緑）で、本番は Pages のまま。

**同じ `dist/` を 1 つのオリジンから配る**ので、ページ（相対パス・`data/hvt` の Range 読み・Service Worker・
CSP）は変わらない。変わるのは応答ヘッダの出どころだけで、Pages が送っていたもの（2026-10-06 実測）を同じにする:

| 何 | どこで決まるか |
|---|---|
| Content-Type | `scripts/aws-publish.mjs` の `CONTENT_TYPES`（拡張子ごとに Pages の実測値。未知の拡張子は公開を止める） |
| Cache-Control | 同上。ブラウザは Pages と同じ 600 秒、Vite のハッシュ付きの名前だけ 1 年。CDN は 1 年保ち、公開のたびに `/*` を無効化する |
| 圧縮 | CloudFront が 1,000〜10,000,000 B のテキストを gzip/br。それを超えるテキスト（いま 6 本）は gzip 済みで置く。`.gz` は置いたバイトのまま（Range のため） |
| `Access-Control-Allow-Origin: *` | CloudFront の管理ポリシー SimpleCORS（`infra/aws/hosting.yaml`） |
| `/ja/` → `ja/index.html`、`/ja` → `/ja/`、`www` → apex | CloudFront Function（同上） |

### 構成（`infra/aws/`）

| ファイル | リージョン | 作るもの |
|---|---|---|
| `certificate.yaml` | **us-east-1**（CloudFront の決まり。他では作れないように Rules で拒む） | ACM 証明書（apex と `www`、DNS 検証は Route 53 に自動で書かれる） |
| `hosting.yaml` | ap-northeast-1 | 非公開・バージョニング付きの S3、OAC、CloudFront、Function、GitHub OIDC と公開用ロール（このリポジトリの `aws-production` 環境だけが引き受けられる）、`PointDns=true` のときだけ Route 53 の A/AAAA |

### 手順（誰がやるか）

| # | 誰 | やること |
|---|---|---|
| 1 | **利用者** | AWS アカウントを作る。⚠ **「有料プラン（Paid account plan）」を選ぶ**——無料プランのアカウントは CloudFront の定額プランに入れず、6 か月かクレジットを使い切った時点で閉鎖される。ルートユーザーに MFA を付ける。 |
| 2 | **利用者** | Route 53 で `intmap.app` を登録する（連絡先と支払いは本人）。ホストゾーンは登録が自動で作る。 |
| 3 | **利用者** | AWS CLI（2.32 以上）で `aws login` を実行し、ブラウザでサインインする（一時的な認証情報・最長 12 時間。エージェントは鍵を見ない）。 |
| 4 | エージェント | `certificate.yaml` を us-east-1 に、`hosting.yaml` を ap-northeast-1 に `aws cloudformation deploy` する（`PointDns=false`）。出力の 4 値を GitHub の変数 `AWS_PUBLISH_ROLE_ARN`・`AWS_SITE_BUCKET`・`AWS_DISTRIBUTION_ID`・`AWS_REGION` に入れ、環境 `aws-production` を作って `main` だけに絞る。 |
| 5 | エージェント（コンソールが要るなら利用者） | ディストリビューションを定額プラン Pro に入れる。 |
| 6 | エージェント | `main` の次の公開から Pages と並行に S3 へも出る。`*.cloudfront.net` の名前で本番検証（`intmap-prod-verifier`）: 地図・Range 206・border-detail・`www`/スラッシュの転送・ヘッダが Pages と一致。 |
| 7 | エージェント | 切り替え: `hosting.yaml` を `PointDns=true` で更新、`site-origin.js` の `CUSTOM_DOMAIN` を `intmap.app` に（上の「独自ドメインへの移行」の手順 6〜12。手順 2〜5 の Pages の DNS と `cname` は**行わない**——ドメインは CloudFront を指す）。Pages の公開物を旧アドレスから新しいアドレスへ送るページに替える（別の PR）。 |

**ロールバック**: 切り替え前は何もしなくてよい（読者は Pages にいる）。切り替え後は `PointDns=false` に戻すと
ドメインの A/AAAA が消える——その間は旧アドレス（Pages）が本番になるので、Pages の転送ページを止めて
`dist/` を再び公開する（`deploy.yml`）。個々のファイルは S3 のバージョン（30 日）から戻せ、どのコミットも
`data-assets.json` の sha256 から再構築できる。

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
