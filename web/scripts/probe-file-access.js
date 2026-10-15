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

async function main() {
  console.log(`\nWho can open a file -- ${BASE}\n`);

  const ownerNode = 'web-owner-' + Date.now();
  const guestNode = 'web-guest-' + Date.now();
  const room = await post('/create', {
    hostNodeId: ownerNode, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Access', hostType: 'web',
  });
  const otp = room.data.otp;

  const mk = async (name) => (await post('/files', {
    otp,
    file: {
      fileId: Date.now() + Math.floor(Math.random() * 1000), fileName: name,
      content: `<p>${name} contents, which not everybody should see.</p>`,
      sharedBy: 'owner', sharedByNodeId: ownerNode,
    },
  })).data.fileId;
  const openFile = await mk('Shared with everyone.docx');
  await new Promise((r) => setTimeout(r, 40));
  const privateFile = await mk('Chapter 4 - draft.docx');
  console.log(`  room ${otp}   open ${openFile}   private ${privateFile}\n`);

  const browser = await chromium.launch();
  try {
    const ctxO = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const owner = await ctxO.newPage();
    const ctxG = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const guest = await ctxG.newPage();
    owner.setDefaultTimeout(60000); guest.setDefaultTimeout(60000);

    await signIn(owner, accts[0]);
    await signIn(guest, accts[1]);
    await enterRoom(owner, otp, ownerNode);
    await enterRoom(guest, otp, guestNode);

    await owner.goto(`${BASE}/app/files`, { waitUntil: 'domcontentloaded' });
    await guest.goto(`${BASE}/app/files`, { waitUntil: 'domcontentloaded' });
    await owner.waitForTimeout(9000);

    // ── Who owns the room, on THIS page ──────────────────────────────
    console.log('  The people list on the file page');
    await guest.locator('text=/connected/').first().click().catch(() => {});
    await guest.waitForTimeout(900);
    const panel = await guest.evaluate(() => {
      const el = Array.from(document.querySelectorAll('div'))
        .find((d) => /Online/.test(d.innerText || '') && /Owner|Member/.test(d.innerText || '')
          && (d.innerText || '').length < 400);
      return el ? (el.innerText || '').replace(/\s+/g, ' ').trim() : null;
    });
    check(!!panel && /Owner/.test(panel), 'a member can see who owns the room', panel || 'no panel');
    check(!!panel && !/Peer \d/.test(panel), 'and nobody is listed as "Peer 1"', panel || '');
    await guest.keyboard.press('Escape');
    await guest.locator('body').click({ position: { x: 5, y: 400 } }).catch(() => {});

    // ── Everything starts open ───────────────────────────────────────
    console.log('');
    console.log('  Before the owner restricts anything');
    const lockedCountBefore = await guest.locator('button:has-text("Locked")').count();
    check(lockedCountBefore === 0, 'no file is locked to begin with', `${lockedCountBefore} locked`);

    // ── The owner restricts one file ─────────────────────────────────
    console.log('');
    console.log('  The owner limits one file to chosen people');
    const dots = owner.locator('button[title="Who can open this file"]');
    const dotCount = await dots.count();
    check(dotCount >= 2, 'the owner gets a menu on every file', `${dotCount} buttons`);

    // The private file is the second one shared, so the second row.
    await dots.nth(1).click();
    await owner.waitForTimeout(700);
    check(await owner.locator('text=Who can open this file').count() > 0,
      'the menu asks who can open it');
    await owner.locator('button:has-text("Only chosen")').first().click();
    await owner.waitForTimeout(2500);

    const stored = await fetch(`${API}/lock?otp=${otp}&nodeId=${guestNode}`).then((r) => r.json());
    const lock = stored.fileLocks?.[String(privateFile)];
    check(!!lock?.openRestricted, 'the restriction is recorded against that file',
      lock ? `openRestricted=${lock.openRestricted}` : 'no record');
    check(stored.openPermissions?.[String(privateFile)] === false,
      'and the other person is not on the list');
    check(stored.openPermissions?.[String(openFile)] !== false,
      'while the other file is untouched');

    // ── What the other person sees ───────────────────────────────────
    console.log('');
    console.log('  What the other person sees');
    await guest.waitForTimeout(4000);
    const lockedBtn = guest.locator('button:has-text("Locked")');
    check(await lockedBtn.count() === 1, 'exactly the restricted file shows as locked',
      `${await lockedBtn.count()} locked`);
    const notShared = await guest.locator('text=Not shared with you').count();
    check(notShared === 1, 'and it says so in words');

    // ── The server does not just hide it, it refuses ─────────────────
    const direct = await fetch(`${API}/doc?otp=${otp}&fileId=${privateFile}&nodeId=${guestNode}&have=x`);
    check(direct.status === 403, 'asking the server for it directly is refused',
      `status=${direct.status}`);
    const allowed = await fetch(`${API}/doc?otp=${otp}&fileId=${openFile}&nodeId=${guestNode}&have=x`);
    check(allowed.status === 200, 'while the unrestricted file still comes back',
      `status=${allowed.status}`);

    // Opening it by URL lands on the locked screen, not the document.
    await guest.goto(`${BASE}/app/editor/${privateFile}`, { waitUntil: 'domcontentloaded' });
    await guest.waitForTimeout(9000);
    const lockedScreen = await guest.locator('text=This file is locked for you').count();
    check(lockedScreen > 0, 'typing the URL lands on a locked screen, not the text');
    const leaked = await guest.locator('.ProseMirror').count();
    check(leaked === 0, 'and the document is not rendered at all', `${leaked} editors`);

    // ── The owner adds them, and it opens ────────────────────────────
    console.log('');
    console.log('  The owner adds them to the list');
    await owner.goto(`${BASE}/app/files`, { waitUntil: 'domcontentloaded' });
    await owner.waitForTimeout(6000);
    await owner.locator('button[title="Who can open this file"]').nth(1).click();
    await owner.waitForTimeout(800);
    const peerRow = owner.locator('div[role="menu"] button').filter({ hasNotText: 'Everyone' }).filter({ hasNotText: 'Only chosen' });
    const rows = await peerRow.count();
    check(rows > 0, 'the people in the room are listed to pick from', `${rows} rows`);
    await peerRow.last().click();
    await owner.waitForTimeout(2500);

    const after = await fetch(`${API}/lock?otp=${otp}&nodeId=${guestNode}`).then((r) => r.json());
    check(after.openPermissions?.[String(privateFile)] === true,
      'the chosen person may now open it');

    await guest.goto(`${BASE}/app/files`, { waitUntil: 'domcontentloaded' });
    await guest.waitForTimeout(6000);
    const stillLocked = await guest.locator('button:has-text("Locked")').count();
    check(stillLocked === 0, 'and their lock is gone, without a reload of the app',
      `${stillLocked} still locked`);

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
