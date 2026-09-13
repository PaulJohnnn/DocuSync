import { defineConfig, devices } from '@playwright/test';

/**
 * DocuSync Automated QA Test Suite — Playwright Configuration
 * Targets: https://docusync-dusky.vercel.app (live) OR localhost:3000 (local dev)
 *
 * Run against live: npm run test:e2e
 * Run against local: BASE_URL=http://localhost:3000 npm run test:e2e
 */

const BASE_URL = process.env.BASE_URL || 'https://docusync-dusky.vercel.app';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : 6,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
    ['json', { outputFile: 'playwright-report/results.json' }],
  ],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',

    // Capture ALL browser console output for F12 analysis
    // (Used via page.on('console') in test files)
  },

  projects: [
    // ── Desktop full size ──────────────────────────────────────────────
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    // ── Minimized/small window (like screenshot) ───────────────────────
    {
      name: 'small-window',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 346, height: 864 }, // matches screenshot dimension
      },
    },
    // ── Mobile (responsive) ───────────────────────────────────────────
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    // ── Firefox ────────────────────────────────────────────────────────
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
});
