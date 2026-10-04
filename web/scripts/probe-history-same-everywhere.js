/**
 * Reported: the Document History shows a different list on the desktop app
 * than in the browser, for the same file.
 *
 * It did. The page asked the desktop host for its history first and fell back
 * to the room's history only if that failed — and those are two different
 * logs. The host keeps its own SQLite event log for the local engine; the
 * room keeps the shared one every device writes to. So a device that could
 * reach the host read its private history and a device that could not read
 * the shared one, and the same file listed different versions depending on
 * where you looked.
 *
 * This opens the same file's history in the real desktop app and in a
 * browser, and compares the two lists row for row. It also checks that
 * Restore asks before overwriting the room's document.
 *
 * Run: node scripts/probe-history-same-everywhere.js [baseUrl]
 */
const { chromium, _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'https://docusync-dusky.vercel.app';
const API = `${BASE}/api/lobby`;
const DESKTOP = path.resolve(__dirname, '..', '..', 'desktop');
const MAIN = path.join(DESKTOP, 'dist-electron', 'main.js');
const accts = JSON.parse(fs.readFileSync(path.join(__dirname, 'live-accounts.json'), 'utf8'));
const FILE_ID = '656565';

const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok, name });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

async function signIn(win, acct, otp) {
  const already = await win.evaluate(() => !!sessionStorage.getItem('docusync_auth_user')).catch(() => false);
  if (!already) {
    await win.goto(`${BASE}/app/login`, { waitUntil: 'domcontentloaded' });
    await win.waitForSelector('input[placeholder="Enter your username"]', { timeout: 90000 });
    await win.fill('input[placeholder="Enter your username"]', acct.email);
    await win.fill('input[placeholder="Enter your password"]', acct.password);
    await win.click('button:has-text("Log In")');
    await win.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), null, { timeout: 90000 });
  }
  await win.evaluate(({ otp, fileId }) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    const k = (n) => `ds_${u.id}_${n}`;
    // hostIp set deliberately: a desktop in a room has one, and it is what
    // used to send this page to a different log from everyone else.
    localStorage.setItem(k('current_room'), JSON.stringify({ otp, name: 'History Parity', hostIp: '127.0.0.1', hostPort: 9000 }));
    localStorage.setItem(k('files'), JSON.stringify([{ id: fileId, name: 'Chapter 3.docx' }]));
  }, { otp, fileId: FILE_ID });
  await win.goto(`${BASE}/app/history/${FILE_ID}`, { waitUntil: 'domcontentloaded' });
  await win.waitForTimeout(5000);
}

/** The version list as a reader sees it: number, label, author, time. */
const rows = (w) => w.evaluate(() =>
  Array.from(document.querySelectorAll('.ds-card'))
    .map((el) => el.innerText || '')
    .filter((t) => /^v\d+/.test(t.trim()))
    .map((t) => {
      const line = t.replace(/\s+/g, ' ').trim();
      return {
        version: (line.match(/^v\d+/) || [''])[0],
        label: (line.match(/^v\d+\s+([A-Za-z ()-]+?)\s+LWW/) || ['', ''])[1].trim(),
        author: (line.match(/Modified by:\s*(\S+)/) || ['', ''])[1],
        time: (line.match(/\d{1,2}:\d{2}\s?[AP]M/i) || [''])[0],
      };
    }));

(async () => {
  console.log(`target: ${BASE}\n`);
  const otp = String(100000 + Math.floor(Math.random() * 899999));

  // A few real versions in the room's log, from two different authors.
  const doc = (lines) => `<div data-margin="96">${lines.map((l) => `<p>${l}</p>`).join('')}</div>`;
  const base = doc(['FIRST LINE.', 'SECOND LINE.']);
  const steps = [
    [base, 'seed'],
    [doc(['FIRST LINE edited by Paul.', 'SECOND LINE.']), 'web-paul'],
    [doc(['FIRST LINE edited by Paul.', 'SECOND LINE edited by Zyra.']), 'web-zyra'],
  ];
  let prev = null;
  for (const [content, author] of steps) {
    await fetch(`${API}/doc`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        otp, fileId: FILE_ID, content, authorNodeId: author, seq: 1,
        committedAt: Date.now(), isSessionEnd: true,
        ...(prev ? { baseContent: prev } : {}),
      }),
    });
    prev = content;
    await new Promise((r) => setTimeout(r, 1200));
  }

  let app, browser;
  try {
    app = await electron.launch({
      executablePath: path.join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe'),
      args: [MAIN], cwd: DESKTOP, timeout: 120000,
      env: { ...process.env, DOCUSYNC_WS_PORT: '9413' },
    });
    const desk = await app.firstWindow({ timeout: 180000 });
    desk.setDefaultTimeout(90000);
    await desk.waitForLoadState('domcontentloaded');

    browser = await chromium.launch();
    const web = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    web.setDefaultTimeout(90000);

    await signIn(desk, accts[0], otp);
    await signIn(web, accts[1], otp);

    const deskRows = await rows(desk);
    const webRows = await rows(web);

    console.log(`  desktop : ${deskRows.map((r) => `${r.version} ${r.label} (${r.author}) ${r.time}`).join(' | ') || '(none)'}`);
    console.log(`  web app : ${webRows.map((r) => `${r.version} ${r.label} (${r.author}) ${r.time}`).join(' | ') || '(none)'}\n`);

    check(deskRows.length > 0, 'the desktop app lists versions', `${deskRows.length}`);
    check(deskRows.length === webRows.length,
      'both platforms list the same number of versions',
      `desktop ${deskRows.length}, web ${webRows.length}`);
    check(JSON.stringify(deskRows) === JSON.stringify(webRows),
      'every row matches: same version, same label, same author, same time');

    // Restore must ask first.
    const restoreBtn = desk.locator('button:has-text("Restore")').first();
    await restoreBtn.click();
    await desk.waitForTimeout(900);
    const asked = await desk.evaluate(() =>
      /Restore this version\?/i.test(document.body.innerText));
    check(asked, 'Restore asks for confirmation before overwriting');

    const hasBoth = await desk.evaluate(() => ({
      yes: /Yes, restore it/i.test(document.body.innerText),
      no: /No, cancel/i.test(document.body.innerText),
    }));
    check(hasBoth.yes && hasBoth.no, 'the question offers yes and no',
      `yes=${hasBoth.yes} no=${hasBoth.no}`);

    // Cancelling must leave the document alone.
    const beforeCancel = await rows(desk);
    await desk.click('button:has-text("No, cancel")');
    await desk.waitForTimeout(1500);
    const afterCancel = await rows(desk);
    check(JSON.stringify(beforeCancel) === JSON.stringify(afterCancel),
      'saying no changes nothing');

    fs.mkdirSync(path.join(__dirname, 'ui-shots'), { recursive: true });
    await desk.screenshot({ path: path.join(__dirname, 'ui-shots', 'history-desktop.png') });
    await web.screenshot({ path: path.join(__dirname, 'ui-shots', 'history-web.png') });
  } catch (err) {
    check(false, 'the history parity run completed', String(err.message || err).split('\n')[0]);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (app) await app.close().catch(() => {});
    const pass = results.filter((r) => r.ok).length;
    console.log(`\n  ${pass} passed, ${results.length - pass} failed`);
    if (results.length - pass) process.exitCode = 1;
  }
})();
