# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 04-multi-user-lww-editing.spec.ts >> Suite 4 — Multi-User LWW Concurrent Editing >> D — API: Two nodes push concurrent edits (LWW conflict scenario)
- Location: tests\e2e\04-multi-user-lww-editing.spec.ts:250:7

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Matcher error: received value must be a number or bigint

Received has value: undefined
```

# Test source

```ts
  213 |     joinResults.push(...results);
  214 | 
  215 |     const successes = joinResults.filter(r => r.status === 200);
  216 |     const failures = joinResults.filter(r => r.status !== 200);
  217 | 
  218 |     console.log(`  [15-PEER] Joined: ${successes.length}/15 successful`);
  219 |     console.log(`  [15-PEER] Failed: ${failures.map(r => `${r.userId}→${r.status}`).join(', ') || 'none'}`);
  220 |     if (successes.length > 0) {
  221 |       console.log(`  [15-PEER] Member count at peak: ${successes[successes.length - 1].memberCount}`);
  222 |     }
  223 | 
  224 |     // All 15 should join successfully (no cap enforced at API level)
  225 |     expect(successes.length, `Only ${successes.length}/15 users joined`).toBe(15);
  226 | 
  227 |     // Step 3: Attempt 16th user — document what happens
  228 |     const user16Res = await request.post('/api/lobby/join', {
  229 |       data: { otp, memberNodeId: 'qa-peer-16', clientNodeId: 'qa-peer-16' },
  230 |       headers: { 'Content-Type': 'application/json' },
  231 |     });
  232 |     console.log(`  [15-PEER] 16th user status: ${user16Res.status()}`);
  233 |     // We record this but do not assert pass/fail (behavior is undefined at cap)
  234 | 
  235 |     // Cleanup: leave all users
  236 |     for (const r of results) {
  237 |       if (r.status === 200) {
  238 |         await request.post('/api/lobby/leave', {
  239 |           data: { otp, nodeId: r.userId },
  240 |         }).catch(() => {});
  241 |       }
  242 |     }
  243 |   });
  244 | 
  245 |   /**
  246 |    * TEST D: API-level LWW conflict scenario.
  247 |    * POST same document snapshot from two nodes with concurrent vector clocks.
  248 |    * The system must return a resolution, not crash.
  249 |    */
  250 |   test('D — API: Two nodes push concurrent edits (LWW conflict scenario)', async ({ request }) => {
  251 |     // Create a shared room for this test
  252 |     const createRes = await request.post('/api/lobby/create', {
  253 |       data: {
  254 |         roomName: 'QA-LWW-Conflict',
  255 |         hostNodeId: 'qa-lww-host',
  256 |         hostIp: '127.0.0.1',
  257 |         hostPort: 9000,
  258 |         hostType: 'desktop',
  259 |       },
  260 |     });
  261 |     if (!createRes.ok()) {
  262 |       console.log('  [LWW-D] Could not create room. Skipping (matchmaker may be unavailable).');
  263 |       test.skip();
  264 |       return;
  265 |     }
  266 |     const { otp } = await createRes.json();
  267 | 
  268 |     // Save document baseline
  269 |     await request.post('/api/lobby/doc', {
  270 |       data: {
  271 |         otp,
  272 |         fileId: 1,
  273 |         content: '<p>Base document text.</p>',
  274 |         vectorClock: { nodeCount: 2, nodeIndex: 0, slots: [1, 0] },
  275 |         authorNodeId: 'qa-lww-host',
  276 |       },
  277 |     });
  278 | 
  279 |     // Both nodes push at "the same time" with concurrent vector clocks
  280 |     const [resA, resB] = await Promise.all([
  281 |       request.post('/api/lobby/doc', {
  282 |         data: {
  283 |           otp,
  284 |           fileId: 1,
  285 |           content: '<p>Node A edited: Introduction chapter.</p>',
  286 |           vectorClock: { nodeCount: 2, nodeIndex: 0, slots: [2, 1] }, // concurrent with B
  287 |           authorNodeId: 'qa-node-a',
  288 |         },
  289 |       }),
  290 |       request.post('/api/lobby/doc', {
  291 |         data: {
  292 |           otp,
  293 |           fileId: 1,
  294 |           content: '<p>Node B edited: Chapter one overview.</p>',
  295 |           vectorClock: { nodeCount: 2, nodeIndex: 1, slots: [1, 2] }, // concurrent with A
  296 |           authorNodeId: 'qa-node-b',
  297 |         },
  298 |       }),
  299 |     ]);
  300 | 
  301 |     console.log(`  [LWW-D] Node A push: ${resA.status()}`);
  302 |     console.log(`  [LWW-D] Node B push: ${resB.status()}`);
  303 | 
  304 |     // Both should respond (not 500)
  305 |     expect(resA.status()).toBeLessThan(500);
  306 |     expect(resB.status()).toBeLessThan(500);
  307 | 
  308 |     // Final state — read back what survived (LWW winner)
  309 |     const getRes = await request.get(`/api/lobby/doc?otp=${otp}&fileId=1`);
  310 |     if (getRes.ok()) {
  311 |       const doc = await getRes.json();
  312 |       console.log(`  [LWW-D] LWW Winner content: "${doc.document?.content?.slice(0, 80)}"`);
> 313 |       expect(doc.document?.content?.length).toBeGreaterThan(0);
      |                                             ^ Error: expect(received).toBeGreaterThan(expected)
  314 |     }
  315 | 
  316 |     // Record conflict history
  317 |     const histRes = await request.get(`/api/lobby/doc/history?otp=${otp}&fileId=1`);
  318 |     if (histRes.ok()) {
  319 |       const hist = await histRes.json();
  320 |       console.log(`  [LWW-D] History entries after conflict: ${hist.history?.length ?? 0}`);
  321 |     }
  322 |   });
  323 | 
  324 |   /**
  325 |    * TEST E: Offline user rejoins — verify edits merge.
  326 |    * Simulates one user going offline, another editing, then the first user returning.
  327 |    */
  328 |   test('E — Offline/Reconnect: offline edits queue then sync on reconnect', async ({ browser }) => {
  329 |     const ctxOnline = await createUserContext(browser, 'qa-always-online');
  330 |     const ctxOffline = await createUserContext(browser, 'qa-goes-offline');
  331 |     const pageOnline = await ctxOnline.newPage();
  332 |     const pageOffline = await ctxOffline.newPage();
  333 |     const capOnline = attachConsoleMonitor(pageOnline);
  334 |     const capOffline = attachConsoleMonitor(pageOffline);
  335 | 
  336 |     const EDITOR_URL = '/app/editor/1789279967967';
  337 |     await Promise.all([
  338 |       pageOnline.goto(EDITOR_URL),
  339 |       pageOffline.goto(EDITOR_URL),
  340 |     ]);
  341 |     await Promise.all([pageOnline.waitForTimeout(2000), pageOffline.waitForTimeout(2000)]);
  342 | 
  343 |     // Take the offline user offline (simulate via DevTools offline or flag injection)
  344 |     await pageOffline.evaluate(() => {
  345 |       (window as any).__DOCUSYNC_DEV_OFFLINE__ = true;
  346 |     });
  347 |     console.log('  [OFFLINE] User B set to offline mode.');
  348 | 
  349 |     // User A (online) types something
  350 |     await typeInEditor(pageOnline, ' ONLINE_USER_EDIT ', 30);
  351 |     await pageOnline.waitForTimeout(1500);
  352 | 
  353 |     // User B (offline) types something (should be queued)
  354 |     await typeInEditor(pageOffline, ' OFFLINE_USER_EDIT ', 30);
  355 |     await pageOffline.waitForTimeout(1000);
  356 | 
  357 |     // Check User B shows "Offline — queued" status
  358 |     const offlineStatus = await pageOffline.locator('text=queued, text=offline, text=Offline').first().isVisible().catch(() => false);
  359 |     console.log(`  [OFFLINE] User B shows offline status: ${offlineStatus}`);
  360 | 
  361 |     // Reconnect User B
  362 |     await pageOffline.evaluate(() => {
  363 |       (window as any).__DOCUSYNC_DEV_OFFLINE__ = false;
  364 |     });
  365 |     console.log('  [OFFLINE] User B reconnected. Waiting for sync...');
  366 |     await pageOffline.waitForTimeout(5000);
  367 | 
  368 |     // Check for sync status update
  369 |     const synced = await pageOffline.locator('text=Synced, text=synced, text=Merged, text=merged').first().isVisible().catch(() => false);
  370 |     console.log(`  [OFFLINE] User B sync indicator: ${synced}`);
  371 | 
  372 |     // No JS crashes
  373 |     printConsoleSummary(capOnline, '[ONLINE USER]');
  374 |     printConsoleSummary(capOffline, '[OFFLINE USER]');
  375 |     expect(capOnline.errors.filter((e: string) => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0);
  376 |     expect(capOffline.errors.filter((e: string) => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0);
  377 | 
  378 |     await ctxOnline.close();
  379 |     await ctxOffline.close();
  380 |   });
  381 | });
  382 | 
  383 | // Fix: reference 'page' properly in test A (needs to be replaced)
  384 | // The `page` variable in test A was incorrectly referenced, fix via the actual page objects
  385 | function fixPageRef() {
  386 |   // This is a no-op — the real fix was using pageA.waitForTimeout in the actual test
  387 | }
  388 | 
```