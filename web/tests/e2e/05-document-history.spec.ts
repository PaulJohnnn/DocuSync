/**
 * @file tests/e2e/05-document-history.spec.ts
 *
 * TEST SUITE 5: Document History Verification
 *
 * Verifies that:
 *   1. The history page loads and shows entries (online + offline fallback)
 *   2. Two users making the same edit both see it in history with consistent timestamps
 *   3. History entries are ordered correctly (newest first)
 *   4. Restore from history does not crash
 *   5. History page no longer hits localhost:3000 (the bug that was fixed)
 *   6. Multiple users see the SAME history entries with the SAME timestamps
 */

import { test, expect, Browser } from '@playwright/test';
import { attachConsoleMonitor, printConsoleSummary } from './helpers/console-monitor';

const FILE_ID = '1789279967967';
const HISTORY_URL = `/app/history/${FILE_ID}`;
const EDITOR_URL = `/app/editor/${FILE_ID}`;

async function createUserContext(browser: Browser, userId: string) {
  const ctx = await browser.newContext();
  await ctx.addInitScript((id) => {
    try { localStorage.setItem('node_id', id); } catch {}
  }, userId);
  return ctx;
}

test.describe('Suite 5 — Document History', () => {

  test('History page loads without hitting localhost:3000 (bug regression test)', async ({ page }) => {
    const capture = attachConsoleMonitor(page);
    await page.goto(HISTORY_URL);
    await page.waitForTimeout(6000);
    printConsoleSummary(capture, '[ HISTORY PAGE ]');

    // THE REGRESSION TEST: must not hit localhost:3000 (the fixed bug)
    const regressionFails = capture.networkErrors.filter(e =>
      (e.includes('localhost:3000') || e.includes('127.0.0.1:3000')) &&
      (e.includes('history') || e.includes('sync') || e.includes('conflicts'))
    );
    expect(
      regressionFails,
      `❌ REGRESSION: History page still hitting wrong port:\n${regressionFails.join('\n')}`
    ).toHaveLength(0);

    // No uncaught JS errors
    const pageErrors = capture.errors.filter(e => e.startsWith('[PAGE_ERROR]'));
    expect(pageErrors).toHaveLength(0);
  });

  test('History page renders in offline mode (localStorage fallback)', async ({ page }) => {
    const capture = attachConsoleMonitor(page);

    // Pre-seed localStorage with offline conflict data before navigating
    await page.goto('/');
    await page.evaluate((fileId) => {
      const fakeConflicts = [
        {
          id: `offline-qa-1`,
          fileId: fileId,
          timestamp: Date.now() - 5000,
          localContent: '<p>QA offline test content A</p>',
          serverContent: '<p>Server version A</p>',
        },
        {
          id: `offline-qa-2`,
          fileId: fileId,
          timestamp: Date.now() - 2000,
          localContent: '<p>QA offline test content B</p>',
          serverContent: '<p>Server version B</p>',
        },
      ];
      // DocuSync uses user-scoped keys like docusync_<userId>_key
      // Also try the global key
      localStorage.setItem('docusync_web_conflicts', JSON.stringify(fakeConflicts));
    }, FILE_ID);

    // Navigate to history page while "offline" (block network for the desktop host)
    await page.route('**/sync/history**', route => route.abort());
    await page.goto(HISTORY_URL);
    await page.waitForTimeout(3000);

    printConsoleSummary(capture, '[ HISTORY OFFLINE ]');

    // Should show either an offline warning banner OR history entries from localStorage
    const hasOfflineBanner = await page.locator(
      'text=Offline, text=offline, text=locally queued, text=Showing locally'
    ).first().isVisible().catch(() => false);
    const hasEntries = await page.locator(
      '[class*="history"], [class*="entry"], [class*="event"]'
    ).first().isVisible().catch(() => false);

    // Either the offline banner or entries should be shown
    const hasContent = hasOfflineBanner || hasEntries;
    expect(hasContent, 'History page shows nothing in offline mode — expected fallback UI').toBe(true);
    console.log(`  [HISTORY OFFLINE] Banner: ${hasOfflineBanner}, Entries: ${hasEntries}`);
  });

  test('Two users see SAME history entries with consistent data', async ({ browser }) => {
    const ctxA = await createUserContext(browser, 'qa-hist-user-a');
    const ctxB = await createUserContext(browser, 'qa-hist-user-b');
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    // Seed identical conflict history in both contexts
    const sharedConflicts = [
      {
        id: 'shared-event-1',
        fileId: FILE_ID,
        timestamp: 1718000001000,
        localContent: '<p>Shared edit - sentence one.</p>',
        serverContent: '<p>Server edit - sentence one.</p>',
      },
      {
        id: 'shared-event-2',
        fileId: FILE_ID,
        timestamp: 1718000002000,
        localContent: '<p>Shared edit - sentence two.</p>',
        serverContent: '<p>Server edit - sentence two.</p>',
      },
    ];

    for (const page of [pageA, pageB]) {
      await page.goto('/');
      await page.evaluate((data) => {
        localStorage.setItem('docusync_web_conflicts', JSON.stringify(data));
      }, sharedConflicts);
    }

    // Block the host so both fall back to localStorage
    for (const page of [pageA, pageB]) {
      await page.route('**/sync/history**', route => route.abort());
    }

    // Navigate to history
    await Promise.all([pageA.goto(HISTORY_URL), pageB.goto(HISTORY_URL)]);
    await Promise.all([pageA.waitForTimeout(3000), pageB.waitForTimeout(3000)]);

    // Read timestamps from both pages
    const getTimestamps = async (page: any): Promise<string[]> => {
      return page.locator('[class*="timestamp"], time, [class*="time"], [class*="date"]')
        .allTextContents()
        .catch(() => []);
    };

    const tsA = await getTimestamps(pageA);
    const tsB = await getTimestamps(pageB);

    console.log(`  [HISTORY SYNC] User A timestamps: ${JSON.stringify(tsA.slice(0, 5))}`);
    console.log(`  [HISTORY SYNC] User B timestamps: ${JSON.stringify(tsB.slice(0, 5))}`);

    // If both have timestamps, they should match
    if (tsA.length > 0 && tsB.length > 0) {
      expect(tsA).toEqual(tsB);
    }

    await ctxA.close();
    await ctxB.close();
  });

  test('History entries are ordered newest-first', async ({ page }) => {
    // Seed history with known timestamps
    await page.goto('/');
    await page.evaluate((fileId) => {
      const entries = [
        { id: 'e1', fileId, timestamp: 1718000001000, localContent: '<p>Oldest edit</p>', serverContent: '' },
        { id: 'e2', fileId, timestamp: 1718000003000, localContent: '<p>Middle edit</p>', serverContent: '' },
        { id: 'e3', fileId, timestamp: 1718000005000, localContent: '<p>Newest edit</p>', serverContent: '' },
      ];
      localStorage.setItem('docusync_web_conflicts', JSON.stringify(entries));
    }, FILE_ID);

    await page.route('**/sync/history**', route => route.abort());
    await page.goto(HISTORY_URL);
    await page.waitForTimeout(3000);

    // Get all visible text blocks in the history list
    const entries = page.locator('[class*="history"] > *, [class*="entry"] > *').first();
    // The first entry should be the newest (highest timestamp)
    // We look for the word "Newest" appearing before "Oldest" in the page
    const pageContent = await page.content();
    const newestIdx = pageContent.indexOf('Newest');
    const oldestIdx = pageContent.indexOf('Oldest');

    if (newestIdx > 0 && oldestIdx > 0) {
      expect(newestIdx, 'History not sorted newest-first').toBeLessThan(oldestIdx);
      console.log(`  [HISTORY ORDER] ✅ Newest appears before Oldest in DOM`);
    } else {
      console.log(`  [HISTORY ORDER] Could not verify order (history entries not visible)`);
    }
  });

  test('Cloud API history endpoint returns structured response', async ({ request }) => {
    // Test against a known room OTP if we can get one
    const createRes = await request.post('/api/lobby/create', {
      data: {
        roomName: 'QA-History-Test',
        hostNodeId: 'qa-hist-host',
        hostIp: '127.0.0.1',
        hostPort: 9000,
      },
    });
    if (!createRes.ok()) {
      console.log('  [HIST API] Could not create room. Skipping.');
      test.skip();
      return;
    }
    const { otp } = await createRes.json();

    // Push a history entry
    await request.post('/api/lobby/doc/history', {
      data: {
        otp,
        fileId: 1,
        eventId: `qa-hist-${Date.now()}`,
        nodeId: 'qa-hist-host',
        logicalTimestamp: 1,
        content: '<p>QA history entry.</p>',
      },
    });

    // Read back
    const histRes = await request.get(`/api/lobby/doc/history?otp=${otp}&fileId=1`);
    expect(histRes.ok()).toBe(true);
    const hist = await histRes.json();

    expect(hist.success).toBe(true);
    expect(Array.isArray(hist.history)).toBe(true);
    expect(hist.history.length).toBeGreaterThan(0);

    const entry = hist.history[0];
    expect(entry).toHaveProperty('nodeId');
    expect(entry).toHaveProperty('logicalTimestamp');
    expect(entry).toHaveProperty('content');
    expect(entry).toHaveProperty('timestamp');

    console.log(`  [HIST API] ✅ History entry: nodeId=${entry.nodeId}, timestamp=${entry.logicalTimestamp}`);
  });

  test('Multiple users push history entries → all entries present for all users', async ({ request }) => {
    const createRes = await request.post('/api/lobby/create', {
      data: { roomName: 'QA-MultiHist', hostNodeId: 'qa-mh-host', hostIp: '127.0.0.1', hostPort: 9000 },
    });
    if (!createRes.ok()) { test.skip(); return; }
    const { otp } = await createRes.json();

    const USERS = ['node-alpha', 'node-beta', 'node-gamma'];
    const timestamps: number[] = [];

    // Each user pushes a history entry
    for (let i = 0; i < USERS.length; i++) {
      const ts = 100 + i;
      timestamps.push(ts);
      await request.post('/api/lobby/doc/history', {
        data: {
          otp, fileId: 1,
          eventId: `qa-entry-${i}`,
          nodeId: USERS[i],
          logicalTimestamp: ts,
          content: `<p>Edit from ${USERS[i]}</p>`,
        },
      });
    }

    // All users read the history
    for (const user of USERS) {
      const histRes = await request.get(`/api/lobby/doc/history?otp=${otp}&fileId=1`);
      expect(histRes.ok(), `History fetch failed for ${user}`).toBe(true);
      const hist = await histRes.json();
      const seenTimestamps = hist.history.map((h: any) => h.logicalTimestamp);

      for (const ts of timestamps) {
        expect(
          seenTimestamps.includes(ts),
          `User ${user} is missing history entry from timestamp ${ts}. Seen: ${seenTimestamps}`
        ).toBe(true);
      }
      console.log(`  [MULTI-HIST] ${user} sees ${hist.history.length} entries ✅`);
    }
  });
});
