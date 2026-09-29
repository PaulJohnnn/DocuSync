/**
 * Captures the manual-approval evidence for the defense deck:
 * the requester waiting with no administrator online, the same screen once
 * one signs in, the administrator's pending queue, and the approved result.
 *
 * Run: node scripts/capture-approval-screens.js <outDir>
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.CAP_BASE || 'http://localhost:3000';
const OUT_DIR = process.argv[2];
const VIEWPORT = { width: 1600, height: 900 };
const USER = 'approval-demo';

const shot = async (page, name) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, name + '.png') });
  console.log('  saved', name);
};

async function adminLogin(page) {
  await page.goto(`${BASE}/app/login`);
  await page.fill('input[placeholder="Enter your username"]', 'admin');
  await page.fill('input[placeholder="Enter your password"]', 'admin');
  await page.click('button:has-text("Log In")');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 });
}

(async () => {
  if (!OUT_DIR) throw new Error('pass an output directory');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();

  // Clear any stale request/account for this username so the run is clean.
  const reset = await browser.newContext({ viewport: VIEWPORT });
  const rp = await reset.newPage();
  await rp.goto(BASE);
  await rp.evaluate(async (email) => {
    const sync = await (await fetch('/api/auth?action=sync')).json();
    for (const p of (sync.pending || []).filter(p => p.email === email)) {
      await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deny', reqId: p.id }) });
    }
    for (const u of (sync.users || []).filter(u => u.email === email)) {
      await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'revoke', userId: u.id }) });
    }
  }, USER);
  await reset.close();

  const reqCtx = await browser.newContext({ viewport: VIEWPORT });
  const requester = await reqCtx.newPage();

  try {
    // ── 1. Request submitted while no administrator is online ──────────
    console.log('Requester submits (no admin online)...');
    await requester.goto(`${BASE}/app/login`);
    await requester.click('button:has-text("Create Local Profile")');
    await requester.waitForSelector('input[placeholder="Enter your username"]');
    await requester.fill('input[placeholder="Enter your username"]', USER);
    await requester.click('button:has-text("Request Local Profile")');
    await requester.waitForSelector('text=Request Sent!', { timeout: 20000 });
    // wait for the presence check to report "offline"
    await requester.waitForSelector('text=No administrator is online right now', { timeout: 20000 });
    await shot(requester, 'approval-1-no-admin-online');

    // ── 2. An administrator signs in; the same screen updates itself ───
    console.log('Administrator signs in...');
    const adminCtx = await browser.newContext({ viewport: VIEWPORT });
    const admin = await adminCtx.newPage();
    await adminLogin(admin);
    await requester.waitForSelector('text=An administrator is online', { timeout: 30000 });
    await shot(requester, 'approval-2-admin-online');

    // ── 3. The administrator's pending queue ──────────────────────────
    console.log('Admin dashboard queue...');
    await admin.goto(`${BASE}/app/admin/dashboard`);
    await admin.waitForSelector('text=Pending Requests', { timeout: 20000 });
    await admin.waitForSelector(`text=${USER}`, { timeout: 20000 });
    await admin.waitForTimeout(1200);
    await shot(admin, 'approval-3-admin-queue');

    // ── 4. Approve — the requester's screen flips on its own ──────────
    console.log('Approving...');
    await admin.evaluate((email) => {
      const rows = [...document.querySelectorAll('div')].filter(d => d.textContent.includes(email));
      const row = rows[rows.length - 1].closest('div[style*="space-between"]') || rows[rows.length - 1].parentElement.parentElement;
      [...row.querySelectorAll('button')].find(b => /approve/i.test(b.textContent))?.click();
    }, USER);
    await requester.waitForSelector('text=Request Approved!', { timeout: 30000 });
    await requester.waitForTimeout(800);
    await shot(requester, 'approval-4-approved');

    // Tidy up: the account only existed for these captures.
    await admin.evaluate(async (email) => {
      const sync = await (await fetch('/api/auth?action=sync')).json();
      for (const u of (sync.users || []).filter(u => u.email === email)) {
        await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'revoke', userId: u.id }) });
      }
    }, USER);
    console.log('\nDone — demo account revoked.');
  } catch (err) {
    console.error('FAILED:', err.message);
    try { await requester.screenshot({ path: path.join(OUT_DIR, 'error-requester.png') }); } catch (_) {}
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
