/**
 * The room code, where the room is.
 *
 * Two things were wrong. The chip in the room's header showed
 * `currentRoom.otp` -- the room's permanent id, not the code the server
 * is accepting. They start out identical, so it looked right, and after
 * any regeneration the most prominent code in the app was one that no
 * longer worked. And the button that replaces it was only in the
 * editor's panel, which is a strange place to go looking for something
 * about the room rather than the document.
 *
 * Run: node scripts/probe-room-code-ui.js [baseUrl]
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
  await page.goto(`${BASE}/app/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 60000 });
  await page.waitForTimeout(1400);
  await page.fill('input[placeholder="Enter your username"]', acct.email);
  await page.fill('input[placeholder="Enter your password"]', acct.password);
  await page.click('button:has-text("Log In")');
  await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), null, { timeout: 30000 });
}

/** The code printed on the room header chip. */
const chipCode = (page) => page.evaluate(() => {
  const b = document.querySelector('button[title="Room code"]');
  return b ? (b.innerText || '').replace(/\s+/g, '').trim() : null;
});

async function main() {
  console.log(`\nThe room code on the room screen -- ${BASE}\n`);

  const ownerNode = 'code-owner-' + Date.now();
  const otp = (await post('/create', {
    hostNodeId: ownerNode, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Thesis', hostType: 'web',
  })).data.otp;
  await post('/files', {
    otp,
    file: {
      fileId: Date.now(), fileName: 'Chapter 1.docx',
      content: '<p>One.</p>', sharedBy: 'owner', sharedByNodeId: ownerNode,
    },
  });
  console.log(`  room ${otp}\n`);

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 820 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);
    await signIn(page, accts[0]);
    await page.evaluate(({ otp, ownerNode }) => {
      const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
      const k = (x) => `ds_${u.id}_${x}`;
      localStorage.setItem(k('node_id'), ownerNode);
      localStorage.setItem(k('current_room'), JSON.stringify({ otp, id: otp, name: 'Thesis', isOwner: true }));
    }, { otp, ownerNode });
    await page.goto(`${BASE}/app/files`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);

    // ── It is there, on the room's own screen ────────────────────────
    const chip = page.locator('button[title="Room code"]');
    check(await chip.count() > 0, 'the room code is on the room header');
    await chip.click();
    await page.waitForTimeout(700);
    check(await page.locator('text=Code to join').count() > 0, 'clicking it opens the code');
    check(await page.locator('button:has-text("Give out a new code")').count() > 0,
      'and the button to replace it is right there');

    // ── It shows the code the SERVER accepts ─────────────────────────
    const before = await chipCode(page);
    const serverBefore = (await post('/heartbeat', {
      nodeId: ownerNode, displayName: 'Owner', hostedRoom: { otp },
    })).data?.joinCode;
    check(!!before && before.includes(serverBefore),
      'the chip shows the code the server is accepting', `chip=${before} server=${serverBefore}`);

    // ── Replace it, from here ────────────────────────────────────────
    await page.locator('button:has-text("Give out a new code")').click();
    await page.waitForTimeout(4000);
    const after = await chipCode(page);
    check(!!after && !after.includes(serverBefore),
      'pressing it changes the code on screen', `${before} -> ${after}`);

    const serverAfter = (await post('/heartbeat', {
      nodeId: ownerNode, displayName: 'Owner', hostedRoom: { otp },
    })).data?.joinCode;
    check(!!after && after.includes(serverAfter),
      'and the screen agrees with the server', `chip=${after} server=${serverAfter}`);

    const oldRefused = await post('/join', { otp: serverBefore, memberNodeId: 'c-old-' + Date.now() });
    check(oldRefused.status !== 200, 'the old code is refused', `status=${oldRefused.status}`);
    const newWorks = await post('/join', { otp: serverAfter, memberNodeId: 'c-new-' + Date.now() });
    check(newWorks.status === 200, 'the new one works', `status=${newWorks.status}`);

    // ── Somebody who does not own the room is not offered it ─────────
    const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 820 } });
    const guest = await ctx2.newPage();
    guest.setDefaultTimeout(60000);
    await signIn(guest, accts[1]);
    await guest.evaluate(({ otp }) => {
      const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
      const k = (x) => `ds_${u.id}_${x}`;
      localStorage.setItem(k('node_id'), 'code-guest-' + Date.now());
      localStorage.setItem(k('current_room'), JSON.stringify({ otp, id: otp, name: 'Thesis' }));
    }, { otp });
    await guest.goto(`${BASE}/app/files`, { waitUntil: 'domcontentloaded' });
    await guest.waitForTimeout(8000);
    await guest.locator('button[title="Room code"]').click();
    await guest.waitForTimeout(700);
    check(await guest.locator('text=Code to join').count() > 0,
      'a member can still see the code to pass on');
    check(await guest.locator('button:has-text("Give out a new code")').count() === 0,
      'but is not offered the button to change it');

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
