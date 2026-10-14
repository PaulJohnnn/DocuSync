/**
 * Photographs the people-and-access panel from both sides.
 *
 * The review said three things: nobody could tell who owned the room,
 * viewing versus editing was not legible, and roles could only be set
 * after locking. A screenshot of the owner's screen alone cannot show
 * any of that, so this captures the SAME moment from both the owner's
 * and the reader's screen, before and after a role is changed.
 *
 * Run: node scripts/capture-access-ux.js [baseUrl] [outDir]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = process.argv[3] || path.join(__dirname, 'access-shots');
const API = `${BASE}/api/lobby`;
const accts = JSON.parse(fs.readFileSync(path.join(__dirname, 'live-accounts.json'), 'utf8'));

fs.mkdirSync(OUT, { recursive: true });
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('    shot  ' + name + '.png');
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

async function enterRoom(page, otp, fileId, name, nodeId) {
  await page.evaluate(({ otp, fileId, name, nodeId }) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    const k = (x) => `ds_${u.id}_${x}`;
    localStorage.setItem(k('node_id'), nodeId);
    localStorage.setItem(k('current_room'), JSON.stringify({ otp, id: otp, name: 'Thesis', isOwner: true }));
    localStorage.setItem(k('files'), JSON.stringify([{ id: String(fileId), name }]));
  }, { otp, fileId, name, nodeId });
}

const openPanel = async (page) => {
  await page.locator('text=/Can edit|View only|Owner/').first().click().catch(() => {});
  await page.waitForTimeout(900);
};

async function main() {
  console.log('');
  console.log('People and access -- ' + BASE);

  const ownerNode = 'web-owner-' + Date.now();
  const guestNode = 'web-guest-' + Date.now();
  const room = await post('/create', {
    hostNodeId: ownerNode, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Thesis', hostType: 'web',
  });
  const otp = room.data.otp;
  const shared = await post('/files', {
    otp,
    file: {
      fileId: Date.now(), fileName: 'Chapter 3 - Methodology.docx',
      content: '<p>Chapter 3. Research Methodology</p><p>This chapter presents the research design, the respondents of the study, and the instruments used to gather the data.</p>',
      sharedBy: 's', sharedByNodeId: ownerNode,
    },
  });
  const fileId = shared.data.fileId;
  console.log('  room ' + otp + '  fileId ' + fileId);

  const browser = await chromium.launch();
  try {
    const ctxO = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const owner = await ctxO.newPage();
    const ctxG = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const guest = await ctxG.newPage();
    owner.setDefaultTimeout(60000); guest.setDefaultTimeout(60000);

    await signIn(owner, accts[0]);
    await signIn(guest, accts[1]);
    await enterRoom(owner, otp, fileId, 'Chapter 3 - Methodology.docx', ownerNode);
    await enterRoom(guest, otp, fileId, 'Chapter 3 - Methodology.docx', guestNode);

    for (const p of [owner, guest]) {
      await p.goto(`${BASE}/app/editor/${fileId}`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('.ProseMirror', { timeout: 60000 });
    }
    await owner.waitForTimeout(9000);

    console.log('');
    console.log('  Everyone can edit');
    await openPanel(owner);
    await shot(owner, '1-owner-everyone-can-edit');
    await openPanel(guest);
    await shot(guest, '2-guest-sees-who-owns-the-room');

    console.log('');
    console.log('  The owner makes one person a reader');
    await owner.locator('button:has-text("Can edit")').first().click();
    await owner.waitForTimeout(2000);
    await shot(owner, '3-owner-after-making-them-view-only');

    // The reader finds out on their next beat, without reloading.
    await guest.waitForTimeout(8000);
    await shot(guest, '4-guest-is-told-and-told-who-to-ask');
    await openPanel(guest);
    await shot(guest, '5-guest-sees-the-rule-and-everyones-role');

  } finally {
    await browser.close();
  }
  console.log('');
  console.log('  screenshots in ' + OUT);
  console.log('');
}

main().catch((e) => { console.error(e); process.exit(1); });
