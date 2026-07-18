// Playwright config for smoke-testing the LIVE production site (post-deploy + uptime).
// No local webServer — it drives the real deployed URL (PROD_URL env or the default
// GitHub Pages URL). Unlike the hermetic suite, it lets real external APIs load, so it
// tolerates transient upstream blips via retries and lenient console classification.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: /prod-smoke\.spec\.js/,
  timeout: 90_000,               // live network + GitHub Pages propagation
  retries: 3,                    // absorb propagation lag and one-off upstream failures
  reporter: [['list'], ['junit', { outputFile: 'test-results/prod-junit.xml' }]],
  outputDir: 'test-results',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    colorScheme: 'light',
    serviceWorkers: 'block',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
