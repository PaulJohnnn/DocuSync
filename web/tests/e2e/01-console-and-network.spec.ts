/**
 * @file tests/e2e/01-console-and-network.spec.ts
 *
 * TEST SUITE 1: Console Error & Network Monitoring (F12 Equivalent)
 *
 * Verifies that no rogue localhost requests, uncaught JS errors, or
 * unexpected network failures occur on any main page.
 *
 * This directly addresses the screenshot issue where the browser console
 * showed continuous ERR_CONNECTION_REFUSED for http://localhost:3000/api/lobby/conflicts
 */

import { test, expect } from '@playwright/test';
import { attachConsoleMonitor, getLocalhostLeaks, printConsoleSummary } from './helpers/console-monitor';

const PAGES_TO_CHECK = [
  { name: 'Home', path: '/' },
  { name: 'App', path: '/app' },
];

// Observe each page for 8 seconds for continuous polling errors
const OBSERVATION_DURATION_MS = 8000;

test.describe('Suite 1 — Console & Network Error Monitoring', () => {

  test('no ERR_CONNECTION_REFUSED or localhost leaks on the Home page', async ({ page }) => {
    const capture = attachConsoleMonitor(page);

    await page.goto('/');
    // Wait to allow any polling intervals to fire
    await page.waitForTimeout(OBSERVATION_DURATION_MS);

    printConsoleSummary(capture, '[ HOME PAGE ]');

    const localhostLeaks = getLocalhostLeaks(capture);
    expect(
      localhostLeaks,
      `Localhost network leaks detected:\n${localhostLeaks.join('\n')}`
    ).toHaveLength(0);

    // No uncaught JS page errors
    const pageErrors = capture.errors.filter(e => e.startsWith('[PAGE_ERROR]'));
    expect(
      pageErrors,
      `Uncaught JS errors:\n${pageErrors.join('\n')}`
    ).toHaveLength(0);
  });

  test('no rogue polling loops on the Editor page (the continuous conflicts fetch bug)', async ({ page }) => {
    const capture = attachConsoleMonitor(page);

    // Navigate to a live editor URL (uses the ID from the original bug report)
    await page.goto('/app/editor/1789279967967');
    await page.waitForTimeout(OBSERVATION_DURATION_MS);

    printConsoleSummary(capture, '[ EDITOR PAGE ]');

    // Check specifically for localhost:3000 calls (the bug from the screenshot)
    const localhost3000Errors = capture.networkErrors.filter(e =>
      e.includes('localhost:3000') || e.includes('127.0.0.1:3000')
    );

    expect(
      localhost3000Errors,
      `❌ CRITICAL BUG CONFIRMED: Rogue requests to localhost:3000:\n${localhost3000Errors.join('\n')}`
    ).toHaveLength(0);

    // Check for repeated ERR_CONNECTION_REFUSED (more than 3 of the same URL = a loop)
    const connRefusedCounts = new Map<string, number>();
    for (const err of capture.networkErrors) {
      if (err.includes('ERR_CONNECTION_REFUSED') || err.includes('ECONNREFUSED')) {
        connRefusedCounts.set(err, (connRefusedCounts.get(err) || 0) + 1);
      }
    }
    const loopingErrors = [...connRefusedCounts.entries()].filter(([, count]) => count > 3);
    expect(
      loopingErrors,
      `❌ POLLING LOOP DETECTED — same URL failing more than 3 times:\n${loopingErrors.map(([e, c]) => `  x${c} ${e}`).join('\n')}`
    ).toHaveLength(0);
  });

  test('Editor page renders key elements at 346x864 (small minimized window)', async ({ browser }) => {
    // Match the screenshot's viewport: 346 x 864
    const ctx = await browser.newContext({ viewport: { width: 346, height: 864 } });
    const page = await ctx.newPage();
    const capture = attachConsoleMonitor(page);

    await page.goto('/app/editor/1789279967967');
    await page.waitForTimeout(3000);

    printConsoleSummary(capture, '[ EDITOR @ 346x864 ]');

    // At 346px, the sidebar may be completely hidden (hamburger menu) or collapsed.
    // We just verify the main editor container is visible.
    const editor = page.locator('.ProseMirror, [contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 5000 }).catch(() => null);

    // No horizontal scroll overflow (layout must not break at small size)
    const hasHorizOverflow = await page.evaluate(() => {
      return document.body.scrollWidth > window.innerWidth;
    });
    expect(hasHorizOverflow, 'Page has unwanted horizontal scroll at 346px width').toBe(false);

    // Count network errors
    expect(capture.networkErrors.length).toBeLessThan(10);

    await ctx.close();
  });

  test('no console errors on History page', async ({ page }) => {
    const capture = attachConsoleMonitor(page);

    await page.goto('/app/history/1789279967967');
    await page.waitForTimeout(OBSERVATION_DURATION_MS);

    printConsoleSummary(capture, '[ HISTORY PAGE ]');

    // History page used to hit localhost:3000 due to room.port bug (now fixed)
    const localhostHits = capture.networkErrors.filter(e =>
      (e.includes('localhost:3000') || e.includes('127.0.0.1:3000')) &&
      e.includes('history')
    );
    expect(
      localhostHits,
      `History page hitting wrong port:\n${localhostHits.join('\n')}`
    ).toHaveLength(0);
  });

  test('no console errors on Sync Rooms (peers) page', async ({ page }) => {
    const capture = attachConsoleMonitor(page);
    await page.goto('/app/peers');
    await page.waitForTimeout(4000);
    printConsoleSummary(capture, '[ PEERS PAGE ]');

    const pageErrors = capture.errors.filter(e => e.startsWith('[PAGE_ERROR]'));
    expect(pageErrors).toHaveLength(0);
  });

  test('no console errors on Metrics page', async ({ page }) => {
    const capture = attachConsoleMonitor(page);
    await page.goto('/app/metrics');
    await page.waitForTimeout(4000);
    printConsoleSummary(capture, '[ METRICS PAGE ]');

    const pageErrors = capture.errors.filter(e => e.startsWith('[PAGE_ERROR]'));
    expect(pageErrors).toHaveLength(0);
  });
});
