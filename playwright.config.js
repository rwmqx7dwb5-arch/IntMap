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
  testIgnore: /prod-smoke\.spec\.js|r184-imagery-profile\.spec\.js/,
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,          // soften transient CDN/network blips in CI; local runs fail fast
  workers: isCI ? 2 : undefined,
  timeout: 60_000,                // index.html is a large single-file app — allow a generous boot budget
  expect: { timeout: 10_000 },
  reporter: isCI
    ? [['list'], ['junit', { outputFile: 'test-results/junit.xml' }], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: BASE,
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
