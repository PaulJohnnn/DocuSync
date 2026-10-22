/**
 * The owner makes a room in the downloaded app and replaces its code.
 *
 * probe-owner-regenerates does this on the web. This does it in the
 * actual Electron application, because the app people install is the one
 * the complaint was about, and "it works in a browser" is not an answer.
 *
 * The owner creates the room the way a person does -- press Create Room,
 * type a name -- so the room's owner is whatever id the app happened to
 * be holding, not one seeded to agree. Then the new code has to let
 * somebody in from a browser that has never seen this room, and the old
 * one has to stop working.
 *
 * Run: node scripts/probe-desktop-regenerates.js [baseUrl]
 */
const { chromium, _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

const BASE = process.argv[2] || 'https://docusync-dusky.vercel.app';
const API = `${BASE}/api/lobby`;
const DESKTOP = path.resolve(__dirname, '..', '..', 'desktop');
const MAIN = path.join(DESKTOP, 'dist-electron', 'main.js');
const EXE = path.join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe');
const OUT = path.join(__dirname, 'desktop-regenerate-shots');
const accts = JSON.parse(fs.readFileSync(path.join(__dirname, 'live-accounts.json'), 'utf8'));

fs.mkdirSync(OUT, { recursive: true });
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
  await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), null, { timeout: 40000 });
}

/** Make a room by pressing the buttons, not by seeding storage. */
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
  await page.waitForTimeout(8000);
  const enter = page.locator('button:has-text("Enter Workspace")');
  if (await enter.count()) { await enter.click(); await page.waitForTimeout(4000); }
}

const chipCode = (page) => page.evaluate(() => {
  const b = document.querySelector('button[title="Room code"]');
  if (!b) return null;
  const m = (b.innerText || '').match(/[A-Z0-9]{6}/);
  return m ? m[0] : null;
});

/** Type the code into the real join form. */
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
  const accepted = await page.evaluate(() => /You.{0,3}re now in/i.test(document.body.innerText || ''));
  if (!accepted) return null;
  await page.locator('button:has-text("Enter Workspace")').click();
  await page.waitForTimeout(4000);
  return page.evaluate(() => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    const raw = localStorage.getItem(`ds_${u.id}_current_room`);
    return raw ? (JSON.parse(raw).otp || JSON.parse(raw).id) : null;
  });
}

async function main() {
  console.log(`\nThe owner replacing the code in the downloaded app -- ${BASE}\n`);
  if (!fs.existsSync(MAIN) || !fs.existsSync(EXE)) {
    console.log('  desktop build not present -- nothing to check\n');
    return;
  }

  let app; let browser;
  try {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-regen-'));
    app = await electron.launch({
      executablePath: EXE, args: [MAIN, `--user-data-dir=${userDataDir}`], cwd: DESKTOP, timeout: 120000,
      env: { ...process.env, VITE_DEV_SERVER_URL: `${BASE}/app/login`, DOCUSYNC_WS_PORT: '9473' },
    });
    const desk = await app.firstWindow({ timeout: 120000 });
    desk.setDefaultTimeout(60000);
    await desk.waitForLoadState('domcontentloaded');
    await signIn(desk, accts[0]);
    await createRoomInTheUI(desk, 'Thesis Room');

    const room = await desk.evaluate(() => {
      const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
      const raw = localStorage.getItem(`ds_${u.id}_current_room`);
      return raw ? JSON.parse(raw) : null;
    });
    check(!!room, 'the desktop app created the room', room ? `otp ${room.otp}` : 'nothing stored');
    if (!room) return;
    const otp = room.otp || room.id;

    await desk.goto(`${BASE}/app/files`, { waitUntil: 'domcontentloaded' });
    await desk.waitForTimeout(10000);
    await desk.locator('button[title="Room code"]').click();
    await desk.waitForTimeout(1000);
    const before = await chipCode(desk);

    const hasButton = await desk.locator('button:has-text("Give out a new code")').count();
    check(hasButton > 0, 'the owner is offered the button in the desktop app',
      hasButton ? `showing ${before}` : 'not offered -- the app does not think they own it');
    if (!hasButton) {
      await desk.screenshot({ path: path.join(OUT, 'no-button.png') });
      return;
    }

    await desk.locator('button:has-text("Give out a new code")').click();
    await desk.waitForTimeout(5000);
    const after = await chipCode(desk);
    check(!!after && after !== before, 'pressing it changes the code on screen',
      `${before} -> ${after}`);
    await desk.screenshot({ path: path.join(OUT, '1-desktop-new-code.png') });
    console.log('    shot  1-desktop-new-code.png');

    // The point of a new code: somebody who has never been here can use
    // it, and whoever is holding the old one cannot.
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const guest = await ctx.newPage();
    guest.setDefaultTimeout(60000);
    await signIn(guest, accts[1]);
    const landed = await joinByCode(guest, after);
    check(landed === otp, 'a new browser joins the room with the new code',
      `landed in ${landed}, room is ${otp}`);

    await guest.waitForTimeout(6000);
    await guest.screenshot({ path: path.join(OUT, '2-guest-in-the-room.png') });
    console.log('    shot  2-guest-in-the-room.png');

    const old = await post('/join', { otp: before, memberNodeId: 'desk-old-' + Date.now() });
    check(old.status !== 200, 'the code it replaced no longer works', `status=${old.status}`);

    // And the owner still sees them, from the app.
    await desk.goto(`${BASE}/app/files`, { waitUntil: 'domcontentloaded' });
    await desk.waitForTimeout(9000);
    const peers = await desk.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '));
    check(/connected|In this room/i.test(peers), 'the desktop app still shows the room',
      (peers.match(/\d+ connected/) || ['no count'])[0]);
    await desk.screenshot({ path: path.join(OUT, '3-desktop-after.png') });
    console.log('    shot  3-desktop-after.png');

    await ctx.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (app) await app.close().catch(() => {});
  }

  const passed = results.filter((r) => r.ok).length;
  console.log('');
  console.log(`  ${passed} passed, ${results.length - passed} failed`);
  console.log('');
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
