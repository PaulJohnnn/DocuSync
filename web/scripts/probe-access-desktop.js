/**
 * The people-and-access panel, on the real desktop build.
 *
 * The web app is checked by probe-access-ux. This opens the same room in
 * the actual Electron application and reads the same panel, because
 * "it works on the web" is not an answer to "does it work on the app I
 * downloaded".
 *
 * Run: node scripts/probe-access-desktop.js [baseUrl]
 */
const { chromium, _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'https://docusync-dusky.vercel.app';
const API = `${BASE}/api/lobby`;
const DESKTOP = path.resolve(__dirname, '..', '..', 'desktop');
const MAIN = path.join(DESKTOP, 'dist-electron', 'main.js');
const EXE = path.join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe');
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
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 60000 });
  await page.waitForTimeout(1400);
  await page.fill('input[placeholder="Enter your username"]', acct.email);
  await page.fill('input[placeholder="Enter your password"]', acct.password);
  await page.click('button:has-text("Log In")');
  await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), null, { timeout: 40000 });
}

async function openEditor(page, otp, fileId, name, nodeId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate(({ otp, fileId, name, nodeId }) => {
      const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
      const k = (x) => `ds_${u.id}_${x}`;
      localStorage.setItem(k('node_id'), nodeId);
      localStorage.setItem(k('current_room'), JSON.stringify({ otp, id: otp, name: 'Access', isOwner: true }));
      localStorage.setItem(k('files'), JSON.stringify([{ id: String(fileId), name }]));
    }, { otp, fileId, name, nodeId });
    if (attempt === 0) await page.goto(`${BASE}/app/editor/${fileId}`, { waitUntil: 'domcontentloaded' });
    else await page.reload({ waitUntil: 'domcontentloaded' });
    try {
      await page.waitForSelector('.ProseMirror', { timeout: 25000 });
      await page.waitForTimeout(1500);
      return;
    } catch (e) { if (attempt === 2) throw e; }
  }
}

const panelText = (page) => page.evaluate(() => {
  const panel = Array.from(document.querySelectorAll('div'))
    .find((d) => /In this room/i.test(d.innerText || '') && /Code to join/i.test(d.innerText || ''));
  return panel ? (panel.innerText || '').replace(/\s+/g, ' ').trim() : null;
});

async function main() {
  console.log(`\nAccess panel on the desktop app -- ${BASE}\n`);
  if (!fs.existsSync(MAIN) || !fs.existsSync(EXE)) {
    console.log('  desktop build not present -- nothing to check\n');
    return;
  }

  const ownerNode = 'web-owner-' + Date.now();
  const deskNode = 'web-desk-' + Date.now();
  const room = await post('/create', {
    hostNodeId: ownerNode, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Access', hostType: 'web',
  });
  const otp = room.data.otp;
  const shared = await post('/files', {
    otp,
    file: {
      fileId: Date.now(), fileName: 'Chapter 3.docx',
      content: '<p>Chapter 3. Research Methodology</p>', sharedBy: 's', sharedByNodeId: ownerNode,
    },
  });
  const fileId = shared.data.fileId;
  console.log(`  room ${otp}  fileId ${fileId}\n`);

  let app; let browser;
  try {
    // The owner is a browser; the desktop app is the other person, which
    // is the case that matters -- can somebody on the downloaded app tell
    // who owns the room they have been invited into.
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const owner = await ctx.newPage();
    owner.setDefaultTimeout(60000);
    await owner.goto(`${BASE}/app/login`, { waitUntil: 'domcontentloaded' });
    await signIn(owner, accts[0]);
    await openEditor(owner, otp, fileId, 'Chapter 3.docx', ownerNode);

    // A disposable profile, so the window starts where a new install
    // would. Electron keeps its user data between launches, so without
    // this it came up still signed in as whoever ran this last -- an
    // account since revoked, which the app then bounced out of in a
    // redirect loop.
    const userDataDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ds-access-'));
    app = await electron.launch({
      executablePath: EXE, args: [MAIN, `--user-data-dir=${userDataDir}`], cwd: DESKTOP, timeout: 120000,
      env: { ...process.env, VITE_DEV_SERVER_URL: `${BASE}/app/login`, DOCUSYNC_WS_PORT: '9471' },
    });
    const desk = await app.firstWindow({ timeout: 120000 });
    desk.setDefaultTimeout(60000);
    await desk.waitForLoadState('domcontentloaded');
    await signIn(desk, accts[1]);
    await openEditor(desk, otp, fileId, 'Chapter 3.docx', deskNode);
    await desk.waitForTimeout(9000);

    await desk.locator('text=/Can edit|View only|Owner/').first().click().catch(() => {});
    await desk.waitForTimeout(1000);
    const seen = await panelText(desk);
    check(!!seen, 'the desktop app shows the people panel');
    if (seen) {
      check(/Owner/.test(seen), 'and marks who owns the room', seen.slice(0, 150));
      check(/You can edit it|View only/i.test(seen), 'and tells you what you can do', seen.slice(0, 80));
      check(/Code to join/i.test(seen) && /[A-Z0-9]{6}/.test(seen),
        'and shows the code to get in');
    }

    // The owner makes the desktop user a reader; the desktop must say so
    // without being reloaded.
    await post('/lock', {
      otp, nodeId: ownerNode, fileId,
      openRestricted: true, restricted: true, grantOpen: deskNode, revoke: deskNode,
    });
    await owner.waitForTimeout(1500);
    await desk.waitForTimeout(9000);

    const after = await panelText(desk);
    check(!!after && /View only/.test(after),
      'the desktop reflects being made view-only, with no reload', after ? after.slice(0, 120) : '');
    const banner = await desk.evaluate(() => {
      const el = Array.from(document.querySelectorAll('span'))
        .find((d) => /^View only\./.test((d.textContent || '').trim()));
      return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : null;
    });
    check(!!banner && /can give you editing access/i.test(banner),
      'and names who to ask', banner || 'no banner');
    const tools = await desk.locator('button:has(svg.lucide-bold)').count();
    check(tools === 0, 'and stops offering the editing tools', `${tools} buttons`);

  } finally {
    if (app) await app.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  const passed = results.filter((r) => r.ok).length;
  console.log('');
  console.log(`  ${passed} passed, ${results.length - passed} failed`);
  console.log('');
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
