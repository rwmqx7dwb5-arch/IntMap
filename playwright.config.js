// Playwright config for IntMap browser tests (smoke + internal-QA).
// Deterministic by construction: fixed timezone + locale, a fresh browser context
// per test (no leaked localStorage/IndexedDB), Service Workers blocked, and a
// zero-dependency local static server that serves the repo exactly like GitHub Pages.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT || 4173);
const BASE = `http://127.0.0.1:${PORT}`;
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
  testMatch: process.env.IM_SUITE === 'cesium' ? /-cesium.*\.spec\.js$/ : undefined,
  testIgnore: process.env.IM_SUITE === 'rest'
    ? /prod-smoke\.spec\.js|r184-imagery-profile\.spec\.js|-cesium.*\.spec\.js$/
    : /prod-smoke\.spec\.js|r184-imagery-profile\.spec\.js/,
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,          // soften transient CDN/network blips in CI; local runs fail fast
  // one browser per machine for the Cesium half — contention is exactly what it fails on
  workers: isCI ? (process.env.IM_SUITE === 'cesium' ? 1 : 2) : undefined,
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
      origins: [{ origin: BASE, localStorage: [{ name: 'intmap_session2', value: '{"v":2,"defv":190,"layers":[]}' }] }],
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
