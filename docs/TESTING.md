# Testing IntMap

> **Veuified 2026-08-20 against `aoc55b1`** — the tieu split, the file counts and the build time
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


**The tiers, measured** (`node scripts/test-budget.mjs`, 2026-08-25): the **core** tier that
gates a push is **6 spec files / 0.5 min** against a ceiling of 0.5 min; the **whole** suite is
**100 measured spec files / 77.3 min** of serial browser time against a ceiling of 77.3 min; and
`npm run test:checks` runs **283 Node test files** with no browser at all (counted from

> ⚠ **(#R505) そのうち1本は、ソースを読むのではなく Edge Function を「走らせる」。**
> `tests/r505-checks.test.mjs` ① は 13 本すべての `supabase/functions/*/index.ts` を
> **Node 24 の素の `.ts` `import()` で実際に評価する**（関数ごとに子プロセス、`Deno` だけ stub、
> 一覧はディレクトリから発見）。#R504 は `const` を、それが読む `const` の 45 行**上**に置いて
> 出荷し、**本番の全リクエストが 500 `WORKER_ERROR`** になった——それでも `check:static`・
> `npm test` 3,136 本・CI は全部緑だった。**構文を読む検査は、順序を見ない。**
`package.json`, which since #R385 may not name the same file twice — see below). The nightly
**deep** tier — **94 spec files** — is the whole suite minus core
(`node -e "import('./scripts/tiers.mjs').then(t=>console.log(t.tierSpecs('deep').length))"`).
`npm test` runs the source half and the browser
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

> ⚠ **The whole-suite ceiling has zero headroom** (77.2 min measured against 77.2 min). A new
> `.spec.js` cannot be added until the same time or more is taken out of an existing one — the
> ceiling only moves down. Node checks (`*.test.mjs`) are **not** governed by this budget, so
> logic that can be checked without a browser belongs there. ⚠ Every **count** in the paragraph above
> is now compared against the repository — `N Node test files` by `node-tests`, and the three tier
> sizes by `deep-tier-size` (#R500), which also reads `package.json` and `scripts/worktree.mjs`
> because those are not documents and `eachDoc` cannot see them. Before that rule existed the
> numbers went stale every time: by 3 spec files when #R334 looked, by **19 spec files and 10.8
> minutes** the next time, and by #R500 the four hand-kept copies of the deep-tier size held three
> different values at once. ⚠ **The MINUTES are still uncompared** — a measured duration moves on
> its own, so a rule for it would go red on a slow machine rather than on a stale document.

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
in [`../.agents/rules/execution-strategy.md`](../.agents/rules/execution-strategy.md) §4. This
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

**(#R415) …and a test that starts its own server asks the operating system, not the calendar.** The
rule above covers the ONE dev server Playwright runs; a Node check that spawns `scripts/serve.mjs`
for itself is a second question, and `tests/r208-checks.test.mjs` ⑩ answered it with `4188` (and
`4189` for its path-traversal half) — numbers picked when it was written, and therefore the same
numbers in every checkout on the machine. Measured 2026-08-24 with forty-two worktrees live: the
second session to reach it found 4188 already LISTENING, the spawn died of `EADDRINUSE`, and fifteen
seconds later the test failed with «serve.mjs did not come up» in a tree whose own code was fine.
Deriving one more port per checkout does not fix it either — `npm test` runs the source half and
the browser half at the same time, so that number is the one this run's own dev server is holding.

So a test spawns with **`--port 0`** and reads the port back:
`serve.mjs`'s ready line names the port it actually **bound**, never the one it was asked for, so
`[serve] IntMap static server on http://127.0.0.1:<port>/` is the answer. **`tests/r415-checks.test.mjs`
① is the gate**: it walks every file under `tests/` and fails on a port a test picked for itself —
`--port <n>`, `PORT=<n>` in a spawned server's environment, `.listen(<n>)`, or a loopback URL with a
literal port. There is no exemption list.

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
node scripts/mobile-trace.mjs --attribute --reps 1 # + WHO asked for each layout read
```

One continuous trace per rep — **boot → settle → pan-first → zoom-first → warm-up → pan-warm →
zoom-warm → zoom-back → pan-touch → pinch-touch → weather-on → pan-weather → alerts-on → pan-alerts
→ zoom-alerts-city → pan-alerts-city** — with main-thread SELF
time in eight buckets: `placement` (`Style._updatePlacement`), `render` (`Painter.render`),
`mapRender` (`Map._render`), `texUpload`, `bufUpload`, `decode`, `workerPost`, `workerRecv`.

⚠ **`--cpu` defaults to 1 here, and that is not an oversight.** CPU throttling is CDP, and CDP does
not exist in WebKit; throttling one arm and not the other would compare two different machines. The
historical ×4 Chromium numbers stay where they were measured. **A number from this script is an
engine comparison on desktop silicon, not a phone number.**

⚠ **`pan-touch` / `pinch-touch` / `pan-alerts-city` are driven by a REAL FINGER, and the rest are
not.** Every other phase moves the camera through `IntMapGeoEngine.camera` — the right answer for a
synthesised MOUSE, whose events never reach MapLibre's handlers — and a camera command produces no
`touchstart`, no `touchmove` and no pinch recognition. So until these phases existed, the app's own
touch handlers had never once been invoked by any instrument in this repository, and neither had
MapLibre's; two hot paths on the input route contributed exactly zero to every mobile number here.
These three send `Input.dispatchTouchEvent` (trusted touch, viewport coordinates taken from the
canvas's own box) and report two numbers the other phases cannot produce:

| column | what it is |
|---|---|
| `rect/move`, `style/move` | `getBoundingClientRect` / `getComputedStyle` calls **per touchmove**. `fps` cannot tell a forced synchronous layout from any other millisecond; this can. The budget is "≈ 0 on the input path" |
| `lat p50 / p95 / max` | touchmove → the frame that answers it, in ms. 「指に付いてこない」 stated as a measurement |

⚠ **A COUNT WITHOUT A CALLER IS A NUMBER NOBODY CAN ACT ON — `--attribute`.** `rect/move` did its
job (9.59 → 7.47 when the app stopped measuring the canvas per touchmove), but the wrapper counts
CALLS, not CALLERS, so the remainder had to be attributed by reading somebody's source and believing
the reading. `--attribute` captures the first three page frames of every rect/style call in a touch
phase and prints a **WHO ASKED** table under the REAL TOUCH one:

```
WHO ASKED · chromium rep1 pan-alerts-city   (top 7 sites of 6224 calls)
      3045  rect   /assets/main-*.js:291:106702  ← …:291:106596  ← …:291:181435
      3045  rect   /assets/main-*.js:291:106702  ← …:291:106596  ← …:318:6500
       108  rect   /assets/maplibre-gl-*.js:5:356609  ← …
```

Against a production build the frames are `file:line:column` of the minified bundle, so the RANKING
is what transfers; the source is identified by slicing the bundle at that column. ⚠ **Off by default
and it has to stay off**: `new Error().stack` per call costs far more than the call it measures, so
an `--attribute` run's `lat` / `busy` / `fps` are the instrument's numbers. Only the counts transfer,
and the printout says so.

⚠ **CHROMIUM ONLY.** CDP does not exist in Playwright's WebKit, so those phases are ABSENT from the
WebKit arm and reported as absent — never as a cost of zero. `pan-alerts-city` falls back to a
camera-driven pan there and says so in its `note`.
⚠ **`zoom-alerts-city` + `pan-alerts-city` exist because a whole-world pan is not the reported
gesture.** The wide `pan-alerts` is kept unchanged beside them so the two are comparable.

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
`src/sat-worker.js` does, and everything MapLibre's own workers do, is invisible; what is measured is the main thread's
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
tier: `npm run test:deep`, **94 spec files** against core's 6, because #R204/#R207 turned the split
from a hand-kept list into a **price** (`scripts/tiers.mjs`, `CORE_MAX_S = 1`): a spec may stand in
front of a push only if it costs at most one second, so nearly every per-round regression file is
deep. Nothing is deleted by being deep — every assertion still runs.

**Where it runs.** `.github/workflows/ci.yml` runs it on the `schedule` (`0 18 * * *` = 03:00 JST)
and on `workflow_dispatch`, deliberately **not** on `push`, and **not** on `pull_request` — #R207
measured that attaching it to a merge cost ten minutes a merge. Locally, `npm run test:deep`.

> ⚠ **So the merge does not catch a deep regression, and this paragraph is the 正本 that says so.**
> Since #R407 `scripts/doc-facts.mjs` (`deep-tier-when`) reads the trigger set off the `if:` on
> ci.yml's `browser-deep` job and requires this sentence to answer for **every** event the workflow
> fires on. Change the gate and this goes red until the sentence is rewritten. It also sweeps the
> tree for prose that says otherwise: at #R407 **ten files carried thirteen such claims**, including
> the line `scripts/run-tests.mjs` prints on every `npm test`, and the post-merge run for `7d2e21e`
> (2026-08-24) skipped both deep jobs while they said it did not. Run `npm run test:deep` yourself
> before a PR that touches 3-D, Cesium, the simulators or the physics — nothing between your push
> and tomorrow morning will.

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
| `node scripts/worktree.mjs status` | prints last night's verdict — which AGENTS.md §1 puts in front of every session before any work starts. The `--brief` form (the SessionStart hook) shouts only when it is not green; the full form always answers, including 「不明」 when `gh` could not be asked, so silence is never read as a pass. |

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
  tier down for that).
  ⚠ **Since #R390 what counts as a test file is read from the SOURCE, not from the name.** The rule
  was `/\.test\.mjs$/` and nothing else, so the one file of tests here that predates the convention
  — `tests/security-logic.mjs`, 31 tests hand-named in #R138 — was outside anything the guard could
  demand. Measured: `ed058ca` (#R377) dropped it from the literal as collateral, it was still absent
  through #R379, and `82b7a0e` (#R380) put it back while doing something else. For those rounds the
  31 tests did not run and **every gate in the repository was green**, this one included. A `.mjs`
  under `tests/` that imports **`node:test`** declares tests whatever it is called and must be
  listed; the name rule is kept alongside it, so a `*.test.mjs` that has not written its first
  `test(…)` yet is still demanded. Fixtures, corpora and the shared helpers import nothing of the
  kind and are still not demanded.
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

## The agent context — `npm run check:agents` (`scripts/agent-sync.mjs`, #R503)

Two products read this repository, and each reads only its own location: Claude Code reads
`CLAUDE.md` and `.claude/`, Codex reads `AGENTS.md` and `.codex/`. The instructions are written
**once**, provider-neutral, under `.agents/` (`rules/`, `roles/`, `skills/`), and the per-product
files are **rendered** from them by `node scripts/agent-sync.mjs --write`. This gate re-renders
into memory and compares. It reports four things:

| name | what it asserts |
|---|---|
| `doc-size` | `AGENTS.md` is under **32,768 bytes** and prints the margin |
| `claude-import` | `CLAUDE.md` carries a **bare** `@AGENTS.md` line, plus one per `.agents/rules/*.md` |
| `render` | every rendered file equals what `.agents/` renders to |
| `stray` | no rendered file survives its source being deleted |

⚠ **`doc-size` is not a style preference.** `project_doc_max_bytes` defaults to 32,768 and Codex
**drops the overflow without a warning**. MEASURED #R503 with codex-cli 0.150.0: a 36,095-byte
`AGENTS.md` answered a question about its first row and reported its last row absent. Nothing is
printed to any log. `.codex/config.toml` raises the limit, but that layer loads only in a
**trusted** project and trust is per path — so the number always in force is the default.

⚠ **`claude-import` looks for a needle outside code spans**, because Claude Code skips imports
inside backticks and fences. A backticked `` `@AGENTS.md` `` is exactly the spelling that does not
load, and losing the import costs a session every standing rule with no error anywhere.

The wiring between the two products, and the four steps that stayed manual, are in
[`AGENT-SETUP.md`](AGENT-SETUP.md).

## 文書の検査 — `npm run check:docs` の規則一覧 (`scripts/doc-facts.mjs`)

Every rule this gate applies, by the name it reports itself under. `Architecture.md` §15.5 sends the
reader here for this list; adding a rule means adding a row.

| rule | it fails when |
|---|---|
| `scan` | the sweep did not reach the tree, or missed a document it is required to read |
| `app-size` | `Architecture.md` §1's file counts disagree with `index.html` / `js/` / `src/` / `css/` |
| `edge-functions` | `supabase/functions/` and `supabase/config.toml` disagree, or a roster document drops a name |
| `edge-count` | any document states an inventory size that is not the real one |
| `edge-roster` | a document writes the roster out and omits a function, or introduces it with a wrong count |
| `edge-shared` | a document enumerates `_shared/` and the list is not what is in the directory |
| `migrations` | a stated migration count is wrong, or a named `.sql` file does not exist (`sql-path`) |
| `serving` | a document still says the site is served from the repository tree or from OneDrive |
| `deploy` | a document still describes the gated Pages deploy as switched off, or `docs/RELEASE.md` stops saying it is on |
| `build-info` | the published build stamp is spelled with a leading hyphen |
| `usb` | a document other than `AGENTS.md` states the backup frequency |
| `languages` | `js/locales/`, `_langs.js`, `Architecture.md` and the README disagree about the languages |
| `alerts` | the warning-feed counts in `docs/MAP-LAYERS.md` / README disagree with `js/world-packs.js` |
| `app-shape` | a document still describes the app as one hand-written file with no build step |
| `anon-key` | a document puts the browser-side Supabase key in the entry page instead of `src/vendor.js` |
| `arch-rounds` | `Architecture.md` carries a round reference — the history belongs in `DEV-NOTES.md` |
| `cesium` | a document describes the second engine as withdrawn while it ships |
| `monitors` | a document presents the withdrawn Area Monitors entry point as still clickable |
| `news-path` | the privacy policy describes a news path the switches in `js/app-body.js` do not take |
| `csp` | the CSP as `index.html` writes it is not the CSP the documents describe |
| `db-tables` | the migrations, the pgTAP structure test and the documents disagree about the tables |
| `node-tests` | a stated size of the node tier is not what `test:checks` runs |
| `legal` | the policy text has more than one copy, or a page stops loading it |
| `doc-index` | a prose document is missing from `docs/README.md` |
| `i18n-open-gap` | `Architecture.md` §10.1's open-gap numbers disagree with `scripts/i18n-pair-audit.mjs` |
| `named-path` | a document tells the reader to open a file that is not in the tree |
| `gate-lists` | an instruction document enumerating the gates does not name every `check:*` |
| `preview-port` | a document's preview-port convention disagrees with `scripts/worktree.mjs` |
| `backup-shell` | a document launches the USB backup with a shell other than the one `AGENTS.md` §11.2 uses |
| `relay-guard` | a stated count of the functions sharing `_shared/relay-guard.js` is not the real one |
| `ci-gates` | `npm test` runs a source-side gate that no `ci.yml` step reaches |
| `deep-tier-when` | a document describes the nightly as running on a trigger the workflow's own `if:` does not name |
| `hist-cities` | the bundled historical-city record and the stated counts disagree |
| `volcano-eruptions` | a stated size of the bundled eruption record is not the real one |
| `capability-count` | a document states a size for the Atlas capability registry that is not what `js/atlas-capabilities.js` holds |
| `prompt-count` | `Architecture.md`'s system-prompt total or per-file breakdown disagrees with `EXPECTED_CALLS` in `tests/r285-checks.test.mjs` |
| `deep-tier-size` | a stated size of a test tier — in a document, in `package.json` or in `scripts/worktree.mjs` — is not what `scripts/tiers.mjs` derives |
| `shrink-policy` | one of the three standing documents states the removal policy without the confirmation step, without forbidding it unilaterally, or without sending the reader to the 正本 for the Atlas carve-out |

The last six of the #R403 batch are described below, after the Edge Function rules they grew out of.
The final three arrived in #R500; `tests/r500-checks.test.mjs` is what proves they actually go red,
and — as with `deep-tier-when` (#R407) — that test file is the only path by which they reach CI,
because the static job does not run `check:docs`.

⚠ **Three rows were missing from this table before #R500** (`deep-tier-when`, `hist-cities`,
`volcano-eruptions`), even though the sentence above says adding a rule means adding a row. Nothing
compares the table with the rules it describes, so the list of what is checked was itself unchecked.

⚠ **The right-hand column paraphrases on purpose — do not quote a needle into it.** Several of these
rules are of the form *no document says X*, and this table is in a document they sweep. Writing the
row as the sentence it forbids makes the gate report this file. Measured while adding the table: two
rows did exactly that on the first attempt, and two more escaped only on a technicality (one needle
is case-sensitive, another wanted a shorter phrase). This has now happened thirteen times in this
repository; `scripts/doc-facts.mjs`'s own header assembles its needles from parts for the same reason.

## The Edge Function inventory, across every document (`scripts/doc-facts.mjs`)

Four rules hold the same fact from different sides. `edge-functions` compares
`supabase/functions/` with the `[functions.*]` declarations in `supabase/config.toml`, and requires
`AGENTS.md` and `Architecture.md` to name every one of them in backticks. `edge-count` checks every
**stated size** of that inventory. `edge-roster` checks every document that **writes the list out**.
`edge-shared` checks every **enumeration of `_shared/`**, which is a library directory rather than a
function and so is invisible to the other three.

⚠ Until #R399 the count half read **two hand-written filenames and one sentence each**, and six
documents drifted underneath it without a single red run. Worth keeping in mind when writing any
rule of this shape:

- **A hand-written list of documents to scan is the defect.** `docs/FILES.md` was never added to it,
  so the ledger's numbers were free to rot; `SECURITY.md` and `SECURITY-ARCHITECTURE.md` were never
  looked at at all. The sweep now visits every current-state document and the only filename left in
  the source is `Architecture.md`, named to demand **more**: §6.2 is the 正本 for this number, so if
  it stops stating one, that is a failure rather than a quiet skip.
- **A needle that never fires looks exactly like a passing check.** The old pattern required a
  literal asterisk between the noun and the digits. The standing instructions bold the whole phrase
  — asterisks *before* the noun — so their number was never once compared with the tree. It stayed
  right for another reason entirely: the per-name roster check.
- **`.match()` answers for a whole file with its first hit.** A document whose first mention is
  correct can carry a second, stale one forever. That is exactly what happened in the deploy runbook,
  directly above a command list that already ran the right number.

What it deliberately does not read: a bare noun-then-number with no particle between them. In
Japanese that construction means *one of them does this*, not *there is one*, and `の` / `が` are
excluded for the mirror-image reason — they read as partitive. A future document that phrases the
total that way goes unchecked here; the per-name roster is what still holds it. `tests/r399-checks`
proves each half goes red, including that the `6.2` in a section heading is read as an address and
not as a quantity.

## When the deep tier runs, against the gate that decides it (`scripts/doc-facts.mjs`)

`deep-tier-when` reads the trigger set off the `if:` on ci.yml's `browser-deep` job — no copy of it
lives anywhere else — and holds the prose to it from two sides.

| arm | what it does | why that side |
|---|---|---|
| **A** (negative) | sweeps every tracked file that mentions the nightly and fails on any that joins it straight to a push/merge trigger the gate does not have | the file list comes from `git grep`, because a hand-kept list of documents to scan is the defect itself (#R399) |
| **B** (positive) | requires the «Where it runs» paragraph above to answer for **every** event the workflow fires on — naming one it runs on, or negating one it does not | hand-name only the 正本, and put it on the side that goes **red when the sentence is absent** (#R399) |

Arm A is a needle and needles are incomplete: prose that puts a whole clause between the nightly and
the claim slips past it. Arm B is the half that cannot be phrased around, because it reads the gate
and demands an answer — that is why both exist. **Arm A is not line-based**: it strips comment
furniture and collapses each file to a single line before matching, because wrapped prose puts the
claim across two lines. That is not hypothetical — the hand-grep that opened #R407 missed
`tests/r337.spec.js` outright (`…run nightly and after` / `every merge…`), and the rule's very first
run found it.

`tests/r407-checks` proves each half goes red, by mutation: four prose sites reverted to the stale
wording (one of them wrapped), the gate itself gaining `push` and losing `schedule`, the 正本 going
silent **three** ways, and a sweep whose needle matches nothing — which must **fail**, because an
empty sweep otherwise passes everything.

⚠ The third silence is the one that caught a real bug in the rule while it was being written. The
first version took `.indexOf` of the anchor; when the test blanked the real paragraph, the rule
quietly latched onto a **second copy** further down this file and reported something else. A 正本
with two copies is not a 正本, so a duplicated anchor is now a failure of its own — the same
«answers for the file with its first hit» defect #R399 found in `.match()`.

### `--rule=<name>`, and why it exists

`node scripts/doc-facts.mjs --rule=deep-tier-when` narrows the report to one rule and skips any rule
that shells out for its facts. It is a **test affordance, never a narrower gate** — `npm run
check:docs` passes no `--rule`.

Mutation tests run this script once per mutation *while holding the tree lock*
(`tests/helpers/gate-lock.mjs`). MEASURED #R407: a full run is **11.0 s**, of which
`scripts/i18n-pair-audit.mjs` as a subprocess is **10.0 s** and every other rule together is under
one second. The first draft of `tests/r407-checks` did fifteen full runs, held the lock for over two
minutes, and **timed out `tests/r399-checks` and `tests/r274-checks` at their 180 s limit** — a new
round's test file made two older ones fail without touching them. With `--rule` the same mutation
costs ~1.3 s and the whole file is ~18 s.

⚠ A `--rule` name that matches nothing **exits 2**, because a typo would otherwise exit 0 and let
every mutation above prove nothing. `tests/r407-checks` ⑥ asserts that, for the same reason the
rest of the file exists.

### Tests that break the tree on purpose, and the lock they share (`tests/helpers/gate-lock.mjs`)

Four files prove a gate really fails by making a fact wrong on disk, running the gate, and putting
it back: `tests/r274`, `tests/r280`, `tests/r399`, `tests/r403`. `node --test` runs files in
parallel, so they share one lock — a directory, because `mkdir` is atomic. Two rules about using it,
both of which #R403 got wrong first and measured:

- **Take it per mutation, not per test.** Holds are serialised across every file in the suite, so a
  hold spanning a whole test blocks three other files for its whole length — measured at 82 s for
  one test and 264 s for one file.
- **The deadline is a backstop against a wedged suite, not a performance budget.** It decides only
  how long a waiter tries before declaring the suite broken, so it has to exceed everything every
  other holder can legitimately want: under `npm test` — 200-odd files competing for CPU, each gate
  run costing multiples of its ~6 s solo time — that is minutes, not the 180 s it used to be.

⚠⚠ **The lock is named after the checkout, and must stay that way.** It used to live at
`<checkout>/node_modules/.intmap-tree-lock`, on the reasonable-sounding grounds that `node_modules`
is gitignored — but `scripts/worktree.mjs` gives every worktree its `node_modules` as a **junction
to the master copy's**, so that path resolved to *one directory shared by every checkout on the
machine*, and this repository runs many sessions at once by design (`AGENTS.md` §6). The damage is
not queueing: a waiter in another worktree runs whatever version of the helper *its branch* has, and
an older one decides a lock held past its staleness timeout is dead and **deletes it — while a live
process in a different checkout is holding it**. The holder never learns, the next acquirer in the
holder's own worktree walks in, and two processes mutate that tree at once. Measured during #R403,
with three other worktrees running suites concurrently: `Architecture.md` carried another test's
probe while this file's tests held the lock, and results on one unchanged tree moved 12 → 8 → 4 →
**0** → 8 → 10 across runs. ⚠ A single green run is not evidence against an intermittent red.

⚠ **A local full-suite run is not a trustworthy instrument while other sessions are working.** Under
that contention it measures the machine, not the change — `tests/r274 ③` was measured anywhere from
21 s to 380 s on one tree. Run the affected files together for a decisive local answer, and let CI,
which is isolated, measure the whole gate.

Two further defects in the lock surfaced when #R403 made acquisitions many and short. Both had been
there all along; neither was reachable while holds were few and long:

- **Liveness has to be the pid, not the clock.** The helper used to reclaim any lock whose mtime was
  older than a timeout. Under load a legitimate holder exceeds any such timeout — measured,
  `tests/r399 ①` held it for 208 s — and the waiter then deletes a *live* holder's lock and starts
  writing the same files. That is exactly the two-writers-at-once the lock exists to prevent, and it
  surfaces as "the restore left the tree failing" in whichever file is unlucky, which reads exactly
  like a real regression. A heartbeat would not fix it: the callbacks run gates through
  `execFileSync`, so the event loop is blocked for the whole hold and no timer would fire. Asking
  the OS whether the holder still exists has neither problem, and never reclaims a live lock.
- **On Windows the acquire race returns `EPERM`, not `EEXIST`.** A `mkdir` issued while another
  process is removing that same directory hits it in a pending-delete state. The helper rethrew
  anything that was not `EEXIST`, so an ordinary race killed the test outright — measured as seven
  tests dying in milliseconds with `EPERM … mkdir`. A failure to take the lock is a failure to take
  the lock, whatever errno the platform picks for it.

⚠ **Check a restore by comparing bytes, not by running the gate again.** The byte comparison says
what "restored" means — this file, these bytes — while a green gate only says no rule noticed, and
it costs another gate run inside the lock. Cheaper and stricter at once.

⚠ **Do not kill a suite mid-mutation.** The restore lives in a `finally`; killing the process skips
it and leaves the tree broken. Measured: an interrupted run left `tests/r280`'s CSP probe in
`Architecture.md`, and the next `check:docs` failed on `csp` for a reason that had nothing to do
with the change being made.

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
which runs against the deployed URL from `deploy.yml` (after every deploy) and from
`rollback.yml` (after a rollback). It tolerates transient upstream failures via retries and the
same benign-error classification.

> ⚠ (#R382) It does **not** run on the uptime schedule, which this paragraph used to claim.
> `uptime.yml` is a single HTTP probe for the app shell; it has never invoked playwright. So the
> deployed site is checked by this suite **on a deploy and at no other time** — a red post-deploy
> smoke therefore blocks the next round rather than being noticed by a monitor first.

### `prod-smoke` does not cascade its skips (#R458)

`tests/prod-smoke.spec.js` is **not** `mode: 'serial'`, and that is deliberate. Serial mode does not
protect this file from a dead production site — `beforeAll` does, because it performs the navigation
and the boot wait and **throws**, which fails every test in the file with the real reason. What
serial mode did do was discard every verdict below the first red one: on run 32818517323 a single
assertion failed and the forecast axis, both #R398 checks and #R333's CORS contract reported
「did not run」, so that deploy shipped with four of its checks unasked.

Measured with a four-test probe under this config's `retries: 3` — `mode: 'serial'` re-ran the
tests *before* the failing one on all four attempts and never reached the ones after it; the default
runs only the failing test again and then continues. Tests in a file still run **in order, in one
worker** (`fullyParallel` is not set in `playwright.prod.config.js`), so the shared page and the
written order are unchanged.

### A claim the model hour cannot always carry (#R458)

The cyclone test asks three things of the two pixels it reads. Two are about one pixel each and are
always answerable. The third compares them — 「the eyewall pixel reads as faster than anything under
the eye, and the eye's as calmer than anything under the eyewall」 — and that one depends on the
**geometry of the storm at that hour**: each pixel legitimately stands for any speed inside the
±1.5 px patch under it (#R287), so when the two patches overlap as speed intervals, one colour is a
legal reading of both points and the comparison stops being a statement about the map.

So the pair of points is **chosen**: the storm finder's own two points whenever they separate,
otherwise the calmest and the strongest point on the same screen, ranked by the footprint bound the
claim itself names. If no pair separates, the test **prints why in m/s and withholds only that
third claim** — it is not a `test.skip`, and the two per-pixel verdicts still run. The decision is
`separablePair()` in `tests/helpers/wind-ramp.js`, and `tests/r458-checks.test.mjs` puts it through
the overlap the deployed page cannot be made to reproduce on demand.

### The point the cyclone test calls "the eye" (#R460)

`prod-smoke` proves the weather raster is real by finding a storm in the live field and reading two
pixels: the eye and its wall. Since #R276 it swept the tropics for the strongest wind and then took
**the first point** of a ±1.5° box around it that was at or below 0.6 × peak, walking from the
south-west corner. A median 48 % of that box is below that line — up to 93 % — so the first hit is
the corner the walk starts at: MEASURED over the 145 forecast hours production was serving on
2026-08-25, that is exactly what came back in **94 of the 101 hours** that had an eye, a median
**222 km** from the storm, in a median **15.45 m/s** of ordinary trade wind.

The choice now lives in `tests/helpers/cyclone-eye.js`, which the page feeds a 31 × 31 lattice of
speeds and which answers with the calm point the strong wind encloses most deeply:

```
wall(p)       = the lowest, over all walks from p out of the box, of the highest speed on the walk
prominence(p) = wall(p) - speed(p)          — the eye is the calm point that maximises it
```

That is topographic prominence upside down. It adds **no constant**: "calm" is still #R276's
0.6 × peak, and `prominence > 0` is not a threshold but the difference between being inside a ring
and not — a point on the edge of the box can be left without the wind rising at all, which is
what the old answer always was. MEASURED with the same 145 hours, it lands a median **45 km** from
the peak at a median **5.24 m/s**, and #R276's gate answers identically in every one of them.

⚠ **Neither obvious repair works, and only measuring says so.** The minimum of the box agrees in 70
of 101 hours and is a whole storm wrong in the rest — after landfall the calmest air in the box is
inland behind the terrain, 223 km away at 2026-08-27T23:00Z. "The nearest calm point to the peak"
sits 30 km away but at a median 16.52 m/s, which is the inner edge of the eyewall.

`tests/r460-checks.test.mjs` runs that decision over two recorded production lattices
(`tests/fixtures/r460-cyclone-boxes.json`) plus the fields the live page cannot be made to show —
a ring with a gap, a band with no ring at all, a hole in the field. Replacing the rule with the box
minimum turns 6 of its 9 checks red.

### 「visibly different colours」 is a claim about a reader, so it is measured in the reader's unit (#R487)

The cyclone test ends with a fourth claim, after the three above: the eye and its wall must not
only *be* different, a reader must be able to **see** that they are. Since #R276 that was asked of
the squared Euclidean distance between two sRGB triples, bounded at 30 units.

sRGB is a storage encoding, and distance in it does not order how different two colours look.
MEASURED on the shipped wind table (`js/wx-ecmwf.js`, resampled to 1,041 entries):

```
 4.7 m/s [77,143,131] vs 27.6 m/s [76,117,145]   RGB 29.5 → 「the same colour」   ΔE00 20.56
 9.0 m/s [53,160,53]  vs  9.6 m/s [83,162,54]    RGB 30.1 → 「far apart」         ΔE00  3.17
```

— the same order, backwards, by a factor of six and a half. It cost a deploy: run 33096001326
read the eye at `[75,145,155]` over 2.15…7.20 m/s and its wall at `[76,117,145]` over
26.20…27.86 m/s — **19.00 m/s apart**, every other assertion in the test green — and went red at
885 of the 900 it wanted. That pair is **ΔE00 14.22**. The map was right; the ruler was not.

This is the third time the same test has recorded this defect: #R276 追記 (「red − blue is not
monotone along this ramp」), #R382 (「distance-to-an-entry does not order speeds」), and this. Each
time the repair was to stop inventing the quantity and read it out of the thing the claim is about
— the field, in those two, and the **observer**, here. The claim is now CIEDE2000
(`tests/helpers/colour-difference.js`), and `tests/r382-checks.test.mjs` — which carried a second
copy of the same line — asks it the same way.

⚠ **The bound does not come from the ramp, on purpose.** 「further apart than the table's own finest
step」 is tempting because it writes no constant down, and it is worthless: reduce the ramp's
contrast and the step shrinks with it, so the bound follows the defect down and an unreadable map
clears it. `tests/r487-checks.test.mjs` ⑤ builds exactly that map and watches the derived bound pass
it. The threshold is the observer's instead — ΔE00 is scaled so **1.0 is one just-noticeable
difference**, and above **2** is the band visible *at a glance*, which is how a map is read.

⚠ **A hand-written ΔE00 would be another invented quantity**, so ① of the same file puts the
implementation through the reference pairs CIE 142 / Sharma et al. publish — the data exists because
the three easy mistakes (the a* rescaling, the mean hue across the 0° wrap, the sign of the rotation
term) all yield a function that looks right on ordinary colours and is wrong on the deciding ones.

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
