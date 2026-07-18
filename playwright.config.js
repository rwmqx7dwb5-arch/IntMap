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
  testIgnore: /prod-smoke\.spec\.js/,
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
  webServer: {
    command: `node scripts/serve.mjs --port ${PORT}`,
    url: BASE,
    reuseExistingServer: !isCI,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
