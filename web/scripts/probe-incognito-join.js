/**
 * A brand-new browser joins a room, the way a second person really does.
 *
 * Incognito is the honest test of joining: no stored room, no node id,
 * no session, nothing cached from a previous run. Every other probe in
 * this suite seeds localStorage to get where it is going, which is
 * convenient and skips exactly the code path a real guest takes.
 *
 * It goes through the whole thing from nothing: sign in, type the code
 * into the form, enter the room, open a document, type in it, and have
 * the owner see it. With a replaced code as well as the original one,
 * because that is where this last went wrong.
 *
 * Run: node scripts/probe-incognito-join.js [baseUrl]
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

/** Type the code into the real form, the way a person does. */
async function joinByCode(page, code) {
  await page.goto(`${BASE}/app/peers`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.locator('button:has-text("Join Room")').first().click();
  await page.waitForSelector('text=Join a Room', { timeout: 20000 });
  await page.evaluate(() => { const el = document.querySelector('input'); if (el) el.focus(); });
  await page.keyboard.type(code, { delay: 70 });
  await page.waitForTimeout(600);
  await page.locator('button:has-text("Join Room")').last().click();
  await page.waitForTimeout(7000);
}

const storedRoom = (page) => page.evaluate(() => {
  const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
  const raw = localStorage.getItem(`ds_${u.id}_current_room`);
  return raw ? JSON.parse(raw) : null;
});

const docText = (p) => p.evaluate(() => {
  const el = document.querySelector('.ProseMirror');
  if (!el) return '';
  const copy = el.cloneNode(true);
  copy.querySelectorAll('.collaboration-cursor__caret').forEach((n) => n.remove());
  return (copy.innerText || '').replace(/\s+/g, ' ').trim();
});

/**
 * One full run from nothing.
 *
 * `rotate` decides whether the code handed out is the room's original
 * one or a replacement, since those take different paths through the
 * client and only one of them used to work.
 */
async function runFromNothing(browser, label, rotate) {
  console.log('');
  console.log(`  ${label}`);

  const ownerNode = 'inc-owner-' + Date.now();
  const otp = (await post('/create', {
    hostNodeId: ownerNode, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Thesis Room', hostType: 'web',
  })).data.otp;
  const fileId = (await post('/files', {
    otp,
    file: {
      fileId: Date.now(), fileName: 'Chapter 5.docx',
      content: '<p>OWNERWROTE the owner put this here first.</p>',
      sharedBy: 'Maria Santos', sharedByNodeId: ownerNode,
    },
  })).data.fileId;

  let code = otp;
  if (rotate) {
    code = (await post('/code', { otp, nodeId: ownerNode })).data?.joinCode;
  }
  console.log(`    room ${otp}, code handed out: ${code}`);

  // A completely clean browser profile -- no storage, no cookies, nothing.
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 90)));

  const before = await page.evaluate(() => 0).catch(() => null);
  void before;

  try {
    await signIn(page, accts[1]);

    // Nothing carried over from anywhere.
    const priorRoom = await storedRoom(page);
    check(!priorRoom, `${label}: starts with no room remembered`,
      priorRoom ? `found ${priorRoom.otp}` : 'nothing');

    await joinByCode(page, code);
    const accepted = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '));
    check(/You.{0,3}re now in/i.test(accepted), `${label}: the join is accepted`,
      (accepted.match(/You.{0,3}re now in [^.]{0,40}/i) || ['no confirmation'])[0]);

    // The room is only remembered once you walk through the door.
    await page.locator('button:has-text("Enter Workspace")').click();
    await page.waitForTimeout(4000);

    const room = await storedRoom(page);
    check(!!room && room.otp === otp, `${label}: lands in the real room`,
      room ? `stored ${room.otp}, room is ${otp}` : 'nothing stored');

    await page.waitForTimeout(7000);
    const sees = await page.locator('text=Chapter 5.docx').count();
    check(sees > 0, `${label}: sees the room's files`, `${sees} rows`);

    // Open it and write something, which is the point of joining.
    await page.locator('button:has-text("Open & edit")').first().click();
    await page.waitForSelector('.ProseMirror', { timeout: 60000 });
    await page.waitForTimeout(3000);
    const opened = await docText(page);
    check(opened.includes('OWNERWROTE'), `${label}: opens the real document`, opened.slice(0, 50));

    await page.locator('.ProseMirror').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('GUESTWROTE the new person typed this.', { delay: 10 });
    await page.waitForTimeout(9000);

    const stored = String((await fetch(`${API}/doc?otp=${otp}&fileId=${fileId}`).then((r) => r.json()))?.snapshot?.content || '');
    check(stored.includes('GUESTWROTE'), `${label}: what they type reaches the room`,
      stored.includes('GUESTWROTE') ? '' : stored.slice(-60));

    const beat = await post('/heartbeat', {
      nodeId: ownerNode, displayName: 'Maria Santos', hostedRoom: { otp },
    });
    const people = (beat.data?.activePeers ?? []).length;
    check(people >= 2, `${label}: the owner sees them`, `${people} people`);

    const real = errors.filter((e) => !/hydration|Minified React error/i.test(e));
    check(real.length === 0, `${label}: nothing threw`, real.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
}

async function main() {
  console.log(`\nA new browser joining from nothing -- ${BASE}\n`);
  const browser = await chromium.launch();
  try {
    await runFromNothing(browser, 'original code', false);
    await runFromNothing(browser, 'replaced code', true);
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
