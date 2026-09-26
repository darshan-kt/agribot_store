import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * These run against a production build rather than the dev server: `next dev` compiles
 * routes on first request, which turns the first navigation of every spec into a
 * multi-second wait and makes timeouts mean "the compiler was busy" instead of "the app
 * is broken".
 *
 * The port is 3100, not 3000, so an `make dev` stack already running on the developer's
 * machine does not have to be torn down to run the suite — and so the suite cannot
 * accidentally test a stale server someone else started.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // The fixture source is deterministic, so a retry that passes means a flaky test, not
  // a flaky robot. Retrying only in CI keeps that signal visible locally.
  retries: process.env.CI ? 2 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      // Crop Scout and Mission Planner are specified for tablet and desktop, and this is
      // the width the layout was designed against.
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // The store, Dashboard and Analytics have to work on a phone. 380 px is the width
      // the brief names.
      name: 'phone',
      use: { ...devices['Pixel 7'], viewport: { width: 380, height: 780 } },
      testIgnore: /crop-scout|mission-planner/,
    },
  ],

  webServer: {
    command: `pnpm exec next start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
