/**
 * What a failed join actually tells you.
 *
 * One screen used to answer every failure: the title said the room did
 * not exist, the body printed the real reason underneath it, and a red
 * box then asserted the code "may have expired or been deleted". For a
 * room whose owner had simply closed it, that is one true statement and
 * two false ones, and the true one is the one people read last.
 *
 * Rooms are now distinguished: closed, full, code replaced, and genuinely
 * not there. Checked at the API, and then on the screen for the case
 * that prompted it.
 *
 * Run: node scripts/probe-join-messages.js [baseUrl]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000';
const API = `${BASE}/api/lobby`;
const accts = JSON.parse(fs.readFileSync(path.join(__dirname, 'live-accounts.json'), 'utf8'));

const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok, name });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

const post = async (p, b) => {
  const r = await fetch(`${API}${p}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
  });
  return { status: r.status, data: await r.json().catch(() => null) };
};

async function signIn(page, acct) {
  for (let i = 0; i < 2; i++) {
    await page.goto(`${BASE}/app/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 60000 });
    await page.waitForTimeout(1400);
    await page.fill('input[placeholder="Enter your username"]', acct.email);
    await page.fill('input[placeholder="Enter your password"]', acct.password);
    await page.click('button:has-text("Log In")');
    try {
      await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), null, { timeout: 30000 });
      return;
    } catch (e) { if (i) throw e; }
  }
}

async function main() {
  console.log(`\nWhat a failed join says -- ${BASE}\n`);

  const hostNode = 'join-host-' + Date.now();
  const room = await post('/create', {
    hostNodeId: hostNode, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Closed room', hostType: 'web',
  });
  const otp = room.data.otp;
  console.log(`  room ${otp}\n`);

  // ── Each kind of refusal is its own kind ───────────────────────────
  console.log('  At the API');
  const missing = await post('/join', { otp: 'ZZZZZZ', memberNodeId: 'jm-' + Date.now() });
  check(missing.data?.reason === 'not_found',
    'a code nobody is using says so', `reason=${missing.data?.reason}`);
  check(!/expired|deleted/i.test(missing.data?.error || ''),
    'and does not claim it expired or was deleted', missing.data?.error);

  const openJoin = await post('/join', { otp, memberNodeId: 'jm-ok-' + Date.now() });
  check(openJoin.status === 200, 'an open room lets people in', `status=${openJoin.status}`);

  await post('/lock', { otp, nodeId: hostNode, isLocked: true });
  const closed = await post('/join', { otp, memberNodeId: 'jm-closed-' + Date.now() });
  check(closed.data?.reason === 'closed',
    'a closed room says it is closed', `reason=${closed.data?.reason}`);
  check(/closed/i.test(closed.data?.error || '') && !/expired|deleted|not found/i.test(closed.data?.error || ''),
    'and says the room is still there', closed.data?.error);

  // ── And on the screen ──────────────────────────────────────────────
  console.log('');
  console.log('  On the screen');
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);
    await signIn(page, accts[1]);
    await page.goto(`${BASE}/app/peers`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    // "Join Room" appears twice: the one that opens the form, and the one
    // that submits it. The first is on the room list.
    await page.locator('button:has-text("Join Room")').first().click();
    await page.waitForSelector('text=Join a Room', { timeout: 20000 });
    // The code is typed, not pasted: the six boxes are one hidden input
    // behind a row of styled cells, and it only fills on key input.
    // The real input sits behind the styled cells, so a click lands on
    // the decoration rather than the field. Focus it directly.
    await page.evaluate(() => {
      const el = document.querySelector('input');
      if (el) el.focus();
    });
    await page.keyboard.type(otp, { delay: 70 });
    await page.waitForTimeout(600);
    await page.locator('button:has-text("Join Room")').last().click();
    await page.waitForTimeout(7000);

    const screen = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim());
    check(/closed/i.test(screen), 'the screen says the room is closed', screen.slice(0, 180));
    check(!/Does Not Exist/i.test(screen),
      'and no longer claims the room does not exist');
    check(!/expired|deleted/i.test(screen),
      'and no longer claims it expired or was deleted');
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log('');
  console.log(`  ${passed} passed, ${results.length - passed} failed`);
  console.log('');
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
