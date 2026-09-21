// Reproduces the full two-peer LWW conflict / concurrency / offline-reconnect /
// delta scenario against the running dev server and saves verified, full-size
// PNG screenshots for every figure. Run with: node scripts/capture-all-figures.js <outDir>
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3000';
const OUT_DIR = process.argv[2];
const VIEWPORT = { width: 1920, height: 1080 };

async function login(page, displayName) {
  await page.goto(`${BASE}/app/login`);
  await page.fill('input[placeholder="Enter your username"]', 'admin');
  await page.fill('input[placeholder="Enter your password"]', 'admin');
  await page.click('button:has-text("Log In")');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), { timeout: 15000 });
  await page.evaluate((name) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    u.name = name;
    sessionStorage.setItem('docusync_auth_user', JSON.stringify(u));
  }, displayName);
}

async function seedFile(page, otp, fileId, html) {
  await page.evaluate(async ({ otp, fileId, html }) => {
    const DB_NAME = 'DocuSyncDB', STORE_NAME = 'files';
    function getDB() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        };
      });
    }
    const db = await getDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ id: fileId, name: 'roadmap-plan.docx', type: 'text/plain', size: html.length, content: html, status: 'synced', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    localStorage.setItem(`ds_user-002_docusync_cached_room_files_${otp}`, JSON.stringify([{ fileId: Number(fileId), fileName: 'roadmap-plan.docx', content: html, contentLength: html.length, sharedBy: 'Paul', sharedAt: new Date().toISOString() }]));
    await fetch('/api/lobby/doc', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp, fileId, content: html, authorNodeId: 'seed-init', seq: 1, committedAt: Date.now(), isSessionEnd: true }),
    });
  }, { otp, fileId, html });
}

// Click the ProseMirror container itself (stable target, unaffected by the
// pagination loop's continuous marginTop rewrites on individual <p>
// children) then jump to the very end of the document with Ctrl+End. Far
// more reliable than clicking a specific paragraph, whose bounding box can
// go stale between measurement and click.
async function focusEditorEnd(page) {
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('Control+End');
  await page.waitForFunction(() => document.activeElement?.classList?.contains('ProseMirror'), { timeout: 5000 });
}

// Scrolls window AND every scrollable element on the page to the top.
// A single window.scrollTo(0,0) isn't enough here: the app's own inner
// content wrapper scrolls independently, and typing near the end of a long
// (duplicated-content) document keeps re-triggering caret-follow scroll on
// React re-renders after the call — so the status badge in the header ends
// up scrolled out of frame by the time the screenshot actually fires.
async function hardScrollTop(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll('*').forEach((el) => {
      if (el.scrollTop > 0) el.scrollTop = 0;
    });
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll('*').forEach((el) => {
      if (el.scrollTop > 0) el.scrollTop = 0;
    });
  });
}

async function typeAndVerify(page, text, screenshotPath) {
  await focusEditorEnd(page);
  const before = await page.evaluate(() => document.querySelector('.ProseMirror').innerText);
  await page.keyboard.type(text, { delay: 20 });
  await page.waitForFunction(
    ({ before, text }) => document.querySelector('.ProseMirror').innerText !== before && document.querySelector('.ProseMirror').innerText.includes(text.trim()),
    { before, text },
    { timeout: 8000 }
  );
  await page.waitForTimeout(2200); // let delta/peer footer catch up to the push
  if (screenshotPath) {
    // The delta/peer-count footer sits below the editor's simulated A4 page,
    // which is taller than a normal viewport — scroll it into view so the
    // figure actually shows what it's meant to demonstrate.
    await page.locator('text=peers connected').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: screenshotPath });
    console.log('saved', path.basename(screenshotPath));
  } else {
    await page.evaluate(() => window.scrollTo(0, 0));
  }
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctxPaul = await browser.newContext({ viewport: VIEWPORT });
  const ctxZyra = await browser.newContext({ viewport: VIEWPORT });
  const paul = await ctxPaul.newPage();
  const zyra = await ctxZyra.newPage();

  try {
    console.log('Logging in both peers...');
    await login(paul, 'Paul');
    await login(zyra, 'Zyra');

    console.log('Paul creating room...');
    await paul.goto(`${BASE}/app/peers`);
    await paul.click('button:has-text("Create Room")');
    await paul.fill('input[placeholder*="Thesis Project"]', 'FigureCaptureFinal');
    await paul.click('button:has-text("Generate Room")');
    await paul.waitForSelector('text=INVITE CODE');
    const otp = (await paul.locator('text=INVITE CODE').locator('xpath=following-sibling::*[1]').innerText()).trim();
    console.log('OTP:', otp);
    await paul.click('text=Enter Workspace');
    await paul.waitForTimeout(1500);

    console.log('Zyra joining room...');
    await zyra.goto(`${BASE}/app/peers`);
    await zyra.click('button:has-text("Join Room")');
    await zyra.locator('input[maxlength="6"]').fill(otp);
    await zyra.click('button:has-text("Join Room")');
    await zyra.waitForSelector('text=Joined Room!', { timeout: 15000 });
    await zyra.click('text=Enter Workspace');
    await zyra.waitForTimeout(1500);
    const zyraRoom = await zyra.evaluate(() => localStorage.getItem('ds_user-002_current_room'));
    if (!zyraRoom) throw new Error('Zyra never got a current_room set after joining — join flow broke');
    console.log('Zyra room set:', zyraRoom);

    const fileId = Date.now().toString();
    const baseHtml = '<p>The quarterly roadmap will be finalized by the engineering team before the end of the sprint.</p><p>All stakeholders should review the attached timeline and confirm their availability for the planning session.</p>';
    console.log('Seeding file', fileId);
    await seedFile(paul, otp, fileId, baseHtml);
    await seedFile(zyra, otp, fileId, baseHtml);

    await paul.goto(`${BASE}/app/editor/${fileId}`);
    await paul.waitForSelector('.ProseMirror');
    await paul.waitForTimeout(1200);
    await zyra.goto(`${BASE}/app/editor/${fileId}`);
    await zyra.waitForSelector('.ProseMirror');
    await zyra.waitForTimeout(1200);

    // Re-push clean baseline in case the initial empty-mount autosave clobbered it
    await paul.evaluate(async ({ otp, fileId, html }) => {
      await fetch('/api/lobby/doc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp, fileId, content: html, authorNodeId: 'seed-init2', seq: 2, committedAt: Date.now(), isSessionEnd: true }) });
    }, { otp, fileId, html: baseHtml });
    await paul.reload();
    await paul.waitForSelector('.ProseMirror');
    await paul.waitForTimeout(1200);
    await zyra.reload();
    await zyra.waitForSelector('.ProseMirror');
    await zyra.waitForTimeout(1200);

    console.log('Focusing both editors at end of document...');
    await focusEditorEnd(paul);
    await focusEditorEnd(zyra);

    console.log('Typing concurrently on both peers...');
    await Promise.all([
      paul.keyboard.type(' Paul: pushing to next Monday.', { delay: 20 }),
      zyra.keyboard.type(' Zyra: pushing to next Friday.', { delay: 20 }),
    ]);
    await paul.waitForFunction((t) => document.querySelector('.ProseMirror').innerText.includes(t), 'Paul: pushing', { timeout: 8000 });
    await zyra.waitForFunction((t) => document.querySelector('.ProseMirror').innerText.includes(t), 'Zyra: pushing', { timeout: 8000 });

    // Figure 11: Tree Clock concurrency indicator, captured immediately, before either resolves
    await hardScrollTop(paul);
    await hardScrollTop(zyra);
    await paul.screenshot({ path: path.join(OUT_DIR, 'figure-11-tree-clock-paul.png') });
    await zyra.screenshot({ path: path.join(OUT_DIR, 'figure-11-tree-clock-zyra.png') });
    console.log('Saved figure 11');

    console.log('Waiting for poll/merge cycles to settle...');
    await paul.waitForTimeout(4500);
    await zyra.waitForTimeout(1500);

    // Figure 13: LWW override outcome
    await hardScrollTop(paul);
    await hardScrollTop(zyra);
    await paul.screenshot({ path: path.join(OUT_DIR, 'figure-13-lww-paul-view.png') });
    await zyra.screenshot({ path: path.join(OUT_DIR, 'figure-13-lww-zyra-view.png') });
    console.log('Saved figure 13');

    // Figures 9-10: event log
    await paul.click('button:has-text("History")');
    await paul.waitForSelector('text=Document History');
    await paul.waitForFunction(() => !document.body.innerText.includes('Loading history'), { timeout: 15000 });
    await paul.waitForTimeout(800);
    await paul.screenshot({ path: path.join(OUT_DIR, 'figure-9-10-event-log.png') });
    console.log('Saved figures 9-10');
    await paul.goBack();
    await paul.waitForSelector('.ProseMirror');
    await paul.waitForTimeout(1200);

    // Figures 14-15: delta/checksum, two distinct verified edits
    await typeAndVerify(paul, ' Confirmed for Q3.', path.join(OUT_DIR, 'figure-14-delta-1.png'));
    await typeAndVerify(paul, ' Final review Friday afternoon.', path.join(OUT_DIR, 'figure-15-delta-2.png'));

    // Figure 12: offline -> edit -> reconnect, on Zyra's context
    await zyra.reload();
    await zyra.waitForSelector('.ProseMirror');
    await zyra.waitForTimeout(1200);
    await hardScrollTop(zyra);
    await zyra.screenshot({ path: path.join(OUT_DIR, 'figure-12a-before-offline.png') });
    await zyra.evaluate(() => { window.__DOCUSYNC_DEV_OFFLINE__ = true; });
    await zyra.waitForTimeout(300);
    await typeAndVerify(zyra, ' Edited while offline by Zyra.', null);
    await hardScrollTop(zyra);
    await zyra.screenshot({ path: path.join(OUT_DIR, 'figure-12b-offline-queued.png') });
    console.log('Saved figure 12b');
    await zyra.evaluate(() => { window.__DOCUSYNC_DEV_OFFLINE__ = false; window.dispatchEvent(new Event('online')); });
    await zyra.waitForTimeout(3500);
    await hardScrollTop(zyra);
    await zyra.screenshot({ path: path.join(OUT_DIR, 'figure-12c-reconnected-synced.png') });
    console.log('Saved figure 12c');

    console.log('ALL DONE. Files in', OUT_DIR);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('SCRIPT FAILED:', e.message); process.exit(1); });
