/**
 * @file tests/e2e/07-overwhelm-system.spec.ts
 *
 * TEST SUITE 7: System Overwhelm / Chaos Engineering
 *
 * Intentionally stresses the system beyond normal limits:
 *   1. Flood the matchmaker with 50 rapid room-creates
 *   2. Bombard /api/lobby/doc with 100 concurrent writes
 *   3. Simulate a room with 15 peers all sending heartbeats simultaneously
 *   4. Paste 50KB of text into the editor (large document stress test)
 *   5. Rapid page navigation stress (triggers WebSocket connect/disconnect storms)
 *   6. Concurrent discovery registrations
 *
 * The system should DEGRADE GRACEFULLY — return 5xx, 429, or appropriate errors.
 * It should NOT: hang forever, return garbled JSON, or crash the web app.
 */

import { test, expect } from '@playwright/test';
import { attachConsoleMonitor, printConsoleSummary } from './helpers/console-monitor';

test.describe('Suite 7 — System Overwhelm & Chaos Testing', () => {

  test('1 — Flood: 50 rapid room creates (system must not 500 consistently)', async ({ request }) => {
    const promises = Array.from({ length: 50 }, (_, i) =>
      request.post('/api/lobby/create', {
        data: {
          roomName: `QA-Flood-${i}`,
          hostNodeId: `flood-host-${i}`,
          hostIp: '127.0.0.1',
          hostPort: 9000,
        },
      })
    );

    const results = await Promise.allSettled(promises);
    const statuses = results.map(r => r.status === 'fulfilled' ? r.value.status() : -1);

    const success = statuses.filter(s => s === 200).length;
    const rateLimit = statuses.filter(s => s === 429).length;
    const serverErrors = statuses.filter(s => s === 500).length;
    const errors = statuses.filter(s => s === -1).length;

    console.log(`  [FLOOD-CREATE] 200: ${success}, 429: ${rateLimit}, 500: ${serverErrors}, Err: ${errors}`);

    // System must not be completely broken — at least some should succeed or rate-limit gracefully
    expect(serverErrors, `${serverErrors}/50 requests crashed with 500`).toBeLessThan(10);
    expect(errors, `${errors}/50 requests threw unexpected errors`).toBeLessThan(5);
  });

  test('2 — Bombard: 100 concurrent doc writes to same room', async ({ request }) => {
    // Create one room
    const createRes = await request.post('/api/lobby/create', {
      data: { roomName: 'QA-Bombard', hostNodeId: 'bombard-host', hostIp: '127.0.0.1', hostPort: 9000 },
    });
    if (!createRes.ok()) { test.skip(); return; }
    const { otp } = await createRes.json();

    const startMs = Date.now();
    const promises = Array.from({ length: 100 }, (_, i) =>
      request.post('/api/lobby/doc', {
        data: {
          otp,
          fileId: 1,
          content: `<p>Concurrent write #${i} at ${Date.now()}</p>`,
          vectorClock: { nodeCount: 100, nodeIndex: i, slots: Array(100).fill(0).map((_, j) => j === i ? i + 1 : 0) },
          authorNodeId: `bombard-node-${i}`,
        },
      })
    );

    const results = await Promise.allSettled(promises);
    const elapsedMs = Date.now() - startMs;
    const statuses = results.map(r => r.status === 'fulfilled' ? r.value.status() : -1);
    const success = statuses.filter(s => s === 200).length;
    const serverErrors = statuses.filter(s => s === 500).length;

    console.log(`  [BOMBARD] 100 concurrent writes in ${elapsedMs}ms`);
    console.log(`  [BOMBARD] 200: ${success}, 500: ${serverErrors}, Other: ${statuses.filter(s => s !== 200 && s !== 500 && s !== -1).length}`);

    // System should not crash (0 or very few 500s)
    expect(serverErrors, `${serverErrors}/100 writes crashed the server`).toBeLessThan(15);

    // Read back — document should exist and have SOME content
    const getRes = await request.get(`/api/lobby/doc?otp=${otp}&fileId=1`);
    if (getRes.ok()) {
      const doc = await getRes.json();
      expect(doc.document?.content?.length, 'Document is empty after 100 writes').toBeGreaterThan(0);
      console.log(`  [BOMBARD] Final doc content: "${doc.document?.content?.slice(0, 60)}"`);
    }
  });

  test('3 — 15-peer heartbeat storm: all heartbeats in 1 second', async ({ request }) => {
    const createRes = await request.post('/api/lobby/create', {
      data: { roomName: 'QA-HeartbeatStorm', hostNodeId: 'hb-host', hostIp: '127.0.0.1', hostPort: 9000 },
    });
    if (!createRes.ok()) { test.skip(); return; }
    const { otp } = await createRes.json();

    // 15 peers all send heartbeats simultaneously
    const promises = Array.from({ length: 15 }, (_, i) =>
      request.post('/api/lobby/heartbeat', {
        data: { otp, nodeId: `hb-peer-${i}`, isHost: i === 0, filesCount: i },
      })
    );
    const results = await Promise.allSettled(promises);
    const ok = results.filter(r => r.status === 'fulfilled' && r.value.status() === 200).length;
    const fail = 15 - ok;

    console.log(`  [HB STORM] ${ok}/15 heartbeats OK, ${fail} failed`);
    expect(ok, 'Most heartbeats should succeed').toBeGreaterThanOrEqual(10);
  });

  test('4 — Large document: paste 50KB text into editor, no crash', async ({ page }) => {
    const capture = attachConsoleMonitor(page);
    await page.goto('/app/editor/1789279967967');
    await page.waitForTimeout(2000);

    // Generate 50KB of text
    const largeText = 'Lorem ipsum dolor sit amet. '.repeat(1800); // ~50KB

    const editor = page.locator('.ProseMirror, [contenteditable="true"]').first();
    const editorVisible = await editor.isVisible().catch(() => false);

    if (editorVisible) {
      // Use clipboard API to paste large text
      await page.evaluate((text) => {
        const el = document.querySelector('.ProseMirror, [contenteditable="true"]') as HTMLElement;
        if (el) {
          el.focus();
          // Dispatch a paste event with large content
          const dt = new DataTransfer();
          dt.setData('text/plain', text);
          el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
        }
      }, largeText);

      await page.waitForTimeout(3000);

      // Editor should still be responsive (not frozen)
      await editor.click({ timeout: 5000 });
      await editor.type('X', { delay: 50 });

      printConsoleSummary(capture, '[ 50KB PASTE ]');

      // No JS crashes
      const pageErrors = capture.errors.filter(e => e.startsWith('[PAGE_ERROR]'));
      expect(pageErrors).toHaveLength(0);
      console.log(`  [50KB] Editor survived large paste without crashing ✅`);
    } else {
      console.log(`  [50KB] Editor not visible (may need auth). Skipping.`);
    }
  });

  test('5 — Rapid page navigation storm (WebSocket connect/disconnect)', async ({ page }) => {
    const capture = attachConsoleMonitor(page);
    const routes = [
      '/app/peers',
      '/app/editor/1789279967967',
      '/app/metrics',
      '/app/history/1789279967967',
      '/app/peers',
      '/app/editor/1789279967967',
    ];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForTimeout(400); // Very short — triggers connect/disconnect storm
    }

    // Final page should still be functional
    await page.waitForTimeout(2000);

    printConsoleSummary(capture, '[ NAV STORM ]');

    // No uncaught JS errors from WebSocket state machine
    const pageErrors = capture.errors.filter(e => e.startsWith('[PAGE_ERROR]'));
    expect(pageErrors, `Navigation storm caused JS crashes:\n${pageErrors.join('\n')}`).toHaveLength(0);
  });

  test('6 — Discovery flood: 30 concurrent peer registrations', async ({ request }) => {
    const promises = Array.from({ length: 30 }, (_, i) =>
      request.post('/api/discovery', {
        data: {
          nodeId: `discovery-flood-${i}`,
          address: `192.168.${Math.floor(i / 255)}.${i % 255}`,
          port: 9000 + i,
          displayName: `Flood Node ${i}`,
          roomOtp: 'FLOOD1',
        },
      })
    );

    const results = await Promise.allSettled(promises);
    const ok = results.filter(r => r.status === 'fulfilled' && r.value.status() === 200).length;
    const bad = 30 - ok;

    console.log(`  [DISCOVERY FLOOD] ${ok}/30 registered, ${bad} failed`);
    expect(ok, 'Too many discovery registrations failed').toBeGreaterThan(20);

    // List should now include many of them
    const listRes = await request.get('/api/discovery?roomOtp=FLOOD1');
    if (listRes.ok()) {
      const body = await listRes.json();
      console.log(`  [DISCOVERY FLOOD] ${body.peers?.length ?? 0} peers visible in discovery`);
    }
  });

  test('7 — Signal relay flood: 50 concurrent WebRTC signals', async ({ request }) => {
    const promises = Array.from({ length: 50 }, (_, i) =>
      request.post('/api/lobby/signal', {
        data: {
          otp: 'SIG001',
          fromNodeId: `signal-from-${i}`,
          toNodeId: `signal-to-${i % 5}`,
          signal: { type: 'offer', sdp: `v=0\r\no=signal ${i} 0 IN IP4 127.0.0.1\r\n` },
        },
      })
    );

    const results = await Promise.allSettled(promises);
    const ok = results.filter(r => r.status === 'fulfilled' && r.value.status() === 200).length;
    const fail50 = 50 - ok;
    console.log(`  [SIGNAL FLOOD] ${ok}/50 signals sent, ${fail50} failed`);
    expect(fail50).toBeLessThan(10);
  });
});
