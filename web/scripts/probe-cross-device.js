/**
 * Can two separate devices collaborate through the LIVE site?
 *
 * This is the question behind "will the desktop app on my other laptop work
 * with a web user". Desktop and mobile are shells that load the same hosted
 * web app, so what has to hold is: two independent clients, with separate
 * storage and separate accounts, reaching docusync-dusky.vercel.app, can
 * share a room and both keep their edits.
 *
 * Two isolated browser contexts stand in for two machines — separate
 * storage, separate sessions, nothing shared but the server. The one thing
 * they cannot reproduce is two different networks.
 *
 * Run: node scripts/probe-cross-device.js [baseUrl]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'https://docusync-dusky.vercel.app';
// Accounts that exist on the target. The qa-* set only exists in the local
// Redis, so against the live site these come from provision-test-accounts.js.
const file = BASE.includes('localhost') ? 'qa-accounts.json' : 'live-accounts.json';
const accounts = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
const U = Object.fromEntries(accounts.map((a) => [a.id, { email: a.email, password: a.password }]));
const beat = (p, ms) => p.waitForTimeout(ms);

const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok, name });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

async function login(page, name, acct) {
  await page.goto(`${BASE}/app/login`, { waitUntil: 'networkidle' });
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 60000 });
  await page.fill('input[placeholder="Enter your username"]', acct.email);
  await page.fill('input[placeholder="Enter your password"]', acct.password);
  await page.click('button:has-text("Log In")');
  await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), null, { timeout: 60000 });
  await page.evaluate((n) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    u.name = n; sessionStorage.setItem('docusync_auth_user', JSON.stringify(u));
  }, name);
}

const text = (page) => page.evaluate(() => document.querySelector('.ProseMirror')?.innerText || '');

(async () => {
  console.log(`target: ${BASE}\n`);
  const browser = await chromium.launch();
  // "Laptop A" and "Laptop B" — nothing shared between the two contexts.
  const laptopA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const laptopB = await browser.newContext({ viewport: { width: 390, height: 844 } }); // phone-sized
  const a = await laptopA.newPage();
  const b = await laptopB.newPage();
  // The live site is slower than a local dev server, and a cold serverless
  // route can take well over the 30s default.
  for (const p of [a, b]) {
    p.setDefaultNavigationTimeout(90000);
    p.setDefaultTimeout(60000);
  }

  try {
    await login(a, 'Paul', U.A);
    await login(b, 'Zyra', U.B);
    check(true, 'both devices signed in against the live site');

    // A creates the room.
    await a.goto(`${BASE}/app/peers`, { waitUntil: 'networkidle' });
    await beat(a, 1500);
    await a.click('button:has-text("Create Room")');
    await beat(a, 700);
    await a.fill('input[placeholder*="Thesis Project"]', 'Cross Device Check');
    await beat(a, 400);
    await a.click('button:has-text("Generate Room")');
    await a.waitForSelector('text=INVITE CODE', { timeout: 45000 });
    const otp = (await a.locator('text=INVITE CODE').locator('xpath=following-sibling::*[1]').innerText()).trim();
    check(!!otp && otp.length === 6, 'device A created a room', `code ${otp}`);
    await a.click('text=Enter Workspace');
    await beat(a, 1500);

    // B joins with just the code — the only thing that passes between them.
    await b.goto(`${BASE}/app/peers`, { waitUntil: 'networkidle' });
    await beat(b, 1200);
    await b.click('button:has-text("Join Room")');
    await beat(b, 600);
    await b.locator('input[maxlength="6"]').fill(otp);
    await b.waitForFunction((c) => document.querySelector('input[maxlength="6"]')?.value === c, otp, { timeout: 15000 });
    await beat(b, 600);
    await b.locator('button:has-text("Join Room")').last().click();
    let joined = true;
    try { await b.waitForSelector('text=Joined Room!', { timeout: 35000 }); }
    catch { joined = false; }
    check(joined, 'device B joined using only the code');
    await beat(b, 1200);
    await b.click('text=Enter Workspace').catch(() => { });
    await beat(b, 1500);

    // Both open the same document.
    const fileId = String(Date.now()).slice(-6);
    const doc = '<div data-margin="96"><p>LINE A.</p><p>LINE B.</p><p>LINE C.</p></div>';
    for (const p of [a, b]) {
      await p.evaluate(async (x) => {
        await fetch('/api/lobby/doc', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otp: x.otp, fileId: x.fileId, content: x.doc, authorNodeId: 'seed', seq: 1, committedAt: Date.now(), isSessionEnd: true }),
        });
      }, { otp, fileId, doc });
      await p.goto(`${BASE}/app/editor/${fileId}`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('.ProseMirror', { timeout: 45000 });
    }
    check(true, 'both devices opened the same document');

    // A types, B must receive it.
    await a.locator('.ProseMirror').click();
    await a.keyboard.press('Control+End');
    await a.keyboard.type(' [FROM DEVICE A]', { delay: 45 });
    let got = true;
    try {
      await b.waitForFunction(() => document.querySelector('.ProseMirror')?.innerText.includes('[FROM DEVICE A]'), null, { timeout: 60000 });
    } catch { got = false; }
    check(got, 'device A’s edit reached device B');
    await beat(b, 2000);

    // B types, A must receive it.
    await b.locator('.ProseMirror').click();
    await b.keyboard.press('Control+End');
    await b.keyboard.type(' [FROM DEVICE B]', { delay: 45 });
    let back = true;
    try {
      await a.waitForFunction(() => document.querySelector('.ProseMirror')?.innerText.includes('[FROM DEVICE B]'), null, { timeout: 60000 });
    } catch { back = false; }
    check(back, 'device B’s edit reached device A');
    await beat(a, 3000);

    // Both edits must survive on both devices.
    const ta = await text(a), tb = await text(b);
    check(ta.includes('[FROM DEVICE A]') && ta.includes('[FROM DEVICE B]'),
      'device A holds BOTH edits');
    check(tb.includes('[FROM DEVICE A]') && tb.includes('[FROM DEVICE B]'),
      'device B holds BOTH edits');

    fs.mkdirSync(path.join(__dirname, 'ui-shots'), { recursive: true });
    await a.screenshot({ path: path.join(__dirname, 'ui-shots', 'cross-device-A.png') });
    await b.screenshot({ path: path.join(__dirname, 'ui-shots', 'cross-device-B.png') });
  } catch (e) {
    check(false, 'cross-device check ran to completion', e.message?.split('\n')[0]);
  } finally {
    await laptopA.close().catch(() => { });
    await laptopB.close().catch(() => { });
    await browser.close();
    const pass = results.filter((r) => r.ok).length;
    const fail = results.filter((r) => !r.ok).length;
    console.log(`\n  ${pass} passed, ${fail} failed`);
    if (fail) process.exitCode = 1;
  }
})();
