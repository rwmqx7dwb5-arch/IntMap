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

**The tiers, measured** (`node scripts/test-budget.mjs`, 2026-08-23): the **core** tier that
gates a push is **6 spec files / 1.0 min** against a ceiling of 1.1 min; the **whole** suite is
**68 measured spec files / 86.3 min** of serial browser time against a ceiling of 86.3 min; and
`npm run test:checks` runs **199 Node test files** with no browser at all (counted from
`package.json`, which since #R385 may not name the same file twice — see below). `npm test` runs the source half and the browser
half *concurrently* (`scripts/test-parallel.mjs`), so it costs `max(a, b)` rather than `a + b`.

⚠ **A NETWORK-DEPENDENT ASSERTION DOES NOT BELONG IN THE GATE.** #R341 split its browser coverage in
two for this reason: `tests/r341.spec.js` is in the gate and asserts only what is true whether or not
a provider answered this minute (the browser contacts no upstream; the GPU cloud is what draws; there
is no zoom prompt at any zoom), while `tests/r341-live.spec.js` holds the claims that need real
aircraft and runs nightly. A gate that goes red because a third party had a bad afternoon is a gate
people learn to ignore.

⚠ **AND A SPEC THAT `test.skip`s ITSELF IS GREEN WITHOUT ASSERTING ANYTHING.** Two aviation specs were
measured waiting 66 s and 95 s for a feed and then skipping — passing in CI, proving nothing. When the
thing a spec is about has two implementations, the spec must NAME the one it means (`?aviation=v1`)
rather than depend on which is currently the default.

> ⚠ **The whole-suite ceiling has zero headroom** (86.3 min measured against 86.3 min). A new
> `.spec.js` cannot be added until the same time or more is taken out of an existing one — the
> ceiling only moves down. Node checks (`*.test.mjs`) are **not** governed by this budget, so
> logic that can be checked without a browser belongs there. ⚠ Only `**N Node test files**` is
> compared against the repository by `scripts/doc-facts.mjs`; the three numbers in the paragraph
> above are not, and they were stale by 3 spec files when #R334 re-measured them.

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

**WHICH of these to run WHILE working** — the staged ladder (targeted checks during the edit,
`npm test` once before the push, `test:deep` only when 3-D/physics were touched) is stated once,
in [`../.claude/rules/execution-strategy.md`](../.claude/rules/execution-strategy.md) §4. This
document owns *what each layer is*; that one owns *when a session runs it*.

**(#R196) `npm test`'s browser half runs through `scripts/run-tests.mjs`, not `playwright test`
directly.** It asks `scripts/shard-plan.mjs` — the same measured-time planner CI has used since
#R195 — for the spec files in longest-first order, runs the ordinary pool at two workers, and then
runs the specs marked `solo` in `tests/durations.json` (the `-cesium` family) at ONE worker, because
#R186 measured that contention is what those fail on. Same files, same config, same assertions; it
only changes the order and the width. If the plan cannot cover every spec that exists it says so and
falls back to a plain `playwright test` over the whole directory — never to a subset.

Override the width with `PW_WORKERS=<n>` when measuring the machine itself.

**(#R282 追記) The port follows the checkout, so you no longer have to remember `PORT`.** This used
to read «set `PORT` when another worktree already has a server on 4173» — an instruction nobody is
reading at the moment they type `npm test`, which is how it kept happening. With
`reuseExistingServer: !isCI`, two sessions on 4173 fail in two silent ways: the second run skips its
own `npm run build` and tests the FIRST one's `dist/`, or it dies mid-suite with
`net::ERR_CONNECTION_REFUSED` when the first takes the server down (measured: **2 failed / 25 did
not run**, on a tree whose own tests all pass — the same suite went **52 passed** on a private
port). `tests/helpers/session-seed.js` now derives it: a linked worktree's `.git` is a FILE, the
main worktree's is a DIRECTORY, so **the main worktree and CI keep 4173** and each worktree gets its
own stable port in 4174–4373. `PORT` in the environment still wins when you want to pin it.

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

### Gating: the startup budget — `npm run check:perf` (#R311)

Until this existed, **the only thing CI weighed was test TIME.** Not one byte of the deploy was
under a gate: `vite build` printed «Some chunks are larger than 3000 kB» on every run and exited 0,
which asserts exactly as much as printing nothing.

```bash
npm run build            # writes .perf/build-report.json as a side effect of building
npm run check:perf       # judge it against tests/perf-baseline.json
npm run perf:report      # the same measurement, printed, without judging
node scripts/perf-budget.mjs --update   # accept the current numbers as the new ceilings
```

**It weighs the two halves of the bundle separately, and that is the whole point.** The largest
chunk in this repo is Cesium at 4.7 MB, and a MapLibre session never asks for it — a gate on "the
biggest chunk" would be loudest about the one number a default session does not pay, and silent
about a hundred kilobytes moving into the entry. `scripts/build-report.mjs` therefore DERIVES the
split from the graph Rollup finished with (the entry chunk of `index.html` plus the transitive
closure of its static imports = what Vite emits `modulepreload` for) rather than reading it off
filenames, and the budget applies two different rules:

* **EAGER — a ratchet in both directions.** Over the ceiling fails as a regression. *Under* it by
  more than a little also fails, and says so: a ceiling with permanent headroom has stopped
  asserting anything, which is the rule #R194 already gave the test-time budget.
* **ASYNC and `dist/` — a ceiling only.** They may shrink freely without anyone editing the
  baseline; they may not grow past the ceiling without someone deciding to raise it. Per chunk as
  well as in total, so one feature cannot double while another that shrank hides it.

⚠ **`requests` and `modules` are counts, not bytes, and are matched exactly.** A byte-sized slack
swallows them whole — `6 > 6 + 2048` is false for every value a count can take — so both rows would
have sat in the table looking gated while being incapable of failing. `tests/r311-checks.test.mjs`
drives `judge()` with synthetic numbers and requires an error from a regression, from an improvement
that leaves the ceiling behind, and from a ±1 change in each count.

**What is deliberately NOT in this gate:** first map pixel, interaction-ready, long-task counts and
heap. Those need a browser and are genuinely noisy, and a flaky gate in front of every push teaches
people to re-run it rather than read it. Bytes are deterministic — the same tree gives the same
numbers — so bytes stand in front of every push and the runtime numbers are measured with the
instrument below. ⚠ That instrument needs `.frame-cache/`, which is gitignored and holds recorded
third-party tiles, so it is a LOCAL measurement: a CI runner with an empty cache would block every
external request and measure a map that never drew.

### Gating: the other half of the deploy — `npm run check:assets` (#R322)

The budget above weighs what Rollup produced. That is the smaller half: JavaScript is 12.5 MB of a
105.7 MB deploy and `data/` alone is 55.8 MB, copied whole by `vite.config.js` and never seen by the
bundler. So `check:perf` can say a chunk grew and cannot say that a file in `data/` had stopped
being fetched a year ago.

```bash
npm run build            # dist/ has to exist
npm run check:assets     # the gate
node scripts/asset-report.mjs --json .perf/assets.json   # the whole classification, per file
```

**Every shipped file is matched against the strings the source actually contains** — `js/ src/ css/
*.html sw.js`, plus the small manifests under `data/`, because several of the largest rasters are
never named in JavaScript at all (`js/precip-annual.js` reads `mercator.file` out of
`data/precip-mm.json`; `js/vs30-mask.js` reads `phone.file` out of `data/vs30.json`). A name that is
only ever *computed* — `'data/planets/' + id + '.jpg'` — is recorded as `prefix`, its own class, and
never as «unreferenced»: a search that cannot see a concatenation has to say so rather than report
an absence it did not establish.

It fails on three things: a file nothing in the repository names, the same payload shipped twice
outside the allowlist, and a file over the per-file ceiling with no reason recorded. ⚠ **The
allowlist holds reasons, not names** — the Cesium SDK builds its own runtime URLs from
`CESIUM_BASE_URL`, and the KaTeX and Inter faces exist twice on purpose because the four standalone
shells are not part of the bundle and cannot reach a content-hashed asset.

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
node scripts/frame-profile.mjs --mem --cycles 10               # heap/nodes/listeners over open-close cycles
node scripts/frame-profile.mjs --commands                      # (#R322) renderer commands per phase
node scripts/frame-profile.mjs --commands --skip sourceData    # …the other arm of the same build
npx vite --port 5311 --strictPort &                            # …and attribution needs the DEV server
node scripts/frame-profile.mjs --attribute --base http://localhost:5311
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

(#R311) three things it also reports now, because none of them was visible before:

* `--boot` separates **first map pixel** from **interaction-ready**. The launch screen covers the
  map until `__imBoot` (index.html) decides the app is up, so "first draw" is not "usable" — the
  gap between them is where a start-up regression hides. It also prints `__imBoot`'s own milestones,
  the long tasks (`≥50 ms` / `≥100 ms` / max / total) and the heap after a forced collection.
  ⚠ the long-task observer is installed with `addInitScript`, i.e. **before the first script**:
  `longtask` entries are not retained the way marks are, so an observer created after boot reports
  zero for a boot that froze the main thread for a second.
* `--mem` answers 「10回開閉してもヒープが一方向に増え続けないか」. It drives the app through
  `window.IntMapOS.exec` — the same commands the buttons and Atlas run, never a private entry point
  — and reports heap, DOM nodes and listeners after each cycle, each preceded by a real GC. The
  verdict is the SLOPE over the second half: the first cycles legitimately fill caches a re-open is
  supposed to reuse.
* `--attribute` gives **self time per `js/` file** over the boot, from a CPU profile.
  ⚠ **point it at the dev server.** In a production build every `js/` file is inside one hashed
  chunk, so every sample says `main-XXXX.js` — true and useless. Dev serves each module at its own
  URL, which is what turns a sample into a file name. That makes it an ATTRIBUTION instrument, not
  a timing one: dev is unbundled and unminified, so the RANKING transfers and the milliseconds do
  not, and must not be quoted as production numbers.

### Measuring the ENGINE, not the phone: `scripts/mobile-trace.mjs` (#R387)

Everything above is Chromium. `frame-profile.mjs` sets an iPhone 13 user-agent, a 390×844 viewport
and DPR 3, and throttles the CPU 4× — an **iPhone-shaped Chromium**, which is not an iPhone. The two
costs the mobile corpus keeps landing on (MapLibre label placement, and native image decode + GPU
upload) are exactly the two whose implementations differ most between Blink and WebKit, so "the
engine is not the variable" was the one assumption never tested.

A real iPhone cannot be reached from this machine (Windows, no Safari, no device bridge). What can
be held constant is everything except the engine:

```bash
node scripts/mobile-trace.mjs --engine chromium --record   # once, CHROMIUM ONLY: fill the replay cache
node scripts/mobile-trace.mjs                      # chromium + webkit, 3 reps each
node scripts/mobile-trace.mjs --engine webkit --reps 1
node scripts/mobile-trace.mjs --cpu 4 --engine chromium   # the historical throttled profile
node scripts/mobile-trace.mjs --verify             # + the CDP sampler cross-check
```

One continuous trace per rep — **boot → settle → pan-first → zoom-first → warm-up → pan-warm →
zoom-warm → zoom-back → weather-on → pan-weather → alerts-on → pan-alerts** — with main-thread SELF
time in eight buckets: `placement` (`Style._updatePlacement`), `render` (`Painter.render`),
`mapRender` (`Map._render`), `texUpload`, `bufUpload`, `decode`, `workerPost`, `workerRecv`.

⚠ **`--cpu` defaults to 1 here, and that is not an oversight.** CPU throttling is CDP, and CDP does
not exist in WebKit; throttling one arm and not the other would compare two different machines. The
historical ×4 Chromium numbers stay where they were measured. **A number from this script is an
engine comparison on desktop silicon, not a phone number.**

Four things it does that no earlier instrument here did:

* **Self time, not inclusive time.** `Map._render` calls `Painter.render`, which calls `texImage2D`.
  A one-entry-per-nesting-level stack pauses the parent's accumulator on enter, so the buckets are a
  real decomposition and can be compared against the total. `tests/r387-checks ①` pins every bucket
  of a synthetic frame to the millisecond.
* **A long-task equivalent that exists in WebKit.** Safari has never shipped the `longtask` entry
  type — `frame-profile.mjs`'s observer is inside a `catch` that silently produces no number there.
  A `MessageChannel` ping loop re-posts to itself as fast as the task queue allows, so the gap
  between two ticks IS the block. MEASURED — both engines, 390×844, each primitive driven in a
  continuous loop for 800 ms — `MessageChannel` does a round trip in **0.008 ms** (Chromium) and
  **1.167 ms** (WebKit); `setTimeout(0)` takes 6.2 / 15.1 ms and `rAF` 16.3 / 16.6 ms. It is the
  right primitive in both, by two orders of magnitude.
* ⚠ **`busy` is accumulated, never inferred — and both attempts to infer it were wrong by the whole
  column.** The idea was `busy = wall − pings × tick0`, with `tick0` the loop's own idle cost.
  Estimating `tick0` from a quiet `about:blank` gives 0.011 ms in Chromium and **50 ms** in WebKit
  (a page Playwright is not driving gets throttled), and 50× too large drives busy to zero.
  Estimating it from the run's own smallest gap gives Chromium **0.100 ms against a 0.013 ms mean**
  — `performance.now()` is quantised to 0.1 ms there, so the "floor" is the *clock's* resolution,
  not the queue's; that charged 7,011,938 × 0.1 ms = **701 s** of instrument overhead against a 90 s
  run. So the probe adds up the time spent in gaps **longer than 2 ms**, which clears both engines'
  floor and needs no calibration. ⚠ That makes `busy>2` a **floor**: work finishing inside 2 ms is
  invisible to it, and the buckets may legitimately exceed it (reported as `overAttributed`, never
  clamped silently). **The bucket columns have no such limit** — they are wrapper measurements.
* **A hook that did not attach is reported ABSENT, never as 0.** Every wrapper records itself only
  when the property was really replaced, and `attachMap()` returns which of the three MapLibre hooks
  took. A minifier that started mangling `_updatePlacement` must show up as a missing hook, not as
  label placement costing nothing.

What is **Chromium-only**, and printed as `—` rather than 0: heap / nodes / listeners (CDP
`HeapProfiler` + `Performance.getMetrics`), CPU and network throttling, the `longtask` observer, and
the sampling profiler. **GC time is unavailable to page script in both engines**, so it is not in any
bucket and is not folded into `other`. **Worker-side work is also outside every bucket** —
`addInitScript` does not reach a dedicated worker's global scope, so the decode that
`js/sat-worker.js` does, and everything MapLibre's own workers do, is invisible; what is measured is the main thread's
half of the exchange (`workerPost` is the structured clone, paid synchronously by the caller).

⚠⚠ **THE WEBKIT ARM IS NOT YET USABLE, AND THE REASON IS NOT KNOWN.** MEASURED, same page, same
viewport, same UA, over seven runs: WebKit reached `ready` **twice** — 25,226 ms and 27,060 ms, both
with `--record` on — against **13,283 ms for Chromium under the identical script**. The other five
runs never reached `ready` (108,556–144,087 ms) and afterwards **the page stopped answering the
protocol entirely**: a bare `page.evaluate(() => 'yes')` never returns.

Two explanations were tried and both were **wrong**: `context.route()` interception is not it (the
intercepted arm is the one that completed), and blocked uncached requests are not it either (the
last failing run recorded **18 replayed / 0 missed / 0 blocked**). So: the Chromium numbers (recorded
in `DEV-NOTES.md` under #R387) are real, the WebKit twelve-phase table does not exist yet, and
**nobody should write down a cause for this until one is measured.** What is established is that WebKit finishes the boot in ~27 s when
every request is answered — about **2× Chromium** on the same machine in the same minute.

⚠ The harness no longer waits in silence for it: `--phase-timeout` (default 150 s) covers every
protocol call in a rep, a tripped deadline ends that rep with a named error, and the run reports
`N rep(s) lost` and tabulates whatever survived.

⚠ **Playwright's `waitForFunction` polls with `requestAnimationFrame` by default, and rAF is the one
primitive that effectively stops in a WebKit page nobody is driving** — one frame in 600 ms, against
60 fps in Chromium. A six-second settle sat there for eleven minutes before this was found. Every
waiter in this harness uses `polling: 500` and a hard `Promise.race` deadline on top.

⚠⚠ **`weather-on` measures switching the wind layer on — NOT the ECMWF field decode, and the run
says so.** The field is a set of large HTTP Range requests against Open-Meteo's `.om` files;
`route.fetch()` gives up on them at 20 s and writes the failure into the replay cache, so every
later run replays *that*. MEASURED: two recording passes, the second after purging every failure the
cache had memorised, both waited **187 s** and both ended `field:false`. The wait is therefore capped
at a bounded 25 s, identical in both engines, and the phase reports **`field`** (is the sampler
there) and **`windLayers`** (does the renderer actually hold wind layers) separately. The downstream
taint is keyed on `windLayers`, not on `field` — #R353's rule that the question is what the renderer
has, not what the source intended. #R325's 1,190 ms colour-raster step is a different measurement,
taken against a live network.

⚠ **A cached failure is sticky.** `blocked` in the summary line counts requests answered by a
`{"failed":true}` cache entry as well as ones aborted for being uncached — one run showed
**422 blocked over 15 distinct poisoned URLs**. If a run's `blocked` count is large, delete the
failed entries from `.frame-cache/` and re-record; nothing in the harness retries them on its own.

⚠ **Driving a layer on is three routes, and the result says which one it took.** `el.click()` is the
reader's own path and is tried first, but the layer rows cancel the click, so the run falls back to
`IntMapOS.exec('layer.on')` **without awaiting it** — awaiting hangs the harness, because the alert
layer's command never settles when a request it starts cannot be answered — and finally to setting
`checked` and firing `change`. Each route is followed by a bounded poll, and **a layer that never
went on is reported `ran:false`, not as a phase that cost nothing** (#R322's rule). The first run of
this instrument drove `dl-ec-wind`, which is the id of a preview *canvas*, and `dl-alerts`, which
does not exist; the real ids are `dl-wind` and `wp-dl-alerts`.

### On-demand modules (#R209)

**Sixteen** feature modules are no longer in the boot bundle; `js/lazy-modules.js` fetches them when
the user reaches for the feature. Two suites guard that, and they guard different things:

(#R209 moved eight, #R224 the Atlas kernel, #R291 the directions panel, and #R311 six more —
data centres, the aircraft card, the 3-D volume tool, the country comparison, live satellites and
the satellite panel. ⚠ `js/analysis-panels.js` was a candidate and could not be one of them AS A
FILE: measured, two of its five factories build Layers-panel buttons — `#btn-correlate` and
`#btn-edu` — at boot, so deferring the file would take two buttons off the panel. #R322 split it by
what RUNS at boot instead of by feature: the shell keeps the registrations, the buttons and the
listeners, five implementations went behind the loader, and the rule is intact — a module may be
deferred only when nothing a reader can see depends on it having run.)

* `tests/r209-checks.test.mjs` — source level: none of them is still in `src/main.js`, every
  dynamic specifier is a literal (nothing else is visible to `scripts/static-checks.mjs`), every
  entry point awaits the loader, and every `turf.<name>` the source calls is on the object
  `src/vendor.js` publishes.
* `tests/r209.spec.js` — browser level, and the one that matters: they are absent before they
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

## The deep tier, and who is told when it goes red (#R304)

`npm test` runs the **core** tier — the gate a push waits for. Everything else is the **deep**
tier: `npm run test:deep`, **64 spec files** against core's 6, because #R204/#R207 turned the split
from a hand-kept list into a **price** (`scripts/tiers.mjs`, `CORE_MAX_S = 1`): a spec may stand in
front of a push only if it costs at most one second, so nearly every per-round regression file is
deep. Nothing is deleted by being deep — every assertion still runs.

**Where it runs.** `.github/workflows/ci.yml` runs it on the `schedule` (`0 18 * * *` = 03:00 JST)
and on `workflow_dispatch`, and deliberately **not** on `push` — #R207 measured that attaching it to
every merge cost ten minutes a merge. Locally, `npm run test:deep`.

> ⚠ **A tier that nobody watches drifts red and stays red.** MEASURED in #R304: the nightly was red
> on **all fourteen runs from 2026-08-08 to 08-21** — every one of the five `Deep rest` shards — and
> the aggregate job reported it honestly each time. Nobody was lied to; nobody looked, because a
> nightly is one row among the dozens a working day of pushes and PRs puts above it in `gh run list`.
> Two of the failures had been true since the round that caused them.

So the nightly's answer is written where unfinished business lives, and printed where every session
starts:

| | |
|---|---|
| `scripts/deep-alarm.mjs` | the `deep-alarm` CI job runs it after the nightly. RED → open the issue if it is not open and **rewrite its body** with tonight's failing tests (named, read out of the shards' `junit.xml`); GREEN → close it. One issue edited, never a comment a night. `cancelled` is not a pass. |
| `node scripts/worktree.mjs status` | prints last night's verdict — which CLAUDE.md §1 puts in front of every session before any work starts. The `--brief` form (the SessionStart hook) shouts only when it is not green; the full form always answers, including 「不明」 when `gh` could not be asked, so silence is never read as a pass. |

Reproduce a nightly failure locally with `npm run test:deep`, or one file at a time:

```bash
npx playwright test tests/r209.spec.js --workers=1
```

⚠ **Prove a failure is real before fixing it.** This suite has measured contention flakes (#R186,
#R196): in #R304's own triage `tests/r164.spec.js` failed at two workers and passed alone, and two
more failures were `Target crashed` from a second Playwright process on the same machine. Run the
file by itself at one worker first; `node scripts/baseline.mjs --classify test-results/junit.xml`
says which of a run's failures `main` already has.
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
- **The node-test list** (#R301, `scripts/check-test-list.mjs`) — `test:checks` is one long
  hand-maintained literal in `package.json`, and a `tests/*.test.mjs` file left out of it is not a
  weaker test, it is **not a test**: it never runs, so it never fails and never passes. Measured
  in #R301, `tests/r210-checks.test.mjs` and `tests/r211-checks.test.mjs` had never once been
  executed — and when they finally were, **five of r211's twelve tests failed**, the earliest of
  them broken by #R212, ninety rounds before anybody saw it. The check compares the list against
  `tests/` **in both directions** (unlisted test
  file → fail; listed path that is not on disk → fail, because `node --test` takes the whole
  tier down for that). Fixtures, corpora and the shared helpers are `.mjs` but not `*.test.mjs`,
  and are not demanded.
  Since #R385 it also compares the list **against itself**: a path named **more than once** fails.
  Both of the original directions are satisfied by a list that says the same true thing twice, and
  the guard could not see it by construction — its first act was `new Set(listed)`. Measured: from
  #R356 to #R379 the literal named `tests/r356-checks.test.mjs` twice and the gate stayed green for
  twenty-two rounds, running that file twice on every CI run and inflating by one the entry count
  the paragraph at the top of this file is checked against by `scripts/doc-facts.mjs`.
  ⚠ It lives **here** rather than in `test:checks` on purpose: a guard for a list cannot be an
  entry in the list it guards. `tests/r260-checks.test.mjs` ⑥ asks the same question about itself
  — which only ever protected the rounds whose author was already thinking about the hazard.

It deliberately does **not** reformat or style-lint existing code.

## The Atlas capability audit (`scripts/atlas-capability-audit.mjs`)

`scripts/atlas-catalog.mjs` asks one question — *is every dispatch case described to the planner?* —
and it is a good one; it found six working features the planner had never been shown. It is also the
only question anything was asking, and the diary is full of the others: an operation that ran and
changed nothing, a route computed and never drawn, a tool that quietly used the map centre, wiring
that was cancelled in the same millisecond it was created. Every one of those is a capability whose
**claim** and whose **observation** disagreed.

The audit asks twenty questions against `js/atlas-capabilities.js` — the one list of what IntMap can
do — and the source of the files that implement it:

| # | it fails when |
|---|---|
| 1 | a dispatch spelling belongs to no capability, or is shadowed by an earlier `case` and can never be entered |
| 2–3 | a capability has no executor, or writes something without both `observe()` and `verify()` |
| 4 | a capability that needs a target may take the map centre instead of asking |
| 5–6 | the planner is never told a capability exists — including one whose module has not loaded yet |
| 7 | a declared output is not something the verifier ever looks at |
| 8 | a button and a sentence reach different code, or an `IntMapOS.exec()` names a command nothing registers |
| 9–10 | the registry lists something unrunnable, or misses something implemented |
| 11–12 | two capabilities claim one spelling; a withdrawal has no reason, or has quietly ended |
| 13 | the nine languages do not reach the same capabilities, or a result message is missing from a locale |
| 14–15 | the catalogue is truncated, or a capability can disappear for being Nth in a list |
| 16–17 | a success is claimed on top of a swallowed error, or a promise is reported before it settles |
| 18 | a capability promises the map and is verified without looking at it |
| 19–20 | an operation that waits for input cannot be resumed; a state-dependent capability has nobody to ask |

```bash
node scripts/atlas-capability-audit.mjs            # the report, with the classification counts
node scripts/atlas-capability-audit.mjs --check    # the gate (npm test, CI)
node scripts/atlas-capability-audit.mjs --json     # machine-readable: registry + classification + checks
```

⚠ **A green gate nobody has seen go red is not evidence.** Every check takes its inputs as data, and
`tests/r318-checks.test.mjs` feeds each one a fixture with the defect deliberately present and
asserts that it fails. A check that cannot be made to fail is deleted, not kept.

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

### What only production can answer (#R333)

`prod-smoke` is also the only place that can catch **half a commit reaching production**. The
front end is published by pushing to `main` (`deploy.yml` -> Pages); an Edge Function is published
only when someone runs `supabase functions deploy`. Nothing else compares the two.

#R318 shipped the `x-intmap-turn` request header on both sides of that line and only the front end
arrived, so every Atlas question failed the browser's CORS **preflight** — the POST was never sent
and `fetch()` rejected with a bare `Failed to fetch`, carrying no HTTP status to explain itself.
**Every check in this repository stayed green, correctly**: `js/` sent the header and
`supabase/functions/ai-proxy/index.ts` allowed it, so comparing the repo against itself reproduces
the green while Atlas is down.

The test reads the CORS contract each `index.ts` declares — resolving `_shared/relay-guard.js`'s
`corsFor(extra)` for the four functions that build theirs that way — and requires every declared
header to be present in the live `OPTIONS` response, for **every** function. It is deliberately
one-way: production allowing *more* than the current commit declares is a function deployed from a
branch that has not merged yet, which is normal while a parallel round is in flight.

The half that needs no network lives in `tests/r333-checks.test.mjs` (a header `js/` sends that no
function allows; the ambiguity guard; `_shared` never counted as a function), including an
assertion that the production-side test still exists — a check that deletes itself is
indistinguishable from one that passes.

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

**…nor on the prose around the code.** A source-level check that looks for a CALL must read
`codeOnly(src)` from **`scripts/code-only.mjs`**, never the raw file: every file that explains why
a call was added, removed, or built differently spells that call in its comment, so the pattern
answers «yes» to the explanation. This repository has paid for it nine times. The eighth was
`scripts/atlas-capability-audit.mjs`, which found `IntMapOS.exec()` in the sentence saying the
call had been withdrawn; the ninth was `tests/helpers/fn-cors.js`, which counted
`corsFor("x-intmap-channel")` plus one comment naming `corsFor()` as **two** CORS contracts and
turned five tests red on a function whose contract was unambiguous. The stripper leaves string
literals, template literals and regular expressions exactly as they are — a URL is not a comment —
and lives in ONE module so the tenth occurrence cannot be a new copy of it.
`tests/r345-checks.test.mjs` holds the rule and proves each clause with a fixture carrying the
defect, in both directions.

---

## Security testing

What each security check proves and how to add a case. The threat model itself is
[`SECURITY-ARCHITECTURE.md`](SECURITY-ARCHITECTURE.md); the DB harness is
[`DATABASE.md`](DATABASE.md#rls--permission-testing).
---

### Run everything

```bash
npm ci
npm test          # = static-checks  →  security-logic (node --test)  →  Playwright (browser)
```

The DB / RLS tests need Postgres and run in CI (`.github/workflows/db.yml`); locally they need
Docker + the Supabase CLI (`supabase db start && supabase db reset --local && supabase test db`).

### Run one layer

| Command | What it proves | Runtime |
|---|---|---|
| `npm run check:static` | no committed secrets, no SQL PII, workflows least-privilege, **every remote action SHA-pinned** (no exemption), valid JSON/YAML/JS/TS | Node only |
| `npm run test:security` (`node --test tests/security-logic.mjs`) | refresh-news is fail-closed / header-only / constant-time; ai-proxy needs a JWT + caps input + never logs secrets | Node only |
| `npx playwright test tests/security.spec.js` | XSS payloads stay **inert in a real browser**; `IntMapSafe.url` blocks bad schemes; i18n renders; CSP present | Chromium |
| `supabase test db` (or `db.yml` in CI) | RLS + privilege + the `feedback.rating` CHECK (pgTAP) | Postgres |
| CodeQL (`.github/workflows/security.yml`) | SAST for JS/TS (XSS, injection) → Security tab | CI |

---

### What each test file is

- **`scripts/static-checks.mjs`** — fast, dependency-light gate. Secret patterns (incl. a
  `service_role` JWT and provider keys), SQL-PII guard, destructive-migration detector,
  workflow permissions + **`action-pinning`** (EVERY remote `uses:` must be a full 40-hex SHA —
  there is no exemption; `actions/*` and `github/*` were exempt once, which is where all of this
  repo's actions live, so the rule ran on an empty set and passed by looking at nothing), asset
  existence.
- **`tests/security-logic.mjs`** (`node:test`) — unit-tests the constant-time compare, then
  **reads the Edge-Function sources** and asserts their invariants so a future edit cannot
  silently reintroduce a fail-open guard, a URL-query secret, an unauthenticated ai-proxy, or
  an uncapped prompt/image. (No Deno runtime needed — this is the CI-friendly substitute.)
- **`tests/security.spec.js`** (Playwright) — loads the app, feeds the commission's exact XSS
  payloads through `IntMapSafe` **into the live DOM**, and asserts no script runs and no active
  `<img onerror>`/`<svg onload>`/`<script>` is created, in text **and** attribute contexts;
  checks scheme-blocking and i18n round-trip; checks the CSP meta.
- **`supabase/tests/03_security_test.sql`** (pgTAP) — the `feedback.rating` CHECK rejects the
  out-of-range DoS payload, `profiles_public` exposes no PII, public-read tables aren't
  anon-writable, `ai_usage` is RPC-only. (00/01/02 cover structure / the RLS matrix / the RPCs.)
- **`supabase/tests/05_r155_security_test.sql`** (pgTAP, #R155) — proves the profiles
  privilege-escalation is closed **grant-independently**: it RE-CREATES the production condition on
  CI (grants `authenticated` the blanket table-level `UPDATE` on `profiles`) and then asserts the
  `tg_profiles_guard_privcols` trigger still freezes `is_admin`/`is_pro`/`plan`/`email` while
  `display_name` stays editable; also asserts the least-privilege column/table grants, the no
  world-readable-profiles invariant, that monitor results are unforgeable at the grant layer, and
  the public-write length caps. (This is the case vanilla CI could not otherwise reproduce.)
- **`tests/r155-checks.test.mjs`** (`node --test`, #R155) — source regression guards over
  `index.html` + `admin.html`: passkeys wired, `delete-account` called with `confirm`, reset/
  change/logout-all present, HIBP k-anonymity sends only a 5-char prefix, GA `page_location`
  sanitized, admin CSP present + **no** public sign-up + re-auth gate, and **behavioural** XSS
  tests that `eval` the shipped `esc()`/`safeUrl()` and assert they neutralise payloads / reject
  `javascript:`+`data:` schemes. Plus UX guards (Köppen border-box, Atlas reply-language lock).

---

### Adding a case

- **New XSS sink?** Route the untrusted value through `IntMapSafe.html()` (text/attr) or
  `IntMapSafe.html(IntMapSafe.url(v,{allowData}))` (href/src/style). Add its payload/context to
  `XSS_PAYLOADS` in `tests/security.spec.js` if it exercises a new context.
- **New Edge-Function auth rule?** Add an assertion to `tests/security-logic.mjs` (unit or a
  source regression guard).
- **New RLS / constraint?** Add to `supabase/tests/03_security_test.sql` using the existing
  pgTAP helpers (`throws_ok`/`lives_ok`/`ok`/`has_*_privilege`) — see 02 for the impersonation
  pattern (`set local role` + `request.jwt.claims`). Don't rewrite 00/01/02; add cases.

---

### The commission payload set (kept in sync with `tests/security.spec.js`)

```
<script>window.__xss = true</script>
<img src=x onerror="window.__xss = true">
<svg onload="window.__xss = true">
"><img src=x onerror=window.__xss=true>
</style><script>window.__xss=true</script>
x" onmouseover="window.__xss=true          (attribute breakout)
x' onmouseover='window.__xss=true          (single-quote breakout)
javascript:alert(1) · data:text/html,… · vbscript:… · java\tscript:…   (url() must return '')
```
Each must render as inert text; and 日本語 / Zürich / Москва / España / emoji / accents /
long place names must survive `html()` unchanged.

## 企業アトラスの門 - `npm run check:companies`

`scripts/companies-audit.mjs`。**他の `check:*` が source を読むのに対し、これは出荷される
`data/companies/` のバイトを読む**——「builder は出典の無い値を落とす」はコードについての主張で、
読者が見るのはファイルだから。検査は 20 本で、番号は [`COMPANIES.md`](COMPANIES.md) §7 と同じ。

実データを作っている最中に、この門が実際に捕まえた形が 2 つある:

- **通貨も年度も持たない金額**（Wikidata には単位が通貨でない時価総額と、P585 を持たない売上がある）
- **座標 `0,0`**——「値が無い」をギニア湾の一点として書いたもの

`--report` は指示書 §14 の形のカバレッジ表を出す（`--all` で全社）。
回帰は `tests/r354-checks.test.mjs`（`test:checks` に登録済み）。
