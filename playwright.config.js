// Playwright config for IntMap browser tests (smoke + internal-QA).
// Deterministic by construction: fixed timezone + locale, a fresh browser context
// per test (no leaked localStorage/IndexedDB), Service Workers blocked, and a
// zero-dependency local static server that serves the repo exactly like GitHub Pages.
import { defineConfig, devices } from '@playwright/test';

/* (#R201) the port, the base URL and the seeded session live in tests/helpers/session-seed.js, so a
   spec that opens its OWN context (r197, r201 — sharing one page across a describe is how they stay
   cheap) cannot silently boot without the seed this config was the only holder of. */
import { PORT, BASE, seededStorageState } from './tests/helpers/session-seed.js';
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: 'tests',
  // prod-smoke runs against the LIVE deployed URL via playwright.prod.config.js — never
  // as part of the local/CI hermetic suite.
  // (#R184) …and r184-imagery-profile is an INSTRUMENT, not a contract. It sweeps the renderer's
  // anti-aliasing and LOD settings and prints frame time beside a sharpness measure; its only
  // assertion is that the canvas was not blank while it measured. It costs 6.2 minutes of a shared
  // two-core runner, and adding it took the CI browser job from ~40 min to 1 h 22 m — at which point
  // four timing-sensitive tests elsewhere in the suite (a 180 s camera settle, a zoom-dolly ratio, a
  // Cesium wheel-after-rotate) began failing on LOAD rather than on their own merits, having been
  // green on main for eight consecutive runs and passing on both trees locally. The measurement it
  // produced is pinned by r184-imagery.spec.js, which DOES run here. Run the instrument deliberately
  // with `npm run test:profile` when investigating performance.
  // (#R186) …and CI can ask for one HALF of the suite. Measured: the `*-cesium*` specs are a handful
  // of tests that each take minutes on a runner with no GPU, so sharding by test count parks them all
  // on one machine — that shard took ONE HOUR while the six others finished in two to fifteen minutes,
  // and four of its tests failed on load rather than on their merits (all four pass locally).
  // Splitting them out lets CI give them machines of their own at one worker, which is the condition
  // they pass under. IM_SUITE is unset everywhere else, so `npm test` locally is unchanged.
  // ⚠ (#R190) …and "run it deliberately with `npm run test:profile`" was not true: the ignore above
  // is unconditional, so that script has never been able to select the file it names — measured this
  // round while looking for a frame-time instrument for the renderer work ("No tests found"). The
  // exclusion is what everything above says it is; it simply has to step aside for the one command
  // whose whole purpose is to run it. IM_PROFILE is set by that npm script and by nothing else, so
  // CI, `npm test` and both IM_SUITE halves are byte-identical to before.
  /* ══ (#R195) …AND CI NO LONGER SHARDS BY TEST COUNT AT ALL ═══════════════════════════════════════
     「いやじゃあ待ち時間をどうにかしろや」「今回だけで終わるな。そもそもの構造をどうにかしろ」

     The note above describes carving ONE heavy family out by regex. That worked, and it was about to
     be done a second time: this round's shards came out 2m11, 2m20, 7m14, 8m51, 11m17 — and **35m58**,
     because the flight-sim specs had clumped the way the Cesium ones once did. Splitting them out by
     hand would have fixed today and guaranteed a third round of it later, since `--shard=i/n` divides
     by TEST COUNT and this suite's files run anywhere from 2 s to 689 s.

     So CI does not use `--shard` any more. scripts/shard-plan.mjs packs the spec FILES into groups of
     equal MEASURED time (tests/durations.json, refreshed from the JUnit XML CI already writes), and
     each job is handed its own file list. A newly slow spec redistributes itself; nobody has to
     notice it first. The only thing still expressed per-file is which specs need a machine to
     themselves — #R186 measured that for Cesium, and it now lives in that file as data rather than
     as another regex here.

     IM_SUITE therefore selects only the WORKER COUNT and the ignore list; the FILES come from the
     planner. It is unset everywhere else, so `npm test` locally is unchanged and still runs the lot. */
  testMatch: process.env.IM_SUITE === 'cesium' ? /-cesium.*\.spec\.js$/
    : (process.env.IM_PROFILE === '1' ? /r184-imagery-profile\.spec\.js$/ : undefined),
  testIgnore: process.env.IM_PROFILE === '1'
    ? /prod-smoke\.spec\.js/
    : (process.env.IM_SUITE === 'rest'
      ? /prod-smoke\.spec\.js|r184-imagery-profile\.spec\.js|-cesium.*\.spec\.js$/
      : /prod-smoke\.spec\.js|r184-imagery-profile\.spec\.js/),
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,          // soften transient CDN/network blips in CI; local runs fail fast
  // one browser per machine for the Cesium half — contention is exactly what it fails on
  // ⚠ (#R195) …AND THE LOCAL DEFAULT IS 2, WRITTEN DOWN RATHER THAN REMEMBERED. `undefined` gave
  // Playwright's default of half the CPU cores, and at that width this machine produces failures that
  // are contention, not regressions — a full run then has to be repeated, and a run is ~48 minutes.
  // The instruction was to pass `--workers=2` by hand every time; #R186 forgot once and threw away
  // 45 minutes, and #R194 had to re-derive the same number. A flag nobody can forget is the fix.
  // Override deliberately with PW_WORKERS=<n> when measuring the machine itself.
  workers: isCI ? (process.env.IM_SUITE === 'cesium' ? 1 : 2) : Number(process.env.PW_WORKERS || 2),
  timeout: 60_000,                // index.html is a large single-file app — allow a generous boot budget
  expect: { timeout: 10_000 },
  reporter: isCI
    ? [['list'], ['junit', { outputFile: 'test-results/junit.xml' }], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: BASE,
    /* ══ (#R186) EVERY TEST GETS THE BOOT IT WAS WRITTEN FOR ═══════════════════════════════════════
       #R186 made Köppen and the submarine cables default-ON, and MEASURED what that costs every boot:
       ready at 9,160 ms against 3,192 ms with them suppressed — a multi-megabyte climate raster and a
       cable network fetched through a CORS relay, on every page load. `canDraw` is unchanged at
       ~400 ms; it is the SETTLING that grows. On a runner with no GPU that lands on the tests that are
       already minutes long and marginal, and they begin failing on load rather than on their merits.
       Seeding the saved-session key the app itself reads suppresses those layers before anything is
       built, so the 350-odd tests that are not ABOUT them boot exactly as they always did. The two
       that ARE about them opt out — see tests/r186.spec.js, which is where that default is pinned. */
    storageState: {
      cookies: [],
      /* ⚠ `layers` ONLY. An earlier version also seeded `tabInit:true`, which is the flag that says
         "this profile has already been offered the default tab" — and that broke tests/r170's «fresh
         desktop profile: Countries open», because a fresh profile is exactly what it is about. The
         seed must say the least it can: which layers, and nothing else about the session.
         ⚠ …plus `defv`, which is not "something about the session" but the STATEMENT THAT IT IS ONE.
         (#R189) an unstamped session predates #R188's imAutoOff fix, so its absences can be an
         outage's poison rather than a choice, and `_restore()` heals them once. This seed is the one
         place in the suite that asserts an absence IS a choice — unstamped, the heal put Köppen and
         the cables back on for all ~350 tests, i.e. exactly the 9,160 ms boot this seed exists to
         avoid. MEASURED as three straight timeouts of r174 «zooming in still moves the viewpoint»
         and three more tests turned flaky. Bump this with the generation in js/app-body.js. */
      origins: seededStorageState().origins,
    },
    timezoneId: 'UTC',            // stable regardless of the developer's / runner's timezone
    locale: 'en-US',
    colorScheme: 'light',
    serviceWorkers: 'block',      // the app registers sw.js; block it so no cross-run tile cache interferes
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: isCI ? 'off' : 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // (#R175) The tests run against the BUILT site, not the sources. IntMap is a Vite build now, and the
  // thing that has to keep working is what GitHub Pages publishes — the bundled, minified, hashed tree
  // in dist/. Testing the sources instead would leave every build-only failure (a bad chunk split, a
  // missing static asset, a module that only resolves through the dev server) to be found in
  // production. `vite build` is ~10 s, so the whole suite still starts in well under a minute.
  webServer: {
    command: `npm run build && node scripts/serve.mjs --port ${PORT} --root dist`,
    url: BASE,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
