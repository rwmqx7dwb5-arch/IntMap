# Testing IntMap

> **Verified 2026-08-20 against `acc55b1`** — the tier split, the file counts and the build time
> below are measurements taken on that date, not estimates.

IntMap ships as a static site — `index.html` + assets, with **no server of its own**. Since
#R175 that static site is produced by a Vite build (`npm run build` → `dist/`) instead of
being the repo tree itself. Everything in this document lives in `package.json`, `scripts/`,
`tests/`, `vite.config.js` and `playwright.config.js`.

> **The browser tests run against `dist/`, not the sources.** `playwright.config.js` builds
> first and serves the build output, because what has to keep working is what GitHub Pages
> publishes. A build-only failure — a bad chunk split, a static asset the build forgot to
> copy, a module that only resolves through the dev server — would otherwise be discovered in
> production. MEASURED 2026-08-20 on this machine, `npm run build` is **21–25 s** (Vite reports
> 20.2 s and 21.7 s for the bundle; 24.9 s wall including npm's own start-up). The "~10 s" this
> line used to claim predates the Cesium chunk.

## What runs

**The tiers, measured** (`node scripts/test-budget.mjs`, 2026-08-20): the **core** tier that
gates a push is **6 spec files / 1.1 min**; the **whole** suite is **65 measured spec files /
86.5 min** of serial browser time against a ceiling of 86.7 min; and `npm run test:checks` runs
**128 Node test files** with no browser at all (counted from `package.json` on 2026-08-21; the
line above it is the 2026-08-20 measurement). `npm test` runs the source half and the browser
half *concurrently* (`scripts/test-parallel.mjs`), so it costs `max(a, b)` rather than `a + b`.

| Layer | Command | Needs a browser? | External network? |
|-------|---------|------------------|-------------------|
| Static checks | `npm run check:static` | no | no |
| Browser smoke | `npm run test:smoke` | Chromium | no (hermetic) |
| Internal QA | `npm run test:qa` | Chromium | no (hermetic) |
| Everything (the CI gate) | `npm test` | Chromium | no (hermetic) |
| Production smoke | `PROD_URL=… npx playwright test --config playwright.prod.config.js` | Chromium | **yes** (live site) |
| News-locator accuracy report | `node scripts/newsgeo-eval.mjs [--miss]` | no | no |

## Requirements

- **Node.js ≥ 20** (CI and the pinned local version use Node 24 — see `.nvmrc`).
- That is all. `npm ci` installs both halves of `package.json`: `dependencies` are the
  libraries the browser ships (MapLibre, Turf, TopoJSON, Supabase, KaTeX, html2canvas — all
  version-pinned, all bundled by Vite since #R175), and `devDependencies` are the build and
  CI tooling (`vite`, `@playwright/test`, `acorn`, `js-yaml`). The static server that serves
  the build output (`scripts/serve.mjs`) is still dependency-free.

## First-time setup

```bash
npm ci                                   # reproducible install from package-lock.json
npx playwright install --with-deps chromium   # one-time browser download
```

`npm ci` (not `npm install`) is what CI uses — it installs the exact locked versions and
fails if `package.json` and `package-lock.json` disagree.

## Run the tests

```bash
npm test                 # static checks + hermetic browser suite (the full CI gate)
npm run check:static     # fast: syntax / JSON / YAML / merge-markers / secrets / assets
npm run test:smoke       # does the app boot + render its shell?
npm run test:qa          # IntMap's own in-page QA harnesses
```

**(#R196) `npm test`'s browser half runs through `scripts/run-tests.mjs`, not `playwright test`
directly.** It asks `scripts/shard-plan.mjs` — the same measured-time planner CI has used since
#R195 — for the spec files in longest-first order, runs the ordinary pool at two workers, and then
runs the specs marked `solo` in `tests/durations.json` (the `-cesium` family) at ONE worker, because
#R186 measured that contention is what those fail on. Same files, same config, same assertions; it
only changes the order and the width. If the plan cannot cover every spec that exists it says so and
falls back to a plain `playwright test` over the whole directory — never to a subset.

Override the width with `PW_WORKERS=<n>` when measuring the machine itself, and set `PORT` when
another worktree already has a server on 4173.

Run a single test by title:

```bash
npx playwright test -g "map container"
npx playwright test tests/smoke.spec.js
```

Serve the app by itself (same as CI serves it — the **build output** at `/`):

```bash
npm run serve            # builds, then http://127.0.0.1:4173/
```

`npm run serve` still means "give me the real site on 4173" — it just runs `vite build` first.
Two shortcuts around it:

```bash
npm run dev              # Vite dev server + HMR, straight from the sources (no build)
npm run preview          # serve an existing dist/ without rebuilding it
```

Use `npm run dev` while editing and `npm run serve` when you want to see exactly what ships.
`file://` is still unsupported, and now doubly so: the entry is an ES module.

### Measuring, not gating: `scripts/frame-profile.mjs` (#R209)

Frame time and start-up are MEASUREMENTS, so they are a standalone runner rather than a spec file —
a spec would join the tier lists, the shard plan and the 5,201 s budget, and a budget is the wrong
thing to put on a stopwatch.

```bash
npm run preview &                                              # serve an existing dist/
node scripts/frame-profile.mjs --boot --record                 # once, to fill the replay cache
node scripts/frame-profile.mjs --boot --net fast4g             # start-up, iPhone-13 profile, CPU/4
node scripts/frame-profile.mjs --sweep --sat                   # frame time over a zoom + hover sweep
node scripts/frame-profile.mjs --boot --desktop --cpu 1        # …or the desktop profile
```

Every external request is answered from `.frame-cache/` (gitignored), so two runs replay identical
bytes and the only thing on the clock is the app. Three rules the file enforces because three rounds
were misled without them:

* **the first two reps are discarded** — a cold cache costs a whole vsync quantum, and a rebuild
  whose chunk hashes changed IS a cold cache (this round nearly recorded an 8.0 s start-up that was
  4.7 s once the new hashes were in it);
* **mean and p95, not the median** — a frame either makes the vsync deadline or waits for the next
  one, so the median can only take the values 16.7 / 33.3 / 50.0;
* **a mobile User-Agent, not just a 390×844 viewport** — the gazetteer's 12,000-row cap, the
  satellite tile caches and the image-concurrency cap are all gated on the UA, so a viewport-only
  profile silently measures the desktop code path.

A/B comparisons must alternate (ABAB…) and report the median of the PAIRED differences, with an
A-vs-A null run to establish the noise floor: #R206 watched a control leave at 24.4 ms and come back
at 20.8, which is larger than most of the effects being looked for.

### On-demand modules (#R209)

Eight feature modules are no longer in the boot bundle; `js/lazy-modules.js` fetches them when the
user reaches for the feature. Two suites guard that, and they guard different things:

* `tests/r209-checks.test.mjs` — source level: none of the eight is still in `src/main.js`, every
  dynamic specifier is a literal (nothing else is visible to `scripts/static-checks.mjs`), every
  entry point awaits the loader, and every `turf.<name>` the source calls is on the object
  `src/vendor.js` publishes.
* `tests/r209.spec.js` — browser level, and the one that matters: the eight are absent before they
  are asked for, ALL of them arrive when asked, and `window.__imLazyCheck.failed` is empty. The last
  is the loader's own verdict — it checks that the factory registered and that the module's global
  appeared — not the test's.

If you add a module to the loader, add it to `LAZY_FACTORIES` in `src/main.js` (not to
`MODULE_FACTORIES`, where the boot guard would report it missing on every clean load).

### Non-AI news locator (`js/newsgeo.js`)

The deterministic news-geolocation engine is measured, not eyeballed. `tests/newsgeo-corpus.mjs` is the
labelled development set (weights were tuned against it) and `tests/newsgeo-holdout.mjs` was written after
the engine was finished and is scored once, so it is the honest generalisation number. Both are asserted
by `tests/r161-checks.test.mjs` #12.

```bash
node scripts/newsgeo-eval.mjs           # per-class accuracy, old locator vs new
node scripts/newsgeo-eval.mjs --miss    # every miss, both engines
```

The "old locator" column is not a strawman: the script reconstructs the previous gazetteer + `scoreGeo`
from the real arrays still present in `index.html`.

`js/newsgeo.js` is the single source of truth; `supabase/functions/_shared/newsgeo.js` is a generated
byte-identical copy (an Edge Function cannot import outside `supabase/functions/`). After editing the
engine, regenerate the mirror — `npm run check:static` fails if the two drift:

```bash
node scripts/sync-newsgeo.mjs
```

## When a test fails

Playwright captures artefacts on failure:

- **Screenshots** and **traces** under `test-results/`.
- An **HTML report**: `npm run report` (opens `playwright-report/`).
- A **JUnit XML** (`test-results/junit.xml`) that GitHub renders in the Actions summary.

Open a trace to step through exactly what the browser did:

```bash
npx playwright show-trace test-results/<failing-test>/trace.zip
```

In CI, the same artefacts are uploaded to the run (**Actions → the run → Artifacts →
`playwright-report`**), and the failing test name + message appear inline in the log.

## Static checks (`scripts/static-checks.mjs`)

Fast, dependency-light gate that catches cheap-to-detect breakage before the browser runs:

- **Syntax** — `node --check` on every `.js` / `.mjs` / `.cjs` / `.ts` file (Node ≥ 22
  strips TypeScript types, so the Deno Edge Functions in `supabase/functions/` are covered
  too). `index.html`'s inline scripts are validated at runtime by the smoke test instead.
- **JSON** — every `.json` is parsed.
- **YAML** — every workflow is parsed; tabs are rejected; missing `permissions:` warns.
- **Merge markers** — `<<<<<<<` / `>>>>>>>` anywhere is an error.
- **Secrets** — private keys, service-role JWTs, and common provider key shapes fail the
  build. The Supabase **publishable** (anon) key is public on purpose and is allowlisted.
- **Referenced assets** — a static `src`/`href`/`url(...)` in `index.html` / `admin.html`
  pointing at a missing local file fails (dynamic `'+x+'` refs are ignored).

It deliberately does **not** reformat or style-lint existing code.

## Internal QA harnesses (classification)

IntMap exposes several self-diagnostic entry points. They are classified by what they
need, so CI only runs the safe ones:

| Harness | Type | In CI? | Why |
|---------|------|--------|-----|
| `IntMapAtlasQA.run()` | pure (fixtures + deterministic text/date math) | ✅ `test:qa` | no network, no AI, no auth |
| `IntMapRegionResolverTest.run()` | pure (geometry math) | ✅ `test:qa` | no network |
| `IntMapUIAudit.run()` | local DOM sweep | ✅ `test:qa` (informational) | deterministic after boot; not a strict pass/fail |
| `IntMapLayerAudit.run()` / `.check()` | needs a rendered map + tiles/feature-state | ❌ | hermetic CI blocks tiles, so paint-state is incomplete — would report false negatives |
| `IntMapDataHealth.check()` / `.probe()` | probes live external endpoints | ❌ | depends on GDELT / Overpass / Wikidata / GIBS / Open-Meteo being up |
| `IntMapRegionResolver.resolve()` (live) | needs the AI proxy + a signed-in user | ❌ | consumes AI quota; requires auth |

The last three are **not** run in CI because they need external network, rendered tiles,
or a signed-in session — running them would make the build flaky and could touch
production services. They remain available for manual diagnosis in the browser console.

## External-API-dependent tests

The hermetic suite (`npm test`) blocks **all** network except the two boot CDNs (unpkg,
jsDelivr), so it never calls GDELT / Overpass / Supabase / tile servers. A blocked
external request is expected and classified benign (`tests/helpers/network.js`); only an
error from IntMap's **own** code fails the build. This is what lets CI stay green when an
upstream data API is rate-limited or down.

The only test that talks to the real internet is the **production smoke** (`prod-smoke`),
which runs against the deployed URL after a deploy and on the uptime schedule. It tolerates
transient upstream failures via retries and the same benign-error classification.

## Determinism

Tests are order-independent and repeatable: a fresh browser context per file (no leaked
`localStorage` / `IndexedDB`), a fixed **UTC** timezone and **en-US** locale, Service
Workers blocked, and a hermetic network. Nothing depends on the developer's clock,
language, or prior runs.

**…nor on the line endings the checkout produced.** `.gitattributes` pins the extensions that
are executed or parsed on Linux (`*.sh`, `*.sql`, `*.mjs`, `*.yml`, `*.yaml`, `*.toml`) to LF;
`js/`, `css/` and the HTML shells are left to `core.autocrlf`, which is `true` on the Windows
development machine and hands those files back with CRLF — while CI reads them with LF. A
source-level check that asserts something about a file's **content** must therefore read the
content, not the bytes: use `readLF` / `sameText` from **`scripts/eol.mjs`**, never a bare
`readFileSync(p, 'utf8')` feeding a pattern that names a line break. Two checks did the latter
and were red on every local run and green in CI, which is worse than no check at all — a
failure list that is always red is a failure list nobody reads. `tests/r283-checks.test.mjs`
holds the rule, and it fails on **both** platforms if a raw byte read comes back.
