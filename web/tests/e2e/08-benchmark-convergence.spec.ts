import { test, expect, Page } from '@playwright/test';
import { BandwidthProfiler } from './benchmarks/bandwidth-profiler';
import { LatencyProfiler } from './benchmarks/latency-profiler';
import * as fs from 'fs';
import * as path from 'path';

async function authenticate(page: Page, username: string) {
  const fakeUser = {
    id: `bot-${Date.now()}-${Math.random()}`,
    email: username,
    name: username,
    isAdmin: false,
    createdAt: new Date().toISOString(),
    status: 'active'
  };

  await page.addInitScript((userObj) => {
    localStorage.setItem('docusync_auth_user', JSON.stringify(userObj));
    sessionStorage.setItem('docusync_auth_user', JSON.stringify(userObj));
    sessionStorage.setItem('docusync_has_seen_welcome_session', 'true');
  }, fakeUser);
}

async function createRoom(page: Page, algo: 'lww'|'ot'): Promise<string> {
  await page.goto('http://localhost:3000/app/peers');
  await page.click('text=Host Workspace');
  await page.waitForTimeout(500); // Animation wait
  
  await page.fill('input[placeholder="e.g., Q3 Planning..."]', `Benchmark Room ${algo.toUpperCase()}`);
  
  // Select the specific algorithm
  if (algo === 'ot') {
    await page.click('input[value="ot"]');
  } else {
    await page.click('input[value="lww"]');
  }
  
  await page.click('button:has-text("Generate Room")');
  await page.waitForSelector('text=Share this Invite Code');
  
  const otpInput = await page.locator('input[readonly]').inputValue();
  return otpInput;
}

// Helper to automate Joining a Room
async function joinRoom(page: Page, otp: string) {
  await page.goto('http://localhost:3000/app/peers');
  await page.click('text=Join Remote User');
  await page.waitForTimeout(500);
  await page.fill('input[placeholder="Enter 6-char code"]', otp);
  await page.click('button:has-text("Connect to Room")');
  await page.waitForSelector(`text=Connected successfully`, { timeout: 10000 });
}

for (const ALGORITHM of ['lww', 'ot'] as const) {
  test(`Thesis Benchmark (${ALGORITHM.toUpperCase()}): Convergence, Latency, and Bandwidth`, async ({ browser }) => {
    test.setTimeout(60000); // 1 minute per algorithm test

    const contextHost = await browser.newContext();
    const contextPeer = await browser.newContext();
    const hostPage = await contextHost.newPage();
    const peerPage = await contextPeer.newPage();

    // Attach Profilers
    const bandwidthHost = new BandwidthProfiler(ALGORITHM);
    bandwidthHost.attach(hostPage);
    const bandwidthPeer = new BandwidthProfiler(ALGORITHM);
    bandwidthPeer.attach(peerPage);
    const latency = new LatencyProfiler(ALGORITHM);

    // 1. Authenticate & Setup Room
    await authenticate(hostPage, 'BenchHost');
    const otp = await createRoom(hostPage, ALGORITHM);
    await hostPage.click('text=Return to Dashboard');
    
    // Create benchmark document
    await hostPage.click('text=Files'); // Navigate natively via sidebar
    await hostPage.click('text=New File');
    await hostPage.click('text=Thesis Benchmark Doc'); // Selecting a quick text doc template
    await hostPage.waitForURL(/\/app\/editor\/.*/);
    const editorUrl = hostPage.url();
    const fileId = editorUrl.split('/').pop();

    // 2. Peer Authenticates & Joins
    await authenticate(peerPage, 'BenchPeer');
    await joinRoom(peerPage, otp);
    
    // Peer navigates natively so the socket doesn't die!
    await peerPage.click('text=Files');
    await peerPage.waitForSelector('text=Thesis Benchmark Doc', { timeout: 15000 }); // Wait for the WebRTC host sync to manifest the file
    await peerPage.click('text=Thesis Benchmark Doc');
    
    // Give WebRTC & WebSocket bindings ample time to handshake and sync CRDT documents across the network
    await hostPage.waitForTimeout(4000); 
    await peerPage.waitForTimeout(4000);

    // Ensure editor is ready
    await expect(hostPage.locator('.ProseMirror')).toBeVisible();
    await expect(peerPage.locator('.ProseMirror')).toBeVisible();

    // --- LATENCY TEST ---
    // Host types a distinct phrase
    const uniqueSyncToken = `[HOST_SYNC_${Date.now()}]`;
    await hostPage.locator('.ProseMirror').type(uniqueSyncToken);
    
    // Measure time until the peer DOM renders the update
    const lat = await latency.awaitDOMConvergence(peerPage, uniqueSyncToken);
    console.log(`[LATENCY] ${ALGORITHM.toUpperCase()} Sync Time: ${lat}ms`);

    // --- CONFLICT RESOLUTION & CONVERGENCE (DATA CONSISTENCY) TEST ---
    // We force overlapping chaotic edits to test collision handling
    const hostInput = ` HOST_CONCURRENT_${Date.now()} `;
    const peerInput = ` PEER_CONCURRENT_${Date.now()} `;

    await Promise.all([
      hostPage.locator('.ProseMirror').type(hostInput, { delay: 10 }), // simulate typing
      peerPage.locator('.ProseMirror').type(peerInput, { delay: 10 })
    ]);

    // Wait for the sync queues to resolve (~3 seconds is standard eventual consistency grace period)
    await hostPage.waitForTimeout(3000); 

    const hostContent = await hostPage.locator('.ProseMirror').innerText();
    const peerContent = await peerPage.locator('.ProseMirror').innerText();

    const dataConsistencyReport = {
      algorithm: ALGORITHM,
      hostMatchesPeer: hostContent === peerContent,
      hostContentLength: hostContent.length,
      peerContentLength: peerContent.length,
      dataLostHostEdit: !hostContent.includes(hostInput) && !hostContent.includes(hostInput.trim()),
      dataLostPeerEdit: !hostContent.includes(peerInput) && !hostContent.includes(peerInput.trim()),
    };

    // Calculate Conflict Detection Rate mathematically 
    // (If data is missing from either, or they misaligned, conflict resolution failed accuracy)
    const metricsDir = path.join(__dirname, '..', '..', 'metrics');
    fs.writeFileSync(
      path.join(metricsDir, `${ALGORITHM}-consistency.json`),
      JSON.stringify(dataConsistencyReport, null, 2)
    );

    // Save final metrics
    bandwidthHost.saveMetrics();
    bandwidthPeer.saveMetrics();
    latency.saveMetrics();

    // Cleanup
    await contextHost.close();
    await contextPeer.close();
  });
}
