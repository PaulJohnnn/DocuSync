/**
 * Minimal two-peer probe: how long does an edit on peer A take to appear
 * on peer B? No video, no scenery — just the timing and the failure mode.
 *
 * Run: node scripts/probe-two-peer-sync.js
 */
const { chromium } = require('playwright');

const BASE = process.env.PROBE_BASE || 'http://localhost:3000';

async function login(page, name) {
  await page.goto(`${BASE}/app/login`);
  await page.fill('input[placeholder="Enter your username"]', 'admin');
  await page.fill('input[placeholder="Enter your password"]', 'admin');
  await page.click('button:has-text("Log In")');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 });
  await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), { timeout: 20000 });
  await page.evaluate((n) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    u.name = n; sessionStorage.setItem('docusync_auth_user', JSON.stringify(u));
  }, name);
}

async function seed(page, otp, fileId, html) {
  await page.evaluate(async ({ otp, fileId, html }) => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('DocuSyncDB', 1);
      r.onerror = () => rej(r.error); r.onsuccess = () => res(r.result);
      r.onupgradeneeded = (e) => { const d = e.target.result; if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id' }); };
    });
    await new Promise((res, rej) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put({ id: fileId, name: 'probe.txt', type: 'text/plain', size: html.length, content: html, status: 'synced', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    await fetch('/api/lobby/doc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp, fileId, content: html, authorNodeId: 'seed', seq: 1, committedAt: Date.now(), isSessionEnd: true }) });
  }, { otp, fileId, html });
}

(async () => {
  const browser = await chromium.launch();
  const a = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const b = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const A = await a.newPage(), B = await b.newPage();
  const log = [];
  B.on('console', (m) => { const t = m.text(); if (/\[APPLY\]|\[SEND\]|poll|Merged|Synced/i.test(t)) log.push(t.slice(0, 120)); });

  try {
    await Promise.all([login(A, 'Paul'), login(B, 'Zyra')]);

    await A.goto(`${BASE}/app/peers`);
    await A.click('button:has-text("Create Room")');
    await A.fill('input[placeholder*="Thesis Project"]', 'Probe');
    await A.click('button:has-text("Generate Room")');
    await A.waitForSelector('text=INVITE CODE');
    const otp = (await A.locator('text=INVITE CODE').locator('xpath=following-sibling::*[1]').innerText()).trim();
    await A.click('text=Enter Workspace');
    await A.waitForTimeout(1200);

    await B.goto(`${BASE}/app/peers`);
    await B.click('button:has-text("Join Room")');
    await B.locator('input[maxlength="6"]').fill(otp);
    await B.locator('button:has-text("Join Room")').last().click();
    await B.waitForSelector('text=Joined Room!', { timeout: 30000 });
    await B.click('text=Enter Workspace');
    await B.waitForTimeout(1200);

    const room = await B.evaluate(() => {
      const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
      return localStorage.getItem(`ds_${u.id}_current_room`);
    });
    console.log('room OTP :', otp);
    console.log('B room   :', room);

    const fileId = String(Date.now()).slice(-6);
    const html = '<div data-margin="96"><p>Base line.</p>\n</div>';
    await seed(A, otp, fileId, html);
    await seed(B, otp, fileId, html);

    await A.goto(`${BASE}/app/editor/${fileId}`);
    await A.waitForSelector('.ProseMirror');
    await B.goto(`${BASE}/app/editor/${fileId}`);
    await B.waitForSelector('.ProseMirror');
    await A.waitForTimeout(2500);

    const marker = 'PROBE-' + Math.random().toString(36).slice(2, 7).toUpperCase();
    await A.locator('.ProseMirror').click();
    await A.keyboard.press('Control+End');
    const t0 = Date.now();
    await A.keyboard.type(' ' + marker, { delay: 15 });

    let ms = null;
    try {
      await B.waitForFunction((m) => document.querySelector('.ProseMirror')?.innerText.includes(m), marker, { timeout: 30000 });
      ms = Date.now() - t0;
      console.log(`\nRESULT: peer B received the edit in ${ms} ms`);
    } catch {
      console.log('\nRESULT: peer B NEVER received the edit (30s)');
      console.log('B editor text:', (await B.evaluate(() => document.querySelector('.ProseMirror')?.innerText || '')).slice(0, 160));
      const server = await A.evaluate(async ({ otp, fileId }) => {
        const r = await fetch(`/api/lobby/doc?otp=${otp}&fileId=${fileId}&since=1`);
        const j = await r.json();
        return (j.content || '').slice(0, 160);
      }, { otp, fileId });
      console.log('server content:', server);
      console.log('B status text:', await B.evaluate(() => document.body.innerText.match(/Synced|Syncing|Offline|unavailable|Merged[^\\n]*/g)?.slice(0, 5)));
    }
    console.log('\nB console (filtered):', log.slice(-8));
    console.log('CLEANUP_OTP=' + otp);
  } finally {
    await browser.close();
  }
})();
