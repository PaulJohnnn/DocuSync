// Captures clean 16:9 screenshots of every major DocuSync screen for the
// defense deck. Two peers share a room so the collaborative screens show
// real multi-peer state rather than an empty room.
// Run with: node scripts/capture-deck-screens.js <outDir>
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3000';
const OUT_DIR = process.argv[2] || path.join(__dirname, '..', '..', 'deck-out');
const VIEWPORT = { width: 1600, height: 900 };

async function login(page, displayName) {
  await page.goto(`${BASE}/app/login`);
  await page.fill('input[placeholder="Enter your username"]', 'admin');
  await page.fill('input[placeholder="Enter your password"]', 'admin');
  await page.click('button:has-text("Log In")');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });
  await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), { timeout: 20000 });
  await page.evaluate((name) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    u.name = name;
    sessionStorage.setItem('docusync_auth_user', JSON.stringify(u));
  }, displayName);
}

async function seedFile(page, otp, fileId, html) {
  await page.evaluate(async ({ otp, fileId, html }) => {
    const DB_NAME = 'DocuSyncDB', STORE_NAME = 'files';
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE_NAME)) d.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({
        id: fileId, name: 'thesis-roadmap.docx', type: 'text/plain', size: html.length,
        content: html, status: 'synced',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    localStorage.setItem(`ds_user-002_docusync_cached_room_files_${otp}`, JSON.stringify([{
      fileId: Number(fileId), fileName: 'thesis-roadmap.docx', content: html,
      contentLength: html.length, sharedBy: 'Paul', sharedAt: new Date().toISOString(),
    }]));
    await fetch('/api/lobby/doc', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp, fileId, content: html, authorNodeId: 'seed-init', seq: 1, committedAt: Date.now(), isSessionEnd: true }),
    });
  }, { otp, fileId, html });
}

async function hardScrollTop(page) {
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelectorAll('*').forEach(el => { if (el.scrollTop > 0) el.scrollTop = 0; });
    });
    await page.waitForTimeout(150);
  }
}

async function focusEditorEnd(page) {
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('Control+End');
  await page.waitForFunction(() => document.activeElement?.classList?.contains('ProseMirror'), { timeout: 5000 });
}

async function shot(page, name) {
  await hardScrollTop(page);
  await page.waitForTimeout(400);
  const p = path.join(OUT_DIR, name + '.png');
  await page.screenshot({ path: p });
  console.log('  saved', name);
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctxA = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const ctxB = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const paul = await ctxA.newPage();
  const zyra = await ctxB.newPage();

  try {
    // ── Public pages (no auth) ──────────────────────────────────────────
    console.log('Public pages...');
    await paul.goto(`${BASE}/home`);
    await paul.waitForTimeout(2500);
    await shot(paul, '01-landing');

    await paul.goto(`${BASE}/app/login`);
    await paul.waitForTimeout(1200);
    await shot(paul, '02-login');

    // ── Auth ────────────────────────────────────────────────────────────
    console.log('Logging in...');
    await login(paul, 'Paul');
    await login(zyra, 'Zyra');

    // ── Room creation ───────────────────────────────────────────────────
    console.log('Creating room...');
    await paul.goto(`${BASE}/app/peers`);
    await paul.waitForTimeout(1200);
    await shot(paul, '03-peers-empty');

    await paul.click('button:has-text("Create Room")');
    await paul.fill('input[placeholder*="Thesis Project"]', 'Defense Demo');
    await paul.click('button:has-text("Generate Room")');
    await paul.waitForSelector('text=INVITE CODE');
    await paul.waitForTimeout(600);
    await shot(paul, '04-room-created');
    const otp = (await paul.locator('text=INVITE CODE').locator('xpath=following-sibling::*[1]').innerText()).trim();
    console.log('  OTP:', otp);
    await paul.click('text=Enter Workspace');
    await paul.waitForTimeout(1500);

    console.log('Second peer joining...');
    await zyra.goto(`${BASE}/app/peers`);
    await zyra.click('button:has-text("Join Room")');
    await zyra.locator('input[maxlength="6"]').fill(otp);
    await zyra.click('button:has-text("Join Room")');
    await zyra.waitForSelector('text=Joined Room!', { timeout: 20000 });
    await zyra.click('text=Enter Workspace');
    await zyra.waitForTimeout(1800);
    const joined = await zyra.evaluate(() => localStorage.getItem('ds_user-002_current_room'));
    if (!joined) throw new Error('join flow broke — no current_room');

    await paul.goto(`${BASE}/app/peers`);
    await paul.waitForTimeout(2500);
    await shot(paul, '05-peers-connected');

    // ── Files ───────────────────────────────────────────────────────────
    const fileId = Date.now().toString();
    const baseHtml =
      '<h2>Q4 Engineering Roadmap</h2>' +
      '<p>The quarterly roadmap will be finalized by the engineering team before the end of the sprint.</p>' +
      '<p>All stakeholders should review the attached timeline and confirm their availability for the planning session.</p>' +
      '<p>Deployment freeze begins the week of the release candidate.</p>';
    await seedFile(paul, otp, fileId, baseHtml);
    await seedFile(zyra, otp, fileId, baseHtml);

    await paul.goto(`${BASE}/app/files`);
    await paul.waitForTimeout(2000);
    await shot(paul, '06-files');

    // ── Editor, single peer ─────────────────────────────────────────────
    console.log('Editor...');
    await paul.goto(`${BASE}/app/editor/${fileId}`);
    await paul.waitForSelector('.ProseMirror');
    await paul.waitForTimeout(2500);
    await shot(paul, '07-editor');

    // ── Live collaboration: both peers in the document ──────────────────
    await zyra.goto(`${BASE}/app/editor/${fileId}`);
    await zyra.waitForSelector('.ProseMirror');
    await zyra.waitForTimeout(2500);

    await focusEditorEnd(paul);
    await paul.keyboard.type(' Paul is editing this sentence live.', { delay: 25 });
    await paul.waitForTimeout(2500);
    await shot(zyra, '08-editor-collab');

    // ── Concurrent edit on the same line → LWW ──────────────────────────
    console.log('Concurrent edit...');
    await focusEditorEnd(paul);
    await focusEditorEnd(zyra);
    await Promise.all([
      paul.keyboard.type(' Paul: ship on Monday.', { delay: 20 }),
      zyra.keyboard.type(' Zyra: ship on Friday.', { delay: 20 }),
    ]);
    await paul.waitForTimeout(1200);
    await shot(paul, '09-concurrent-peer-a');
    await paul.waitForTimeout(4000);
    await shot(paul, '10-lww-resolved');

    // ── Version history ─────────────────────────────────────────────────
    console.log('History...');
    await paul.goto(`${BASE}/app/history/${fileId}`);
    await paul.waitForTimeout(3000);
    await shot(paul, '11-history');

    // ── Metrics ─────────────────────────────────────────────────────────
    console.log('Metrics...');
    await paul.goto(`${BASE}/app/metrics`);
    await paul.waitForTimeout(4000);
    await shot(paul, '12-metrics');

    // ── Settings ────────────────────────────────────────────────────────
    await paul.goto(`${BASE}/app/settings`);
    await paul.waitForTimeout(2000);
    await shot(paul, '13-settings');

    // ── Admin dashboard ─────────────────────────────────────────────────
    console.log('Admin...');
    await paul.goto(`${BASE}/app/admin/dashboard`);
    await paul.waitForTimeout(3000);
    await shot(paul, '14-admin');

    console.log('\nOTP used (clean up if run against production):', otp);
    console.log('Done. Screenshots in', OUT_DIR);
  } catch (err) {
    console.error('FAILED:', err.message);
    try { await paul.screenshot({ path: path.join(OUT_DIR, 'error-paul.png') }); } catch (_) {}
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
