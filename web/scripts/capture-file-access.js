/**
 * Who can OPEN a file, as opposed to who can type in it.
 *
 * The owner picks, per file, between everyone in the room and a chosen
 * few. Anybody not chosen still sees the file in the list -- being shown
 * a shorter list than everyone else is confusing in a different way --
 * but it carries a lock, will not open, and the server will not hand
 * over its text to them even if they ask for it directly.
 *
 * Run: node scripts/probe-file-access.js [baseUrl]
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

async function enterRoom(page, otp, nodeId) {
  await page.evaluate(({ otp, nodeId }) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    const k = (x) => `ds_${u.id}_${x}`;
    localStorage.setItem(k('node_id'), nodeId);
    localStorage.setItem(k('current_room'), JSON.stringify({ otp, id: otp, name: 'Access', isOwner: true }));
  }, { otp, nodeId });
}


const OUT = process.argv[3] || path.join(__dirname, 'file-access-shots');
fs.mkdirSync(OUT, { recursive: true });
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('    shot  ' + name + '.png');
};

async function main() {
  console.log('');
  console.log('Per-file access -- ' + BASE);

  const ownerNode = 'web-owner-' + Date.now();
  const guestNode = 'web-guest-' + Date.now();
  const room = await post('/create', {
    hostNodeId: ownerNode, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Thesis', hostType: 'web',
  });
  const otp = room.data.otp;

  const mk = async (name) => (await post('/files', {
    otp,
    file: {
      fileId: Date.now() + Math.floor(Math.random() * 1000), fileName: name,
      content: '<p>' + name + '</p>', sharedBy: 'Maria Santos', sharedByNodeId: ownerNode,
    },
  })).data.fileId;
  await mk('Chapter 1 - Introduction.docx');
  await new Promise((r) => setTimeout(r, 40));
  const priv = await mk('Chapter 4 - Results (draft).docx');
  console.log('  room ' + otp);

  const browser = await chromium.launch();
  try {
    const ctxO = await browser.newContext({ viewport: { width: 1400, height: 760 } });
    const owner = await ctxO.newPage();
    const ctxG = await browser.newContext({ viewport: { width: 1400, height: 760 } });
    const guest = await ctxG.newPage();
    owner.setDefaultTimeout(60000); guest.setDefaultTimeout(60000);

    await signIn(owner, accts[0]);
    await signIn(guest, accts[1]);
    await enterRoom(owner, otp, ownerNode);
    await enterRoom(guest, otp, guestNode);
    await owner.goto(BASE + '/app/files', { waitUntil: 'domcontentloaded' });
    await guest.goto(BASE + '/app/files', { waitUntil: 'domcontentloaded' });
    await owner.waitForTimeout(9000);

    console.log('');
    console.log('  Who owns the room');
    await guest.locator('text=/connected/').first().click().catch(() => {});
    await guest.waitForTimeout(900);
    await shot(guest, '1-member-sees-the-owner');
    await guest.locator('body').click({ position: { x: 5, y: 500 } }).catch(() => {});

    console.log('');
    console.log('  The owner picks who can open a file');
    await owner.locator('button[title="Who can open this file"]').nth(1).click();
    await owner.waitForTimeout(800);
    await shot(owner, '2-three-dots-menu');
    await owner.locator('button:has-text("Only for")').first().click();
    await owner.waitForTimeout(2500);
    await shot(owner, '3-only-chosen-people');

    console.log('');
    console.log('  What the other person sees');
    await guest.waitForTimeout(5000);
    await shot(guest, '4-locked-for-them');
    await guest.goto(BASE + '/app/editor/' + priv, { waitUntil: 'domcontentloaded' });
    await guest.waitForTimeout(9000);
    await shot(guest, '5-locked-screen');

    console.log('');
    console.log('  The owner adds them');
    await owner.goto(BASE + '/app/files', { waitUntil: 'domcontentloaded' });
    await owner.waitForTimeout(6000);
    await owner.locator('button[title="Who can open this file"]').nth(1).click();
    await owner.waitForTimeout(900);
    const rows = owner.locator('div[role="menu"] button').filter({ hasNotText: 'Everyone' }).filter({ hasNotText: 'Only for' });
    await rows.last().click();
    await owner.waitForTimeout(1800);
    await shot(owner, '6-green-dot-means-chosen');

    console.log('');
    console.log('  Reader or editor, same menu');
    await owner.goto(BASE + '/app/files', { waitUntil: 'domcontentloaded' });
    await owner.waitForTimeout(6000);
    await owner.locator('button[title="Who can open this file"]').first().click();
    await owner.waitForTimeout(900);
    await shot(owner, '7-both-questions-one-menu');
    await owner.locator('button:has-text("Only for")').nth(1).click();
    await owner.waitForTimeout(2500);
    await shot(owner, '8-view-only-or-can-edit');
  } finally {
    await browser.close();
  }
  console.log('');
  console.log('  screenshots in ' + OUT);
  console.log('');
}

main().catch((e) => { console.error(e); process.exit(1); });
