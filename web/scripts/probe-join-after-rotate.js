/**
 * Join with a code that has been replaced, through the actual join form.
 *
 * probe-room-code-ui checked that the new code is accepted by POST
 * /join, and it is -- which is why this got through. The failure was
 * afterwards, in what the client then remembered: it stored the code
 * that had been typed as the room's id. Those are the same string until
 * a code is replaced, so everything worked right up until somebody
 * replaced one.
 *
 * After that, the join succeeded and every request that followed asked
 * about a room named after the CODE: the file list, the documents, the
 * presence heartbeat. Nothing was there, and the heartbeat's self-heal
 * then created an empty room at that name -- so the person landed
 * somewhere that looked like the room, was named like the room, and was
 * empty.
 *
 * This drives the real form and then checks the thing that actually
 * matters: can they see the room's files, and does the owner see them.
 *
 * Run: node scripts/probe-join-after-rotate.js [baseUrl]
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

/** Type a code into the join form and press the button. */
async function joinThroughTheForm(page, code) {
  await page.goto(`${BASE}/app/peers`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.locator('button:has-text("Join Room")').first().click();
  await page.waitForSelector('text=Join a Room', { timeout: 20000 });
  await page.evaluate(() => {
    const el = document.querySelector('input');
    if (el) el.focus();
  });
  await page.keyboard.type(code, { delay: 70 });
  await page.waitForTimeout(600);
  await page.locator('button:has-text("Join Room")').last().click();
  await page.waitForTimeout(7000);
}

/** What the client decided the room is. */
const storedRoom = (page) => page.evaluate(() => {
  const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
  const raw = localStorage.getItem(`ds_${u.id}_current_room`);
  return raw ? JSON.parse(raw) : null;
});

async function main() {
  console.log(`\nJoining with a replaced code -- ${BASE}\n`);

  const ownerNode = 'rot-owner-' + Date.now();
  const otp = (await post('/create', {
    hostNodeId: ownerNode, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Thesis Room', hostType: 'web',
  })).data.otp;
  await post('/files', {
    otp,
    file: {
      fileId: Date.now(), fileName: 'Chapter 5 - Conclusion.docx',
      content: '<p>FINDME this file is in the real room.</p>',
      sharedBy: 'Maria Santos', sharedByNodeId: ownerNode,
    },
  });

  // The owner replaces the code, exactly as the button does.
  const regen = await post('/code', { otp, nodeId: ownerNode });
  const newCode = regen.data?.joinCode;
  check(!!newCode && newCode !== otp,
    'the code is now different from the room id', `room ${otp}, code ${newCode}`);
  console.log('');

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const guest = await ctx.newPage();
    guest.setDefaultTimeout(60000);
    await signIn(guest, accts[1]);

    console.log('  Somebody joins with the new code');
    await joinThroughTheForm(guest, newCode);

    const onJoinScreen = await guest.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '));
    check(/You.{0,3}re now in|Thesis Room/i.test(onJoinScreen),
      'the join is accepted', onJoinScreen.slice(0, 90));

    // Into the room.
    await guest.locator('button:has-text("Enter"), button:has-text("Open")').first().click().catch(() => {});
    await guest.waitForTimeout(2000);
    await guest.goto(`${BASE}/app/files`, { waitUntil: 'domcontentloaded' });
    await guest.waitForTimeout(9000);

    // ── The thing that actually matters ──────────────────────────────
    const room = await storedRoom(guest);
    check(!!room && room.otp === otp,
      'the client remembers the ROOM, not the code that was typed',
      room ? `stored otp=${room.otp}, room is ${otp}, code was ${newCode}` : 'nothing stored');

    const seesFile = await guest.locator('text=Chapter 5 - Conclusion.docx').count();
    check(seesFile > 0, 'and they can see the room\'s files', `${seesFile} rows`);

    const bodyText = await guest.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '));
    check(!/No files in this room yet/i.test(bodyText),
      'rather than an empty room that merely looks right');

    // And the owner sees them arrive, which is the other half of joining.
    const beat = await post('/heartbeat', {
      nodeId: ownerNode, displayName: 'Maria Santos', hostedRoom: { otp },
    });
    const peers = (beat.data?.activePeers ?? []).length;
    check(peers >= 2, 'the owner sees them in the room', `${peers} people`);

    // A ghost room must not have been created under the code.
    const ghost = await fetch(`${API}/files?otp=${newCode}`).then((r) => r.json()).catch(() => null);
    check(!ghost || ghost.error || (ghost.files ?? []).length === 0,
      'and no empty room was created under the code itself',
      ghost && ghost.files ? `${ghost.files.length} files at that name` : 'none');

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
