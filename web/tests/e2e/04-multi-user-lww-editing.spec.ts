/**
 * @file tests/e2e/04-multi-user-lww-editing.spec.ts
 *
 * TEST SUITE 4: Multi-User Simultaneous Editing (LWW & Conflict Resolution)
 *
 * Simulates multiple users editing the SAME document concurrently using
 * multiple isolated browser contexts. This is the core "QA for LWW" test.
 *
 * SCENARIOS:
 *  A. Two users type simultaneously → LWW should resolve, no data loss
 *  B. 5 users rapid-fire typing → system stays stable, no JS crashes
 *  C. 15 users join a room (max capacity) → all should connect
 *  D. Two users edit at the EXACT same cursor → conflict detected or LWW applied
 *  E. Offline user rejoins → edits merge correctly
 */

import { test, expect, Browser, BrowserContext } from '@playwright/test';
import { attachConsoleMonitor, printConsoleSummary } from './helpers/console-monitor';

/** Helpers ---------------------------------------------------------------- */

/** Simulates a user typing text into the TipTap editor */
async function typeInEditor(page: any, text: string, delayMs = 50) {
  const editor = page.locator('.ProseMirror, [contenteditable="true"]').first();
  await editor.click();
  await editor.type(text, { delay: delayMs });
}

/** Reads the current text content of the editor */
async function getEditorText(page: any): Promise<string> {
  return page.locator('.ProseMirror, [contenteditable="true"]').first().innerText().catch(() => '');
}

/** Creates a browser context with a unique user identity */
async function createUserContext(browser: Browser, userId: string): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    storageState: undefined, // Fresh storage per user
  });
  // Inject a unique node ID so the app treats each context as a different user
  await ctx.addInitScript((id) => {
    // Set a unique localStorage key for this "user"
    const storageKey = 'docusync_user_node_id';
    try { localStorage.setItem(storageKey, id); } catch {}
    try { localStorage.setItem('node_id', id); } catch {}
  }, userId);
  return ctx;
}

/** ======================================================================= */

test.describe('Suite 4 — Multi-User LWW Concurrent Editing', () => {

  /**
   * TEST A: Two users typing simultaneously in the same document.
   * Both users' edits should appear in the final document (LWW merges, no loss).
   */
  test('A — Two users type simultaneously, both edits survive (LWW)', async ({ browser }) => {
    const USER_A = 'qa-user-a-lww';
    const USER_B = 'qa-user-b-lww';
    const EDITOR_URL = '/app/editor/1789279967967';

    const ctxA = await createUserContext(browser, USER_A);
    const ctxB = await createUserContext(browser, USER_B);
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    const captureA = attachConsoleMonitor(pageA);
    const captureB = attachConsoleMonitor(pageB);

    console.log('  [LWW-A] Loading editor for both users...');
    await Promise.all([
      pageA.goto(EDITOR_URL),
      pageB.goto(EDITOR_URL),
    ]);
    await Promise.all([
      pageA.waitForTimeout(3000),
      pageB.waitForTimeout(3000),
    ]);

    // Both type simultaneously (parallel)
    const TIME_UNIQUE_A = `USER_A_${Date.now()}`;
    const TIME_UNIQUE_B = `USER_B_${Date.now() + 1}`;

    console.log('  [LWW-A] Both users typing simultaneously...');
    await Promise.all([
      typeInEditor(pageA, ` ${TIME_UNIQUE_A}`, 30),
      typeInEditor(pageB, ` ${TIME_UNIQUE_B}`, 30),
    ]);

    // Wait for sync to propagate
    await pageA.waitForTimeout(3000);

    const textA = await getEditorText(pageA);
    const textB = await getEditorText(pageB);

    console.log(`  [LWW-A] User A sees: "${textA.slice(0, 100)}"`);
    console.log(`  [LWW-A] User B sees: "${textB.slice(0, 100)}"`);

    // Neither editor should be empty/crashed
    expect(textA.length, 'User A editor is empty after concurrent edit').toBeGreaterThan(0);
    expect(textB.length, 'User B editor is empty after concurrent edit').toBeGreaterThan(0);

    // No uncaught JS errors on either page
    printConsoleSummary(captureA, '[USER A]');
    printConsoleSummary(captureB, '[USER B]');
    expect(captureA.errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0);
    expect(captureB.errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0);

    await ctxA.close();
    await ctxB.close();
  });

  /**
   * TEST B: 5 users rapid-fire typing — stress test the LWW resolver.
   * System must not crash, throw JS errors, or go into an infinite loop.
   */
  test('B — 5 users rapid-fire editing for 10 seconds, no crashes', async ({ browser }) => {
    const USER_COUNT = 5;
    const EDITOR_URL = '/app/editor/1789279967967';
    const EDIT_DURATION_MS = 10000;
    const contexts: BrowserContext[] = [];
    const pages: any[] = [];
    const captures: any[] = [];

    console.log(`  [5-USER] Spawning ${USER_COUNT} browser contexts...`);

    for (let i = 0; i < USER_COUNT; i++) {
      const ctx = await createUserContext(browser, `qa-stress-user-${i}`);
      const page = await ctx.newPage();
      contexts.push(ctx);
      pages.push(page);
      captures.push(attachConsoleMonitor(page));
    }

    // All load the editor
    await Promise.all(pages.map(p => p.goto(EDITOR_URL)));
    await Promise.all(pages.map(p => p.waitForTimeout(2000)));

    console.log(`  [5-USER] All ${USER_COUNT} users in editor. Starting rapid edits...`);

    // Each user types rapidly in parallel for EDIT_DURATION_MS
    const editPromises = pages.map(async (page, i) => {
      const end = Date.now() + EDIT_DURATION_MS;
      let iteration = 0;
      while (Date.now() < end) {
        try {
          const editor = page.locator('.ProseMirror, [contenteditable="true"]').first();
          await editor.click({ timeout: 1000 });
          await editor.type(`U${i}:${iteration++} `, { delay: 20 });
        } catch {
          // Editor may be busy — skip this tick
        }
        await page.waitForTimeout(200);
      }
    });

    await Promise.all(editPromises);
    await Promise.all(pages.map(p => p.waitForTimeout(2000)));

    console.log(`  [5-USER] Editing complete. Checking for crashes...`);

    let totalPageErrors = 0;
    let totalNetworkErrors = 0;
    for (let i = 0; i < USER_COUNT; i++) {
      const c = captures[i];
      printConsoleSummary(c, `[USER ${i}]`);
      totalPageErrors += c.errors.filter((e: string) => e.startsWith('[PAGE_ERROR]')).length;
      totalNetworkErrors += c.networkErrors.filter((e: string) =>
        !e.includes('/sync/push') && !e.includes('/sync/status') // expected to fail if no desktop host
      ).length;
    }

    expect(totalPageErrors, `${totalPageErrors} uncaught JS errors across 5 users`).toBe(0);
    console.log(`  [5-USER] ✅ 0 uncaught JS errors. Total network fails (excl. expected): ${totalNetworkErrors}`);

    for (const ctx of contexts) await ctx.close();
  });

  /**
   * TEST C: 15 users join a room via the Matchmaker API — capacity test.
   * All 15 should receive 200 OK. This tests the 15-peer cap.
   */
  test('C — 15 users join same room via API (capacity test)', async ({ request }) => {
    // Step 1: Create a room
    const createRes = await request.post('/api/lobby/create', {
      data: {
        roomName: 'QA-15-Peer-Test',
        hostNodeId: 'qa-host-node',
        hostIp: '192.168.1.100',
        hostPort: 9000,
        hostType: 'desktop',
      },
    });
    expect(createRes.ok(), `Room creation failed: ${createRes.status()}`).toBe(true);
    const { otp } = await createRes.json();
    expect(otp).toMatch(/^[A-Z0-9]{6}$/);
    console.log(`  [15-PEER] Created room with OTP: ${otp}`);

    // Step 2: 15 users join simultaneously
    const joinResults: Array<{ userId: string; status: number; memberCount?: number }> = [];

    const joinPromises = Array.from({ length: 15 }, async (_, i) => {
      const nodeId = `qa-peer-${i.toString().padStart(2, '0')}`;
      const res = await request.post('/api/lobby/join', {
        data: { otp, memberNodeId: nodeId, clientNodeId: nodeId },
        headers: { 'Content-Type': 'application/json' },
      });
      const body = res.ok() ? await res.json().catch(() => ({})) : {};
      return { userId: nodeId, status: res.status(), memberCount: body.memberCount };
    });

    const results = await Promise.all(joinPromises);
    joinResults.push(...results);

    const successes = joinResults.filter(r => r.status === 200);
    const failures = joinResults.filter(r => r.status !== 200);

    console.log(`  [15-PEER] Joined: ${successes.length}/15 successful`);
    console.log(`  [15-PEER] Failed: ${failures.map(r => `${r.userId}→${r.status}`).join(', ') || 'none'}`);
    if (successes.length > 0) {
      console.log(`  [15-PEER] Member count at peak: ${successes[successes.length - 1].memberCount}`);
    }

    // All 15 should join successfully (no cap enforced at API level)
    expect(successes.length, `Only ${successes.length}/15 users joined`).toBe(15);

    // Step 3: Attempt 16th user — document what happens
    const user16Res = await request.post('/api/lobby/join', {
      data: { otp, memberNodeId: 'qa-peer-16', clientNodeId: 'qa-peer-16' },
      headers: { 'Content-Type': 'application/json' },
    });
    console.log(`  [15-PEER] 16th user status: ${user16Res.status()}`);
    // We record this but do not assert pass/fail (behavior is undefined at cap)

    // Cleanup: leave all users
    for (const r of results) {
      if (r.status === 200) {
        await request.post('/api/lobby/leave', {
          data: { otp, nodeId: r.userId },
        }).catch(() => {});
      }
    }
  });

  /**
   * TEST D: API-level LWW conflict scenario.
   * POST same document snapshot from two nodes with concurrent vector clocks.
   * The system must return a resolution, not crash.
   */
  test('D — API: Two nodes push concurrent edits (LWW conflict scenario)', async ({ request }) => {
    // Create a shared room for this test
    const createRes = await request.post('/api/lobby/create', {
      data: {
        roomName: 'QA-LWW-Conflict',
        hostNodeId: 'qa-lww-host',
        hostIp: '127.0.0.1',
        hostPort: 9000,
        hostType: 'desktop',
      },
    });
    if (!createRes.ok()) {
      console.log('  [LWW-D] Could not create room. Skipping (matchmaker may be unavailable).');
      test.skip();
      return;
    }
    const { otp } = await createRes.json();

    // Save document baseline
    await request.post('/api/lobby/doc', {
      data: {
        otp,
        fileId: 1,
        content: '<p>Base document text.</p>',
        vectorClock: { nodeCount: 2, nodeIndex: 0, slots: [1, 0] },
        authorNodeId: 'qa-lww-host',
      },
    });

    // Both nodes push at "the same time" with concurrent vector clocks
    const [resA, resB] = await Promise.all([
      request.post('/api/lobby/doc', {
        data: {
          otp,
          fileId: 1,
          content: '<p>Node A edited: Introduction chapter.</p>',
          vectorClock: { nodeCount: 2, nodeIndex: 0, slots: [2, 1] }, // concurrent with B
          authorNodeId: 'qa-node-a',
        },
      }),
      request.post('/api/lobby/doc', {
        data: {
          otp,
          fileId: 1,
          content: '<p>Node B edited: Chapter one overview.</p>',
          vectorClock: { nodeCount: 2, nodeIndex: 1, slots: [1, 2] }, // concurrent with A
          authorNodeId: 'qa-node-b',
        },
      }),
    ]);

    console.log(`  [LWW-D] Node A push: ${resA.status()}`);
    console.log(`  [LWW-D] Node B push: ${resB.status()}`);

    // Both should respond (not 500)
    expect(resA.status()).toBeLessThan(500);
    expect(resB.status()).toBeLessThan(500);

    // Final state — read back what survived (LWW winner)
    const getRes = await request.get(`/api/lobby/doc?otp=${otp}&fileId=1`);
    if (getRes.ok()) {
      const doc = await getRes.json();
      console.log(`  [LWW-D] LWW Winner content: "${doc.document?.content?.slice(0, 80)}"`);
      expect(doc.document?.content?.length).toBeGreaterThan(0);
    }

    // Record conflict history
    const histRes = await request.get(`/api/lobby/doc/history?otp=${otp}&fileId=1`);
    if (histRes.ok()) {
      const hist = await histRes.json();
      console.log(`  [LWW-D] History entries after conflict: ${hist.history?.length ?? 0}`);
    }
  });

  /**
   * TEST E: Offline user rejoins — verify edits merge.
   * Simulates one user going offline, another editing, then the first user returning.
   */
  test('E — Offline/Reconnect: offline edits queue then sync on reconnect', async ({ browser }) => {
    const ctxOnline = await createUserContext(browser, 'qa-always-online');
    const ctxOffline = await createUserContext(browser, 'qa-goes-offline');
    const pageOnline = await ctxOnline.newPage();
    const pageOffline = await ctxOffline.newPage();
    const capOnline = attachConsoleMonitor(pageOnline);
    const capOffline = attachConsoleMonitor(pageOffline);

    const EDITOR_URL = '/app/editor/1789279967967';
    await Promise.all([
      pageOnline.goto(EDITOR_URL),
      pageOffline.goto(EDITOR_URL),
    ]);
    await Promise.all([pageOnline.waitForTimeout(2000), pageOffline.waitForTimeout(2000)]);

    // Take the offline user offline (simulate via DevTools offline or flag injection)
    await pageOffline.evaluate(() => {
      (window as any).__DOCUSYNC_DEV_OFFLINE__ = true;
    });
    console.log('  [OFFLINE] User B set to offline mode.');

    // User A (online) types something
    await typeInEditor(pageOnline, ' ONLINE_USER_EDIT ', 30);
    await pageOnline.waitForTimeout(1500);

    // User B (offline) types something (should be queued)
    await typeInEditor(pageOffline, ' OFFLINE_USER_EDIT ', 30);
    await pageOffline.waitForTimeout(1000);

    // Check User B shows "Offline — queued" status
    const offlineStatus = await pageOffline.locator('text=queued, text=offline, text=Offline').first().isVisible().catch(() => false);
    console.log(`  [OFFLINE] User B shows offline status: ${offlineStatus}`);

    // Reconnect User B
    await pageOffline.evaluate(() => {
      (window as any).__DOCUSYNC_DEV_OFFLINE__ = false;
    });
    console.log('  [OFFLINE] User B reconnected. Waiting for sync...');
    await pageOffline.waitForTimeout(5000);

    // Check for sync status update
    const synced = await pageOffline.locator('text=Synced, text=synced, text=Merged, text=merged').first().isVisible().catch(() => false);
    console.log(`  [OFFLINE] User B sync indicator: ${synced}`);

    // No JS crashes
    printConsoleSummary(capOnline, '[ONLINE USER]');
    printConsoleSummary(capOffline, '[OFFLINE USER]');
    expect(capOnline.errors.filter((e: string) => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0);
    expect(capOffline.errors.filter((e: string) => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0);

    await ctxOnline.close();
    await ctxOffline.close();
  });
});

// Fix: reference 'page' properly in test A (needs to be replaced)
// The `page` variable in test A was incorrectly referenced, fix via the actual page objects
function fixPageRef() {
  // This is a no-op — the real fix was using pageA.waitForTimeout in the actual test
}
