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

`tests/r710-historical-identity-checks.test.mjs` executes the historical resolver with and without
translations, with two different present-day countries beneath one historical territory, with QID
translations and CShapes identifiers, and with the former-state registry. It also derives every
distinct name from the shipped era snapshots and verifies that a missing translation cannot replace
that identity with the present-day statistical carrier. This census is a regression test population,
not a count of production failures.

`tests/r710-boundary-precision-checks.test.mjs` checks geometry-only refinement, preservation of
feature identity and corrected shapes, and the precision metadata. The source simplification target
is separate from historical survey accuracy. Refinement must preserve polygon components and holes;
adding interpolated vertices is not evidence of greater accuracy.

Memory lifecycle regressions execute the actual function bodies with controlled resource owners:
`tests/r708-legend-clock-lifecycle-checks.test.mjs` keeps the entire clock range reachable with constant DOM
and one subscription across legend rebuilds;
`tests/r708-playground-lifecycle-checks.test.mjs` exercises every answer-map closing path;
`tests/r708-dem-lifecycle-checks.test.mjs` checks independent terrain caches, late requests and view teardown;
`tests/r708-koppen-lifecycle-checks.test.mjs` checks obsolete image/bitmap completion, immediate canvas release,
and unchanged resolution and image fallback. These count released resources; they do not claim device RSS savings.


**The tiers, measured** (`node scripts/test-budget.mjs`, 2026-08-25): the **core** tier that
gates a push is **7 spec files / 0.5 min** against a ceiling of 0.6 min; the **whole** suite is
**115 measured spec files / 81.4 min** of serial browser time against a ceiling of 81.4 min; and
`npm run test:checks` runs every `tests/**/*.test.mjs` with no browser at all, which
`npm run test:checks` runs **296 Node test files** with no browser at all (counted from

> ⚠ **(#R505) そのうち1本は、ソースを読むのではなく Edge Function を「走らせる」。**
> `tests/r505-checks.test.mjs` ① は 13 本すべての `supabase/functions/*/index.ts` を
> **Node 24 の素の `.ts` `import()` で実際に評価する**（関数ごとに子プロセス、`Deno` だけ stub、
> 一覧はディレクトリから発見）。#R504 は `const` を、それが読む `const` の 45 行**上**に置いて
> 出荷し、**本番の全リクエストが 500 `WORKER_ERROR`** になった——それでも `check:static`・
> `npm test` 3,136 本・CI は全部緑だった。**構文を読む検査は、順序を見ない。**

> ⚠ **(#R520) もう1本、ソースを読むかわりに「取り出して走らせる」検査がある。**
> `tests/r520-checks.test.mjs` は出荷される `js/time-borders.js`（module ではなく IIFE）から
> `_labelFC` とその補助関数を**文字列のまま `vm` に取り出して評価し**、同梱の `data/cshapes.js` から
> 組み立てた本物のスナップショットに当てる。主張は「1国につきラベル1個」「1国も落ちない」
> 「全アンカーが自国の陸の上（**検査側に独立に書いた point-in-polygon で**訊く）」。
> 直前まで `imtb-lbl` / `imtb-lbl2` は国境ポリゴンから描かれていて**外環1つにつき1ラベル**
> （1900 年で 151 か国＝1,583 環）だったが、`tests/r309`（宣言の突き合わせ）も `tests/r410`
> （描かれた文字）も緑だった——**どちらも真だった。同じ文字を40回描くレイヤーについて。**
> 数を数えるものがどこにも無かった。
`node --test` discovers for itself — there is no list of them to keep (#R529). The nightly
**deep** tier — **108 spec files** — is the whole suite minus core
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
> is now compared against the repository — the three tier
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

- **Node.js ≥ 24** — the version `.nvmrc` pins, CI installs and `package.json`'s `engines`
  declares. ⚠ The floor was `>=20` until #R529, when `test:checks` became
  `node --test "tests/**/*.test.mjs"`: **Node 20 searches directories and does not accept a
  glob** (Node ≥21 does), so the declared floor had to become a version the command runs on.
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

### Gating: the global surface — `npm run check:surface` (#R795)

**What it replaced.** From #R168 to #R795 `tests/r168-checks` #8 held `lines < N` over the app shell
(index.html + src/main.js + src/vendor.js + js/app-body.js + js/geo-engine.js + js/lazy-modules.js),
and twenty more tests held one — copies for the shell (r350, r479), for js/atlas-console.js (4,908 /
4,910 / 5,300 in nine files), js/app-body.js (4,400 in two), js/widgets.js (130) and the seven
index.html stages of #R162–#R169 (33,500 down to 6,200). Measured on the day they were retired: shell 8,049 / 8,050, atlas-console
4,906 / 4,908 — one and two lines of headroom, and eleven `import` lines in src/main.js carrying two
to five modules each "for the shell budget". A count of lines could not tell a feature that moved out
from a line joined to its neighbour, so it had stopped measuring what it was for.

**What it measures instead.** How much of the program reaches through one shared object:

- the members of `IM_HOST` in js/app-body.js (getter, setter, and any later `IM_HOST.x =`), and
  which of them are writable;
- every `window.NAME =` a js/ or src/ file performs (comments and strings blanked first).

Both are held as **names** in `tests/global-surface-baseline.json` and ratcheted both ways, like
`check:perf`: a name that appears fails until it is accepted with `--update` (and named in
DEV-NOTES — that is the review of a new coupling); a name that is gone fails too, so the baseline
keeps asserting what it says (#R194). The diff it prints is the member, not the count.

```bash
npm run check:surface                       # compare with the baseline
node scripts/global-surface.mjs             # report
node scripts/global-surface.mjs --update    # accept the tree as the new baseline
```

**Companions retired to properties in the same round.** `tests/r175-checks` ③ no longer forbids an
unexported top-level declaration in js/ — `scripts/check-split-scope.mjs` measures the hazard that
rule stood for (a free identifier that resolves to nothing), and `scripts/export-readers.mjs` measures
"every export has a reader" with readers in js/, src/, scripts/ and tests/. `tests/r168-checks` #1–#3
read the shell with a parser: each factory instantiated once after the map exists, each shim a hoisted
declaration that forwards `this` and every argument, and nothing evaluated before a factory touching a
name it provides.

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

### Every layer under the same finger: `scripts/layer-sweep.mjs` · `scripts/view-matrix.mjs` (#R512)

`mobile-trace.mjs` measures the two layers a report named. These two borrow its harness — boot,
context, replay cache, the CDP finger, the snapshot arithmetic are **imported, not copied**, so a
busy millisecond here is the same millisecond there — and ask a wider question.

```bash
node scripts/layer-sweep.mjs --cpu 4 --record            # every box in #layer-dropdown, one at a time
node scripts/layer-sweep.mjs --only wp-dl-alerts,dl-planes,beta-dl-* --idle 5000
node scripts/layer-sweep.mjs --with wp-dl-alerts        # the marginal cost of each layer ON TOP of alerts
node scripts/view-matrix.mjs --cpu 4 --reps 2 --record  # vector/satellite × flat/globe + the antimeridian cell
```

**`layer-sweep`** walks `#layer-dropdown input[type=checkbox]` — the one registry every reader of
the layer list uses (Atlas, favourites, session tabs) — so a layer added next round is swept next
run. ⚠ Not `input[id^="dl-"]`: that spelling keeps 44 of the 163. Each row is **flip → idle window →
finger pan + pinch → flip back → post window**, and it reports three things the finger alone cannot:

| column | what it is |
|---|---|
| `Δbusy`, `fps`, `worst`, `placemt`/`render`/`decode` | the gesture with the box flipped, against the most recent baseline. A `+` row was switched ON (Δ = what it adds); a `−` row is ON by default and was switched OFF (Δ < 0 = what the default map pays for it) |
| `idle f/s`, `sd/s`, `setD/s` | fetch **attempts**, `styledata` events, `GeoJSONSource.setData` calls per second **while nobody touches the map**. A layer that keeps the style busy at rest is the #R499 shape — a retry loop that turns at microtask speed when a feed does not answer — and it is caught by a counter, not by a thumb |
| `after-off` | the same counters after the box is unchecked. A layer still fetching or mutating the style after OFF is a leak |
| `unpainted` | the box is checked but `__imLayerPainted` says nothing reached the renderer (#R353's rule: the box is the app's opinion) |

⚠ **The baseline drifts, so it is a median of three and is taken again every `--rebase` rows** (12):
on the smoke run a single baseline read 6,962 ms and the third row 2,867 ms with *less* on, because the
default map was still decoding while the baseline was taken. Every row records `baselineAt`. The
floor — every app layer hidden through the engine, basemap and UI only — is measured **last**, in the
warmest browser of the run, beside one more baseline. ⚠ Boxes are driven by `checked` + `change`,
which is exactly what `IntMapOS.exec('layer.on')` does; never `el.click()` (the dropdown cancels it in
the capture phase) and not through the command either (measured: a 3 s poll per flip that fell through
to the same `change` anyway).

**`view-matrix`** puts the identical finger on four maps — `{vector, satellite} × {flat, globe}` —
switched through the app's own commands, and on a fifth that is a known renderer defect:
maplibre-gl-js#7672 (globe, pitch ≳ 40°, zoom > 5, looking across the date line collapses to
single-digit fps in a bare map). Satellite-only fast → symbol placement; flat-only fast → the globe
renderer; both slow → pixel fill / UI composite / the touch path; the fifth cell alone slow → the
renderer, and the answer is a version, not an optimisation.

Both are Chromium-only (the finger is CDP), both print **a ranking on desktop silicon, not a phone
number**, and both need `--record` on a checkout whose `.frame-cache/` has not seen the layers'
bytes yet — a blocked miss measures a layer without its data.

**`scripts/phase-profile.mjs`** answers the question the buckets leave open — *which functions* make
up `other`. Same boot, the layers named by `--with` switched on, the camera taken to `--zoom`, and the
CDP sampling profiler run across one small finger pan (or, with `--rest <ms>`, across that many
milliseconds of nobody touching the map). Self time by file and by function, with the bundle
offset. ⚠ Against a minified build every name is one letter: build once with
`npx vite build --minify false --outDir dist-dev` and pass `--dist dist-dev`.

⚠ **An A/B arm has to be asked whether it is drawing the same thing before it is asked how fast.**
The first MapLibre 6.7 arm reported 60 fps in every phase and half the busy time — and had drawn no
tile at all: the 6.x worker is loaded as a real URL beside the bundle, Vite does not emit it, the
request 404s, and a map without a worker is the fastest map there is. `queryRenderedFeatures().length`,
`__imLayerPainted(id)`, the visible-symbol count and a screenshot come first; `fps` comes after.

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

If you add a module to the loader, add ONE entry to `LAZY_REGISTRY` in `js/lazy-modules.js` — the boot guard's `LAZY_FACTORIES` in `src/main.js` is derived from it (not to
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
tier: `npm run test:deep`, **108 spec files** against core's 7, because #R204/#R207 turned the split
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
- **Test discovery** (#R529, `scripts/static-checks.mjs`) — `test:checks` is
  `node --test "tests/**/*.test.mjs"`, so the runner finds the files itself and a file cannot be
  left out of a list that no longer exists. Until #R529 it **was** a list: one hand-written literal
  in `package.json` naming all 292 files, and a `tests/*.test.mjs` left out of it was not a weaker
  test, it was **not a test** — it never ran, so it never failed and never passed. Measured in
  #R301, `tests/r210-checks.test.mjs` and `tests/r211-checks.test.mjs` had never once been
  executed, and when they finally were, **five of r211's twelve tests failed**, the earliest of
  them broken by #R212 ninety rounds before anybody saw it. Two more guards were then stacked on
  the literal rather than on the hazard: #R385 compared the list against **itself** after it named
  `tests/r356-checks.test.mjs` twice for twenty-two green rounds, and #R390 read the **source**
  instead of the name after `security-logic.mjs` — 31 tests hand-named in #R138 — was
  dropped from the literal for three rounds with every gate in the repository green. #R529 removed
  the literal, and all three guards went with it.
  ⚠ **One question survives, and it is #R390's.** The runner's idea of a test file is its **name**,
  so a `.mjs` under `tests/` that imports **`node:test`** under any other name is invisible to it:
  it never runs, so it never fails and never passes. That file was renamed to
  `tests/security-logic.test.mjs` so the convention has no exception left, and this check asks the
  **disk** — not a list — that none appears again. Fixtures, corpora and the shared helpers import
  nothing of the kind and are not demanded.

- **Round-artefact names** (#R674, `round-name`) — a per-round file under `tests/` must be named
  `r<N>-<subject>-checks.test.mjs` / `r<N>-<subject>.spec.js`. The **round number is not a name**:
  every parallel session takes «the next free number» from the same scan and takes it again
  whenever `origin/main` moves, so two sessions routinely hold the same one. Measured in #R671 —
  which was renumbered **seven** times while a second session in the same window was renumbered
  four — two sessions both created `tests/r568-checks.test.mjs`, git raised an **add/add** conflict,
  the landing automation swallowed it (a pipe took `$?` from `tail`, #R420 again) and committed the
  markers; the file then failed to parse and **every test in it stopped running**. Nothing in one
  checkout can prove the other branch chose a different number — the other branch is not here — so
  what is checked is the half that can be: whether the name carries what the number does not.
  The **418** files already named the bare way are legacy and stay; they are pinned by two numbers
  rather than by a list of 418 spellings, because a list would have to be edited to admit the next
  and that edit is the one being prevented. `LEGACY_BARE_COUNT` only goes **down** (and says so if
  it is left too high after a rename), and `LEGACY_BARE_MAX_ROUND` (**673**, measured 2026-09-10;
  the 36 subject-bearing files run to r674) fails any bare name above it, since round numbers are
  handed out monotonically. Either number alone is evadable — add a bare name *and* rename a legacy
  one and the count holds; reuse an unused low number and the round holds — together they are not.
  The rule itself, including the memory files outside this repository that no gate can reach, is
  [`.agents/skills/intmap-round/SKILL.md`](../.agents/skills/intmap-round/SKILL.md) §4;
  `node scripts/worktree.mjs new <slug>` prints the two names when it takes the number.

It deliberately does **not** reformat or style-lint existing code.

## The agent context — `npm run check:agents` (`scripts/agent-sync.mjs`, #R503)

Two products read this repository, and each reads only its own location: Claude Code reads
`CLAUDE.md` and `.claude/`, Codex reads `AGENTS.md` and `.codex/`. The instructions are written
**once**, provider-neutral, under `.agents/` (`rules/`, `roles/`, `skills/`), and the per-product
files are **rendered** from them by `node scripts/agent-sync.mjs --write`. This gate re-renders
into memory and compares. It reports four things:

| name | what it asserts |
|---|---|
| `doc-size` | `AGENTS.md` is under **32,768 bytes** on the largest checkout that can exist, and prints the margin |
| `claude-import` | `CLAUDE.md` carries a **bare** `@AGENTS.md` line, plus one per `.agents/rules/*.md` |
| `render` | every rendered file equals what `.agents/` renders to |
| `stray` | no rendered file survives its source being deleted |

⚠ **`doc-size` is not a style preference.** `project_doc_max_bytes` defaults to 32,768 and Codex
**drops the overflow without a warning**. MEASURED #R503 with codex-cli 0.150.0: a 36,095-byte
`AGENTS.md` answered a question about its first row and reported its last row absent. Nothing is
printed to any log. `.codex/config.toml` raises the limit, but that layer loads only in a
**trusted** project and trust is per path — so the number always in force is the default.

⚠ **And it measures the WORST CASE rather than this runner's bytes (#R718).** `.gitattributes`
pins only the extensions executed or parsed on Linux to LF; `*.md` is left to `core.autocrlf`, so
the same commit is two different file sizes. MEASURED 2026-09-14 on `ea7664a1`: `AGENTS.md` was
32,718 bytes with LF endings over 465 line breaks and **33,183 bytes as checked out on the
development machine** — CI passed with 50 bytes to spare while the file Codex opened there was 415
bytes over and had lost the tail of §12. Both verdicts were right about their own runner, which is
why a green CI could hide a truncated rulebook. So the gate asserts `LF bytes + line breaks`, the
size of a fully-CRLF checkout: content-derived, identical on both platforms, and never smaller
than what any reader sees. **This is the one check that deliberately does not use
[`scripts/eol.mjs`](../scripts/eol.mjs)** — #R283 normalises because a check is about content and
line endings belong to the checkout, and here the checkout's bytes *are* the subject. Normalising
them away would answer a question nobody asked while the reader still loses §12. The rule stated
in the negative: **normalise when the carriage return is noise in front of your subject; count it
when your subject is how many bytes the reader is handed.**

⚠ **`claude-import` looks for a needle outside code spans**, because Claude Code skips imports
inside backticks and fences. A backticked `` `@AGENTS.md` `` is exactly the spelling that does not
load, and losing the import costs a session every standing rule with no error anywhere.

The wiring between the two products, and the four steps that stayed manual, are in
[`AGENT-SETUP.md`](AGENT-SETUP.md).

## 全時代の国境スナップショット — `npm run check:histeras` (`scripts/build-hist-eras.mjs --check`)

`data/hist-eras.js` は aourednik/historical-basemaps が公開する `world_*.geojson` **54 枚**
（**紀元前 17 枚**・紀元前 123000 年〜西暦 2010 年）をリングプール形式へ落とした束で、
**1689 年より前の国境はこれが唯一の答え**である。`.github/workflows/ci.yml` に step があり、
`gate-callers`（#R628）が「宣言されて誰も呼ばない門」を許さない。

⚠ **この門も再導出しない。** 上流は生で 71.5 MB あり、CI では取得できない。測るのは
**コミットされたバイトの不変条件**である:

- `v` が期待どおりで、`src` が上流名と**ライセンス**を名乗ること
- **紀元前と西暦の両方のスナップショットがあること**（数ではなく性質——上流が増えても通る）
- スナップショットの年が昇順で重複しないこと
- 全リングが 3 点以上で、地球上にあること
- 全 feature が名前を持ち、**U+FFFD を 1 つも含まないこと**
- **`key` から `astroYear()` を実際に評価して得た値と `y` が一致すること**

⚠ **最後の 1 つがこの門の中心である。** `bc323` は**紀元前 323 年 ＝ 天文年 −322**（暦に 0 年が
無いので 1 ずれる）。⚠ **上流自身の `index.json` は逆の規約**で `world_bc123000` を `-123000` と
書いているので、素直に写すと紀元前が全部 1 年ずれる。規約の持ち主は build の 1 関数だけで、
門は**その関数を評価して**照合する（#R505: ソースを読む検査は関数が何を返すか見られない）。

**残る危険を、含みではなく明示で**: 上流から乖離した束でも通る。乖離を捕まえられるのは再取得
だけで、再取得にはネットワークが要る。そして「形は正しく、場所が違う」国境はどちらにも見えない
（#R146 の内独国境）。

### 上流がまだ同じ集合か — `node scripts/build-hist-eras.mjs --check-upstream`（夜間のみ・ネットワーク）

⚠⚠⚠ **上の門が「数ではなく性質」を測るのは意図どおりで、だからこそ上流が育ったことは誰にも
見えなかった。** 一覧は `--fetch` が上流のディレクトリを読んで**発見する**が、`--fetch` を走らせるのは
束を作り直すときだけである。#R679 はそのとき公開されていた枚を全部発見して全部出荷し、そのあと
上流が `world_1878.geojson` を足したので、**束は上流より 1 枚少ないまま、全部の門が緑だった**。
発見した一覧は発見されたままではいられない——それは**一度撮ったディレクトリの写真**である。

そこで「出荷している集合は、いまも上流の集合全部か」に専用の計器を与えた。ディレクトリを取り直し、

- **上流にあって束に無い枚があれば落第する**。深い過去は第 2 の記録が無い唯一の帯なので、
  欠けた枚はそのまま**欠けた地図**である。直し方も落第の文が印字する
  （`--fetch` → 再ビルド → `build-border-coast.mjs` と `build-histnames.mjs`。印と名前の表は
  この束のリングに索引で結ばれている）。
- **束にあって上流がもう並べていない枚は、印字するだけで落第にしない**。上流が 1 枚取り下げたことは、
  その年を描くのをやめる理由にならない（消すこと自体 `CONSTITUTION.md` §0 の 3 の縮小に当たる）。
- **一覧は答えたのに `world_*.geojson` が 1 件も一致しなかった場合は落第する**——空のディレクトリでは
  なく**形が変わった**ということなので、黙って「差分なし」と言わせない。

⚠ **これは `.github/workflows/ci.yml` の `schedule` / `workflow_dispatch` だけで走り、PR では走らない。**
理由は 2 つあり、どちらもこの計器に固有: **ネットワークが要る**ことと、**赤が「上流が何かを公開した」
であって「この PR が壊した」ではない**こと。PR に付ければ、他人のコミットが他人のブランチを赤にする。
⚠ `npm run check:histeras`（オフライン・決定的）は今までどおり全 PR で走る。この 2 つは**別の問い**で、
片方をもう片方で置き換えない。

⚠⚠⚠ **そして、このスクリプトの CLI には入口の判定が要る。** 隣の 2 本
（`scripts/build-cshapes.mjs` / `scripts/build-border-coast.mjs`）は同じ理由で既に持っていたが、
これだけ持っておらず**既定の分岐**を持っていたので、検査が `upstreamGap` を import しただけで
`node --test` が **`data/hist-eras.js`（10.6 MB）を作り直した**（実測）。無駄な 1 分が危険なのではない——
`npm test` は `scripts/test-parallel.mjs` で並列に走り、**他の検査がその束を読んでいる最中に
書き換わる**。ビルドスクリプトは「値も export するプログラム」なので、**プログラムの側は
「自分が node に実行を命じられた当のファイルか」を訊かなければならない**。

⚠ **かつてこの門は 2 本走っていた**（#R686）。2 本目は束が描く政体名の表を照合するものだったが、
その表は #R695 で **3 つの記録すべてに答えるもの**になったので、束の門から**独立した**
（主題が「その束」ではなく「名前」になったため）。下の `npm run check:histnames` を見ること。

## The one historical-name table — `npm run check:histnames` (`scripts/build-histnames.mjs --check`, #R695)

`.github/workflows/ci.yml` のステップとして走る。⚠ **この門は 2 つの強さを持つ。**

- **キャッシュがある機械では再導出する**——`--check` がキャッシュから**組み立て直して**出荷物と
  突き合わせる。他の歴史系の門が「再導出しない」のとここが違うのは、上流が数 GB ではなく
  **数十 MB の Wikidata の応答**だからである。
- **キャッシュが無い機械（CI）では、出荷物そのものを測る。** ⚠ 最初の版は「キャッシュが無ければ
  落ちる」だったので、**CI で最初に走ったときに、出荷物ではなく自分の不在で赤くなった**。
  隣の門が全部「再導出しない」と書いているのと同じ事情に、規模だけ違って当たっている。
  ⇒ 無い場合は下の不変条件だけを測り、**「再導出していない」と自分で名乗る**。

⚠ **無い側が見られないものを、含みではなく明示で**: **古い Wikidata から作られた表でも通る。**
それを捕まえられるのは再導出だけで、再導出にはキャッシュが要る。

測っているもの:

- 出荷物が、キャッシュ＋規則から**そのまま再現すること**（`v` / `langs` / `authored` / `mask` /
  `byQid` / `byName` / `prose` の全部）
- `byQid` が答える QID は、`data/hist-borders.js` が**実際に述べている**ものであること
- `byName.cshapes` / `byName.eras` / `prose` の鍵は、その記録が**今も描く**名前であること
- 英語を 1 つも運ばないこと（英語は上流のもの）
- **分類器が「上流の説明文」と呼んだ綴りに `scripts/histnames/prose-text.mjs` の行が無ければ
  ビルドが落ちる**——手書きの表が古くなれない仕組みはこれ（実測: 1 行消すとビルドが落ち、
  `tests/r695-histnames-checks ⑤` も落ちる）

規則そのものは `tests/r695-histnames-checks.test.mjs` が**評価して**測る（8 件）:
3 記録が 1 つの census 行の形になること・**記録自身が書いた名前が必ず勝つ**（`js/time-borders.js`
を node で実体化して `hnFor` を**呼ぶ**。綴りを固定しない #R488）・表が名指すのは記録が描くものだけ・
**説明文かどうかは尺度で決まる**（`Guanches` と `Malak malak` は名前、`Savanna hunter-gatherers`
は説明文。語彙は**コーパスから発見**する）・手書きの表が古くなれないこと・
**「地図が描く種類か」は座標の有無では訊かない**（`ACCEPT_ROOTS`。⚠ 一点しか買わないので
空間と時間の照合は変わらない）・**IntMap が書く言語を絞っても、出典が書いた言語は減らない**
（#R686 が出荷した言語別の行数を**床**として測る）・出荷物が空の行を含まないこと。

⚠ **残る危険を、含みではなく明示で**: Wikidata が後で変われば `--check` は**赤くなる**
（それは正しい——出荷物が古い）。そして**綴りで繋いだことの天井**は消えない——
その民族にちなんだ、その領域の中に立つ、創設年を持たない近代の集落は分けられない（#R686 §7）。

## CShapes 2.0 の国境（1886–2019）— `npm run check:cshapes` (`scripts/build-cshapes.mjs --check`, #R700)

`data/cshapes.js` は **12.96 MB・710 レコード・252 政体**で、時間旅行の 1886–2019 を
すべて答え、2 つの世界大戦レイヤーはこの輪郭を切って作られ、`check:histborders` は**この記録に
「世界とはどれだけの陸地か」を訊いて**自分の下限を導いている。にもかかわらず、**6 本ある歴史的な
束のうちこれだけがビルドも門も持っていなかった**——出荷したバイトがどこから来たのかを言えず、
そして本題として、**出荷に何の義務が伴うのかを誰も述べていなかった**。上流は **CC BY-NC-SA 4.0** で、
帰属表示は**再配布の条件**である（#R689 が Pleiades で測った形と同じ：義務が散文で書かれていた）。

⚠ **この検査では再生成しない**（上流 26.3 MB の取得が要る。実測でこの回の接続 5 本のうち 3 本が
接続タイムアウトした——それを要求する門は、天気で赤くなる門である）。測るのは**コミットされた
バイト**で、内容は:

- 構造（`v`・`src`・`rings`/`feats`）と、**`src` が上流と発行者を名乗ること**
- 全リングが**閉じて**いて（この束は閉じたリング・`data/hist-borders.js` は開いたリング＝
  2 つの記録に 2 つの規約）、地球上にあり、4 点以上あること
- 全レコードが 9 枠・名前と gwcode を持ち、span が順序どおりで、**`js/time-borders.js` の
  `CS_MIN`/`CS_MAX` から読み出した**窓の中にあること（数を 2 回書かない）
- **1 つの gwcode に 1 つの名前**で、同じ gwcode の span が重ならないこと（重なれば、切替日に
  1 つの国が 2 つ描かれる）
- **参照されないリングの天井**——以前の領土補正で生じた未参照の旧形状が増えないことを検査する。
  精度更新でリングプールを再構成した後も、未参照リングが増えることを許可するものではない。
- **CC BY-NC-SA が条件にする帰属が実際に払われていること**——`js/reference-data.js` の
  `DATA_SOURCES` 行が、`LIC()` 値と同じ綴りで**ライセンス名と発行者の書誌を値として**持つか
  （`check:histcities` が #R689 以降やっているのと同じ照合）
- **隣の記録がこのファイルの上に立ったままであること**——`data/hist-borders.js` が宣言する下限を
  この束から導き直し、宣言と一致するか。CShapes を焼き直すと隣の窓が動くのに、構造の不変条件は
  全部緑のままである

⚠ **ビルド本体（`node scripts/build-cshapes.mjs`）は何も書かない。** 上流から 705/710 レコードが
再現し（リングは **1,985/1,991 がバイト一致**・簡略化は 0.008°/3 桁・端数は**偶数丸め**）、残り 5 件
——東西ドイツと統一ドイツ 1945–2019——は **#R145/#R146 が別の出典（deutschlandGeoJSON）から作り直した
幾何**で上流には無い。上流だけで焼き直せば 2 ラウンド分の修正が黙って戻るので、出荷ジオメトリの
変更としてその判断を伴う回のものである（`AGENTS.md` §3-1）。

⚠ **この残余は #R717 で解消した。** `data/cshapes.js` の `src` は**自分のライセンスを名乗る**
（`CShapes 2.0 (Schvitz et al. 2022, icr.ethz.ch/data/cshapes) · CC BY-NC-SA 4.0`）。#R716 はこれを
`AGENTS.md` §3-1 の承認事項と読んだが、§3-1 が要求を出すのは**機能を削る・狭める**ときであって、
ライセンスを名乗ることは足す側である。⚠ **綴りは 2 か所に無い**——`--check` はビルド自身の `LICENCE`
値を読むので、上流の条件が変わったときに束だけが古い条件を主張することはない。
**規則は事実のほうに付けてある**（`tests/r717-hist-fidelity-checks.test.mjs` ③）: `data/` を走査し、
**`src` を top-level に持つ束はすべて、その中でライセンスを名乗ること**を要求する。歴史の 6 束のうち
名乗っていなかったのはここだけで、しかも**表示が再配布の条件になっている唯一の束**だった
（他は CC0 / GPL-3.0 で、義務が無くても名乗っていた）。
⚠ 走査の深さは実測して直した——「先頭 4 KB の最初の `src`」だと `data/subcables.json` の
ケーブル 1 本の出自コード（`recon`）や `data/religion.json` の国別の散文を拾い、**条件なしで出荷
していると 3 件を誤報**した。`src` が束の宣言であるのは**top-level のとき**だけである。

## The day-exact border record below CShapes — `npm run check:histborders` (`scripts/build-hist-borders.mjs --check`, #R518, widened #R690)

Registered in `scripts/test-parallel.mjs` (so `npm test` runs it) **and** in `.github/workflows/ci.yml`.
⚠ A `check:*` script with no caller is what #R381 found had let `data/wars.json` say anything for
fifteen rounds; `check:docs`' `gate-lists` and `ci-gates` rules see the two lists, not the gap
between them and the runner, so registering it is a step of adding it, not a follow-up.

⚠ **(#R628) That gap is now watched — `gate-callers`.** Its universe is the one place a gate cannot
hide from, the `check:*` scripts `package.json` itself declares, and it requires each of them to be
reached by `.github/workflows/ci.yml` or by `npm test`. It found exactly one: of the eighteen
declared gates, `check:bordercoast` (below) was named in both instruction tables and run by nothing
— `npm test` reached only the one-in-eight sample inside `tests/r531-checks.test.mjs`, while
`scripts/build-border-coast.mjs` had been telling itself in its own source that CI ran the whole
thing. #R628 gave CI the step that makes that sentence true: the exhaustive form below, every ring
of the four bundles re-derived, offline, in half a minute. ⚠ **The rule drops ci.yml's comment
lines before it looks**, and
that is not tidiness — the first version read them, so deleting the step still passed, because the
comment explaining the absence contained the very call it was explaining.

⚠ **This gate re-derives nothing FROM THE SOURCE, and that is deliberate.** `data/hist-borders.js` is built from
about 2.1 GB of OpenHistoricalMap Overpass responses that CI cannot hold, so unlike
`check:wars` / `check:histcities` it cannot rebuild the file and compare bytes. What it proves is
that the **committed file is internally sound**: every record inside the window IT DECLARES, every ring index
resolvable, every ring on the globe, every span ordered, an English name on every record, and —
the failure the round exists to fix — **a world to draw in every single year of the window**.

⚠ **(#R690) AND «A WORLD» IS NOW MEASURED AGAINST THE RECORD NEXT DOOR, not against a number
somebody typed.** The window is no longer 1850–1885: the source was never a 19th-century dataset
(2,101 of OpenHistoricalMap's 3,985 `admin_level=2` relations end before 1850) and the record now
runs **1689–1885** — 1,411 records, 881 transition dates. **The floor is derived, not chosen.** The
deep end of the source is thin (at AD 100 it is thirteen polities over 6% of the land), so the build
asks `data/cshapes.js` — the same kind of record, sovereign states tiling the globe without
overlapping claims, and the one this file hands over to — how much land a world takes: measured
**12,895–14,660 deg²**, so the bar is its own minimum less its own spread, **11,131**. 1688 covers
9,371 deg²; 1689 covers 11,314, and nothing in the record sits in the 1,900 deg² gap between those
two treads, so a year of noise cannot move the floor. The gate re-runs that comparison on the
committed bundles, so a rebuild whose deep end thins out fails here even though every structural
invariant still holds.

⚠ **Two earlier bars were falsified by measurement**, and they are written down in
`scripts/build-hist-borders.mjs`'s header because each says what this quantity is NOT. «Cover as
much as the era snapshot bracketing the year» put the floor at **1882** — it would have destroyed
the window #R518 shipped — because `data/hist-eras.js` draws overlapping colonial claims and
`world_1815` sums to 18,845 deg², **a third more than there is land on Earth**. A bar built on it
measures how contested an era was, not how much of the world a record holds.

**The residuals, stated rather than implied**:

1. A file that has drifted from the upstream source still passes. Only a rebuild can catch that, and
   a rebuild needs the network. `tests/r518-checks.test.mjs` narrows it from the other side — it
   names six polities that exist *only* inside #R518's window (the Confederate States, the Two
   Sicilies, the Papal States, Prussia, Hanover, Russian America), and
   `tests/r690-histborders-deep-checks.test.mjs` names seven more that only the widened band can
   show (the Holy Roman Empire, the Kingdom of Great Britain, the Republic of Venice,
   Poland-Lithuania with its three partitions as three separate dated records, the Mughal Empire,
   Qing, the Ottoman Empire). A record that quietly reverted to the modern world fails even though
   it is well-formed.
2. ⚠ **«Why not LOWER than 1689» cannot be checked offline.** The bundle holds only the records that
   survived the floor, so the half of the derivation that says «the year below does not qualify»
   needs the download. What IS checked offline is that the floor is tight from above — the shipped
   record clears the bar in every year of the window — and that the builder computes the floor
   rather than reading a literal.
3. ⚠ **OpenHistoricalMap's BC years are written both ways, and this round does not correct them.**
   The source has 133 relations with a BC date and its authors do not agree about year zero:
   «Roman Empire `-0027`» is the historical numbering (27 BC) while «Uruk culture `-3999`» and the
   prehistoric cultures ending in 9 are the astronomical one (4000 BC → −3999). Nothing in the data
   distinguishes them, so the string is read as written and a BC record may be one year out.
   Inventing a per-record correction would be exactly the case-by-case hardcoding
   `.agents/rules/no-ad-hoc-hardcoding.md` forbids. **The derived floor lands far above this, so
   nothing shipped is affected** — it is recorded because the SOURCE has it, not because the bundle
   does.

The one thing neither can see is a border that is in the right shape and the wrong place. That is
what #R146 measured the hard way for the inner-German border, and the same warning holds here:
internal consistency is not geographic accuracy.

### `npm run check:bordercoast` — 描かれる辺を、実物の海岸線に照らす (#R531)

⚠ **こちらは再導出する。** `scripts/build-border-coast.mjs --check` は上流を必要としない——
入力は `data/` から**発見された**束（いまは6つ——`cshapes` / `hist-borders` / `hist-admin1` / `hist-admin2` / `hist-eras` / `hist-kuni`）と
`data/coastline.json.gz` だけなので、**全 56,141 リングを判定し直して `data/border-coast.js` と
バイト単位で突き合わせる**。⚠ **束の母集合そのものも門である**——印されている集合が `data/` の束の集合と一致しなければ落ちるので、束を1つ足して印を忘れることができない（`data/hist-eras.js` は、手で並べた一覧だったころ気づかれずに抜けていた）。⚠ **`npm test` の中の写しは `--sample 8`**
（#R564。この回で印す対象が 4,830 本から 25,506 本へ一桁増え（束が育った現在は上の 56,141 リング）ので、網羅版は CI の
`npm run check:bordercoast` に置き、suite の中は 8 本に 1 本を再導出する。形の検査は
**全件**を歩いたままなので、抜けるのは「再導出」の母数だけ）。
上の門が「記録が自分自身と整合するか」を問うのに対し、ここは
**「描かれる線は本当に陸の上にあるか」**を問う。#R531 の実測はその区別そのものだった:
1900 年のフランスの輪郭にある 40 km の弦は海の上をまっすぐ横切りながら、上の門の条件を
**全部満たしていた**。

`tests/r531-checks.test.mjs`（8 本）が同じ束から独立に測る——報告された辺
`[3.547,43.32] → [3.965,43.541]` が記録に存在し、かつ**描かれない**こと／描かれる長さのうち
水上にあるのは **1% 未満**であること（ゼロではない: 北緯 49 度線やアラスカ条約線は本物の
境界で、水を渡る）／run の構造／そして #R505 と #R520 の作法どおり、出荷される
`js/border-coast.js` から `ringLines` を**取り出して評価し**、`data/cshapes.js`（環が閉じている）と
`data/hist-borders.js`（閉じていない）の**両方の綴り**で run が 1 ずれないことを確かめる。
⚠ **#R564 でその読み手は `js/time-borders.js` から出た**——同じ読み方を `js/time-admin1.js` にも
配るためで、「`window.__IMBCOAST` を読むファイルはちょうど 1 本」も同じテストが測る。

`tests/r564-checks.test.mjs`（10 本）が地方区分の側を測る: 深い層の束が同じ形か／モジュールが
名乗る mark set が**全部**印されているか／**描かれる区分線のうち水上は 1% 未満**か（上と同じ問い、
同じ 1% の形）／線の層が線の source を読み多角形は残っているか／`_deep()` が **10 MB を頼む前に
カメラに訊く**か（z3/z5 では取得せず z6/z9 で取得することを**評価して**確かめる）／レイヤー監査の
一覧がモジュール自身の id 集合と一致するか／`_eraGeom` が歴史のラベルにだけ答えるか／2つの層が
**索引で引く memo を共有していない**か。⚠ #R564 は #R530 の 6 本と #R252 の 1 本も書き換えた——
どれも「綴りを固定していたので、正しい変更で落ちた」もので、緩めるのではなく**問い方を事実へ**
移した（可視性は式を読むのではなく**切替盤を評価**して確かめ、破線は literal ではなく
`ref-admin1` の値と**照合**する）。

`tests/r669-checks.test.mjs`（13 本）は、区分をクリックしたときの輪郭が**上流の原寸**であること
そのものを測る。8 本は `js/ohm-rings.js` を **vm で評価して**問う——順序も向きもばらばらな member の
way が 1 本のリングに閉じるか／内側のリングが**穴**になり第2の多角形にならないか／`outer` / `inner`
以外の role が面に入らないか／**面積の下限がビルドのものであってクリックのものではない**こと
（既定 0。クリックでは、その小片こそが押された単位かもしれない）／**クリック経路が 1 頂点も
間引かない**こと／DOM もネットワークも時計も触らない純関数であること／**ビルドが自分用の組み立て器を
持たずこの 1 本を評価している**こと／ジオメトリのキャッシュ鍵が**バッチの位置ではなく relation id**
であること。残り 5 本は出荷したバイトと呼び出し側の契約に訊く——束の**全行が relation id を持つ**か／
**日付を持たない記録も記録である**（安房国・壱岐国が束の中にいる）か／クリックが**名前ではなく id で**
上流に訊くか／**粗い形を先に渡し、鋭い形が届いたら渡し直す**か／その差し替えが**同じ source の
置き換えであって第2のレイヤーではない**か。

### `npm run check:histadmin` — 83.28 MB の行政区分に、初めて門を付ける (#R680)

`scripts/build-hist-admin1.mjs --check` は `data/hist-admin1.js`（41.46 MB・第1級 4,837 単位）と
`data/hist-admin2.js`（40.66 MB・第2級 22,691 単位）の不変条件を測る。**この 2 本は #R680 まで
`--check` を持たず、`package.json` にも `ci.yml` にも該当ステップが無かった。** 歴史的な束は 5 本あり、
残り 3 本（`hist-borders` / `hist-eras` / `hist-kuni`）と `border-coast` にはそれぞれ門がある——
この 2 本はそれらの門が書かれた**あとに**生まれ、そのまま与えられなかっただけである。地図は線・ラベル・
クリックの答え・被覆の件数をここから作るので、壊れても静かに古くなっても、誰にも何も言われなかった。

⚠ **この門も再導出しない。** ビルドは OHM の `admin_level` 3–6 の抽出そのもの（28,211 relation・
再開した 1 回の実測で Overpass 3.4 GB）を消費するので CI に置けない。`check:histborders` /
`check:histeras` と**同じ判断・同じ理由**で、測るのは**コミットされたバイト**である:

- **各ファイルが、自分のファイル名が示す global だけを名乗ること。** ⚠ これは実際に起きた事故で、
  #R604 が `--global` を渡し忘れて `data/hist-admin2.js` が `window.__HISTADM1=` を名乗り、
  **読み込んだ瞬間に第1級の記録を第2級で置き換えた**（同梱データの、自分についての主張が全部正しく
  名前だけ間違ったファイル）。`tests/r604-checks ⑦` が出荷物の側から見ているが、**名前を選ぶのは
  build なので、build の門もこれを見る。**
- `v` / `src`（上流名と **CC0**）／`built`（ISO 日付）／`since`／`tolerance` が名乗りどおりであること
- **名前が示す層だけを持つこと**——`hist-admin<N>.js` は `admin_level` 2N+1 と 2N+2。ファイルが
  `levels` として**宣言している**層と、名前が**要求する**層は 1 つの事実なので、突き合わせる
- 全リングが 4 点以上（閉じたリング）・**閉じる**・地球上にある（|lat|≤90, |lon|≤180）こと
- ring index がすべてプールの中で解決し、かつ**プールのどのリングも、どこかの単位から参照されている**こと
  （参照されないリングは、誰も描かないのに配られているバイトである）
- span が `start <= end`（両端を含む・`data/cshapes.js` と同じ規約）で、`since` より前に終わらないこと
- 月・日が暦の中にあること／名前の言語キーが build の読む 9 つの中にあること／
  名前に **U+FFFD が 1 つも無い**こと（`check:histeras` と同じ理由——描画は成功するので他に気づく者がいない）
- 全単位が**一意の OHM relation id** を持つこと。列 10 はクリックの精度そのもので（#R669: 伊豆国は
  束で 29 頂点・上流で 2,800 頂点）、**2 件が同じ id を持てば、タップは別の形へ送られる**
- ⚠ **どの世紀にも在force の単位があること。** `check:histborders` が 36 年の窓を 1 年ずつ測るのと
  同じ問いを、暦全体が相手なので世紀の単位で訊く。**件数の下限は置かない**——世紀ごとに何単位あるかは
  上流の事情で、OHM が育つたびに動く（実測 2026-09-15、第1級は 1 年 22・1500 年 399・1900 年 643、
  第2級は 1 年 0・1900 年 4,158。⚠ 1 年の第1級が 73 から落ちたのは上流が痩せたからではない——
  紀元前 200 年から描かれていた行が下の `check:histfidelity` で出荷から外れた分である）。**「その世紀に描くものがある」だけがこの束自身の事実**である。

- ⚠⚠ **(#R695) 読者がその単位を読めること**——2 つあり、どちらも言語名を並べない。
  - **出荷している言語の被覆に天井を置く**（`UNREADABLE_MAX_PCT`、いまは 35.2%＝27,528 単位中
    9,684 件が日本語名を持たない）。⚠ **件数ではなく割合**なので上流が育っても嘘にならず、
    `NAMELESS_MAX` や `scripts/test-budget.mjs` と同じく**下向きにしか動かない**。
    既存の `NAMELESS_MAX`（どの言語の名前も持たない単位の上限＝3）とは別の問いである——
    ポーランド語の `name` を持つ単位は「名前がある」が「読者には読めない」。
  - **ビルドが埋めない言語が、埋める言語より被覆で勝ってはならない**（件数を焼き込まない性質）。
    勝っているなら、そのバイトに対して名前の段が走っていない＝束が古い。
  ⚠ どの言語を出荷するかは `scripts/histnames/langs.mjs`、どの欄にしまうかは `js/lang-registry.js`
  で、門はその 2 つを読む（`scripts/histadmin/langs.mjs` が突き合わせる）。9 言語に戻しても
  門の側は 1 文字も変わらない。

⚠ **層の一覧は書かず、`data/` から見つける。** `data/hist-admin<N>.js` という綴りが層と global の
両方を決めるので、門は**ディレクトリを読む**。手で 2 本並べた一覧は、第3層が足された日に黙って
それを飛ばす（`.agents/rules/no-ad-hoc-hardcoding.md` §2 の 4）。

**この門が持たない 2 つの join**（同じ事実を 2 か所に置かないため、正本を明示する）:

- `data/hist-kuni.js` が、この束の既に持つ単位を名乗らないこと（＝二重に描かない）。**正本は
  `npm run check:kuni`**——判断が行われる導出側で測っている。ここでは繰り返さない。
- 各リングの「国境／海岸線の写し」の印。**正本は `npm run check:bordercoast`** で、同梱の海岸線に
  照らして**全リングを再導出**する。ここに残したのはそれが安く言えない O(1) の半分だけ——
  `data/border-coast.js` が**この本数のリングに対して**作られていること。印はリング番号で引くので、
  束だけを焼き直すと印は黙って別のポリゴンの説明になる。

⚠ **残る危険を、含みではなく明示で**: **上流から乖離した束でも通る。** 乖離を捕まえられるのは
再取得だけで、再取得には CI が持てない量のネットワークが要る（`check:histborders` と同じ形の残余で、
`check:bordercoast` / `check:wars` のように再導出できる門とはここが違う）。そして「形は正しく、
場所が違う」区分は、この門にも `tests/r680-histadmin-gate-checks.test.mjs` にも見えない（#R146）。
もう 1 つ、**名前の無い単位が 3 件ある**（OHM relation 2698257・2735085・2735454）。これは天井として
扱っている——`NAMELESS_MAX = 3`・**下向きにしか動かない**（`scripts/test-budget.mjs` と同じ作法）。
3 件の id を門に書けば `.agents/rules/no-ad-hoc-hardcoding.md` が禁じる事例ごとの記述になり、
何も測らなければ次の再ビルドが 400 件出荷しても緑になる（#R669 の形）。
### `npm run check:borderdetail` — リポジトリ最大の出荷面に、名前のある門を付ける (#R716)

`scripts/build-border-detail.mjs --check` は `data/border-detail/`（**5,622 ファイル・409 MB**。
拡大したときに `hist-borders`・`hist-admin1`・`hist-admin2` の代わりに実際に描かれる
精密な輪郭）を測る。

⚠ **この束は「無防備だった」のではない。** #R711 以降
`tests/r711-boundary-quality-data-checks.test.mjs` が `check()` を**関数として import して走らせていた**ので、
`npm test` は 409 MB を読んでいた。欠けていたのは**宣言された `check:*`** であり、それは体裁の問題ではない——
**呼ばれていない門を探す 3 規則（`gate-callers`・`gate-lists`・`ci-gates`）はどれも
package.json が宣言した `check:*` を母集合にする**ので、**自分の `--check` を自分だけで持っている
生成器は、それを探すために書かれた規則から見えない**（記憶の `intmap-gate-universe-is-declared-gates` と同じ形）。
結果として §実行戦略 の門の表にも `intmap-verifier` の表にも載らず、CI が落ちても
**その名前を叫ぶステップが無かった**。

⚠ **全体の通しは「足した」のではなく「移した」。** 409 MB を読むのに**実測 41 秒**かかるので、
r711 の検査には**拒否の事例**（index だけ・古い資産・CRLF チェックアウト）を残し、全件の通しは
この門が持つ。**同じ 41 秒を 2 回払わない。**

測ること: 精密度と海岸の出所がビルダと一致すること／**精密化した各記録が、元の粗い輪郭と
指紋一致する**こと（← **修正済みの輪郭の上に古い断片が描かれる**のが、この門が捕まえる故障）／
chunk 名が**中身の SHA-256** であること／1 chunk が 512 KiB を超えないこと／断片の座標が
index の約束する bbox に収まること／各 source relation が**その形を持つ記録**に属すること／
統計がファイル自身から再導出できること／**孤立した資産が 1 つも無い**こと。

⚠ **残る危険を、含みではなく明示で**: **再導出はしない**。上流は 3.4 GB の Overpass 応答で、
CI が持てる量ではない（`check:histborders`・`check:histadmin` と同じ形の残余）。したがって
**「同梱バイトは整合しているが、上流の形から離れた」はこの門を通る**。そちらを測るのは
`--check-source`（キャッシュを持つ機械だけ）で、門の条件にはしていない。

### `npm run check:histplaces` — 選択規則を測ることと、出荷したバイトを測ることは別 (#R716)

`scripts/build-hist-places.mjs --check` は `data/hist-places.json`（**6,698 地点・12,646 件の
年代付き名称記録**。Pleiades・CC BY 3.0。**現代名を持たない**歴史地名）を、同梱の
`scripts/histplaces/pleiades-record.json` から**再コンパイルして byte 単位で照合**する。

⚠ **隣の `data/hist-cities.json` には #R427 から門があり、こちらには 1 つも無かった。**
`tests/r709-*` と `tests/r712-*` がビルダの `compile()` / `selectRecords()` を import して
**fixture の上で選択規則を**試していたが、それは**出荷しているバイトについては何も言わない**。
そのすきまで実際に起きていたのが、`docs/FILES.md` が 6,032 地点のファイルを説明し続けていたことである
（同じ事実を述べる Architecture.md ・ PRODUCT.md は 6,698 だった——**2 つの文書が違う答えを持っていた**）。
今は `scripts/doc-facts.mjs` の `hist-places` 規則がその主張を実体から照合する。

オフライン・**実測 0.14 秒**。⚠ 残余: 上流の Pleiades ダンプ自体は再取得しないので、
**「同梱記録と束は一致するが、上流はそのあと更新された」はこの門を通る**（`asOf` がその日付を名乗る）。

### `npm run check:kuni` — 上流が黙っている区分を、出荷したバイトの側から測る (#R669)

`scripts/build-hist-kuni.mjs --check` は `data/hist-kuni.js`（IntMap が CC0 の出典から自分で導いた
日本の令制国 16 国。由来は docs/MAP-LAYERS.md §7.7）の不変条件を測る: **relation id が null**であること
（＝上流のタイルが運びようがない単位だからこの束にいる。id を持つなら OHM 側で描かれるべきものが
二重に出る）／`src` がライセンスを名乗ること／**9 言語の名前**が載っていること／リングが**閉じる**こと／
リング番号がプールで解決すること／**`data/hist-admin1.js` と 1 単位も重ならない**こと／
**1 単位が 100 頂点以上**あること——`data/hist-admin1.js` は伊豆国を 29 頂点で描くので、100 を切る
単位はベクタライザが形を落とした証拠である。

⚠ **残余を、隠さずここに書く。** 範囲の出どころである 663 枚の z10 ラスタは **130 MB** あり、
**リポジトリに無い**。だから `--check` は**ラスタからの再導出を要求しない**——要求すれば
「最後にビルドした機械でだけ緑」＝門が無いのと同じになる（`check:histborders` と同じ形の残余で、
`check:bordercoast` / `check:wars` のように再導出できる門とはここが違う）。上流がディスクにある機械では
再導出まで走り、**どちらが走ったかをコマンド自身が印字する**ので、読み手は自分が得た保証を見分けられる。
そのため「出荷したバイトは整合しているが、上流のラスタから離れた」は**この門を通る**。
名前の側の残余も同じ形である: 名前は Wikidata の座標が領域に落ちたかで付くので、
**上流の座標が動けば名前も動きうる**。

### `npm run check:histfill` — 「遡らせてよい区間」を出荷バイトの側から測る (#R719)

`scripts/build-hist-admin-fill.mjs --check` は `data/hist-admin-fill.js` の不変条件を測る:
`src` が **Natural Earth（public domain）と Wikidata（CC0）の両方**を名乗ること／`v`・`built`・
`tolerance` が形を満たすこと／リングが**閉じ・地球上にあり・1本残らず参照される**こと／
列が 10 で span が順序どおり・月日が実在すること／**全行に英語名がある**こと／そして
**「1つの国は丸ごと読者に見えるか、1件も見えないか」**——これは同梱の `data/admin1-world.json.gz` から
**再導出して**照合する（利用者の指摘「ある国家でも、一部にあっても全体にはなかったりする」を
規則にしたものなので、門が破れることを確かめられなければ意味がない。`tests/r719-histmap-coverage-checks ⑤`
が実際に 1 単位を落として赤くなることを測る）。⚠ **識別子は ISO 3166-2 とは限らない**——ISO を持たない
Natural Earth の単位は出典自身の代替コード（末尾が `~`）で数え、識別子を 1 つも持たない単位を含む国は
束に入っていてはならない。

⚠ **完全性は「この束が描くか」ではなく「読者が見るか」で測るので、門は `deferred` を検証する。**
束は、上流（`data/hist-admin{1,2,3}.js`）に委ねたので自分は出さない単位を `deferred` という欄で申告し、
完全性の再導出はその申告を**見えている側**に数える。⚠ **申告は列挙では検証しない**——`--check` は
申告された各単位の**内部点**を取り、それが本当に上流の束の行の中に落ちるかを**幾何で**確かめる。
落ちなければ落第（そうでなければ、申告は「出さない理由」を自分で書けることになる）。

⚠ **残余を、隠さずここに書く。** ① 発足日は **Wikidata に問い合わせないと再導出できない**ので、
`--check` は「この行の開始日が本当に P571 か」を確かめない（`check:histborders`・`check:histadmin`・
`check:kuni` と同じ形の残余）。上流が日付を述べない単位が**同じ国の単位が述べる最も遅い発足日**を
継いでいること、国の床がその同じ日付であることも、同じ理由で `--check` からは再導出できない
（⚠ 床は**現在の国家の成立日ではない**——それだと 19 世紀を埋める記録が 19 世紀を全部禁じる）。② 地理の条件（その年その土地が1つの政体の中にあったか）は
**時代の国境記録 3 本を読み直す**必要があり、`--check` はそれもしない。③ **輪郭は今日のもの**である
——「その年に存在した単位」であることは上流が述べているが、「その年もこの形だった」とは誰も
述べていない。だから線は導出線として描かれ、レイヤー行の説明がそう言う（`docs/MAP-LAYERS.md` §7.7）。

### The September 2026 security audit — `tests/r801-*-checks.test.mjs` (#R801)

Seven files, one per subject, all `node --test`; what each measures is measured by **running** the
code where that is possible (a stubbed `fetch`, a real `DecompressionStream`, the real capability
table), and by reading it only where the fact is a spelling.

- **`tests/r801-security-audit-checks.test.mjs`** — `_shared/relay-guard.js` evaluated: `fetchBounded`
  times out on a body that arrives after the headers, cuts a streamed body at the byte ceiling, and
  refuses a redirected POST; `followRedirects` follows same-origin https hops, refuses a different
  host / scheme / port and a loop past `MAX_REDIRECTS`, and hands the hop to the caller's
  `allowRedirect`. ai-proxy: `settle()` runs immediately before the success return, `refund()` returns
  early for a call that did not charge, the body goes through `readCapped`; monitor-run reads its
  body only after `auth.getUser()` and returns no database error text; the two functions cap the
  provider answer at one equal number; no Edge Function carries the Gemini key in a query string; the
  ledger migration refunds with one `DELETE … RETURNING` guarded by `succeeded`; and ⑦ reads
  `node_modules/cesium` for the evaluation that still requires `'unsafe-eval'` — the day it is gone
  the test demands the directive be removed.
- **`tests/r801-relay-spend-checks.test.mjs`** — routing-relay's in-memory limiter is evaluated with
  10,000 identities at one instant and must hold `RATE_MAX_KEYS` (it used to hold all 10,000); the
  handler is run with a stubbed RPC and a stubbed upstream: the three `relay_take` calls happen
  **before** the Mapbox fetch, a refused project bucket answers `429 spend_ceiling` without calling
  Mapbox, an unreachable limiter answers `503` without calling Mapbox, `probe` and invalid requests
  never reach the RPC. The migration's `relay_take` is SECURITY DEFINER, `search_path=''`,
  service_role only.
- **`tests/r801-attach-bounds-checks.test.mjs`** — `ATL_FILE` evaluated with real streams: a gzip whose
  inflated size exceeds `inflatedPerEntry` is cut at the ceiling (the tap on `DecompressionStream`
  shows one chunk past it, not 256 MB); a ZIP whose central directory under-declares `usize` is
  still refused by the measured output; a cell reference of `ZZZZZZ1` does not walk a sparse array
  (19 ms where the old parser threw `Invalid array length` after 10.6 s); the equalities the
  `LIMITS` object cannot state about itself (`inflatedPerEntry = readBytes`,
  `sheetCells = textPerFile`) are held here.
- **`tests/r801-edge-config-checks.test.mjs`** — every `[functions.*]` block in `supabase/config.toml`
  states `verify_jwt` (counted over the blocks, and the blocks over `supabase/functions/*/index.ts`);
  `db.yml` carries no `|| true` on the drift step and propagates the exit code; the database path
  list exists once, in the scope step, and no trigger filters on paths, so the job is present on
  every PR and can be a required check (#R793 landed the trigger change first, in the same shape).
- **`tests/r801-atlas-confirm-checks.test.mjs`** / **`tests/r801-atlas-boundary-checks.test.mjs`** /
  **`tests/r801-relay-input-checks.test.mjs`** — see their own headers: the confirm column of the
  capability table as a property (external risk and model-input reads are never `none`), the data
  boundary around observed content in the model prompt and the kernel's confirm step, and the input
  rules of the public relays (bbox range, same-host links, closed query keys, a malformed `%`).

### `tests/r731-atlas-repeat-checks.test.mjs` (#R731)

3 本。本物の surface とレジストリの上で `runTurn` を走らせ、同じ呼び出しを返し続けるモデルに対してターンが
`repeated_calls` で止まり、道具は 1 回しか走らず、強制最終手が 1 回だけ訊かれ、モデル呼び出しが 4 回以下であること／
違う呼び出しを挟む手は数えず、ターンが普通に `answered` で終わること／console が空の最終文に 1 文を書く経路と
`maxRepeatSteps` の値を測る。
### `tests/r732-gis-geometry-crs-checks.test.mjs` (#R732)

9 本。**幾何カーネル・座標変換・地図のレイヤーとの橋**が主張していることを測る（正本
[`GIS-CORE.md`](GIS-CORE.md)・骨格は `Architecture.md` §7.3e）。r729 と同じく、`js/geodesy.js` を
**ブラウザと同じように評価して**本物の `js/gis-*.js` を動かす。⚠ `boot()` は `geometry.ready()` を
**待つ**——カーネルは sweep-line を要求されてから取りに行くので、待たない検査は処理ではなく
`geometry-unavailable` を測ることになる。

- ① **宣言された処理には必ず走らせ手がある**——`ops()` が返すのは宣言そのもので、検査にも
  パネルにも 2 つ目の一覧が無いこと。
- ② **線と面のバッファは本物の Minkowski 和**——カプセル（線分の周りの帯＋両端の半円）の
  **解析解**と突き合わせる。⚠ **一度見た出力を焼き付けない**——記録した数は明日のコードが何を
  出しても通る。
- ③ **穴のある凹んだ窓で切り抜ける**——離れた答えは離れたまま返り、幅ゼロの連結線が無いこと。
- ④ **継ぎ目はほどかれる**（拒まれない）。拒まれるのは**世界を巻く環だけ**。面積は緯度経度の箱の
  解析解と突き合わせる。
- ⑤ **距離と述語は形そのものを読む**——外接矩形の中心からではないこと、および端から端までの連鎖。
- ⑥ **採番はプロジェクト読み込みと同じ名前空間を見る**——`ds-1` を復元しても次の取り込みが
  衝突しないこと。
- ⑦ **失敗した再計算は下流に印を残す**——元のレコードが戻り、`stale` が伝播し、処理が
  `input-stale` で拒むこと。
- ⑧ **再投影は本物**——変換できないファイルは名指して断ること。
- ⑨ **レイヤーの橋は形を丸ごと渡す**——地図側の窓が線と面を落とさないこと。

⚠ **#R729 ③ にあった 3 つの拒否（`buffer-needs-points` / `clip-window-not-convex` /
`clip-window-crosses-antimeridian`）はここの ② ③ ④ に**「拒否ではなく仕事」として**引き継いだ**。
拒否が実装になったときに測るのをやめると、拒否を消したラウンドが見るのをやめたラウンドになる。

### `tests/r735-gis-raster-time-checks.test.mjs` (#R735)

11 本。**数値ラスター・時刻の契約・空間索引・止められる処理**が主張していることを測る（正本
[`GIS-CORE.md`](GIS-CORE.md) §1.4・§1.5・§2.6、骨格は `Architecture.md` §7.3e）。r729 / r732 と同じ
boot——本物の `js/geodesy.js` をブラウザと同じように評価し、本物の `js/gis-*.js` を動かす。

- ① **先頭ゼロのコード列は符号**——`"01100"` が `text` になり、`fields[].padded` に件数が載り、
  **filter が `"01100" == "1100"` を偽と答える**こと。`0`・`0.5`・`0e3` は数のまま。
- ② **時刻の宣言は検証される**——`time-field-missing` / `time-unreadable` /
  **`time-track-misaligned`**（位置 3 に対して時刻 2）で名前を付けて拒むこと。裸の年が**その年 1 年**に
  なること、**100 未満の年が 1900 年代へ動かない**こと（#R602）、格子に地物ごとの宣言を付けられないこと。
- ③ **GPX / gx:Track は点ごとの時刻と標高を保つ**——位置を受け入れた**同じ枝**で並行配列に積むこと
  （落とした位置の時刻を積めば以降が全部ずれる）、`coordTimes` の綴りが**1 か所**であること、
  そして **`sanitizeFeatures` が位置を `[lng, lat]` に作り直す**ことを測る——それが標高を座標の中に
  置かない理由なので、その前提が変わったら検査が落ちる。
- ④ **格子はデータセット**——`kind:'raster'`・バンドが `fields[]` に並ぶ・`describe()` に payload の扉が
  入らない・格子になっていない仕様は登録の時点で例外。そして**ラスターより前の op が全部**
  `input-kind` で拒むこと（逆向きも）。
- ⑤ **格子の算術は測った数と突き合わせる**——平均が**面積重み付き**（緯度 30° 幅の 2 行で 27% 違う
  ので、単純平均と区別がつく）・void を 0 として混ぜない・値ごとの面積が**画素の面積**・測定値の
  分類を `values-not-integer` で拒む・地点の値が「読めた／穴だった／範囲外だった」を**別の答え**として
  返す・`mask` の出力が次の入力になる・格子が違う差分は `grid-mismatch`・全球 1 画素の面積が 4πR²。
  ⚠ **一度見た出力を焼き付けない**——比較相手は緯度経度セルの閉形式である。
- ⑥ **索引は対を落とさない**——同じ run を**索引を外して**もう一度走らせ、面ごとの数（と clip の断片数）が一致すること
  （取りこぼしは「間違った答え」ではなく「少し小さい数」なので、それ以外では捕まらない）。
  子午線をまたぐ箱を**両側に本物の相手が居る形で**入れる——変異（`lonRanges` の 2 本目を捨てる）で
  実際に赤くなることを確かめてある。
- ⑦ **止められる**——`signal` が立っていれば `cancelled` を返し、**何も登録しない**こと。
  進捗が報告されること。止めなければ最後まで答えること。
- ⑧ **時間の窓は軌跡を切る**——線が 2 点に切られ、`coordTimes` と `coordEle` が**一緒に切られ**、
  出力の宣言が拒否されずに残ること。属性の時刻は選ぶ側で、日付の無い行は**落として数える**。
  `within` と `overlaps` が別の答えを出すこと。軸を宣言していないデータセットは `time-not-declared`。
  **軌跡を buffer した出力は per-position の軸を主張しない**（位置が別のものになっている）。
- ⑨ **`clear()` は採番を巻き戻さない**——プロジェクト読み込みは「空にしてから名前で復元する」ので、
  0 に戻すと次の取り込みが `ds-1` を再発行して衝突する。
- ⑩ **利用者の仕事ひとつ、端から端まで**——道路から 500 m 以内の施設を区域別に数え、レシピと系譜を
  確かめ、**距離だけ 1 km に変えて同じ id の下で下流まで再計算**し、拒まれる引数では**元の結果が戻って
  下流に印が付く**こと。⚠ これは利用者が #R735 の完成条件として書いた一連の作業そのものである。
- ⑪ **到達できること**——`js/gis-panel.js` が `sources()` / `toDataset()` / `toRaster()` を呼び、その節が
  実際に描かれ、走っている焼き込みが再描画をまたいで止められること。そして `data.query` の**引数
  スキーマ**に `spatial` が在ること（#R732 は evaluator と目録に書いて、**模型が見る一覧に書かなかった**）。

### `tests/r749-gis-raster-pipeline-checks.test.mjs` (#R749)

13 本。**格子は計算できたが、見ることができなかった**——その配管を端から端まで測る。
本物の `js/map-ui.js` の upload closure を、**記録する描画器**と stub の document に対して評価する
（`tests/r738-gis-style-checks` と同じ boot）。

- ① 格子は**エンジン自身の動的画像**に載る（geojson source も 3 レイヤーも作らない）
- ② ⚠ **行はエンジンに訊く。** stub の `imageRowLatitudes` は**どんな等間隔の歩き方でも出ない
  緯度**を返すので、その呼び出しを無視した塗り手は偶然にも一致できない（#R195 の 895 km ずれを、
  この塗り手について訊いたもの）
- ③ 尺度の無いバンド（全部同じ値／全部欠損）は**名前で断る**。2 つは**別のコード**
- ④ 凡例は**絵を塗ったその集計**（欠損の画素も、宣言された nodata も NaN も両方数える）
- ⑤ 消したら canvas ソースも消える ／ ⑥ 属性着色は名前で断り、**凡例を消さない**
- ⑦ `classifyRaster` が返しうる拒否は全部、**同じファイルの中に文を持つ**（集合はコードから拾う）
- ⑧ **画像を断る描画器は成功と報告されない**（#R739 と同じ規則を格子について）
- ⑨ ⚠ **カーネルのバイトが動いて版が動いていなければ落ちる**。台帳は
  `scripts/gis-kernel-versions.mjs`、ハッシュは**改行を正規化してから**取る（門の判定が走者の
  性質にならないように）
- ⑩ GeoTIFF は**地物の機械に入る前に**格子として取り込み経路を出る
- ⑪ 2 つの新しい読み手（`js/gis-geotiff.js` の `refusals()` と `js/gis-warp.js` の `refuse()`）の
  拒否が全部、`js/map-ui.js` の `reasonText` に文を持つ
- ⑫ ⑬ ⚠ **配線が描けていることは通電していることではない。** 検査の中で組み立てた本物の
  GeoTIFF のバイトを、読み手 → warp → レジストリの契約 → 塗り手へ**通す**。実測: 2 つの
  module は互いの `affine` の形が違い、**両方とも自分の検査では緑**のまま、落とされた
  GeoTIFF はその継ぎ目で断られていた

⚠ **付随して分かったこと（#R749）**——`tests/r231-checks` の zh / zh-hans の inline 被覆は
**百分率の文字列を `/100\.0%/` で照合する**ので、`6299/6300 = 99.98%` は「100.0%」に丸められて通る。
その陰に **#R743 で入った未訳の 1 文字列が 1 ラウンド隠れていた**（今回 40 件増えて分母が動いた瞬間に出た）。
⚠ **閾値は動かしていない**——直したのは欠けのほうである。丸めが「ほぼ 100%」を「100%」と読ませる構造は
残っており、件数（`6339/6339`）で述べれば消える。

### `tests/r749-gis-geotiff-checks.test.mjs` (#R749)

17 本。⚠ **検査用の TIFF は検査側のライターがバイトから組み立てる**（実装の関数を 1 つも使わない）。
II と MM が同じ配列を返す／strip と tile が一致／4 つの圧縮が無圧縮と一致／predictor 2 が効いている
（無視した再構成と 20 画素以上違うことも測る）／`GDAL_NODATA` が **NaN** になり実在の 0 は 0 のまま／
地理参照の無い TIFF と BigTIFF が名前で断られる／`refusals()` がソースの拒否と**同一集合**であること／
`read()` が呼ばれるまで画素を展開しないこと／ctx による中止。

### `tests/r749-gis-warp-checks.test.mjs` (#R749)

11 本。⚠ **参照は warp の外**（前方 affine の定義・`js/geodesy.js` の半径から書き下した haversine）。
恒等 warp が 1 画素も動かさない／EPSG:32654 の往復が四隅と中央で一致／90° 回転 affine の転置が全画素
厳密一致／**NaN 1 画素が 4 画素に増えない**（nearest 落ちが効いている）／`method` 省略と不明の拒否／
`align` の規則未指定・不明・`grids-disjoint`／`categorical` の拒否と、整数だけでは推測しないこと／
**70°N で出力画素の実距離を測地で測る**／中止と進捗／CRS 未申告と壊れた affine の拒否。

### `tests/r749-gis-persistence-checks.test.mjs` (#R749)

7 本。⚠ **不変条件は「到達した答え」ではなく「元の欠陥」で書く**。宣言した型と単位が保存と再読み込みを
**越えて失われない**／読み手や出典が述べた単位が**利用者の宣言として復元されない**／いまのデータで
成り立たない宣言は**無検証で写さず** `refused` に名前付きで出る／処理レコードの版が違えば
`engineChanged` に出る／**測れなかった（null）ときに「同じ」と報告しない**／古い
`RECORD_VERSION` のレコードに**今の版が代入されない**／取り消し履歴は保存されない。

### `tests/r749-gis-sources-checks.test.mjs` (#R749)

9 本。上限で切った取得が `all` と名乗らない／画面外を捨てている供給元が `all` と名乗らない／
**全世界の bbox を渡しても、タイルしか持たない供給元は `all` にならない**（この層が作られた理由）／
`toDataset()` の `provenance` から `coverage` が読める／`region()` が 1 画素ずつの `sampleAt` と
同じ値を返す（参照は素の `sampleAt` ループ）／オフのレイヤーは**空の成功ではなく** `layer-not-visible`／
`list()` が手書きの一覧ではない。

### `tests/r729-gis-core-checks.test.mjs` (#R729)

7 本。**データセットと処理の基盤**（正本 [`GIS-CORE.md`](GIS-CORE.md)）が主張していることを測る。
⚠ ④ の母集合は #R735 で `js/gis-raster.js` を含むようになった——`js/gis-ops.js` は格子カーネルの拒否を
**そのまま返す**（理由はカーネルのものが一番役に立つ）ので、そのコードもパネルに届く。
⚠ 本物の `js/geodesy.js` を**ブラウザと同じように評価して**（`export` を持たないので import できない）
本物の `js/gis-datasets.js` / `js/gis-ops.js` / `js/gis-project.js` を動かす——stub を書くと
**実物より高機能な fixture** になり、その欠陥を原理的に見られない（#R621）。

- ① **列の型は値から測る**——`pop` という名の text 列と、名前で何も言っていない number 列が
  両方正しく判定されること。`12 km` は text。空セルは型を決めず数だけ隣に持つ。`2020` は number。
  `03/04/2020` は text（読む人によって違う日になる）。列の集合は全地物の**和集合**。
- ② **連鎖が 1 つの台帳の上で走る**——filter → buffer → clip → aggregate が**登録 4 回**で、
  `lineage` が 2 つの取り込みまで遡れること。5 km の円の**球面**面積が 78.5 km² 近傍であること。
- ③ **本当に拒む**——線の内向きバッファは `inward-buffer-needs-area`、切り取りの窓が面でなければ
  `geometry-type`、環を 1 つも持たない面は `no-clip-polygons`、読者の列を上書きする集計は
  `output-column-in-use`、存在しない列の条件は `unknown-field`。
  ⚠ **0 件は答えであって失敗ではない**（`{ok:true}`）。
  ⚠ 幾何カーネルが来る前の 3 つの拒否はここに無い——上の #R732 ② ③ ④ が**仕事として**測る。
- ④ **返しうる拒否コードに、全部 9 言語の文がある**——⚠ **両側を構文から集める**。
  `js/gis-ops.js` / `js/gis-project.js` / `js/gis-core.js` / `js/gis-layers.js` /
  `js/gis-raster.js` / `js/gis-expr.js` / `js/gis-datasets.js` / **`js/gis-sources.js`**（#R749）が返す集合と
  `js/gis-panel.js` が文を持つ集合を突き合わせる（`tests/r576-checks` ⑩ と同じ形）。検査に一覧を
  書くと、次に増えた 1 件が黙って落ちる。実際に**綴りが 2 つに割れていた 1 件**をこれが出した。
- ⑤ **保存は本体とレシピを分ける**——取り込みは features ごと、処理は**段だけ**。入力が先に書かれる。
  `setParams` で半径を 5→10 km にすると面積が 4 倍になり、レシピが**新しい半径**を持つ。
  再読み込みで取り込みは中身ごと、処理は**もう一度走って**戻る。
- ⑥ **クエリはレジストリを問い合わせの瞬間に読む**——`run` と `catalogue` の入口に `syncUserTables()`
  があり、登録先が `TABLES` **そのもの**で、外れたデータセットが表でなくなること。
- ⑦ ⚠ **登録は「読まれた」ところにあり「描かれた」ところには無い**——`addFC` に登録が入ると、
  読者が分析結果を描くたびに「ファイルが出典」を名乗るデータセットが増える。`js/gis-core.js` が
  レンダラに直接触らないこと、`sourceCrs` を名乗るのが**仕様が WGS 84 を固定する 3 形式**だけで
  あることも同じ検査が測る。
### `tests/r728-atlas-final-shape-checks.test.mjs` (#R728)

3 本。ISS の 3 通りの問いで `search()` が返す行が 12 以下で先頭が `layers.satellites` であること／
`readReply` が turn schema の鍵を持つ JSON 形の文を空にし、散文と parse 済みの返答は従来どおりであること／
偽の衛星モジュール（5°・62°・20° の 3 通過）で `satelliteFacts` が 3 本を列挙し掠めに印を付け、カタログが
「通過モードは無い」と言うこと。

### `tests/r727-atlas-find-checks.test.mjs` (#R727)

5 本。レジストリにカタログ文を束ねて `search()` を**実際に走らせ**、ISS の 5 通りの問い（日本語・英語）で
`layers.satellites` が 1 位になること／頻出語で最長ブロックが勝たないこと（`min(1, 2/df)`）／Latin 語が語として
照合されること（«iss» は «missile» に無い）／正確な別名（100 点）が文書得点（天井 30）を越えられないこと／
空振りの文が「持っている id で直接呼べ」と言うことを測る。

### `tests/r726-atlas-eval-checks.test.mjs` (#R726)

16 本。本番の Atlas に 14 問を投げて読者として読んだ結果から出た欠陥を、**モジュールを node で評価して**測る:
回答契約の `heading` が ATX 記号を剥がすこと／本文からの地名抽出が改行をまたがないこと／本文由来の 1 語候補は
ambiguous でも並ばないこと／厳格ジオコーダが `namedetails=1` で問い `featureNames` を **geo-resolve から受け取って**
（写しを持たずに）照合すること／`research.historicalMap` の観測器が `factions` で、同じ件数の描き直しが
`completed` になること／`camera` 観測器が到着を待つこと／`layers.baseDisplay` が登録・schema・カタログ・
dispatch の 4 か所に揃い `find_capability` で届くこと／`mechanical()` が成功結果に `text` を載せること／
`find` の空振りが探索を終わらせる文であること／衛星・天気・経路の結果が事実を運ぶこと／過去年のハイライトが
era の面を使うこと／状態記述が勢力図・era 政体・天気／衛星カードを述べること／人格に `workspace` 節があり
internal 呼び出しには載らないこと／`map.clear` が `clear` 観測器で、消すものが無ければ `already_clear` になること。
### `tests/r725-atlas-trace-detail-checks.test.mjs` (#R725)

5 本。作業一覧の**引数の欄**が、能力自身の宣言から来ることを測る。⚠ **本番が見つけた欠陥**
——#R723 の欄は `a.name || a.place || a.country || …` という**11 個のキー名の一覧**で、
本番の実ターンでは**全行が空**だった（走った `map.compose` は主題を `title` に持つ。12 個目の綴り）。

- ① **本番が実行した 4 つの引数そのもの**（`IntMapAtlasExec.execute` から採取）で、各行が主題を出すこと。
- ② **レジストリ全件の掃引**——schema が宣言する全引数に値を入れ、選ばれたものが必ず
  「enum を持たない文字列」であること。⚠ **数と真偽は文字列として渡す**（モデルは `zoom:"10"` と
  書く）。そうしないと「宣言された型」の規則に到達せず、外しても緑のままだった。
- ③ **推測しない**——schema の無い id・渡されていない引数・空白は**空欄**（推測は「何をしたか」について嘘をつく）。
- ④ **順序と必須が食い違う 1 件**（`chart.compose` は free=[title, source]・required=[kind, source]）で
  **能力の宣言順が勝つ**。最初に書いた「必須を優先」は、この 1 件で**図表の題名ではなく出典**を出した。
- ⑤ **行動の `type` が主題にならない**——21 の schema が `type` という名の引数を宣言している
  （今日は全部 enum なので ② の規則が既に拒む）。**機構ではなく不変条件**を述べてあるので、
  `type` が自由文字列で宣言された日にこれが落ちる。

⚠ **6 種の変異で全部鳴ることを確かめた**（キー名の一覧を戻す／enum を通す／必須優先を戻す／
未知の id を推測する／空白を通す／宣言された型を無視する）。**うち 2 つは最初生き延びた**
——④ は差の出る 1 件を測っていなかったから、②は数を数として渡していたから。

### `tests/r753-account-menu.spec.js` ＋ `tests/r753-account-menu-checks.test.mjs` (#R753)

6 本＋3 本。**アカウントのボタンとアカウントメニュー**。⚠ **このパネルのログイン後の半分は、
これまで一度も試験されていなかった**——`tests/r168.spec.js` は自分の頭でそう書いている
（「currentUser は届かない。hermetic policy が Supabase を塞ぐし、資格情報を試験に置くわけには
いかない」）。塞がっているのは**通信**であって**セッション**ではない: supabase-js は
`getSession()` を localStorage から答えるので、**期限が未来のセッション 1 個**で
`refreshCurrentUser()` が走り、本物の `openAccountMenu()` が開く。その後にこのモジュールが
プロジェクトへ出す要求（プロフィール行・当日の利用行）は hermetic policy の意図どおり全部落ち、
モジュール自身の catch が受ける——**通信の無い端末でこのパネルが耐えるべき状態そのもの**。

- ① **広い画面のボタンはアイコンを持たず、携帯では逆にアイコンがボタンである**
  （計算値と実測の箱。34px であることまで）。
- ② **ログイン後の経路でシートが開き、日次の計器を 2 つとも述べる**（2 行・2 本のバー）。
- ③ **`.acct-*` の規則で何にも当たらないものが無く、パネルの class で規則の無いものも無い**
  ——#R488 の形。`acct-danger` は**規則が無いまま**出荷され（#R231 の註が述べている区切りは
  一度も描かれていなかった）、`.acct-color` は**使う者がいないまま**残っていた。
  ⚠ **いま当たらない ＝ 死んでいる、ではない**（`.acct-ai-out` は残 0 の色、
  `.acct-ask-danger` は破壊的な確認）。手書きの除外表ではなく、**その class をモジュールが
  書いているか**で分ける——状態の class は `js/auth-ui.js` に在り、消えた部品の class はどこにも無い。
  ⚠ CSSOM を歩くとき、**入れ子 CSS のブラウザでは CSSStyleRule も `.cssRules` を持つ**
  （空）。「`cssRules` があれば入れ物」とすると**52 個あるうち 0 個**しか見えない。
- ④ **確認と入力がシートの中で起き、Esc は上にあるものから閉じる**（確認 → シート → 開いた
  ボタンへ focus が戻る）。
- ⑤ **Google のセッションに、持っていないパスワードの欄を出さない**。
- ⑥ **パネルが何も投げていない**。

⚠ **この spec は deep tier（nightly）で走る。** 実測 594 / 1,970 / 574 ms ＝ 表の 2 秒で、`CORE_MAX_S`＝1 を超えるから——**価格であって好みではない**（`scripts/tiers.mjs`）。
**push を門で守るのは同じ回の checks 側**（node・`npm test` に内包）で、#R620 と同じ関係にある。

checks 側（node）は、ブラウザに言えない 2 つだけを述べる: **window.confirm/prompt/alert を
持たないこと**（問いは 1 つの `_acctAsk()` を通る）と、**残り回数をこのファイルが計算し直さない
こと**（`aiUsageSummary()` が唯一の答え）。⚠ 後者の綴りは**語境界で測る**
——`HOST.aiUsageSummary` は `HOST.aiUsage` を部分文字列として含むので、素朴な包含検査は
この回が依拠している呼び出しそのものを禁じてしまう。

### `tests/r746-atlas-clock-rounding-checks.test.mjs` (#R746)

3 本。**作業一覧が印字する所要時間**を測る。本番で見出しの時計が `1m58s → 1m59s → **1m60s**
→ 2m00s` と数えていた（分と秒を別々に丸めていたので、毎分 0.5 秒だけ必ず起きる）。

- ① **存在しない時刻を印字しない**——0〜5 分の全境界の前後 ±1.2 秒を 10 ms 刻みで掃く。
- ② **自分が名乗る精度より真値から離れない**——① だけなら「常に 0m00s」でも満たせる。
- ③ **時計が逆走しない**——① ② はどちらも**列**を見ないので、境界で戻る時計を見逃す。

⚠ `fmtMs` は private のままで、`Date.now()` を動かして `done()` に塗らせる
（**読者の画面が塗られるのと同じ経路**。検査のためだけの export は `tests/r175` ③ が禁じる）。

### `tests/r744-atlas-trace-head-checks.test.mjs` (#R744)

6 本。**進行表示が 1 種類であること**を測る。#R723 の一覧は自分の見出し（「Working」＋ターンの
合計時間）を持ち、**同じターンについて泡の中のシマーも同時に出ていた**——本番の実測は
「Working 40.5s」と「Researching」が上下に並んでいる状態。⚠ **重複していたのは語だけで、
合計時間は残る**（②）。

- ① **見出しがいま起きていることを言い、同じことを言うものが他に無い**——考え中で始まり、
  操作が走ればその操作の語になること。加えて**泡の中の印は文字を持たない**こと（`live()` で
  戻したあとも）。
- ② **ターンの合計は見出しに残り、それは行が持っていない数である**——操作を一瞬で終わらせ、
  その周りで**待つ**ターンを作り、見出しの数が**行の和より大きい**こと。⚠ この 1 本は最初
  「合計はもう出ない」を測っていて、**間違ったものを測っていた**（重複していたのは語だけ）。
- ③ **取り消しが探す綴りで、作業中の返答が今も見つかる**——印は**泡の子孫**であること、
  見出しの語は `.atl-b` の中に無いこと、呼び出し側 2 か所が今もその綴りを名指すこと。
- ④ **停止の注記は印を置き換える**——実物の `markCancelled` に、**文字を持たない印**という
  このラウンドが新しく渡す入力を与えて訊く。
- ⑤ **語が変わっても、シマーしている要素は作り直されない**（要素の同一性で訊く。作り直すと
  アニメーションが 0% から再開する＝文字を比べる検査には見えない欠陥）。
- ⑥ **詳細は見出しの後ろにあり、その見出しが開く**——見出しの markup と折り畳みの CSS。

### `tests/r723-atlas-progress-ui-checks.test.mjs` (#R723)

5 本。**Atlas が回答中に読者へ何を見せているか**を測る。⚠ **ソースを読まずモジュールを評価する**
（#R505）——測っている欠陥のうち 3 つは**順序の**欠陥（何がいつ消え、いつ戻り、いつ外れるか）で、
ソースからは見えない。そのために必要な最小の DOM（`className` / `innerHTML` の代入が子を捨てる
こと / `insertAdjacentElement` / class 選択子だけの `querySelector`）をテスト側に持っている。

- ① **済んだ段が次の段が始まっても画面に残る**——`view.flyTo` → `research.brief` → `data.weather` の
  ライフサイクル事象を流し、3 行とも一覧にあり、走っているのはちょうど 1 行であること。
  （旧実装は要素 1 つを毎段上書きしていたので、6 段のターンは 1 語ずつしか見えなかった）
- ② **能力の一覧が母集合である**——`makeAtlasCapabilities({})` を読み込み、`category` の集合を取り、
  そのどれかに言葉が無ければ落ちる。加えて **登録されていない id でも「考え中」と名乗らない**
  ことを直接訊く（#R744 以降は `phaseWord('think')` に語を訊く——印が文字を持たなくなったので、
  `stageHtml()` に訊き続けると**空文字列との比較で常に真**になる）。⚠ 後者は**測って足した**——前者だけでは fallback を「考え中」に書き換えても
  **緑のままだった**（母集合の全 category に言葉があるので fallback へ到達しない＝空虚な主張）。
- ③ **道具 1 本ごとの compose が印を奪わない**——`ai.innerHTML` の代入で `.atl-stage` が消えることを
  まず確かめ（これが欠陥そのもの）、`live()` が戻すこと・一覧は泡の子ではなく兄弟なので消えないこと・
  `done()` がターンの終わりに印を外すことを測る。印は語であり、同時に**取り消し走査が探すもの**。
- ④ **走り続ける一覧が残らない**——`done()` を呼ばずに次の返答を開いても、前の一覧が「作業中」を
  主張しなくなること。出口を全部数え上げる代わりに、**返答が 1 つ増える 1 か所**で守っている。
- ⑤ **綴りの一覧が戻っていない**——`_STAGE_OF` / `_STAGE_TXT` が `js/atlas-console.js` の**コード**に
  無いこと（`scripts/code-only.mjs` で剥がす。両ファイルの**説明文**はその名前を書いているので、
  生テキストで引くと済んだ撤去を失敗と呼ぶ）。

⚠ **5 本とも、書いた直後に変異で鳴ることを確かめた**（行を上書きする／category の言葉を 1 つ落とす／
fallback を「考え中」にする／`live()` を無効化する／`done()` の撤去をやめる／次の返答で前を閉じない／
綴りの一覧を戻す）。**最初 1 つが生き延び**、それが ② の後半を足した理由である。
### `npm run check:histfidelity` — 出荷した歴史地図を、形ではなく**主張**として測る (#R730)

`scripts/hist-fidelity.mjs --check`（オフライン・約 3 秒。`npm test` と `ci.yml` の両方が呼ぶ）は、
上の門が測っているのと**同じバイト**に別の問いを出す。上の門はどれも**形**を測る——リングが閉じ、
span が順序どおりで、どの世紀にも在force の単位がある——そして**そのすべてが緑のまま**、地図は
令制国 48 国と五畿七道の道を紀元前 200 年から描き、壱岐国・安房国・東海道・山陰道・西海道を 1900 年にも
今日も描き、上海の共同租界とフランス租界を上海が生まれる前から描いていた（廃藩置県は 1871-08-29）。
**整った span は、誰かが述べた span ではない。** 測るのは 3 つで、**3 つを同時に読む**:

- **unsourced span** — 上流が述べていない開始日から描かれている行。**0 でなければ落第**。
  ここだけはラチェットではなく、ハードな不変条件である。
- **double claim** — 同じ名前・同じ admin_level の単位が、ある瞬間に二重に在force になる組。
  `identical` 54・`nested` 34,189・`seam` 11,196 で、**増えたら落第**。
- **coverage** — その年に地図が政体の中に置いている陸地のうち、**第1級の区分が描かれている割合**を
  0.25° の陸地格子で測る。政体の母集合は `data/cshapes.js` / `data/hist-borders.js` /
  `data/hist-eras.js` で、**どの記録がどの帯を答えるかはその記録自身から導く**（`js/time-borders.js`
  の定数を写さない）。観測の正本は `data/hist-fidelity.json`（紀元前 500 年から 2019 年まで 18 年ぶん・
  `measured` にその測定日）で、前回の観測より 0.5 ポイント下がったら落第。`--update` が記録し直す。
  実測: 1500 年 4.9%・1800 年 25.4%・1900 年 47.2%・2000 年 55.4%・2019 年 59.6%。1900 年に第1級の
  区分が 1% 未満の政体は 82、**一部だけ**が 30、丸ごと（95% 以上）が 38。
  ⚠ **被覆だけを見て上げてはならない**——最も安い上げ方が「誰も置いていない年に単位を描く」ことで、
  それがこの門の 1 番目の測定そのものである。だから 3 つは 1 つの門が同時に読む。

`--report` は政体ごとの表を、`--year 1900 --in 128,30,146,46` は**その年その枠に実際に描かれているもの**を
そのまま並べる。後者は便利機能ではなく、`.agents/rules/historical-verification.md` §2-1 が要求する
読み方である——令制国はそれで見つかった。集計はすべて緑で、1900 年の日本の一覧が
「滋賀県, 壱岐国, 安房国, 東海道, 山陰道, 西海道」だった。

⚠ **この門が測れない 3 つを、含みではなく明示で書く。**

- ① **上流が述べた日付が、史実として正しいかは測れない。** 測っているのは「誰かが述べたか」だけである。
  実測: Wikidata は和泉国の廃止を 1861 年、河内国を 1881 年と述べており、OHM の 1871-08-29 のほうが
  正しい。述べられた日付どうしの食い違いは、機械には多数決にしか見えない。**史実の側の検証は
  人間の仕事として `.agents/rules/historical-verification.md` が引き受ける。**
- ② **`seam`・`identical` と、本物の係争を区別できない。** 数えているのは同名・同レベルの単位が
  1 つの瞬間に重なる組だけで、年精度の継ぎ目（上流が 1852..1853 → 1853..1889 と書く形）も、上流の
  重複も、Alaska boundary dispute や Essequibo のように**2 つの主体が実際に主張した土地**も、同じ
  「二重」として出てくる。だから内訳は**ラチェット**であって、0 を目標にしていない。
- ③ **被覆の分母は「地図が政体の中に置いている陸地」である。** 国境記録が薄い年は分母も薄い——
  紀元前の数 % は「区分が無い」だけでなく「その年に描かれている政体がほとんど無い」ことも意味する。
  年をまたいで割合を比べるときは、分母が同じ記録から来ているかを先に見ること。

### `tests/r730-histfidelity-checks.test.mjs` (#R730)

7 本。**どれも直した姿ではなく、元の欠陥に対して書いてある**——各本が古い挙動を置き直し、門が
気づくことを測る: 出荷した 3 層に**誰にも帰せない下限から描かれる行が 1 行も無い**こと／令制国が
大宝律令（0701）に始まり廃藩置県（1871-08-29）に終わること／**開始日だけを述べて終了日を述べない
単位は「いまも在force」なので、導出した終了日を受け取らない**こと（これが無いと Distrito Federal が
畿内から 1871-08-29 を受け取る）／**1 件の証言は制度の合意ではなく、導出した span は区間でなければ
ならない**こと／行を元の下限へ戻すと `check:histfidelity` が実際に落ちること／時計が届くどの時代にも
観測があり、門が `package.json` と `ci.yml` に宣言されていること／
`.agents/rules/historical-verification.md` が恒久の文脈として読み込まれること。

### `tests/r819-gis-*.test.mjs` — GIS 基盤の 11 本（#R819）

**どれも「直した姿」ではなく「元の欠陥」に対して書いてある**（[[intmap-restate-the-defect-not-the-fix]]）。
「キャッシュが効く」「複数の runtime を作れる」「扉が増えた」は**実装についての文**で、
昨日の答えを返すキャッシュ・1 つの registry を共有する 2 つの runtime・こちらで計算して `used` と
名乗る扉を、どれも緑で通す。

| ファイル | 本数 | 何を測るか |
|---|---:|---|
| `r819-gis-aggregation-checks` | 9 | `areaWeightedMean` が**区域内の地面**で重み付けられること（実測の 10.89 と 55）／**既定は動いていない**こと／「交差するか」と「どれだけ寄与するか」が別々に訊かれ、地面を持たない member と値が読めない member が**別の欄**に数えられること／量が**列から**読まれ、著者が記録されること。⚠ 返り値の形ではなく**答え**を、実物の registry と実物の op を通して測る |
| `r819-gis-index-checks` | 18 | 偽陰性ゼロを**種別ごとに、索引を外した走査に対して**（索引どうしを比べると両方が同じだけ間違っていれば緑になる）／継ぎ目が特例でないこと／**既定の候補集合が動いていない**こと。⚠ ③ は**この回の前のファイルを実際に走らせて採った digest** との照合で、今日のソースから期待値を組み直さない（[[intmap-co-designed-reader-cannot-falsify]]）／仕事の計器が本当に仕事を数えていること／`auto` が名前ではなく測定で選ぶこと |
| `r819-gis-sources-checks` | 16 | 窓は出せるが絞り込めない供給元で、**どの条件がどこで効くか**が計画され記録されること／**上限で切れた頁を濾したものを答えにしない**こと（`plan-unsatisfiable`）／`coverage.answeredBy`／申告と実測を並べて食い違いを名指すこと |
| `r819-gis-staged-acquire-checks` | 13 | **`kind:'staged'` が読者にも Atlas にも出ない**こと——後段が `js/gis-ops.js` の filter で走り、橋の中に書いた比較で走らないこと／解消した理由が**消されずに「解消した」と述べられる**こと／`analysis` が取得条件の語彙に在ること |
| `r819-gis-topology-checks` | 16 | 単体では完全に妥当な 2 つの区域の**重なり・隙間・合っていない共有境界**が、件数ではなく**幾何として**返ること／許容幅が呼び出し元のもので、許容した隙間も**測って返す**こと／⚠ **両端がつままれた薄片が `gaps` では出ない**ことを含む |
| `r819-gis-warp-checks` | 10 | 抱えた常駐量が**読者が検算できる形で報告**され、書き出す先が在れば**実際に上限が効く**こと／同じ warp を別の割り方で走らせて**同じバイト**になること／**総量が再標本化を生き延びる**こと——⚠ 箱では原理的に保存できない**回転した格子**の上で測る。⚠ areal の参照値はこの検査の中で `js/gis-raster.js` の閉じた式から組み、測る対象の外に置く |
| `r819-gis-worker-checks` | 9 | 式のカーネルと幾何演算が**本物のスレッド**で答えること／止めが**1 回の巨大な演算**に届き、半端な答えを残さないこと |
| `r819-gis-geometry-portable-checks` | 6 | factory が**自分のバイトから組み直されて**答えること／同じ演算が両スレッドで**同じ JSON** を返すこと／運べないものが**形を複製する前に**名指されること／⚠ **その分類が主張ではないこと**——宣言された全演算を、dep を抜いたカーネルに通して、事前判定どおりの拒否が出るか確かめる／公開の答えが動いていないこと（`geom-2` 据え置き） |
| `r819-gis-worker-dispatch-checks` | 7 | **受け口はあったが呼び手がいなかった**——`expr.rows` は登録済みで、`js/` にペイロードを組む者が 1 人もいなかった。同じ式が両経路で**画素単位で同じ格子**を出すこと／運べない式が実行前に判定され、主スレッドが同じ答えを出すこと／数値規則が**2 つ目にならない**こと（U+00A0 を含めてセル単位で一致）／中止が途中結果を答えにしないこと |
| `r819-gis-cache-checks` | 7 | 条件が 1 つも動いていない問いが**二度計算されない**こと／**5 つの条件を 1 つずつ動かす**と別の答えになること（⚠ 対照つき——同じ鎖 2 本は**同じ鍵**になるので「常に違う」では通らない）／切れば #R783 の経路と答えに戻ること／**引いた記録が食い違えば捨てて op が走る**こと |
| `r819-gis-runtime-checks` | 12 | 同じ id を使う 2 つのジョブが互いの数を答えないこと——⚠ **2 つの本物の realm**（worker thread）で測る。プロセス内の「別 runtime のつもり」は、この検査自身の帳簿を測ることになる／片方を終えてももう片方が動くこと／解放時に飛んでいた呼びが**必ず決着する**こと／単一 runtime の経路が #R783 のままであること／**`scope-conflict` が守っているものを守り続ける**こと |

### `tests/r782-draw-slider-coarsens-checks.test.mjs` (#R782)

5 本。**モジュールを評価して測る**（#R505）——Draw の「解像度」スライダーが何をするかは走っている
関数の性質で、ソースの綴りではない。①**描かれる線が、スライダーが残した折れ線と頂点単位で一致する**
（全設定で。⚠ これが**撤去した機構の回帰**である——「`smoothPath` という綴りが無いこと」を測ると、
別の名前で滑らかにし直すビルドで緑になる）②解像度 0 では捕捉した軌跡そのもの③スライダーは実際に
粗くする（頂点数は単調に減り、**最大折れ角は増える**。⚠ 単調減は `<=`——RDP は底を打つので厳密な
減少はその平坦部の位置を測ることになる）④面積はスライダーに不変（#R8c）⑤捕捉が 1.5px より細かく、
札が「平滑化」と言っていないこと。⚠ **4 本が変更前のビルドで赤くなることを確かめてある**（④ は
不変の契約なので緑のまま）。

### `tests/r719-histmap-coverage-checks.test.mjs` (#R719)

9 本。門の側は**壊して鳴るかを測る**（合成の root を作って `--check` を走らせる。#R680 の仕掛け）:
階層の admin_level が**集合として**不整合なら落ちる（重複・穴）／1 階層 1 レベルは通る／
世紀の穴は落ちるが「単に遅く始まる階層」は通る／**名前の天井を述べていない階層**は落ちる／
穴埋め記録から 1 単位を落とすと「1国は丸ごと」が落ちる。描画の側は `js/map-tools.js` の
**捕捉の細かさ**だけが残っている（線を面積の追跡より細かく採ること）——⑧ が測っていた
Catmull–Rom スプラインは #R782 が撤去した。

`tests/r575-checks.test.mjs`（13 本）はパンデミック・シミュレーターの**数理そのもの**を測る——
外部監査が挙げた 12 の性質を、ソースを読むのではなく **engine を node で走らせて**確かめる:
人口保存（各国・毎 step・`S+E+I+R+V+D = 初期人口`）／**再生速度から独立**（engine の中に `speed`
という語が無いこと、および 1 回で 400 日回した状態と 50 日を 8 回回した状態が完全一致すること）／
免疫 0 か月で NaN も Infinity も負も出ないこと／潜伏 0 日でも人口が増えないこと／**I が 0 でも E が
残っていれば終わらない**こと／累計感染が単調であり `R+D+I` と一致しないこと／移動量 0 なら他国へ
渡らないこと／同じ種は同じ流行・別の種は別の流行になること／R₀<1 は減り R₀>1 は増えること／
初期免疫を上げるほど流行が単調に小さくなること／**新しい変異株を持つ国はその時点でちょうど 1 国**で
あること／点の散らしが多角形の外へ出ないこと。⚠ 13 本目は UI 側の契約で、`js/playground.js` に
`speed` を掛けた確率と `T.R+T.D+T.I` の攻撃率が**戻ってこない**ことを見張る。
⚠ 11 本目（変異株）は**種を 1 つではなく 6 つ**走らせる。変異株の発生は 1 日 0.0014 のベルヌーイ
試行なので、1 つの種で 900 日なら**3 回に 2 回しか起きない**——`seen > 0` は落ちるまでコイン投げに
勝ち続けていただけで、行き先の抽選が変わった瞬間に落ちた。測っている性質は 1 つも緩めていない。

`tests/r682-hist-eras-note-checks.test.mjs`（7 本）は、歴史国境レイヤーが「いま何を描いているか」を
述べる文を測る。⚠ **ソースを読まず、モジュールを評価する**（#R505）——`js/time-borders.js` を `vm` の
文脈に載せ、同梱の `data/hist-eras.js` を `window.__HISTERAS` として渡し、時計を実在の年へ動かして
`note()` / `coverage()` / `typeNote()` に訊く。そうしないと測れないのがこの回の性質だから:
**文の数は、source に載っている当の FeatureCollection の数である**（`shownFC`）。ソースに「141」や
名前なしの「6,955 件」が書いてあることを確かめる検査は、**文と線が食い違った日にも緑**で、それがまさに防ぎたい
壊れ方（#R669 が令制国に立てた規則と同じ）。⚠ `data/hist-eras.js` の 54 枚**すべて**について名前あり／名前なし／分類の
内訳を束自身と突き合わせるので、1 枚について正しいだけでは通らない。枚どうしの空白も
「紀元前 10000 年と 123000 年の間には何も無い」という**数**ではなく、記録の隣り合う 2 項の関係として
測る（上流が間に 1 枚出した日に書き直さなくてよい）。⚠ **綴りは 1 つも固定していない**（#R488）——
9 言語については「9 本が互いに異なること」と「数えた数が入っていること」だけを測る。
⚠ `js/map-ui.js` が `opts.sub` を実際に描くかはこの検査の外（描画の事実なので、ビルド済みの本番で
実測した）。⚠ vm の realm が違うので配列の `deepEqual` は原型で落ちる——`.length` で測る。

`tests/r678-pandemic-p1-checks.test.mjs`（10 本）は、シミュレーターの**入力**を測る——
症例の点をどこへ置くか、次にどの国へ届くか、その国に何ができるか、画面の数がどこから来たか。
3 本は**この回が測定によって決めたこと**を後の編集が黙って戻せないように置いてある:
① **重みが等しい／無いアンカーは、置換前の丸投げ巡回と 1 点も違わない配置になる**（最大剰余法＋巡回。
この性質があるから「重み付きの別関数」を作らずに済んだ）／② 90/9/1 の人口は 90/9/1 の点になり、
**千点あれば最小の町も 10 点を受け取る**（重み付けが「最大の都市だけに症例がある」に化けていないこと）／
⑤ **路線表に出発行の無い国の行は、路線表を渡す前と 1 ビットも変わらない**——「2014 年の表に無い」を
「どこへも飛ばない」と読ませないための保証で、同時に**直行便の無い国が到達不能にならない**ことも測る。
残りは、⑦ **出典が名乗る `for` がそのプリセットに実在する欄であること**（散文ではなく鍵なので、
欄の改名で attribution が迷子にならない。**COVID-19 の R₀ と IFR に出典が無いという事実も固定する**——
将来の編集が黙って全部に出典を付けたらこの行を書き換えねばならない）／⑧ `data/health.json` に
**COVID-19 の免疫列が無いこと**（ハイブリッド免疫は接種率ではなく、作れば MCV1 の列と同じ見た目になる）／
⑨ 観測は**形**を与え、スライダーは**人口加重平均**を与えること、かつ「未知の病原体」では効かないこと。
⚠ **spec は 1 本も足していない**——`check:testbudget` は suite 全体が天井ちょうど（81.0 / 81.0 分）で、
規則は「spec を足す回はどこかから時間を払う」である。実ブラウザでの確認はリポジトリ外の
使い捨てスクリプトで行った（#R675 と同じ扱い）。

`tests/smoke.spec.js` の **R766 ①②③** は、その到達可能性を**ブラウザで**測る——#R670 の検査は
「登録済みの `sim.*` が全部行を持つか」を**ソースから**数えており、`sim.*` ではない扉（データと分析・
比較ビュー・相関分析・地図データの読み込み・Playground・レイヤープリセット）を 1 つも見ていなかった。
本番 R765 を 18 幅で測ると、`#layer-tools` の **8 個すべてが全幅で `rect 0,0,0,0`** だった。
⇒ 測るのは **「帯が差し出す扉は、読者が開くパネルから到達できる」**で、扉は**列挙せず DOM から
数え上げ**、`elementFromPoint` で 1 つずつ訊く（[[intmap-visible-is-not-unoccluded]]）。
⚠ **「`#btn-gis-panel` が在る」は測らない**——それは**ずっと在った**ので、その綴りを書いた検査は
**出荷済みのビルドで緑になる**（[[intmap-restate-the-defect-not-the-fix]]）。
⚠ 下限は「1 つ以上」で**今日の個数ではない**（携帯では 3 つが作られないので、個数を固定すると
その差が不合格になる）。

⚠⚠ **なぜ独立した spec ではなく smoke なのか。** 新しい spec は `check:testbudget` の core 天井
（0.6 分）を壊し、しかも `scripts/tiers.mjs` の current-round 例外により**次のラウンドで deep へ
降りて、push でも PR でも走らなくなる**（[[intmap-deep-tier-rots-unwatched]]）——**3 度再発した
欠陥の検査としては最悪の置き場所**である。smoke は `CORE_ALWAYS` で**既に起動している**ので、
`scripts/test-budget.mjs` の言葉どおり「the assertions are free, the boot was the whole price」。
⚠ 携帯の面も**リロード不要**（`syncResponsive` が `resize` で `applyLayout` を回す）なので、
2 つ目の起動を買わずに両レイアウトを測れる。
⚠⚠ **パネルは「開いているはず」ではなく、読者と同じように `#lsr-toggle` を押して開ける。**
実測: seeded session の 1280×720 では読み込みから 30 秒後も `body.lsr-open` は false だった
——閉じたパネルの中の扉は当然到達できないので、開けない検査は**製品を誤って赤くする**。
帯の配置も build / open / close / 再構築 のときだけ走るので、開くことが置き場所を確定させる。
⚠⚠ **スクロールは待つのであって、時間を測らない。** `scrollIntoView` のあと 120ms 寝る初版は
**3 回に 1 回落ち**（実測: 812 高の画面で中心が y=890。落ちる扉は毎回違う）。矩形が
viewport に入るまで**ポーリング**し、入らなかった扉は `reach:false` として報告する（嘘をつかない）。
⚠ **測定の罠**: ペインが合成されていないとシートの transition が進まず `top` が動かない
（[[intmap-raf-zero-is-not-a-product-defect]]）。**screenshot を 1 枚挟むと進む。**

⚠⚠ **変異検査を回すときは 1 本ずつ `-g` で走らせる。** `tests/smoke.spec.js` は
`test.describe.configure({ mode: 'serial' })` なので、先頭が落ちると後続は「did not run」になる
——それを**「緑だった」と読むと、不合格を出せない検査を出せると誤判定する**
（[[intmap-co-designed-reader-cannot-falsify]]）。実測: `_placeLayerTools` を `return;` で潰すと
**①②③ すべてが単独実行で赤くなる**（`-g` を使わないと①しか赤く見えない）。

`tests/r766-gis-entrance-checks.test.mjs`（4 本・147 ms）は**ソースが答えられることだけ**を測る
——運んだノードが捨てられる前に救い出されているか（**順序**）・二重の扉の判定が宣言からの計算の
ままか・`data-os-act` が実在するコマンドを名乗っているか・帯を動かす各経路のあとに再配置が走るか。
⚠ **到達可能性そのものはここでは測らない**——ソースを読むことは、この欠陥が 3 ラウンド生き延びた
方法そのものである。

`tests/r670-checks.test.mjs`（3 本）は**到達可能性の正本**を測る。#R666 は
「LayersのToolsからアクセスできるように」に `#layer-tools` へのボタンで答えたが、そこは
**クラシックのドロップダウンの中**で、既定の読者には `display:none` の祖先の下で `0×0` だった
（本番実測。ボタンも OS アクションも正しく届いていて、**帯だけが描かれていなかった**）。
⚠ **#R258 ⑨ と #R261 ⑨ は手で書いた id の一覧**なので、あとから足された模擬装置を 1 つも見られない
——**手で書いた一覧は、そこに足されなかったものに気づけない**。この検査は一覧を持たず、
**登録済みの `sim.*` コマンドを数え上げて**、そのすべてが `js/map-ui.js` の行を持つことを要求する。

`tests/r666-checks.test.mjs`（4 本）は**入口**を測る——`sim.pandemic` が OS アクションであること、
Layers ▸ Tools がその行を持ちコマンド経由で押すこと、`#btn-playground`（**どこも作っていない id**）
への配線が消えたこと、Atlas が**モードを選ぶ前に**モジュールを取りに行くこと。

`tests/r666-model.test.mjs`（10 本）は**数値そのもの**を測る。2 通目の外部監査が挙げた 4 件は
**すべて実測で確認された**もので、engine を走らせて確かめる: **平均潜伏日数・平均感染日数が設定値と
一致する**こと（以前はインフルエンザの潜伏 1 日が 2.31 日・麻疹の 11 日が 12.03 日）／**実現する R₀ が
設定した R₀ と一致する**こと（以前は 1.4 が 1.66・12 が 13.40。「1 未満なら減る」型の検査では見えない）
／確率 1 の遷移が**全員に毎回起きる**こと・確率 0.5 の遷移が 0.393 ではなく 0.5 になること（二項分布）
／**接種した人のうち防御された割合が効果と一致する**こと（以前は効果 0.4 でも 0.6 でも同じ 3,300 万人が
`V` に入った）／`SV` が保存則と感染力の**両方**に入っていること／**空の国に着いた輸入株が 100% その株**
であること（以前は 47.1%）／行き先が**分布**であり人口・陸境・空港規模を反映すること／
**有病率の足切り無しに小さな流行も出国でき、出国者の数が感染者の数とともに増える**こと／
`data/airports.json` と `data/country-facts.json` が閉じていること。

`tests/r689-chronos-coverage-checks.test.mjs`（8 本）は、#R679 が「数で残した」歴史都市名の穴と、
その回が**書き留めておいて払わなかった**帰属表示を測る。①②は `LIC()` を**評価**して、
ライセンスが「attribution を言わない」「credit を負うのに払う行を名指さない」「負わないのに
名指す」宣言を拒むこと、そして**その宣言が自分の直列化を往復できる**ことを見る（最初の版は
`source !== undefined` で判定していて、JSON の往復が「無い」を `''` にするので、**自分が書いた
生成物の上で発火した**）。③は「行が導出なら LICENCE を出す」——母集合はファイル名の一覧ではなく
**行が自分で名乗る `derived`** なので、4 番目の上流はそれが収穫された日に含まれる。④は出荷物の
側から同じことを訊く: `data/hist-cities.json` の `rights` のうち attribution を負うものは、
`js/reference-data.js` に行があり、**9 言語すべての `pages.*.js` に説明がある**こと。

⑤〜⑧は被覆そのもの。⑤は**日付を言えない主張のラチェット**——開始を言わない span を持つ都市は
2,288、うち日付つきの証拠を 1 件も持たないのは 1,694。これは上流に無いものなので埋めず、
**増えないことだけ**を門にする（減るのは常に可（可＝許される））。⑥は「日付つきの証拠を持つ都市では、
日付つきの証拠が答える」——#R679 の並び順の不変条件で、⑤が直せない残りが**まさにその証拠を
持たない都市だけ**であることを示す。⑦は #R679 が開いたままにした問い（「読めない名前と、日付の
悪い名前のどちらが悪いか」）への答えが**並べ替えではなく言語欄の共有**であることを、
ヴォルゴグラードの 1700 年で測る。⑧は OpenHistoricalMap がもたらした被覆（AD 1000–1499 が
106 → 388 span）と、**その上流の span がすべて開始年を言う**ことを見る。

`tests/r695-histadmin-names-checks.test.mjs`（10 本）は、行政区分の単位が**読者の言語で読めるか**を
測る。①〜⑤は判定規則を**評価**する（`scripts/histadmin/names.mjs` は DOM もネットワークも時計も
持たない）——①違う名前を述べる単位が同じ Wikidata 項目を名乗っているなら**誰もそのラベルを
受け取らない**（Q724＝Maine を *Devonshire County* が名乗っている）／②同じ単位が時代ごとに
分かれているだけなら名乗ってよい（Provinz Brandenburg は 10 件とも Q700264）／③1 件だけの主張は
使え、**述べる名前が 1 つも無い組**は使えない／④埋めるのは**空いている欄だけ**で、Wikidata の
曖昧さ回避ラベルは地図のラベルにならない（規則は `scripts/histeras/match.mjs` の `plainLabel`
1 本）／⑤`name:zh` の字体は**実際に変換して**判定する。⑥〜⑩は出荷物の側から: **どの言語欄も
読者が実際に受け取れる欄であること**（`IntMapLang.htmlTag` で往復する。誰も読まない `zh` 欄は
バイトの無駄である）／**埋めない言語が埋める言語に勝っていないこと**／**出荷を絞っても収穫と
キャッシュは 9 言語ぶんであること**（戻すのに再取得が要るなら「1 行で戻せる」は嘘になる）／
Wikidata の裸の `zh` が**簡体側**であること（IntMap の `zh` は繁体）／第2級の単位の**半分以上が
出荷言語で読めること**。⚠ 天井の数そのものは門（`check:histadmin`）の側にあり、ここでは
繰り返さない——1 つの事実に正本を 2 つ作らないため。

`tests/r673-checks.test.mjs`（11 本）は 3 通目の外部監査が挙げた 9 件を測る。どれも「模型が単純
すぎる」ではなく、**同じプログラムの 2 か所が同じ問いに違う答えを返していた**箇所である:
到達していない国でも**免疫が減衰し接種が進む**こと（以前は 1 つの `if (!seeded) continue` が感染の
算術と一緒にそれも飛ばし、**旅行者が着いた日がその国の公衆衛生の開始日**だった）／未到達国に配らない
ことが `vaccinateUnreached` という**明示された政策**であること／`S=0・SV>0` の国にも輸入が着くこと
（国内の感染力は両方から引くのに輸入は `S` しか見ず、**同じ人が隣人には感染し空港には感染しなかった**）
／`draw()` が**半端な人数でも期待値どおり動かす**こと（n=0.5・p=0.5 で 0.125 ではなく 0.25。
「1 人まるごとの Bernoulli を引いてから `min(n,k)` で切る」が払い出しを半分にしていた）／
どんな端数でも人口保存が崩れないこと／**120 か月は 120 か月で、「終生」は別の欄**であること
（`>=600 ⇒ ∞` の帯域内番兵が、Ebola の実在する 10 年を「∞」と表示させ、**同じ上端を触ると本当に
無限にしていた**）／**累計死者だけの国は現在症例の点を描かない**こと（描いていて、しかも赤だった）
／差分の署名が **21×2 の状態すべてを区別する**こと（`cls+sev×2` は 2 組を厳密に衝突させていた）／
プリセットの値がスライダーの格子を**そのまま通り抜ける**こと（Ebola の R₀ が engine 1.95・入力欄 2・
ラベル 1.9 の 3 つに割れていた）／「現在の世界」が**実在するワクチンと治療法から始まる**こと
（COVID-19 だけが両方 `false` で、画面の説明と算術が正面から食い違っていた。SARS は対照——
実在しないので `false` のまま）。
⚠ **7 件は変異テストで検出力を確認してある**——修正前の実装を 1 つずつ戻すと、それを名指す検査が
**7 件とも赤くなる**。「関数名がある」「綴りが一致する」ではなく、**振る舞いを測っている**（#R505）。
⚠ **`caseDotPlan` / `dotSignature` / `snapToStep` は `js/pandemic-model.js` の export である。**
DOM のクロージャの中にあったから外部監査に見つかり 11 ラウンドの検査に見つからなかったので、
`scatterCases()` と同じ理由で外へ出した。

⚠ **`tests/r666-model.test.mjs` ⑦ は、それ自身が構造として無効だった。** `seed(i, cases)` が
`fromShare` に `null` を**固定で**渡していたので、`inject` の `if (fromShare) mixShare(…)` は
**一度も走らなかった**——株の割合を手で置き、種を播き、割合が変わっていないことを主張する検査は、
何も触らなければ必ず通る。#R666 の欠陥を実装に戻しても**緑のままだった**。`fromShare` は公開
シグネチャに入り、この検査は変異テストで赤くなることを確認してある。**引数が私有なら、その規則は
間違えようがない**（＝測れない）。

`tests/r575.spec.js` はその**ブラウザ側の 1 本**——engine を別ファイルへ出した以上、「import が
届いていない」「HUD がボタンを描かない」「地図のクリックが engine に届かない」は node からは
原理的に見えない。設定画面が出て、地図の click で流行が始まり、**日が進み**、点が 2 種類
（赤＝感染性・橙＝潜伏中）だけを名乗り、HUD がその両方と「1 点＝何人ぶんか」を印字し、例外が
1 つも出ないことを 1 回の起動で読む。

`tests/r530.spec.js` はその**ブラウザ側の半分**で、#R564 で 3 つ増えた——どれも node からは
原理的に訊けない: **印がレイヤーへ届いているか**（線の source が `imta-ln-src` で、しかも多角形の
数より features が少ない＝海岸線の写しが落ちている）／**z6 未満では深い層を取得もしないか**
（`window.__HISTADM2` が未定義であること。カメラが要る）／**区分名のクリックが記録の多角形を
輪郭にするか**（`IntMapOutline.current().geo` が `geomAt()` と JSON 一致すること）。
⚠ 3 つとも**同じ 1 回の時間旅行**の中で読む——束の解決を待ち直さないため（#R530 の値付けと同じ理由）。

`tests/r531.spec.js` はその門の**ブラウザ側の半分**で、これだけはファイルに訊けない——
印がレイヤーへ**届いているか**。#R531 以前は `imtb-line` に幾何があるかを測る spec が 1 本も
無かったので、**線の source が空でも全部緑**だった。

## 放射性物質の拡散モデル — `tests/r576-checks.test.mjs`（12 本・#R576）

⚠ **10 本は、模擬の気象場を組んでモデルを実際に走らせて測る。** 外部からの講評が挙げた 10 点は
どれも「印字された数が、それを知る手段を持っていたか」の話なので、**ソース文字列の一致では
1 点も測れない**——#R505（ソースを読む検査は評価順序を見ない）と #R488（綴りを固定した検査は
死んだ機構を緑のまま残す）の同じ形である。風・雨・境界層を合成で組み、粒子を飛ばし、
**出てきたものについて**主張する。⚠ 上流を 1 回も呼ばないので、**今日の天気に依存しない**
（`js/radiation-model.js` は DOM も window も持たないので Node から直接 import できる）。

守っているもの: 開始時刻が要求した**瞬間**に最も近い時刻であること／粒子が**自分の高度の風**で
流れること／内側ネストが近傍を解像し、外側が遠方でも風の場であること／領域を出た粒子が
クランプされず**退役して数えられる**こと／拡散係数が摩擦速度と境界層から来ていて**気温から来て
いない**こと／run が終わったという理由で地面に何も落とされないこと／ピークが `1/√n` の誤差棒を
持ち、標本が足りなければ**数値を withhold する**こと／放出量が**事故 × 核種**であること／
法定区分が**それの存在する核種にだけ**出ること／初年度線量が**積分**であって掛け算でないこと。

残る 2 本は**配線**で、ここだけはファイルを読む——**物理の写しが 1 つであること**
（`src/radiation-worker.js` は `js/radiation-model.js` を import するだけ、`js/sims.js` は同じものを
import し、worker が無ければページで解いて `engine` で名乗る、`src/main.js` が client を読む）と、
**モデルが純粋であること**（`document` / `window.` / `IntMapLang` / `requestAnimationFrame` を
1 つも含まない＝worker で走れる）。

⚠ **「戻ってはならないもの」を見張る grep は 3 か所だけ**で、どれも走らせる検査の**中**に置いてある
——⑥ は `js/sims.js` から «settle the remainder»（終了時に浮遊分の半分を地面へ落とす行）が消えた
ままであること、⑧ は `js/atlas-console.js` が `SOURCES[x].bq`（核種によらない 1 つの放出量）を
読まないこと、⑩ はその回答文から `annualMSv`（「この線量率が 1 年続く」）が消えて `r.firstYearMSv`
に置き換わっていること。**存在しないことは、走らせても観測できない。**⚠ ⑩ の grep は**コメントを
落としてから**当てる——直しの上の注記は消した式をわざと引用しているので、区別できない grep は
「その欠陥を説明すること」を禁じてしまう。

## 位置引数の i18n 監査 — 要求する引数の個数と、床の分母

門そのもの（`npm run check:i18n` ＝ `scripts/i18n-audit.mjs --gate` と、その子の計器 13 本）の全体像は
`Architecture.md` §10.1 が正本。ここに書くのは、**その計器が何を数えているか**である。

- **「引数が足りない」の判定は、方針から導く。** `scripts/i18n-positional-audit.mjs` は
  `scripts/lang-policy.mjs` の `authoredLangs()` を読み、`pick()` が位置で解く 5 言語
  （en / jp / de / ru / es）のうち**方針がまだ書く最後の位置＋1** を要求する。いまは 2（en+jp）で、
  方針が 9 言語へ戻れば自動的に 5 へ戻る。⚠ **ここが 5 という直値だった間、憲法の改正どおり
  en+jp だけで書いた新しい文字列は「欠陥」として報告されていた**——方針が実行できない状態である。
  実測では当時 short なサイトは 0 件だったので、**改正後に最初の位置引数を書くまで誰も気づけなかった**。
- **言語別の被覆（＝床）の分母は「5 言語ぶんの組を実際に持つサイト」である。** 解析できた call site を
  そのまま分母にすると、ドイツ語の引数を 1 つも持たないサイトが「翻訳済みのドイツ語の行」として
  数えられ、**存在しない翻訳が、翻訳を削除から守っている当の数に積まれる**（実測: 改正後の最初の
  2 サイトで de/es/ru が 7,341 → 7,343 に上がり、門は床をそこまで上げろと言った）。
  組を持たないサイトは「未翻訳」でもない——**この計測の外**にあるので、数える前に返る。
- ⚠ **だから `tests/i18n-coverage-floor.json` の de/es/ru が 7,341 → 7,332 に下がっているのは、
  計測の訂正であって削除ではない。** 翻訳の行は 1 つも消えていない。
  ⚠ **「英語と同一の引数」を測る側は狭めていない**——ドイツ語の引数を実際に渡しているサイトは、
  今もドイツ語を渡し続けなければならない。これが「床」であって天井ではない、ということの中身である。

## 文書の検査 — `npm run check:docs` の規則一覧 (`scripts/doc-facts.mjs`)

Every rule this gate applies, by the name it reports itself under. `Architecture.md` §15.5 sends the
reader here for this list; adding a rule means adding a row.

| rule | it fails when |
|---|---|
| `scan` | the sweep did not reach the tree, or missed a document it is required to read |
| `app-size` | `Architecture.md` §1's file counts disagree with `index.html` / `js/` / `src/` / `css/` |
| `edge-functions` | `supabase/functions/` and `supabase/config.toml` disagree, a roster document drops a name, or the standing instructions can no longer reach a document that holds the whole roster |
| `edge-count` | any document states an inventory size that is not the real one |
| `edge-roster` | a document writes the roster out and omits a function, or introduces it with a wrong count |
| `edge-shared` | a document enumerates `_shared/` and the list is not what is in the directory |
| `migrations` | a stated migration count is wrong, or a named `.sql` file does not exist (`sql-path`) |
| `serving` | a document still says the site is served from the repository tree or from OneDrive |
| `deploy` | a document still describes the gated Pages deploy as switched off, or `docs/RELEASE.md` stops saying it is on |
| `build-info` | the published build stamp is spelled with a leading hyphen |
| `usb` | a document other than `AGENTS.md` states the backup frequency |
| `languages` | `js/locales/`, `_langs.js`, `Architecture.md` and the README disagree about the languages, or a document writes the full roster of nine in codes the app only accepts as aliases |
| `alerts` | the warning-feed counts in `docs/MAP-LAYERS.md` / README disagree with `js/world-packs.js` |
| `app-shape` | a document still describes the app as one hand-written file with no build step |
| `anon-key` | a document puts the browser-side Supabase key in the entry page instead of `src/vendor.js` |
| `arch-rounds` | `Architecture.md` carries a round reference — the history belongs in `DEV-NOTES.md` |
| `cesium` | a document describes the second engine as withdrawn while it ships |
| `monitors` | a document presents the withdrawn Area Monitors entry point as still clickable |
| `news-path` | the privacy policy describes a news path the switches in `js/app-body.js` do not take |
| `csp` | the CSP as `index.html` writes it is not the CSP the documents describe |
| `db-tables` | the migrations, the pgTAP structure test and the documents disagree about the tables |
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
| `histb-count` | the size of the day-exact border record below CShapes, as any tracked file states it, disagrees with `data/hist-borders.js` — or one of the nine source pages states that row without a number its English original states (see below) |
| `shrink-policy` | one of the three standing documents states the removal policy without the confirmation step, without forbidding it unilaterally, or without sending the reader to the 正本 for the Atlas carve-out |
| `section-refs` | a document names another document and a `§` number that document has no section for |
| `gate-callers` | `package.json` declares a `check:*` script that neither `ci.yml` nor `npm test` ever runs |
| `bordercoast-rings` | a document states how many rings the border/coast record marks, and `data/border-coast.js` marks a different number (three documents said 25,506 while the bundles held 33,600 — the number came from #R564 own completion line and none of the three copies moved) |
| `chronos-sheets` | a document — **or a tracked file under `js/` or `scripts/`** (#R717) — states how many year snapshots `data/hist-eras.js` holds, in Japanese (`枚`) or English (digits **or** a cardinal word), and the record holds a different number |
| `chronos-units` | a stated unit or ring count for one of the historical admin tiers, or the count of era polygons upstream gave no name to, is not what the bundle holds |
| `chronos-bytes` | a stated MB weight of a bundle in `data/`, or of the two admin tiers together, is not what the files weigh in either convention (see below) |
| `histadmin-inforce` | a cell of the in-force table in `docs/MAP-LAYERS.md` is not what that tier holds in force on that year — re-derived with the builder’s own probe |

The last six of the #R403 batch are described below, after the Edge Function rules they grew out of.
The final three arrived in #R500; `tests/r500-checks.test.mjs` is what proves they actually go red,
and — as with `deep-tier-when` (#R407) — that test file is the only path by which they reach CI,
because the static job does not run `check:docs`. The last two rows arrived in #R628 and
`tests/r628-checks.test.mjs` (six tests) is theirs, for the same reason and by the same method —
mutation under the tree lock, with `--rule` so a mutation costs one rule's runtime rather than the
whole file's.

### ⚠⚠⚠ (#R717) `chronos-sheets` の母集合だけが `js/` と `scripts/` へ広がっている

`scripts/doc-facts.mjs` が掃くのは長らく**追跡された `*.md` と `package.json`** だけだった。
同じ出荷バイトについて同じ種類の主張をしている**ソースのコメント**と、**読者が開く出典ページ**
（`js/locales/pages.*.js`）は、どの規則の外にもあった。実測（#R717 当日・`data/hist-eras.js` の枚数）:
`js/hist-scale.js`・`js/time-borders.js`・`scripts/build-hist-borders.mjs`・`scripts/histeras/census.mjs`・
`scripts/asset-report.mjs`、そして**9 言語すべての出典ページ**が、1 枚少ない数を述べていた。
#R716 はこの形を 1 件見つけ、**その 1 ファイル・その 1 つの数**に向けた針で答えている
（[[intmap-discovered-list-is-a-photograph]]）。⇒ 母集合を git から取り直した。

- **英語の主張も読む。** 針は `枚` しか知らず、ソースのコメントと出典ページの英語は全部その外だった。
  数詞は**語で書かれていても数である**（正本は「Fifty-four frames」と書く）ので、英語の基数詞を読む。
  ⚠ **これは言語の数詞であって事例の一覧ではない**——単位・十位・teen が合成されるので、まだ誰も
  書いていない数も読める。⚠ 読むのは**憲法 §7 が IntMap の執筆言語と定める 2 つ**（`枚` と英語）だけで、
  第 3 の言語が数を語で書いた場合は下の残余に落ちる。
- **偽陽性は実測して塞いだ**（緩めたのではない）: ① 枚は**年で名指される**ので、束自身が持つ
  スナップショット年（1920・1930・1900・1960 …）は数ではなく名前として扱う、
  ② `#R518` のようなラウンド札は数ではない（数字の前の語境界が分ける）、
  ③ 「in N snapshots」は**どこに描かれるか**であって記録の大きさではない、
  ④ 3 つの束を名指して合計を述べる文（`120 sheets`）はこの束についての主張ではない、
  ⑤ 時代の限定は**直前の数**に掛かる（「54 world snapshots, 17 of them BC」を 2 件の落第にしない）。
- ⚠ **広い母集合を受け取ったのは `chronos-sheets` だけで、これは限界であって好みではない。**
  `chronos-units` は母集合全体を**錨なしで**掃き、`chronos-bytes` は**同じ文で直前に名指された
  `data/` のパス**へ数を結びつける。44 の文書に対しては健全だが、571 のソースに対してはそうではない
  ——実測で新しく出た 29 件の落第のうち **26 件が規則の読み違い**だった
  （`js/reference-data.js` の「N first-level units … from Natural Earth」は**現代の**束の話——
  ⚠ その N はここには写していない。この文書はこの規則の掃引の中にあるので、単位の名詞の隣に
  書いた数はそれ自体が主張として読まれる、
  `scripts/build-hist-eras.mjs` の「71.5 MB」は**上流のダウンロード**の大きさ、そして
  **小数点にコンマを使う言語（9 言語中 7 つ）では「34,03 MB」が「03 MB」と読まれていた**）。
  残る 3 件のうち**本物だった 2 件はこの回で直した**（出典ページの gazetteer の重さ 3.9 → 5.3 MB を
  9 言語、`js/tsunami.js` の bathymetry 1.26 → 1.29 MB）。**狼と叫ぶ針は次のセッションが緩める**ので、
  2 つの規則がこの母集合を受け取るのは、上の 3 つを学んでからである。

⚠ **(#R707) 上の 4 行が見ていないもの（残余を隠さず書く）。** Chronos の束の数は、その束を名指す
**文**または**ブロック**（1 つの箇条書き・1 つの表の行・1 つの段落）の中にあるときだけ主張として読まれる。
したがって:

- **同じ文の 2 つ目の MB は読まない。** `docs/FILES.md` は生のバイト数の隣に brotli 後の重さを書くので、
  最初の 1 つだけを「そのファイルの重さ」として扱う（brotli を毎回測り直すと実測 15.6 秒かかり、門が
  2 倍以上遅くなる）。2 つ目以降は報告行の「further MB figure(s)」に数え上げられる。
- **束を名指さない文の数は、主張として読まれない。** 実測 (#R707): `PRODUCT.md` の
  「…枚が数ピクセルずつしか占めない」は `data/hist-eras.js` も上流の名前も名乗らないので、この規則の
  外にある。数を足すときは、その数が何についての数かも同じ文に書く。
- **MB の慣習は 2 つあり、規則はどちらも受ける。** 実測: `docs/FILES.md` は MiB（11,116,066 バイトを
  10.60 と書く）、`docs/TESTING.md` / `docs/MAP-LAYERS.md` / `package.json` は 10 進（16,224,963 バイトを
  16.2 と書く）。差は 4.8% で、この規則が捕まえた drift はどれも桁が違う（10.4 → 11.1・16.2 → 19.4・
  25.4 → 30.5）。**どちらかに統一するのは文章の変更なので、指示なしには行っていない**（`AGENTS.md` §3-2）。

⚠ **(#R694) `edge-shared` is now proved by `tests/r694-shared-roster-facts-checks.test.mjs`, and
NOT through this script.** One run of `doc-facts.mjs` is ~7.5 s, so the sweep that actually matters
— *every* name in `_shared/`, dropped from *every* roster, is caught and named — would have been
four minutes and therefore would never have been written. The judgement was moved into
[`scripts/shared-roster.mjs`](../scripts/shared-roster.mjs), which `doc-facts.mjs` imports and the
test imports too, so the sweep costs milliseconds and there is still only one copy of the rule. The
same file also covers `check:archfiles`: that the `_shared/` roster may be line-wrapped at **any**
of its names, that a `js/` module described in the `supabase/` block does not count as described,
and that the gate is still red for the defects it exists to catch. This is #R575's lesson in a new
place — arithmetic nobody can reach is arithmetic nobody measures.

⚠ **`section-refs` resolves an ADDRESS; it does not read the sentence around it.** It fires only
where a document *names* the document it is addressing — in backticks or as a Markdown link — and
what it caught on its first run were addresses a session follows every round. The standing
instructions sent the end-of-round report to a subsection of §11 that does not exist, and sent the
USB mirror to another one; that chapter stops at 11.4. `docs/FILES.md` pointed twice at a section of
the Claude-side file that has stopped at §A-5 since #R503 moved the standing instructions out of it.
The aviation-source and photo-geolocation documents each carried one more. A dead section number is
not a typo — it reads as a promise that the rule is written down somewhere, and the reader who goes
looking finds a document that never mentions it.

⚠ **What it deliberately does not resolve, stated rather than implied**: a bare `§N` with no
document beside it (a self-reference, whose meaning depends on the sentence it is in) and a section
of an instruction sheet that is not in this repository. Two forms need more than a table of
headings: `Architecture.md`, `docs/FILES.md` and `docs/MAP-LAYERS.md` share **one** section-number
space — `CONSTITUTION.md` §6 declares it — so the three resolve as a single pool; and 「§3 の 5 番」
addresses an **item** of a numbered list rather than a heading, which is accepted only when the list
under that section really has a fifth item. That is the half that rots: the round that inserts an
item renumbers every reference to the ones below it.

⚠ **`languages` compares the SPELLINGS now, not only how many there are.** It used to count, and a
roster can be the right length with every name in it spelled the way the code does *not* key on:
this app's Japanese is `jp` and its traditional Chinese is `zh`, with the IETF spellings accepted by
`js/lang-registry.js` as aliases only. #R588 measured what that costs — an election pack written
against the alias set shipped 113 elections whose Japanese and Chinese notes reached nobody, and
every instrument stayed green because the fallback is a real string — and a session copies the
roster the document in front of it gives. Only a **complete** nine-name roster is read as a roster,
so a document naming an alias in order to explain the alias is untouched.

⚠ **Three rows were missing from this table before #R500** (`deep-tier-when`, `hist-cities`,
`volcano-eruptions`), even though the sentence above says adding a rule means adding a row. Nothing
compares the table with the rules it describes, so the list of what is checked was itself unchecked.

⚠ **The right-hand column paraphrases on purpose — do not quote a needle into it.** Several of these
rules are of the form *no document says X*, and this table is in a document they sweep. Writing the
row as the sentence it forbids makes the gate report this file. Measured while adding the table: two
rows did exactly that on the first attempt, and two more escaped only on a technicality (one needle
is case-sensitive, another wanted a shorter phrase). This has now happened thirteen times in this
repository; `scripts/doc-facts.mjs`'s own header assembles its needles from parts for the same reason.

### ⚠ (#R701) `histb-count` measures the nine languages without knowing a word of any of them

This rule holds the size of `data/hist-borders.js` — how many records, and how many transition
dates, the 1689–1885 window carries — against every place that states it. Until #R701 it did that
with a table of unit nouns, and **that table was made of English and Japanese**, so seven of the
nine shipped languages were outside the gate entirely. Measured across the 44 documents and the
rule's own carriers: **it read 8 claims where 30 were standing, and 14 of the 22 it could not see
were the same two numbers in the other seven languages** — ru 「1 411 записей … 881 различная дата
изменений」, fr 「1 411 enregistrements … 881 dates de transition distinctes」. Every instrument was
green, because the fallback for an unmatched sentence is silence.

⚠ **Adding seven languages' nouns to the table would have been the defect, not the fix**
([`no-ad-hoc-hardcoding.md`](../.agents/rules/no-ad-hoc-hardcoding.md)): a hand-written list of
nine translations falls out of date the first time a translator rephrases, and a tenth language
ships outside it on day one. So the nine pages are **not** measured by their nouns. They are one
authored sentence and its eight translations, keyed by the English original, which makes a
language-independent property available: **every number the 正本 states, each translation states
too.** That holds every figure in the row — the two counts, the file size, the relation totals, the
percentage, the polity range, both window ends — rather than the two a noun table can name.

- **Inclusion, not equality, and the direction was measured rather than chosen.** A translation may
  spell as a numeral what English spelled as a word (ja 「9 言語」 for «nine languages», 「3 回の
  分割」 for «three partitions»), so translations legitimately state *more* numbers — 65, 59 and 57
  against the 正本's 56. What none may do is drop one. On the nine as they ship: **56 × 8 = 448
  assertions, 0 missing.**
- **The roster is discovered from disk and then held to the shipped language count.** Writing it out
  here would be a third spelling of the same nine and would be wrong about two of them: the app's
  Japanese page is `pages.ja.js` while its language code is `jp`, and its traditional Chinese is
  `pages.zh-hant.js` while its code is `zh` (#R588).

The other half of the rule — the single-language carriers — was widened in two ways at the same
time, and one of them could not have been done without the other:

- **A number's scope is the smallest unit that names the record: its line *or* its sentence.** A
  line is a rendering artifact, not a unit of meaning, and a sentence that names the record on one
  line states its count on the next. That cost four claims, and two of them had been **stale since
  #R690 widened the window** — `js/time-borders.js` stated #R518's size in the present tense eleven
  lines above the paragraph holding the current one. ⚠ **A paragraph is not the unit, and that was
  measured before being rejected**: paragraph scope pulled in per-instant counts and other records'
  sizes — 11 false claims. #R694's shape, one rule over.
- **Grouped numbers are read whole.** The old needle took the 2–5 digits before the noun, so it read
  a thousands-separated count as its tail — the defect #R689 fixed in `hist-cities`. It was green
  only because every grouped statement happened to sit outside line scope, which means **widening
  the scope without this would have manufactured false failures the moment it arrived.**
- **The carriers are discovered, not listed.** This used to name two source files by hand (#R399's
  defect: the ledger rots wherever the list forgot to look). Everything git tracks is now swept,
  minus the generated bundles under `data/`, `dist/` and the change log — which legitimately quotes
  numbers that were true once.

**The residuals, stated rather than implied.** Counted by hand over every tracked file that writes
either number: **26 statements stand in the single-language carriers, of which this rule reads 10**
(plus the 448 held across the translations). The 16 it does not read fail for three separate
reasons, and none of them is «the table is missing a word»:

1. **Eight say `features`, and that word is deliberately not a unit here** (`Architecture.md`'s QID
   row, the English and Japanese source pages' QID sentence, `js/time-borders.js`,
   `scripts/build-histnames.mjs`, `scripts/histeras/harvest.mjs`, and twice in
   `scripts/histnames/records.mjs`). Every bundled record in this repo is a list of features, so
   the word does not say *which* record is being counted: with it in the set, a sentence naming this
   record while counting the aourednik overlay contributed one false claim and the per-year probes
   contributed two more. **22 claims at 3 false is worse than 12 at 0** — a gate that cries wolf is
   loosened by the next session that meets it.
2. **Seven wear a real unit but name the record only in a PREVIOUS sentence** (twice in
   `js/time-borders.js`, three times in `scripts/asset-report.mjs`, once in
   `scripts/build-hist-borders.mjs`). Reaching them means resolving the subject across a sentence
   boundary, and the cheap approximation of that — the paragraph — was measured and rejected above.
3. **One is a bare number in a table column** (`scripts/histnames/records.mjs`), with no unit at all.

What would close (1) and (2) is the same mechanism: a reader for the **grammatical role** of a
quantity — what noun phrase it modifies, and what that phrase refers to — rather than for the noun
sitting beside it. That is a separate piece of machinery, not another entry in a table, and it is
the only honest way to widen further.

`tests/r701-histb-count-lang-independent-checks.test.mjs` is what proves the widened rule actually
goes red — twelve mutations, including one per non-English language, both directions of the grouped
number, and the green-tree baseline that proves the widening added no false claim. ⚠ **That file
had to assemble its unit nouns from parts**: the sweep now reads it too, so a mutation table that
wrote a wrong count beside its noun as one literal made the gate report the test file. Fourteenth
time in this repository.

## The Edge Function inventory, across every document (`scripts/doc-facts.mjs`)

Four rules hold the same fact from different sides. `edge-functions` compares
`supabase/functions/` with the `[functions.*]` declarations in `supabase/config.toml`, and requires
`Architecture.md` to name every one of them in backticks — and the standing instructions to **reach**
a document that does, whether by naming the roster themselves or by sending the reader to the file
that holds it. ⚠ **That half used to demand the roster in the instructions themselves, and it pulled
against the other gate on that file**: `check:agents`' `doc-size` caps `AGENTS.md` at 32,768 bytes
because Codex drops the overflow silently, and a deploy inventory is 「今どうなっているか」 rather
than 「どう働くか」. So #R628 moved the 正本 to [`AGENT-SETUP.md`](AGENT-SETUP.md) §9, where the
deploy command it belongs to already lived, and asked this rule the question that actually matters
to a session about to deploy — can the instruction it reads lead it to the complete list?
`edge-count` checks every
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
  ⚠ **(#R628) …and «every current-state document» was itself hand-drawn until this round.** The
  universe was two non-recursive `readdirSync` calls — the repository root and `docs/` — which is
  not the same thing as *the documents*: `fonts/README.md` carries a permanent instruction about
  every glyph the app draws **and** the copyright and licence notice the OFL requires to travel with
  the bundled faces, and it sat outside every rule in this file, not excluded but never looked at,
  because it is one directory over. So did `.github/pull_request_template.md`. The universe is now
  **discovered** — git's own list of tracked `*.md` — and each exclusion carries the reason it is
  one (the `DEV-NOTES` history, which legitimately quotes what was true once; `.agents/`, swept
  separately as the instruction documents; the `.claude/` and `.codex/` renderings, which
  `check:agents` holds to their source; and the untracked machine-local credentials file). ⚠ An
  empty answer from `git` falls back to the old two directories, because a sweep that reads nothing
  passes everything.
- **A needle that never fires looks exactly like a passing check.** The old pattern required a
  literal asterisk between the noun and the digits. The standing instructions bold the whole phrase
  — asterisks *before* the noun — so their number was never once compared with the tree. It stayed
  right for another reason entirely: the per-name roster check.
- **`.match()` answers for a whole file with its first hit.** A document whose first mention is
  correct can carry a second, stale one forever. That is exactly what happened in the deploy runbook,
  directly above a command list that already ran the right number.
- **(#R694) A window is a length, and a length is not a relevance.** `edge-shared` read a
  **260-character window** after each `_shared/` mention and needed the closing bracket inside it.
  `docs/FILES.md` wrapped its roster over three indented lines, the close landed at ~290, the group
  came back `null`, and the roster was skipped entirely — so the gate printed «_shared/ holds 11: …»,
  **naming all eleven**, while passing a document that listed nine. Cutting the same roster to eight
  pulled the close back inside the window and it went red at once: what decided whether an omission
  was caught was the **length of the text**, not the omission. An inventory is now read to its
  matching bracket with no cap, and a bracket that never closes is a **failure** — «I could not read
  it» must never leave as «it is fine». The same rule also excused any list of **fewer than three**
  names, so dropping nine of eleven was caught and dropping nine of ten was not; the count was never
  what made a passage an inventory. What does is that the mention is of the **directory** rather than
  of a file inside it — `_shared/newsgeo.js`（＝ブラウザの `js/newsgeo.js` と1バイト同一） is a true
  sentence about one file, and reading its bracket as a roster calls it ten names short.
- **(#R694) A mutation anchored on a spelling measures last year's spelling.** `tests/r399-checks` ①
  pinned the literal roster text, so **adding two files — correctly, to every document — turned CI
  red** because the anchor was no longer in the tree (the #R488 / #R530 shape). Mutations are now
  written as the **breakage**: read the real directory, drop one name from whatever the document
  actually says. A correct addition cannot invalidate it.

- **(#R699) A set of separators is an inclusion list, and everything outside it is invisible.**
  The count half bound the number to the noun with a hand-written set — 「は を — – - : ： （ (」 —
  and that set, not the documents, decided what the rule could see. MEASURED: `docs/README.md` was
  shaped 「Edge Function の名簿（**N 本**の名前…）」 with N **one short** of the seventeen that
  exist, and the gate was green, because 「の」 had been deliberately kept **out** of the set
  (「… の 1 本」 is partitive). Restoring that N today still leaves the old needle green —
  `tests/r699-doc-claim-needles-checks` ① carries the sentence verbatim and runs both needles over
  it, which is what makes this a fix rather than a restatement. (⚠ The sentence is **not** written
  out here: this document is inside the sweep, and a document that spells out the defect it
  describes reports itself as wrong — the self-hit `scripts/doc-facts.mjs`'s own header warns about.) Sentences outside the set were not judged wrong and not
  judged right: nobody looked at them, and the report said 「7 stated counts, all 17」 about the ones
  that happened to fit. Same shape as the window above, one level down — a property of the **needle**
  leaking out into the rule's coverage.
  The judgement moved to [`scripts/doc-claims.mjs`](../scripts/doc-claims.mjs), which asks the
  question the other way round: find every quantity carrying one of the subject's counters, then
  **walk the noun-modifier chain left** to see what it is counting. 「の名簿（17 本の名前」 reaches
  the subject through one noun; 「公開 relay 4 本」 stops at `relay` and is not ours. MEASURED over
  the same 44 documents: **7 claims → 9, with no false one**. The two sentences the old set existed
  to dodge still do not count — but they come back **classified and tallied** (`partitive`,
  `instance`) rather than unseen, which is the whole difference: a rule that reports only what it
  agreed with cannot tell 「nothing disagreed」 from 「nothing was looked at」.

What it still does not read, written down rather than papered over:

- **A bare English numeral that attaches to nothing.** `docs/SECURITY-ARCHITECTURE.md` §5 opens
  "There are seventeen Edge Functions, and this table used to list two." A statement of how many
  there are and a sentence of the document's own history sit in **one sentence**, and nothing
  structural separates them. It was tried at section scope and at paragraph scope and measured:
  widening far enough to catch the first turns the second into a failure. The counted Japanese
  quantities, where this repository's facts actually live, are complete.
- **A connector the walk does not know.** The link alphabet is still a hand-written set — but
  running off the end of it is now **visible**: a quantity that no other noun claimed, on a line
  that names the subject, comes back as `unlinked` and is checked like any other claim instead of
  joining the ~460 quantities in the documents that have nothing to do with the subject.

`tests/r399-checks` proves each half goes red, including that the `6.2` in a section heading is read
as an address and not as a quantity.

### ⚠ The same shape in the sibling rules — measured, and four claims were wrong

#R699 swept the other twelve rules that pull a number out of prose, over the same 44 documents.
Eight were complete. Five were not, and **four of the claims they could not see were wrong at that
moment**, with `check:docs` green:

| rule | saw | real candidates | true claims it could not see | what the needle was pinned to |
|---|---|---|---|---|
| `capability-count` | 10 | 13 | **3, all three stale** | the decoration around the counter, not the counter |
| `deep-tier-size` | 8 | 9 | **1, stale** | the English 「spec files」; the same fact in Japanese was outside the rule |
| `histb-count` | 8 | 30 | 22 (all correct today) | 「件の記録」/「records」 — **seven of the nine shipped languages cannot be reached** |
| `alerts` | 3 | 10 | 7 | one named sentence per number, in one named file |
| `csp` | 2 | 3 | 1 | a bare English numeral (the residual above) |

The `capability-count` misses were the reader-facing ones: `PRODUCT.md` told anyone reading it that
the search tool reaches a registry one dozen short of the 138 that exist, and `docs/FILES.md` was
further out still. A 「の」 between the number and the counter, and a missing pair of asterisks, were
the whole difference between a checked claim and an invisible one.

⚠ **But the general fix is NOT 「bind to the counter」, and `alerts` is where that was measured.**
「能力」「都市」「リング」「名前」 belong to one subject each — nothing else in this repository is
counted in them — so binding the number to the counter is exact, and that is what
`capability-count` now does. 「か国」 and 「フィード」 are not like that: sweeping every one of
them turned **fifty-nine true sentences into failures in a single run** — the radiation layer’s
countries, the internet-health layer’s countries, the news layer’s feeds, every one of them correct
and none of them about severe-weather alerts. A generic counter needs the **subject** reached as
well. So `alerts` binds the phrase that names the subject (「自前…フィード」,「MeteoAlarm の N か国」),
and what is left — prose that restates these counts with no subject beside the number — stays a
written residual rather than a sweep that cries wolf.

⚠ **And one needle captured a number it never compared.** `alerts` read
`(\d+) countries over (\w+) feeds` out of `README.md` and used only the first group, so the
spelled-out feed count beside it would have passed at **any** number of feeds. Seeing a claim and
judging it are two different things, and the distance between them here was one unused capture
group. `tests/r699-doc-claim-needles-checks` ⑪ now walks every needle in that rule and requires
each group it takes to be read.

**Still open** (measured, not fixed): `histb-count` reaches only the English and Japanese
spellings, so the same two numbers stated on the seven other source pages — 「**1 411** записей …
**881** различная дата изменений」 and its siblings — are outside it, 22 claims against the 8 it
holds. All are correct today. ⚠ Its needle is also `(\d{2,5})\s*records`, which would read a
digit-grouped 「1,411 records」 as **411** (the #R689 shape); that is latent only because every
digit-grouped line happens to fall outside its line scope. Widening the rule and stripping the
separators have to happen in the same change.

### ⚠ Three more ways a rule can be silent, all of them measured

**A fact written into a pattern is a fact nobody is checking.** `capability-count`'s sixth
needle spelled the withdrawn count as a **literal** — 「撤去済み *1* を除く (N)」 — instead of
comparing it. #R590 raised the registry and reworded that sentence in the same commit, the
pattern stopped matching, and **four claims went unchecked from that moment**: `Architecture.md`
twice and `DECISIONS.md` twice, each stating that 137 capabilities are withdrawn when exactly
one is, while `docs/FILES.md` two files away still carried the reachable count of the round
 before (138 at the time, and wrong by then). The rule printed 「10 stated
size(s)」 and none of the four was among them. This is the `alerts` capture group one step
earlier: there a number was taken and never read; here it was never taken. Both halves of that
sentence are read and compared now, and `tests/r699-doc-claim-needles-checks` ⑫ mutates the
sentence back to what shipped **and** forbids a count from returning to the pattern.

**A needle that matches nothing reports green.** `languages` required 「対応 UI 言語は」 with
half-width spaces around 「UI」; `Architecture.md` §2 writes it without them. **Zero matches
across all 44 documents**, stepped over by an `if (archN && …)`, so the rule that exists to hold
the language count to `js/locales/` had been checking nothing at all. Spacing around a Latin word
inside Japanese is a typographic choice a writer makes sentence by sentence, so it cannot be part
of the pattern. The silent skip was the other half: 「the 正本 does not state it」 and 「the 正本
states it correctly」 came out as the same green line, and §2 owns this number, so its absence is
now a failure — the way `edge-count` already demands the count of Architecture.md §6.2.

**And #R694 left half of its own lesson standing.** It removed the 260-character window from
`edge-shared`, but the sentence it criticised — a gate 「naming all eleven」 while proving nothing
about any document — could still be printed by a sweep that audited **nothing**, because that
`ok()` was unconditional. It counts the inventories it audited now, prints the count, and fails
at zero; three documents enumerate that directory and a session reads them to learn what it may
import.

### ⚠ Rules that do not say how many claims they saw

A rule whose green line carries no number cannot distinguish 「nothing disagreed」 from 「the sweep
reached nothing」 — the #R694 failure, which printed a roster of eleven while passing a document
that listed nine. `node scripts/doc-facts.mjs` (without `--check`) prints every rule's green line,
so the list is **read off the gate**, never kept by hand here.
`tests/r699-doc-claim-needles-checks` ⑧ holds the half that a list cannot: every rule that can
`fail()` must also `ok()`, because `tests/r274-checks` ① derives the roster of rules from the `ok()`
side alone, and `scan` and `sql-path` — which only ever failed — sat outside the one test whose
whole point is 「a rule that does not run cannot fail」. Deriving a universe from one of its two
sides is the same defect as the separator set above: the answer is bounded by where you looked.

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

Several files prove a gate really fails by making a fact wrong on disk, running the gate, and
putting it back. ⚠ **Which ones is a question for the tree, not for this sentence** — it said "four:
r274, r280, r399, r403" while nine files were importing the helper, because a hand-written list goes
stale the day one is added and nothing says so. Ask instead:

```bash
grep -l "helpers/gate-lock.mjs" tests/*.test.mjs
```

`node --test` runs files in parallel, so they share one lock — a directory, because `mkdir` is
atomic. Two rules about using it, both of which #R403 got wrong first and measured:

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

⚠⚠⚠ **And the lock was still letting two writers in, 2.7% of the time it changed hands (#R623).**
The owner's pid was published with `writeFileSync`, which opens the file with `O_TRUNC` and *then*
writes — so for the microseconds in between it exists and is **empty**. A waiter that read it there
got `''`, `Number('')` is `0`, `0` is not a live pid, and so the liveness check reported that the
**live** holder was gone: the waiter deleted its lock and walked in. It is the #R403 clock bug in a
new costume — a momentary failure to *read* the owner treated as proof there **is** no owner — and
one bad reclaim cascades, because the robbed holder still removes "its" lock at the end and hands
the same wound to the next waiter. Measured with eight processes taking the lock in turn with holds
that block the event loop, as the gates do: `''` on **13 of 480 handovers**, and **24 breaches of
mutual exclusion in 320 holds**. After the fix, **1,080 holds, 0 breaches**.

The lock now publishes its stamp by writing it under a unique name and **renaming it into place**,
so a reader sees the whole stamp or no stamp at all; an unreadable stamp counts as *not published
yet*, never as *dead*; and a reclaim **claims** the stale stamp by renaming it before removing the
directory, so two waiters that both judged the same dead lock cannot both delete — which is what
would otherwise let the second one delete the live lock the first had just taken.

⚠⚠ **The diagnostic used to point the wrong way, and that cost more than the bug.** When a mutation
test found its gate red under the lock, `tests/r403-checks` sampled `git status --porcelain` **after
the gate had returned** and told the reader that a clean tree means the gate itself is wrong. But
the interfering write is made *and put back* inside the gate run — that is what a mutation test is —
so the sample printed `(clean)` in exactly the case it existed to catch. Measured on CI run
34389623083, on a branch that touched none of this: `tests/r403 ①` reported `tests/r399 ②`'s
deliberate "Architecture.md no longer states how many Edge Functions there are" as its own failure.
`tests/helpers/gate-precondition.mjs` now asks the **lock** instead of the tree — every writer takes
it, so a hold that survived intact means nobody else was inside, and a hold that did not says so
outright — and it names the one case it still cannot see (a writer that mutates and restores inside
the gate run *without* taking the lock) rather than quietly excluding it.

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

### What Atlas can SEE, as distinct from what it can reach (`tests/r582-checks.test.mjs`)

Twenty questions above ask whether a capability is *reachable*. #R582 measured a different thing and
found it at zero: whether Atlas is shown that the capability **exists**, at the moment it decides what
kind of request it has. `SYS()` named eleven tools and represented the other hundred-odd with one
sentence on `find_capability` — the name of a door, and not one thing behind it. A model does not open
a door for something it has no reason to believe is there, so `sim.ballistic` (a real simulator with no
UI entry point anywhere in the product) was answered as if IntMap had no simulator at all.

Six checks, and the shape of each is deliberate:

| # | it fails when |
|---|---|
| 1 | the index Atlas is shown omits a capability the registry holds — the expectation is **derived from the registry**, never a list typed into the test |
| 2 | a withdrawn capability is advertised (the door would answer `FEATURE_WITHDRAWN`) |
| 3 | the number of simulators Atlas can see ≠ the number IntMap has — a **count**, not a spelling, because #R488 is what happens to checks that pin one |
| 4 | `SYS()` does not actually concatenate the index, or the index is not read from the registry — asked of the **syntax tree**, since a builder left defined and unwired still passes a grep |
| 5 | the index grows back into the 81,951-byte catalogue #R406 removed |
| 6 | `js/atlas-policy.js` gains or loses a clause, or its text names a weapon — the guard against answering the next refusal report with one more sentence (`CONSTITUTION.md` §5) |

Mutation-tested: unwiring the concatenation reddens ④; dropping one category from `index()` reddens ①③.

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

### Evaluating the weather engine instead of pinning its spelling (`tests/helpers/wx-ecmwf-page.mjs`)

`js/wx-ecmwf.js` decides which read wins when several arrive at once, and seven checks across five
rounds guarded that by matching its SOURCE TEXT — `/var mine = [^;]*\+\+seq;/`, `'seq !== mine'`,
`/if \(!ahead\) promote\(join\)/`. ⚠ **A correct change made all seven red at once.** The defect
they were meant to guard was in the placement of that very line: the ticket was taken at the CALL,
before `ready()`, while the join happened later — so a second request for THE SAME read overtook the
read it was about to join, and a model with no frames yet had nothing to fall back to. Moving the
ticket onto the read fixed it and changed every spelling. #R488's lesson again: a check that pins a
spelling can only guarantee that an implementation CONTINUES, not that it is right.

So the seven now **evaluate the shipped module** — browser and the Open-Meteo SDK stubbed, nothing
else — and measure the property each round actually cared about: that an overtaken read still
resolves with the frame it decoded rather than null, that it never reaches `ensureData`, that
`release()` frees only its own variable, that a read-ahead neither takes a ticket nor is killed by
one. `coldWxModel()` builds that page; the six files that need it share this one copy, because six
copies of one judgement is the thing `.agents/rules/no-ad-hoc-hardcoding.md` §2 exists to prevent.

⚠ **The page is deliberately the RICHER of the two that were written** — the one that also carries
what `js/waves.js` touches. A leaner stub is a second, more forgiving opinion about the same
browser, and #R552 measured what that costs: a fixture more capable than the shipped wiring cannot,
in principle, detect that the shipped wiring is broken.

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

## Bundled data whose upstream stopped maintaining a column (`tests/r567-checks.test.mjs`)

A snapshot of somebody else's dataset can be checked for shape — every index resolves, every
row has a name — and that is worth doing, but it cannot catch the failure that actually costs
something: a column upstream still publishes and no longer updates.

The World Heritage feed has one. Its `danger` column is empty for Palmyra, Sana'a, Kyiv and
Odesa, and its newest entry of any kind is `Y 2014`; a layer that read it would put a decade-old
snapshot on the map under a present-tense label. The status is therefore taken from Wikidata,
and **the test does not pin the count** — a pinned 52 goes red the next time the Committee
meets, which teaches everyone to update the number rather than to look. It asserts instead that
**at least one property was listed in danger after 2014**. A build that went back to the
abandoned column cannot satisfy that, whatever the count happens to be, because the column has
nothing newer in it. The property is structural; the number is free to move.

Two of the other seven are the same kind of question rather than a spelling:

- **«すべて» is measured, not asserted.** UNESCO publishes one coordinate per COMPONENT PART, so
  a build that read only the first of each row would produce exactly as many points as rows.
  The test requires more points than properties and at least one property drawn as several —
  neither of which names a number.
- **The category vocabulary must stay in the data.** `tests/r567-checks.test.mjs` ⑦ parses
  `js/beta-overlays.js` with acorn and requires every occurrence of a category name to be either
  a lookup-table key or a member of a translation tuple. A comparison, a filter or a paint ladder
  that spells one out is the #R515 shape — the layer would stop reading `whsDoc.categories`, and
  a category UNESCO adds would silently vanish from the map instead of appearing in grey.
  Verified by mutation: adding one `categories[i] === 'Cultural'` turns it red.

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

⚠ **There is exactly one question where the carriage return is the subject, not noise in front of
it (#R718): «how many bytes is the reader handed?»** Codex stops reading `AGENTS.md` at
`project_doc_max_bytes` and counts the bytes the filesystem gave it, carriage returns included, so
`check:agents`' `doc-size` must not normalise — see the `doc-size` notes above for the measurement
and what it cost. It does not read the checkout's bytes either: `crlfBytes` in `scripts/eol.mjs`
returns the size of a fully-CRLF checkout, which is derived from the content and therefore the
same number on both platforms. **Normalise when the carriage return is noise in front of your
subject; count it when your subject is how many bytes the reader gets.**

⚠ **A tool that counts LINES asks a different question, and `lf()` is the wrong answer to it.**
`readLF`/`sameText` are for «do these two texts say the same thing»; a codemod that indexes its
own array with a parser's `loc.line` needs «which line is this», and that has one right answer:
ECMAScript's LineTerminatorSequence — `<LF>`, `<CR>`, `<CR><LF>`, `<LS>`, `<PS>` — which is the
set acorn advances `loc.line` on. Use **`splitLines` / `joinLines` from `scripts/eol.mjs`**, which
splits on exactly that set and carries each line's own terminator, so a rewritten file keeps the
endings it came with instead of being re-punctuated wholesale. Deciding one terminator for a whole
file (`src.includes('\r\n') ? '\r\n' : '\n'`) is what `scripts/i18n-dead-key-codemod.mjs` did, and
on a generated file with an LF header in front of a CRLF body it counted 6,272 lines where acorn
counted 6,286: a crash past the desync, and a silently wrong line read before it.
`tests/r548-checks.test.mjs` holds that rule and **evaluates** the scripts rather than reading
them, because the broken and the fixed spelling are nearly the same text.

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

**And ask the question through a door the OLD code can answer too.** A regression check earns its
name by failing on the code before the fix — but a check written entirely against a new API fails
on the old code because the API is missing, which proves nothing about the defect. The DEM tile
store (`tests/r671-dem-store-checks.test.mjs`) had three defects that were all orderings — the trim ran
before the insert, the completion path never ran it, and nothing bounded how many requests were
outstanding — so the checks EXECUTE `js/map-readout.js`'s factory in a `vm` against a fake `Image`
the test fires by hand. Two of the measurements deliberately avoid the new statistics function:
how many `Image` objects the module constructed, and how many tiles still answer `demElevAt()`
after everything has landed. Both are questions the pre-fix module answers, and it answered **480
Images** and **480 of 480 still resident against a ceiling of 140** — the report's own numbers,
reproduced by the shipped code rather than by a model of it. A check that can only be run against
the fix is a description of the fix, not a test of the defect.

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
| `npm run test:security` (`node --test tests/security-logic.test.mjs`) | refresh-news is fail-closed / header-only / constant-time; ai-proxy needs a JWT + caps input + never logs secrets | Node only |
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
- **`tests/security-logic.test.mjs`** (`node:test`) — unit-tests the constant-time compare, then
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
- **`supabase/tests/07_r507_profiles_public_test.sql`** (pgTAP, #R507) — proves the public author
  card is a **table with RLS**, not a SECURITY DEFINER view: relkind `r`, RLS on, exactly one
  `SELECT USING (true)` policy, no INSERT/UPDATE/DELETE/**TRUNCATE** for anon or authenticated,
  a SECURITY DEFINER sync function with a pinned `search_path` and no client EXECUTE, and the
  sync proven end to end (backfill, rename, a `login_count` bump that must not disturb the card,
  a new signup, an account deletion). ⚠ **The older files could not have caught this**: they
  assert the projection (four columns, no `email`) and both roles can read it — all true of the
  defective view. This file asserts the mechanism.
- **`supabase/tests/08_relay_rate_limit_test.sql`** (pgTAP, #R801) — `relay_take` allows up to the
  capacity, refuses past it, refills after time passes (the row's `at` is moved into the past and the
  take repeated), and cannot be executed by anon or authenticated.
- **`supabase/tests/09_r801_security_audit_test.sql`** (pgTAP, #R801) — charge → settle → refund
  leaves the count and the row; two refunds of one unanswered turn decrement once; `settle_ai_turn`
  is service_role only; **no table in `public`** grants TRUNCATE / REFERENCES / TRIGGER to anon or
  authenticated (counted over `pg_class`, not over names); every SECURITY DEFINER function in
  `public` pins a `search_path` without `public` in it (counted over `pg_proc`); anon cannot file
  feedback or a bug report as an existing user and A cannot file as B; an author may update a post's
  body and `edited_at` but not `created_at`, `author_name` or `user_id`.
- **`tests/r507-checks.test.mjs`** (`node --test`, #R507) — the source-side pair: the migrations
  end with `profiles_public` as a table, the drop of the old view is guarded on `relkind` so the
  migration stays re-runnable, only `SELECT` is ever granted, the PostgREST schema reload sits
  **outside** the transaction — and the class-level gate, that **any** view a migration leaves
  behind must set `security_invoker = true`, so this defect cannot be dug a second time.
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
- **New Edge-Function auth rule?** Add an assertion to `tests/security-logic.test.mjs` (unit or a
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
回帰は `tests/r354-checks.test.mjs`。

## 時限式の fixture — `tests/r700-stale-fixture-checks.test.mjs` (#R700)

**nightly の deep tier が 1 日で 5 本（#R402/#R405/#R416/#R435/#R455）を落とし、5 本とも製品の
退行ではなかった。** どれも route で差し替えたニュースの行に `2026-08-24` という**絶対時刻**を
書いており、`js/app-body.js` の `computeFilteredNews()` は `NEWS_MAX_AGE_MS` より古い項目を一覧
から落とす——つまり **fixture は書かれた日から 3 日で期限切れになる**。実測は
「読み込みは成功していて、落としているのは鮮度フィルタ」（`loadedEventCount:1 /
visibleEventCount:0`）。同じ日に落ちた 10 件のうち残り 5 件も、数を綴りで固定した検査
（`@2x.png$` に API キーの query が付いた・`#map` が 23 px 縮んだ・段の名前が #R673 で改まった）
で、**どれも製品のほうが正しかった**。

⚠ **日付を新しい日付に書き換えるのは、同じ時限装置を巻き直すだけである。** 時刻は実行時の
時計から作る:

```js
const AGO = (mins) => new Date(Date.now() - mins * 60e3).toISOString();
```

検査は 3 本。

| # | 何を見るか | 門か |
|---|---|---|
| ① | ② が母集合を決めるのに使う `.news-item` が、まだ製品が描く行であること（`js/`・`css/` に訊く。死んだ綴りは母集合を黙って空にする・#R488） | 門 |
| ② | **ニュースの経路を route で差し替え、かつ鮮度で切られた後の一覧を測っている** spec は、時刻を `Date.now()` から作る | 門 |
| ③ | 「いつ走らせるかで意味が変わる絶対時刻」を持つ test ファイルの**観測を印字する**（製品自身の窓は `js/app-body.js` から読む。72 という数は検査に書かない） | 観測 |

⚠ **③ を門にしていないのは、その日付が鮮度で切られる経路に渡っているかを静的に決められない
から。** 実測でも `tests/r386.spec.js` は同じ 18 日前の fixture を持ったまま緑で、そこは切り口が
結果を決めていない。決められないことを決めたふりをするより印字する——「見つけたものを 1 件ずつ
許す表」を書かないためでもある（`.agents/rules/no-ad-hoc-hardcoding.md` §1）。② の母集合は
`tests/` を走査して発見し、一覧を手で持たない。

⚠⚠ **そして、これが 3 ラウンド誰にも見えなかった理由。** deep tier の spec を読む者は
**nightly しかいない**（何がそれを走らせるかの正本は上の «Where it runs»）。deep にしか居る
spec は、壊れても手元の `npm test` にも PR の CI にも出てこないので、**腐ってから気づかれる
までが一晩ではなく数週間**になる。3-D・Cesium・物理・シミュレータ・そして deep に置いた
検査を触ったら、`npm run test:deep` を自分で走らせる。

### Chronos の収録と精度

`tests/r711-historical-city-identity-checks.test.mjs` は実際の歴史都市名モジュールと出荷データを
使い、近隣の町名が都市全体の名称を置き換えないことを照会・ポップアップ解決・描画式で検証する。
正しい町域の旧名は保持する。生成時の対応キーも出典の名称証拠と照合する。

`tests/r711-label-visibility-checks.test.mjs` は出荷するラベル定義を実行し、国名・地方区分名が
拡大側のズーム上限だけで消えないことと、通常の衝突判定が保持されることを検証する。
これは常に全名称が画面に収まるという検査ではない。実画面の再現結果は開発記録に記載する。

`tests/r711-boundary-quality-checks.test.mjs` は、出典と異なる補正形状を詳細線で上書きしないこと、
島と穴の保持、表示範囲による取得、読込失敗時の元の線の維持を検査する。
同梱詳細データは `scripts/build-border-detail.mjs --check` で、形状指紋・内容ハッシュ・
座標範囲・断片の境界箱・出典relation ID・件数と容量・余分なファイルをオフライン検査する。
容量は配信するLF改行に正規化して測り、Windowsのcheckout変換をデータ増加と混同しない。
`tests/r711-boundary-quality-data-checks.test.mjs` はLFとCRLFの両方、および不正な容量記録を検査する。
キャッシュ原典がある環境では同生成器の `--check-source` で各島・穴との対応も照合する。
合計リング数の一致だけでは、失われた穴を別の増えた穴が相殺できるため十分ではない。
`tests/r711-boundary-country-refresh-checks.test.mjs` は実際の国境モジュールを実行し、
詳細線到着時に線が再設定され、現在の領域や日付が変わらないことを測る。
`tests/r700-seam-density-checks.test.mjs` は、切替日前後の描画座標がその日に有効な
原典レコードと一致することを検査する。密度と辺長中央値の変化率が一致することは要求しない。

`tests/r709-historical-places-source-checks.test.mjs` は、Pleiades の固定した出典記録を生成器の
`compile()` で実際に変換し、配信する `data/hist-places.json` と完全一致することを測る。
既存の都市名変更との出典ID重複、権利・集落型・座標・名称期間の条件、原綴り・転写・言語コード・
疑問符の保持も検査する。Runtime を評価して実データの年代別表示、1 BCE と天文年 0 の対応、
都市ラベルからの表示・縮尺・配色の継承、スタイル再読込、余分な書換えの不在、カードの出典と
精度表記、共有リーダーの登録解除、取得中断後の遅延応答の拒否を検証する。
この Node テストは `npm test` の通常の探索で実行されるため、新しい `check:*` ゲートは設けない。
手動の再生成確認は `node scripts/build-hist-places.mjs --check`。出典の期間や代表点を正しく運ぶ検査であり、
古代の創建・廃絶年や実際の遺跡位置の正しさを保証する検査ではない。

`tests/r712-historical-coverage-fidelity-checks.test.mjs` は、現代名がある歴史地点も取り込み、
適格な全出典IDが都市名変更・独立地点のどちらか一方へ届くことを検査する。
`tests/r712-historical-detail-refresh-checks.test.mjs` は、行政詳細線の部分再生成で国境の
索引・容量・参照中の断片を保持し、精度や出典条件が異なる索引の混在を拒否することを検査する。
`tests/r712-historical-city-recovery-checks.test.mjs` は、HTTP・ネットワーク・JSON・空記録の
取得失敗後の復旧、並行取得の共有、成功キャッシュ、再描画からの再入を実行して検査する。
`tests/r712-historical-ring-topology-checks.test.mjs` は、凹形の本土と島・真正な穴・穴の中の島・
出典の内外役割を検証する。`tests/r712-historical-topology-build-checks.test.mjs` は、原典再現と
座標多重集合を条件とする再分類、補正済み形状の保持、外環消失時に穴を陸地化しないことを測る。

`tests/r717-hist-fidelity-checks.test.mjs` は、**歴史地図が読者に何を主張しているか**を 4 本で測る。
① **散文の規則が `js/` と `scripts/` に届いていること**——`js/` に間違った枚数を**書いて**
`--rule=chronos-sheets` を走らせ、**落第すること**と、**落第の理由がその主張であること**を要求する
（母集合が縮んだ日にこの 1 本だけが赤くなる）。数詞は**数字と英語の語の両方**で植える——正本は
「Fifty-four frames」と語で書くので、数字だけの針ではその文が見えない。
② `data/hist-cities.json` の span が、**自分の実証ビットが否定している言語で名前を主張していない**こと。
そして `js/hist-cities.js` が**欄の無い言語を `en` へ退かせ続けている**こと——この 1 行が無くなると
9 人中 8 人の読者に空のラベルが出るのに、`check:histcities` は**記録とビルドが一致したまま**なので緑になる。
③ `data/` を走査し、**`src` を top-level に持つ束はすべてその中でライセンスを名乗る**こと。
④ **1885/1886 の継ぎ目**（主権国家の記録と OHM の記録の交代で政体が 3 割落ちること）について
`Architecture.md` が述べる数を、**両方の束から導き直して**照合する。⚠ **数は検査の中に書いていない**。

`tests/r714-hist-river-names-checks.test.mjs` は、**一致が争点ではない**ことを測る。`score()` を
評価して、空間・時間・綴りのすべてが完全に一致する候補でも、種類が地図の描くものでなければ
`not-a-place` として拒まれることを要求し、`decide()` で同点の解消も測る。さらに**広い根
（landform / body of water）が宣言されていないこと**と、**その根が消したはずの島嶼国家の行が
出荷物に実在すること**を測る。川 1 本の名前を一覧で直す検査ではない。

`tests/r713-hist-coverage-checks.test.mjs` は、**同じ問いを 1 つのストアにしか出していなかった 2 か所**を測る。
① OHM の集落掃引について、`coordOf()` を**実際に評価して**どの element 種別から座標を取り出せるかを決め、
取り出せる種別が `OHM_PLACE_KINDS`（掃引が訊く種別）に入っていることを要求する。綴りの一致ではなく
両側からの計測なので、クエリと受け側が片方だけ編集されても落ちる。`place` の絞り込みが
コメントを除いて 1 か所にしか書かれていないことも測る。
② `resolveArticles()` を評価し、正規化とリダイレクトの**連鎖**（1 段だけ辿ると別の名前が無言で
未回答になる）・循環で停止すること・曖昧さ回避ページと不在ページを記事として採らないこと・
API の区切り文字（`|` `#`）を含む名前を**別のページへの問いに変えず**に飛ばすことを検査する。
さらに `data/histnames.json` の `lanes` 集計が、文書自身の `byName` / `byQid` の行数と一致することを
**両側とも出荷バイトから導いて**測る（検査の中に書いた数は検査されている数ではない）。
これは**名前が届く割合の検査であって、歴史的な名称そのものの正しさの証明ではない**。

`tests/r709-historical-click-coverage-checks.test.mjs` は、GeoEngine の排他的所有者と説明用 fallback の
区別、歴史地名を背景面が塞がないこと、共有した出典リーダーのクリック経路を実行して検査する。
個別の歴史地名を例外一覧へ加える検査ではなく、同じ登録経路を使う次の地物にも適用される規則を測る。

`tests/r705-chronos-*-checks.test.mjs` は同名別都市の地点判定、OHM終了日の排他判定・2桁年・日付精度保持、境界の出典精度が形状から線へ渡ること、歴史背景と現在背景の切替を実行して検証する。年別スナップショットの精度分類は歴史的正しさの証明ではなく出典属性の保持を測る。

`tests/r707-chronos-*-checks.test.mjs` は、名前の無い形のクリック（譲る条件と、カードが述べるのが
上流の語だけであること）・ラベルのアンカー（既存の点が 1 度も動かないこと、離れた大きな領土にだけ
点が増えること）・区分ラベルの衝突順位・上流の集合との差分を測る。⚠ **どれも出荷したモジュールを
出荷した束の上で<b>評価</b>する**（#R505）。⚠ **規則を書き写さない**——下限や間隔を計算し直す検査は
同じ判断を 2 か所に置くことになり（#R536）、どちらが何を言っても一致してしまう。国名の綴りも
固定しない（#R488）。代わりに測るのは、**記録そのものが「離れた巨大な領土」を持つ状況が実在すること**と、
そのときに点が増えること。

### `tests/r740-*-checks.test.mjs` (#R740)

14 本。**Atlas に渡した「できること」と、IntMap が実際にできることが一致しているか**を測る。
どれも**出荷しているテキストを lift して実行する**（#R505）——本番で観測した文字列が、旧いコードに
対して同じ実行をしたときに再現することまで確かめてある。

- `r740-atlas-metrics-checks` — 実装の `METRICS` / `XMET` / `VMET` / `XVMET` / `_metSpec` を**そのまま
  評価**し、**すべての指標について id と 5 言語のラベルが自分の鍵に戻る**こと。`drawChoro` / `ratio` /
  `relate` / `rows` の本体に `METRICS[` が残っていないこと。「不明な指標」の文言が**1 か所**にしかなく、
  そこが**数え上げた有効鍵を必ず添える**こと。そして `makeAtlasCatalogText()` を実際に呼び、
  渡した一覧が本文に出ることと、**手書きの鍵一覧が本文のどこにも無い**こと。
- `r740-query-refusal-checks` — クエリエンジンを実ロードし USGS の応答だけ差し替えて、
  `magnitude` と `マグニチュード` が `mag` に当たること、`wobble` は**拒否され実在の列 id が返る**こと、
  `time >= '2026-09-10'` が**その日 04:00 の行を残す**こと（辞書順比較なら落ちる）、
  **結合先の条件**も同じ拒否になること（そのとき `table` は FROM の表ではなく条件が属する表）、
  結果表が `width:auto; min-width:100%` で `#`/`Name` が折り返さないこと。
- `r740-atlas-button-names-checks` — 出荷している `_uiNameSweep` を lift し、**ここで組んだ DOM に対して
  実行**する。自分の `title` を持つボタンはその名前を保ち、**× そのもの**のボタンだけが `close: …` になり、
  アイコンだけのボタンは**名前を与えられない**こと。⚠ 誤った名前は名前が無いことより悪い
  （Atlas は `aria-label` を handle にして UI を引く）。

`tests/r740-isochrone-verdict-checks.test.mjs` は、**成功した仕事を「何も起きなかった」と報告しないこと**を
測る（#R740 §5b）。出荷している `makeAtlasCapabilities()` からレジストリを作り、`observe` / `verify` を
**実際に評価する**——同じ到達圏を描き直しても `not_rendered` にならないこと、空なら今までどおり
`not_rendered` であること、カメラが既に名指された視界になっているなら失敗ではないコードで完了すること、
そして**行き先が申告されていないときは推測せず** `no_change` のままであること。
⚠ 汎用の `paint` verifier が従来どおりであることも同じファイルが測る（到達圏だけが別扱いであることを固定する）。

`tests/r740-legend-stack-checks.test.mjs` は、`tileLegends()` を lift して**組んだ DOM に対して実行**し、
本番で観測した構成（容器 900px・高さ 106/337/303/252 の 4 枚）で**どの凡例も容器の外に出ず、どの 2 枚も
重ならない**ことを測る。1〜2 枚のときは従来どおり左端の 1 列に積まれること、`data-dragged` の凡例が
1 バイトも動かされないことも同じファイルが測る。

`tests/r741-repeat-and-metric-names-checks.test.mjs` は、**出荷しているモジュールを実際に動かして**
① 指標の名前の**一意な一部**がその指標に解決すること（`life` → `lifeExp`）と、2 つ以上に当たる語は
解決しないこと、② **拒否された呼びを同じ引数で出し直す手が `maxRepeatSteps` に数えられる**こと、
③ 違う引数を含む手は 1 つも数えられないこと（取り上げていないこと）を測る。
ループは本物の `runTurn()` に「常に拒否する能力」を渡して回す。

### `tests/r762-handoff-removal-checks.test.mjs` (#R762)

**撤去した機構が戻っていないこと**を測る。#R762 は ChatGPT の発話を GitHub issue #225 経由で
エージェントのやることリストに変える経路（`handoff.mjs` / `handoff-inbox.mjs` / `GPT-HANDOFF/`）を
外した。撤去はまとめて元に戻るのではなく、**参照 1 本ずつ戻ってくる**——だから測るのは
ファイル名の一覧ではなく、**エージェントに読ませる面がこの経路を名指していないか**である。

- ① 経路が持っていた 7 ファイルが存在しないこと
- ② **追跡された指示の面**（md/mjs/js/json/toml/yml/cmd/ps1）に、この経路の綴りが 1 行も無いこと。
  `git grep` で走査する（全ファイルを読むと 71 秒、`git grep` なら 1.9 秒）。⚠ `DEV-NOTES.md` と
  `DEV-NOTES-ARCHIVE.md` は母集合から外す——**ラウンド記録は「当時そうだった」を述べ続けるのが仕事**
- ③ **針が実際に当たること**。② が緑でも、針が何にも当たらないなら測っていない。#R762 が実際に
  削除した行（`@.agents/rules/gpt-handoff.md`・deny 規則・`INTMAP_HANDOFF_STATE_DIR` など）を
  針に食わせる。⚠ 針は `NEEDLE_SRC` **1 か所**から `git grep` と `RegExp` の両方が取る
  （2 つ書けば同じ規則の 2 実装になり、両方が同じだけ間違っていれば緑になる）
- ④ `scripts/codex-setup.mjs` の `OUTSIDE_ROOTS` が 2 件であること（handoff のカーソル置き場が
  3 件目だった）。散文が「四つが追随する」と述べたままになっていないこと

### `tests/r759-gis-pipeline-checks.test.mjs` (#R759)

**取得 → 演算 → 説明が 1 本に通っていること**を、本物の `js/gis-*.js` を動かして測る
（`tests/r743-gis-atlas-surface-checks` と同じ boot に `js/gis-raster.js` と `js/gis-expr.js` を足したもの。
地図は**何を訊かれたかを記録する** stub で、返す記録は本物のレジストリが作る）。

- ① **取得条件の一覧が 2 つ無いこと**——`js/gis-atlas.js` は `acquireFields()` を呼び、欄名を並べた
  配列リテラルを自分で持たない（`sample` の 3 欄と `kind` の 2 語だけが例外で、それも形で許す）。
  知らない欄は名前で断り、**拒否が語彙を運ぶ**
- ② 条件が**レイヤーの扉まで実際に届く**こと。述べなければ空の要求のままであること（カメラの箱を
  この層が発明しない）。窓を `acquire` と `sample` に**別々に**書いたら断ること
- ③ `op` を述べない依頼が取得になり、`coverage` の全欄と `next` が呼び手に届くこと。op を走らせた
  ときも、その途中で取得したものが答えに載ること
- ④⑤ **coverage の継承**——最も弱いものが残り、どの入力の判定かを述べること。⚠ **述べていない入力が
  あるときに `all` と述べないこと**、どの入力も述べていなければ coverage を作らないこと
- ⑥ 読者が宣言した**単位が演算の出力にも残る**こと（著者は `inherited` に変わり、`unitFrom` が
  出どころを持つ）。出力に無い列について述べられた単位が**列を発明しない**こと
- ⑦ **2 つの格子の差が、どちらか一方の時点にならない**こと——違えば両方を含む区間、片方が
  述べていなければ `null`（隣の行から代入しない）、同じならそのまま
- ⑧ `datasetRow()` が coverage を**投影**すること（明日足された欄がその日のうちに planner へ届く）
- ⑨⑩ 宣言と実装の一致——`data.gis` の schema が `op` を要求せず `acquire` を宣言していること、
  planner が読む目録が `acquire` / `coverage` / `cursor` を述べていること
- ⑪ **供給元になれると述べた行の数**（`js/map-ui.js` の `holds()`）。増減したら DEV-NOTES #R759 の
  監査をやり直させるための計器であって、数そのものが方針ではない
- ⑫ **時点の宣言が冪等**であること——`declareTime` が自分で作ったミリ秒を読み直せず、時点を述べた
  格子を処理するたびに時点が消えていた（誰にも告げられずに）

### `tests/r775-atlas-eval-checks.test.mjs` (#R775)

**本番で Atlas に 55 問投げて見つけた、全門が緑のまま出荷されていた 6 つ**を固定する。
⚠ 測っているのは「直したか」ではなく「**その欠陥を生んだ構造が残っていないか**」。

- ① **「どの行が国か」を訊く述語が 1 つ**であり、`countryStats` を**指標を読んで周回する全部**がそれを訊くこと。
  母集団は**発見する**（関数名の一覧を手で並べない）。⚠ **属領を落とさない**こと——Bermuda も
  French Southern and Antarctic Lands も**製品自身の Countries タブが見せている**（実測）
- ② **本番で拒否された指標名が解決する**こと。「名目GDP」「名目GDP（現在価格米ドル）」
  「nominal GDP (current US$)」。⚠ **#R741 の「life」もそのまま通る**こと
- ②b **推測は拒否より悪い**——`demographics` の中の `dem`、`democratic`、`popular` は指標名ではない。
  ⚠ **この行が自分の修正を一度落第させた**（最初の実装は `dem` を民主主義指数に解決した）
- ③ **拒否文が読者に意味を述べる**こと。鍵は全部残り（計画側が送り返すもの）、
  その隣に**読者の言語の名前**が並ぶこと
- ④ **Atlas が描いたものに turn の印が付く**こと。⚠ **種類の一覧を手で並べていない**こと
  （公開済みの `atlas` 節から発見する）。⚠ **読者自身のピンには付けない**こと。
  ⚠ **台帳は記録するだけで何も消さない**こと。⚠ **空の地図を「空だ」と明言する**こと
- ⑤ **自動スクロールが読者の質問（要素）に錠を取る**こと。⚠ **#R79g の半分は無傷**であること
  （最下部近傍の判定と短い返答の振る舞い）。⚠ **手で上へスクロールした読者を引き戻さない**こと
- ⑥ **操作を 1 件も行わずに死んだターンは、質問を入力欄に戻す**こと。
  ⚠ **途中まで進んだターンは戻さない**・**読者が打ちかけた文を上書きしない**・**勝手に再送しない**こと
- ⚠ `js/atlas-console.js` の行数天井（`tests/r318` ⓑ）をこの回が越えていないこと
### `tests/r774-gis-units-checks.test.mjs` (#R774)

**単位の違う 2 つの量を引き算してはならない。** 出荷されていたビルドで `1000 m − 1 km → 999`、
`10 °C − 283.15 K → −273.15` がどちらも `ok:true` だった（どちらも本当は 0）。⚠ 測っているのは
**登録された記録**（格子の値とバンドの単位）であって返り値の形ではない——欠陥は返り値の形には
一度も無かった。

- ① **換算してから引く**こと（m/km・°C/K）。答えは A の単位で述べられ、**札を落として終わらせない**
- ② **別の量は名前を付けて拒む**（`unit-mismatch`）。⚠ 「別の量」と「読めない綴り」が `verdict` で
  読者に分かれて届くこと
- ③ **沈黙は不一致ではない**——単位を述べていない格子は今までどおり引け、同じ綴りどうしはこの回の
  前とバイトで同じ
- ④ 換算しても**欠損だった画素は欠損のまま**（番兵 −9999 が倍率で実測値にならない）
- ⑤ **規則は `rasterDiff` のものではない**——`mosaic`・`compute`・`rasterCalc` が同じ答えを返すこと。
  1 つの呼び手だけで測ると、それは関数に付いた規則になる
- ⑥ **式の中では換算しない**（読者の算術を書き換えない）。リテラルは中立。`×` `÷` は綴りを作らず、
  `+` が導けた単位は**出力の列に付く**（著者は op＝`unitStatedAt:'derived'`）
- ⑦ 換算表そのもの。期待値は **SI と 1959 年の国際ヤード・ポンド協定の定義値**で、
  **測る対象の外**に書いてある（マイル・フィート・ポンド・海里・標準大気・°F の 2 点）
- ⑧ **`js/gis-units.js` が載っていなければ、この回の前と同じ答えに戻る**（載っていないモジュールが
  黙って「合っている」と言わない）

### `tests/r774-gis-seam-area-checks.test.mjs` (#R774)

**日付変更線を跨ぐ面について、内外判定と面積が同じ形を意味すること。** 出荷時は同じ 1 つの
多角形を `pointInPolygon` が幅 2° の帯と読み、`areaKm2` が 4,426,211 km²（**179 倍**）と読んでいた。

- ① 継ぎ目の帯 ＝ 同じ緯度の帯。穴も MultiPolygon も同じ規則。**面積と内外の比が 1**
- ② **極が動いていない**こと——`diskFillPolys` の 89°N の円盤が、同じ半径の赤道の円盤と一致する
  （⚠ 期待値は**もう一方の円盤**から取る。同じ半径の円なので互いが参照になる）。
  補集合（509,280,824 km²）を踏まないこと
- ③ 継ぎ目にかからない環は触られないこと（幅 340° の帯を割っても答えが変わらない）。
  ⚠ **幾何カーネルが無ければ `null`**——持っていない巻き直しで測ったとは言わない
- ④ **巻き直しの正本がひとつ**であること（`js/gis-ops.js` に 2 つ目の 360° ループが生えていない）

### `tests/r774-gis-time-checks.test.mjs` (#R774)

**存在しない暦日と、終わりが始まりより前の期間を受理しないこと。** `2026-02-30` が
`2026-03-02` として、`{start:2026-09-17, end:2020-01-01}` が `timeRefused:null` として通っていた。
裸の年・BC・`YYYY-MM`・時刻つき・ゾーンつきが壊れていないこと、`interval` の逆転した行が
`readable` に数えられず件数が読者に届くこと、新しい拒否コードが**宣言されている**こと。

### `tests/r774-gis-geotiff-unit-checks.test.mjs` (#R774)

**バンドの単位が外部 GIS へ届くこと。** IntMap は `role="unit"` と書き、GDAL は `role="unittype"` を
読む——**IntMap で書いて IntMap で読む往復では永久に露見しない**
（[[intmap-co-designed-reader-cannot-falsify]]）。⇒ 書き出した**バイトそのもの**から IFD を自前で
走査し、42112 の `<Item>` を独自パーサで読んで `role` を照合する。読み手が `role` に依存していない
ことも測る（`unittype` を同じ長さの別語に潰しても単位が読めること）。

### `tests/r774-gis-probe-checks.test.mjs` (#R774)

**表示状態が取得の答えを変えないこと。** 北東の 1 画素だけが値を持つ場は、レイヤーが ON でも OFF
でも同じ答えを返す。⚠ 測っているのは**答え**であって、プローブの点の数ではない（点を増やすのは
直っていない）。「訊けなかった」（`layer-not-visible`）と「そこには値が無い」
（`layer-values-all-missing`）が別の事実として届くこと。

### `tests/r765-gis-analysis-manifest-checks.test.mjs` (#R765)

**「作業を再開できる」と「その結果をもう一度出せる」は別のこと**を測る。⚠ 測っているのは
**幸せな欄が埋まっていること**ではなく、**このアプリが自分の答えについて知らないことを、
知らないと述べていること**である。

- ① **記録が、自分を計算したエンジンの版を持って登録される**こと。⚠ **配る者が載っていなければ
  黙る**こと（今日の版で埋めない）
- ② `manifest` が鎖を**入力が先の順**に並べ、取得の段は供給元と coverage を、演算の段は
  もう一度走らせられるレシピと `engineThen` を持つこと。単位が**誰が述べたか**ごと運ばれること。
  ⚠ 「いま」と「そのとき」が**別の欄**であること
- ③ **gap が出ること**——版を持たない上流・バイトを保存していない取り込み・完全性を述べない供給元。
  ⚠ 各 gap が**どの段の話か**と**読者向けの文**を持つこと
- ④ 指紋が、**同じ中身で同じ・違う中身で違う**こと。⚠ **キーの順は変えない**（並びが違うだけの
  同じ答えは同じ答え）／⚠ **地物の順は変える**（順序は答えの一部）／⚠ **格子は画素の並びと
  「どこに置かれているか」の両方**から取る
- ⑤ `verify` が**「同じ」「違う」「測れなかった」**を分けること。⚠ **指紋を取れなかったものが
  「同じ」に潰れない**こと（ここが潰れると、この仕組みは何も保証しない）。
  ⚠ 取らないと決めたことが「取れなかった」として報告されないこと
- ⑥ 版が公表され、文書がこの口と `gaps` を述べていること。知らない id が名前を付けて断られること

### `tests/r765-gis-external-reader-checks.test.mjs` (#R765)

**「書き出せた」を、自分以外の読み手で確かめる。** #R756 の往復検査は 3 形式とも既存の読み手で
読み返しており、それは正しい第一段で、限界がある——**一緒に作られた書き手と読み手は、他の誰にも
開けないファイルについて一致できる**。不一致を出せない比較は何も測っていない。

⚠ **参照は TIFF 6.0 / GeoTIFF 1.0 の仕様から書いた読み手**で、`js/gis-geotiff.js` も
`js/gis-export.js` の定数も**取り込まない**。タグは**番号で**知っている（33550 / 33922）。

- ① この app が書いた GeoTIFF を、**この app を知らない読み手が開ける**こと
  （9×7 の float32・両軸で非対称の値なので、転置や鏡像がたまたま一致することはない）
- ① **場所**が仕様のタグから読み取れること（画素が合っていても場所が違えば別のデータ）
- ① **述べているバイト順・標本形式と、実際に書いたバイトが一致する**こと
  （`SampleFormat` が 1 のまま float を書くと、共に設計された読み手は通し、仕様どおりの読み手は
  別の数を読む）
- ② ⚠ **参照が本当に不合格を出せること**（バイト順の印・magic・IFD のオフセットを壊した 3 通りを
  実際に拒む）。⚠ 参照が**測る対象の読み手を 1 行も使っていない**こと
- ③ **文書が、この検査の限界をそのまま述べている**こと——GDAL ではないこと、緑なのは
  「仕様どおり」であって「QGIS で開ける」ではないこと。
  ⚠ この検査自身が最初**主題を持たない針**で、`/GDAL/` が文書のどこかに在れば通る形だったので
  **通ってしまった**（[[intmap-claim-needle-is-an-inclusion-list]]）。いまは**その節の中の、
  その主張**を見る

### `tests/r764-gis-scale-and-precision-checks.test.mjs` (#R764)

**境界の画素をどう数えるか**と、**止められること**を測る。⚠ 1 画素だけの格子を使い、辺を整数に
取ってあるので、**期待される重みは読者が手で確かめられる比**（緯度帯が同じなら面積は Δλ に比例する）
であって、実行から写した数ではない。

- ① **既定は動かない**——`boundary` を述べない呼び手は `center` の答えをそのまま得る
- ② `allTouched` が、区域の触れた画素を丸ごと採ること
- ③ `fractional` の重みが **0.4 の区域で 0.4** になること。⚠ **内部の画素は 1 のまま**（端だけが分けられる）
- ④ 面積の規則を渡されなければ `fractional` は `fraction-needs-area-rule` で断ること
  （**黙って `center` に落ちない**——別の問いに、完全に見える数で答えることになる）
- ⑤ 知らない規則が、語彙を添えて断られること
- ⑥ **重みが効くのは「地面」だけ**——`count` と `sum` は画素を 1 つとして数え、`sumTimesAreaKm2` と
  区分ごとの面積は重みを取る
- ⑦ `zonal` op の**各行**が `_boundary` を持って出ること（後から検算できること）。op 側も語彙を添えて断ること
- ⑧ **中止が、それまで `ctx` を渡されていなかった 6 つの演算に届く**こと
  （`filter`・`buffer`・`dissolve`・`timeWindow`・`join`・`compute`）
- ⑨ ⚠ **測るのは註ではなく実行表**——`RUN` のどの行も `ctx` を渡されていること。註が表と食い違って
  いたのがこの回の欠陥そのものなので、文を読んで確かめることはしない。
  ⚠ `ctx` を渡さない呼び手が待たされないことも測る（2 つ目の実装を作っていないこと）

### `tests/r764-gis-error-domain-checks.test.mjs` (#R764)

**球面近似はどこまで信用してよいのか**を、推測ではなく実測で定める。⚠ **参照は測る対象の外にある**
——WGS-84 楕円体上の Vincenty 逆解法を**このテストの中に別途実装**して突き合わせる（カーネルから
取ってきた参照は何も測らない）。緯度 7 点 × 距離 6 点 × 方位 4 点。

- ① 相対誤差が **0.6 % を超えない**こと。⚠ **小さすぎても落ちる**——差がほぼ 0 なら、参照が実装と
  同じものになった合図である
- ① **1,000 km までは、誤差は距離ではなく「どこで・どちら向きに」で決まる**こと。
  ⚠ **この検査は最初に書いたときと逆のことを述べている**——「距離に依らない」と推測して掃引したら
  赤道で 0.561 %〜0.378 % と動いた。**主張を実測に合わせたのであって、実測が通るまで枠を広げたのではない**
- ① **5,000 km ではその一定性が崩れる**こと（長い経路は通過する緯度を平均するので、
  「その場所の誤差」ではなくなる）
- ① **10 km での差が 100 m 未満**であること（都市の規模で使ってよいか、読者が判断できる形の数）
- ② 半径がアプリに 1 つしかないこと（`js/gis-geometry.js` が自分で 6371 と書いていないこと）、
  そして**文書が測った範囲をそのまま述べている**こと

### `tests/r763-gis-raw-data-contract-checks.test.mjs` (#R763)

**表示用の値ではなく、原データが解析へ流れること**を測る。⚠ **実測された欠陥は「欄が無い」ではない**
——点の標本を実装している **18 行のうち、数を返すものが 0 行だった**（どれも値を丸めて単位を連結して
いた）ので、気温も降水も標高も区域統計に対して `layer-values-not-numeric` を返していた。唯一通っていた
`aod` は、単位文字列が**たまたま空**だったから通っていた。
⚠ **stub は本物のレジストリより高機能ではない**——`measure` を持たない行に `number` が付かないことが、
② を「言い直し」ではなく「測定」にしている。

- ① 数量を述べた行が、**読者に見せる文と、その文を作った数の両方**を渡すこと。`js/map-ui.js` の数値
  レイヤーが `measure` を持つこと。`_om` の文が、返している数から作られていること
- ② `「12.3°C」` と見せる行が **12.3 の格子**になること。レイヤーが述べた**単位が帯に載る**こと
  （呼び手の宣言のほうが勝つ）。⚠ **数を述べない行は今までどおり文字列として断られること**（緩めていない）
- ③ **「取得に失敗した」「値がどこにも無い」「文字列だった」が 3 つの答え**であること。
  `js/gis-raster.js` の `failed` と `empty` が**重ならない**こと
- ④ **1 点で全体を断じない**こと（中央が欠損でも周辺に値があれば拒まない／どこも答えなければ今までどおり断る）
- ⑤ ラスタの取得語彙に **`time` と `band`** が在り、`toRaster` が実際に下へ渡すこと。1 地点 1 値の
  供給元に帯を指定したら**黙って 0 番を返さず**断ること
- ⑥ **一度も描かれていない行**でも `load()` を述べていれば読めること。読み込み失敗が「表示をオンにしろ」
  にならないこと。`js/map-ui.js` の 3 行がその扉を実際に述べていること
- ⑦ loader 経路の絞り込みが、**描画経路と同じ predicate**（`IntMapLayers.narrow`）を通ること
- ⑧ **非同期の扉に呼び手が居る**こと（`js/` からの `acquire()` 呼び出しは出荷時 **0 件**だった）。同期の
  扉が今までどおり `supplier-is-async` で断ること。両方の扉が**同じ要求を組み立てる**こと
- ⑨ この回が足した拒否コードが**宣言され、読者への文（en+jp）を持つ**こと

### `tests/r763-gis-meaning-across-ops-checks.test.mjs` (#R763)

**演算を通っても、時点・単位・失敗が落ちないこと**を測る。⚠ **読むのは登録された記録**であって、
ターンの返り値ではない——返り値の経路は最初から動いていて、**だから誰も気づかなかった**。

- ⑩ **格子だけ借りた入力は、答えの時点に投票しない**こと。2020 年の格子を 2025 年の格子へ合わせた
  記録が 2020 年のままであること、貸した側が時点を述べていなくても**こちらの日付が消えない**こと。
  ⚠ **両方が値を出す演算では今までどおり両方が投票する**こと（緩めていない）。⚠ そしてそれを述べるのは
  **走った runner** であって、`DECL` に書かれた op ごとの表ではないこと
- ⑪ **prefix を付けて結合した列の単位が、新しい名前へ付いていく**こと（派生記録に読者は宣言し直せない）。
  `fieldStatements` が **prefix を自分で解釈しない**こと（別の op の引数を推測しない）
- ⑫ **演算自身が失った行が、その記録に残る**こと——入力が全部 `all` でも `partial` になり、`computed.failed`
  と `from`（op の id）を持つこと。入力が沈黙していても述べられること。⚠ **何も落とさなかった run が
  落としたと述べない**こと。理由の語彙が `js/gis-sources.js` の 1 つであること

### `tests/r759-gis-worker-checks.test.mjs` (#R759)

**「Worker が在ること」と「普段の分析が Worker で走ること」は別**を測る。Node には `Worker` も
`Blob` も無いので、**本物のプロトコル（`{type:'run'|'progress'|'done'}`）だけを実装した偽の口**を
`js/gis-raster.js` に注入する（偽物が本物より高機能だとバグを通り道で直してしまう・#R585）。

- ① **2 つの経路がバイト単位で同一**であること。⚠ 一致だけでは「両方が同じだけ間違っている」を
  緑にするので、**独立に書いた期待値 fixture** を別に持つ（NaN・±Infinity・宣言された sentinel・
  sentinel を宣言しない帯）
- ② **中止が走行中の算術に届く**こと（実測: 400 万画素のうち報告できたのは 1.6%、閉じの進捗は来ない）。
  止めたあとに主スレッドで走り直さないこと
- ③ Worker が無い／塞がれている／死んだときに主スレッドで完走し、**理由が結果に残る**こと
- ④ **登録されているが誰も呼ばないジョブの数**——実体（`jobNames()`）から数え上げ、増えていないこと
### `tests/r760-atlas-verdict-checks.test.mjs` (#R760)

19 本。**判定・反復・ターン台帳**。出荷している `makeAtlasCapabilities()` / `runTurn()` と状態モジュールを
**実際に評価する**（#R505）——ソースを読む検査は、どの経路が先に立つかを見られない。

- **宣言された面の再描画は `already_there`**——`meta.painted` を出す面（色分け・線・多角形・輪郭）
  について、同じものをもう一度描いた呼びが `not_rendered` にならないこと。
- **宣言を保持していない面は今までどおり `not_rendered`**——申告は**読むのであって信じない**
  （これが無ければ「描いたと言えば通る」判定になる）。
- **同じ判定の `partial` は打ち切りに数え、判定が変われば数えない**——後者が無いと、
  まだ仕事を終えていない呼びを取り上げてしまう。
- **宣言された恒久的な拒否は、引数ではなく種別で数える**——言い換えた再試行も同じ拒否として
  数えること、**何も宣言しない拒否は今までどおり引数で数える**こと。
- **道具の結果が `code`（理由の語）を運ぶ**こと。
- **ターン台帳が開いて閉じる**こと——応答・停止理由・取り消し・例外のそれぞれで。
- **監査の所見は `auditNote` に乗り、`unverified` を立てない**こと（2 つの事実に 1 つの綴りを
  使わない）。

### `tests/r760-admin1-coverage-checks.test.mjs` (#R760)

8 本。**形が覆う第一級行政区分**（`js/atlas-admin1.js` の `coveredBy`）。同梱の索引を実際に読んで測る。

- **内包・部分的な重なり・接していない形**の 3 通り。
- ⚠ **bbox の前置きふるいが偽陰性を出さない**こと——**ふるいを外した全数走査と同一の集合**が
  返ること。索引を使った run どうしを突き合わせても原理的に見えない欠陥なので、**比較相手は
  測る対象の外に置く**（#R743）。
- **高緯度の円が円のまま**であること——経度の度は緯度で縮むので、1 つの度半径で書くと北で
  細い楕円になる。
- **`limit` を超えたら `truncated` で申告する**こと（黙って切らない）。
- **索引が読めない（`index_unavailable`）と該当 0 件が別の答え**であること。
- **国で絞り込んだ走査が、その国の単位だけを見る**こと。
