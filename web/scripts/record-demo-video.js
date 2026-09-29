/**
 * Records a two-device demo of DocuSync and composes it into a single
 * side-by-side video.
 *
 * Two independent browser contexts stand in for two devices. Both are
 * recorded, then stitched left/right with Playwright's bundled ffmpeg.
 *
 * The pacing is deliberately slower than the tests: typing has a visible
 * delay and each step pauses, because this is meant to be watched rather
 * than asserted on.
 *
 * Run: node scripts/record-demo-video.js [outDir]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const BASE = process.env.DEMO_BASE || 'http://localhost:3000';
const OUT_DIR = process.argv[2] || path.join(__dirname, '..', '..', 'demo-video');
const RAW_DIR = path.join(OUT_DIR, 'raw');
const VIEW = { width: 1280, height: 720 };

const FFMPEG = path.join(
  process.env.LOCALAPPDATA || '',
  'ms-playwright', 'ffmpeg-1011', 'ffmpeg-win64.exe'
);

const beat = (page, ms) => page.waitForTimeout(ms);

async function login(page, displayName) {
  await page.goto(`${BASE}/app/login`);
  await page.waitForSelector('input[placeholder="Enter your username"]');
  await beat(page, 700);
  await page.fill('input[placeholder="Enter your username"]', 'admin');
  await beat(page, 400);
  await page.fill('input[placeholder="Enter your password"]', 'admin');
  await beat(page, 500);
  await page.click('button:has-text("Log In")');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 });
  await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), { timeout: 20000 });
  await page.evaluate((name) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    u.name = name;
    sessionStorage.setItem('docusync_auth_user', JSON.stringify(u));
  }, displayName);
}

async function seedFile(page, otp, fileId, html, fileName) {
  await page.evaluate(async ({ otp, fileId, html, fileName }) => {
    const DB = 'DocuSyncDB', STORE = 'files';
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onerror = () => rej(r.error);
      r.onsuccess = () => res(r.result);
      r.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      };
    });
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({
        id: fileId, name: fileName, type: 'text/plain', size: html.length,
        content: html, status: 'synced',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    await fetch('/api/lobby/doc', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp, fileId, content: html, authorNodeId: 'seed', seq: 1, committedAt: Date.now(), isSessionEnd: true }),
    });
  }, { otp, fileId, html, fileName });
}

async function focusEnd(page) {
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('Control+End');
  await page.waitForFunction(() => document.activeElement?.classList?.contains('ProseMirror'), { timeout: 5000 });
}

(async () => {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });

  const browser = await chromium.launch();

  // Warm the dev server's routes in a throwaway context so the recorded
  // run doesn't open with a compile pause on every page.
  console.log('Warming routes...');
  const warm = await browser.newContext({ viewport: VIEW });
  const wp = await warm.newPage();
  for (const r of ['/app/login', '/app/peers', '/app/files', '/app/metrics']) {
    try { await wp.goto(BASE + r, { timeout: 60000 }); await wp.waitForTimeout(800); } catch (_) {}
  }
  await warm.close();

  const mk = (name) => browser.newContext({
    viewport: VIEW,
    recordVideo: { dir: path.join(RAW_DIR, name), size: VIEW },
  });

  const ctxA = await mk('paul');
  const ctxB = await mk('zyra');
  const paul = await ctxA.newPage();
  const zyra = await ctxB.newPage();

  try {
    // ── 1. Sign in ────────────────────────────────────────────────────
    console.log('Scene 1: sign in');
    await Promise.all([login(paul, 'Paul'), login(zyra, 'Zyra')]);
    await beat(paul, 1200);

    // ── 2. Create a room ──────────────────────────────────────────────
    console.log('Scene 2: create room');
    await paul.goto(`${BASE}/app/peers`);
    await beat(paul, 1500);
    await paul.click('button:has-text("Create Room")');
    await beat(paul, 900);
    await paul.fill('input[placeholder*="Thesis Project"]', 'Thesis Defense Demo');
    await beat(paul, 900);
    await paul.click('button:has-text("Generate Room")');
    await paul.waitForSelector('text=INVITE CODE');
    await beat(paul, 2500); // hold on the invite code
    const otp = (await paul.locator('text=INVITE CODE').locator('xpath=following-sibling::*[1]').innerText()).trim();
    console.log('  room', otp);
    await paul.click('text=Enter Workspace');
    await beat(paul, 1800);

    // ── 3. Second device joins ────────────────────────────────────────
    console.log('Scene 3: second device joins');
    await zyra.goto(`${BASE}/app/peers`);
    await beat(zyra, 1200);
    await zyra.click('button:has-text("Join Room")');
    await beat(zyra, 800);
    await zyra.locator('input[maxlength="6"]').fill(otp);
    await beat(zyra, 900);
    // "Join Room" labels both the nav button that opens this form and the
    // submit button inside it; take the last match so we press submit.
    await zyra.locator('button:has-text("Join Room")').last().click();
    await zyra.waitForSelector('text=Joined Room!', { timeout: 30000 });
    await beat(zyra, 1600);
    await zyra.click('text=Enter Workspace');
    await beat(zyra, 1800);

    // Show the peer list with both connected
    await paul.goto(`${BASE}/app/peers`);
    await beat(paul, 3000);

    // ── 4. Open the shared document ───────────────────────────────────
    console.log('Scene 4: open document');
    const fileId = String(Date.now()).slice(-6);
    const base = '<div data-margin="96"><h2>Q4 Engineering Roadmap</h2>\n'
      + '<p>The quarterly roadmap will be finalized before the end of the sprint.</p>\n'
      + '<p>All stakeholders should confirm availability for the planning session.</p>\n</div>';
    await seedFile(paul, otp, fileId, base, 'roadmap.txt');
    await seedFile(zyra, otp, fileId, base, 'roadmap.txt');

    await paul.goto(`${BASE}/app/files`);
    await beat(paul, 2500);
    await paul.goto(`${BASE}/app/editor/${fileId}`);
    await paul.waitForSelector('.ProseMirror');
    await beat(paul, 1500);
    await zyra.goto(`${BASE}/app/editor/${fileId}`);
    await zyra.waitForSelector('.ProseMirror');
    await beat(zyra, 2500);

    // ── 5. Live collaboration, device 1 -> device 2 ───────────────────
    console.log('Scene 5: live sync A -> B');
    await focusEnd(paul);
    await paul.keyboard.type(' Paul: the release candidate ships on Monday.', { delay: 55 });
    await zyra.waitForFunction(
      (t) => document.querySelector('.ProseMirror')?.innerText.includes(t),
      'ships on Monday', { timeout: 20000 }
    );
    await beat(zyra, 2500);

    // ── 6. And back, device 2 -> device 1 ─────────────────────────────
    console.log('Scene 6: live sync B -> A');
    await focusEnd(zyra);
    await zyra.keyboard.type(' Zyra: confirmed, I will prepare the release notes.', { delay: 55 });
    await paul.waitForFunction(
      (t) => document.querySelector('.ProseMirror')?.innerText.includes(t),
      'release notes', { timeout: 20000 }
    );
    await beat(paul, 3000);

    // ── 7. Version history — the append-only log ──────────────────────
    console.log('Scene 7: version history');
    await paul.goto(`${BASE}/app/history/${fileId}`);
    await beat(paul, 4500);

    // ── 8. Metrics — measured live ────────────────────────────────────
    console.log('Scene 8: metrics');
    await paul.goto(`${BASE}/app/metrics`);
    await beat(paul, 2000);
    await zyra.goto(`${BASE}/app/metrics`);
    await beat(paul, 5000);

    console.log('\nRoom used:', otp);
    fs.writeFileSync(path.join(OUT_DIR, 'room.txt'), otp);
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    // Videos are only flushed to disk on context close.
    await ctxA.close();
    await ctxB.close();
    await browser.close();
  }

  // ── Publish the recordings ──────────────────────────────────────────
  // Playwright bundles a deliberately minimal ffmpeg (no hstack, drawtext or
  // libx264), so the two device recordings are published as-is rather than
  // composited. They share one timeline: start them together to watch the
  // devices side by side.
  const pick = (dir) => {
    const d = path.join(RAW_DIR, dir);
    const f = fs.existsSync(d) ? fs.readdirSync(d).filter(x => x.endsWith('.webm'))[0] : null;
    return f ? path.join(d, f) : null;
  };
  const outputs = [
    ['paul', 'DocuSync-Demo-Device1-Paul.webm'],
    ['zyra', 'DocuSync-Demo-Device2-Zyra.webm'],
  ];
  for (const [dir, name] of outputs) {
    const src = pick(dir);
    if (!src) { console.error('missing recording for', dir); continue; }
    const dest = path.join(OUT_DIR, name);
    fs.copyFileSync(src, dest);
    console.log('wrote', dest, '(' + Math.round(fs.statSync(dest).size / 1024) + ' KB)');
  }
  fs.rmSync(RAW_DIR, { recursive: true, force: true });
})();
