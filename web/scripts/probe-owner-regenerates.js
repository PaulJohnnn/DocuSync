/**
 * The owner makes a room the normal way, then replaces its code.
 *
 * Every other probe here seeds the owner's node id into localStorage and
 * creates the room with that same id, so the two always agree. A real
 * owner never does that: they sign in, press Create Room, and whatever
 * id the client happens to be holding becomes the room's owner.
 *
 * If those two ids are not the same thing, nothing identifies them as
 * the owner afterwards -- no badge, no button, and the server refuses
 * the change.
 *
 * Run: node scripts/probe-owner-regenerates.js [baseUrl]
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

/** Make a room the way a person does: press the button, type a name. */
async function createRoomInTheUI(page, name) {
  await page.goto(`${BASE}/app/peers`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.locator('button:has-text("Create Room")').first().click();
  await page.waitForSelector('text=Room Name', { timeout: 20000 });
  const box = page.locator('input').first();
  await box.click();
  await page.keyboard.type(name, { delay: 40 });
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Generate Room")').click();
  await page.waitForTimeout(7000);
  // Walk through the confirmation, which is what stores the room.
  const enter = page.locator('button:has-text("Enter Workspace")');
  if (await enter.count()) { await enter.click(); await page.waitForTimeout(3500); }
}

const stored = (page, key) => page.evaluate((k) => {
  const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
  return localStorage.getItem(`ds_${u.id}_${k}`);
}, key);

async function main() {
  console.log(`\nAn owner replacing their own room's code -- ${BASE}\n`);

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 820 } });
    const owner = await ctx.newPage();
    owner.setDefaultTimeout(60000);
    await signIn(owner, accts[0]);
    await createRoomInTheUI(owner, 'Thesis Room');

    const roomRaw = await stored(owner, 'current_room');
    const room = roomRaw ? JSON.parse(roomRaw) : null;
    check(!!room, 'the room was created', room ? `otp ${room.otp}` : 'nothing stored');
    if (!room) return;
    const otp = room.otp || room.id;

    // The two ids that have to agree, and usually are never compared.
    const myNodeId = await stored(owner, 'node_id');
    const myNodeIdEarly = myNodeId;
    const lockView = await fetch(`${API}/lock?otp=${otp}&nodeId=${myNodeIdEarly}`).then((r) => r.json()).catch(() => null);
    const hostNodeId = lockView?.hostNodeId;
    console.log(`    the room says its owner is: ${hostNodeId}`);
    console.log(`    this browser calls itself:  ${myNodeId}`);
    check(!!hostNodeId && hostNodeId === myNodeId,
      'the room records THIS browser as its owner', `${hostNodeId} vs ${myNodeId}`);

    // Into the room, where the button lives.
    await owner.goto(`${BASE}/app/files`, { waitUntil: 'domcontentloaded' });
    await owner.waitForTimeout(9000);

    await owner.locator('button[title="Room code"]').click();
    await owner.waitForTimeout(900);
    const hasButton = await owner.locator('button:has-text("Give out a new code")').count();
    check(hasButton > 0, 'the owner is offered the button to replace the code',
      hasButton ? '' : 'not offered -- the app does not think they own it');

    if (hasButton) {
      const before = await owner.evaluate(() => {
        const b = document.querySelector('button[title="Room code"]');
        return b ? (b.innerText || '').replace(/\s+/g, '').trim() : null;
      });
      await owner.locator('button:has-text("Give out a new code")').click();
      await owner.waitForTimeout(4000);
      const after = await owner.evaluate(() => {
        const b = document.querySelector('button[title="Room code"]');
        return b ? (b.innerText || '').replace(/\s+/g, '').trim() : null;
      });
      check(!!after && after !== before, 'pressing it actually changes the code',
        `${before} -> ${after}`);

      // And the new one has to let somebody in.
      const join = await post('/join', { otp: after, memberNodeId: 'reg-' + Date.now() });
      check(join.status === 200 && join.data?.otp === otp,
        'the new code admits somebody to the same room', `status=${join.status}`);
      const old = await post('/join', { otp: before, memberNodeId: 'reg-old-' + Date.now() });
      check(old.status !== 200, 'and the old one no longer does', `status=${old.status}`);
    }

    // Whatever the screen showed, can the server be persuaded.
    const direct = await post('/code', {
      otp,
      nodeId: myNodeId,
      accountId: await owner.evaluate(() => JSON.parse(sessionStorage.getItem('docusync_auth_user')).id),
    });
    check(direct.status === 200, 'the server accepts the owner asking directly',
      `status=${direct.status} ${direct.data?.error || ''}`);

    // ── The same owner, on a different machine ──────────────────────
    //
    // Which is the case that matters: they made the room on a laptop and
    // are now looking at it on another one, or in the desktop app. A
    // different machine means a different node id, so the only thing
    // that can still identify them is their account.
    console.log('');
    console.log('  The same owner, on a second machine');
    await ctx.close();
    const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 820 } });
    const second = await ctx2.newPage();
    second.setDefaultTimeout(60000);
    await signIn(second, accts[0]);
    await second.evaluate(({ otp }) => {
      const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
      const k = (x) => `ds_${u.id}_${x}`;
      localStorage.setItem(k('current_room'), JSON.stringify({ otp, id: otp, name: 'Thesis Room' }));
    }, { otp });

    // Let the first machine's presence record lapse, as it would once
    // that browser is closed.
    await fetch(`${API}/heartbeat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId: myNodeId, leaving: true, hostedRoom: { otp } }),
    });

    await second.goto(`${BASE}/app/files`, { waitUntil: 'domcontentloaded' });
    await second.waitForTimeout(10000);
    const secondNodeId = await stored(second, 'node_id');
    console.log(`    second machine calls itself: ${secondNodeId}`);

    await second.locator('button[title="Room code"]').click();
    await second.waitForTimeout(900);
    const stillOwner = await second.locator('button:has-text("Give out a new code")').count();
    check(stillOwner > 0, 'the owner is still the owner on their other machine',
      stillOwner ? '' : 'not offered the button');

    const secondTry = await post('/code', {
      otp, nodeId: secondNodeId,
      accountId: await second.evaluate(() => JSON.parse(sessionStorage.getItem('docusync_auth_user')).id),
    });
    check(secondTry.status === 200, 'and the server lets them change it from there',
      `status=${secondTry.status} ${secondTry.data?.error || ''}`);
    await ctx2.close();

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
