/**
 * The real desktop app and a real browser, on the same document, both ways.
 *
 * Not two browser tabs pretending: this launches the actual Electron build
 * on one side and Chromium on the other, signs each in as a different
 * person, and checks that work travels desktop -> web AND web -> desktop,
 * that both platforms show the same version history, and that the panel's
 * new behaviours (the upload notice and the file lock) reach the other
 * platform rather than only the one they were implemented on.
 *
 * WHY THE ENV VAR MATTERS
 *
 * The shipped desktop app is a WebView shell: `desktop/electron/main.ts`
 * ends with `win.loadURL('https://docusync-dusky.vercel.app/app/login')`,
 * so it always opens production no matter what base URL a test passes. It
 * reads `VITE_DEV_SERVER_URL` first, though, and the navigation allowlist
 * already permits localhost — so setting that variable points the genuine
 * desktop shell at this machine's server. The architecture under test is
 * exactly the shipped one; only the address differs.
 *
 * Run: node scripts/probe-cross-platform.js [baseUrl]
 */
const { chromium, _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000';
const API = `${BASE}/api/lobby`;
const DESKTOP = path.resolve(__dirname, '..', '..', 'desktop');
const MAIN = path.join(DESKTOP, 'dist-electron', 'main.js');
const ELECTRON_EXE = path.join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe');
const accts = JSON.parse(fs.readFileSync(path.join(__dirname, 'live-accounts.json'), 'utf8'));

const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok, name });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

const post = async (p, b) => {
  const res = await fetch(`${API}${p}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const get = async (p) => {
  const res = await fetch(`${API}${p}`);
  return { status: res.status, data: await res.json().catch(() => null) };
};

/** The document's words, without the collaboration furniture. */
const docText = (w) => w.evaluate(() => {
  const pm = document.querySelector('.ProseMirror');
  if (!pm) return '';
  const copy = pm.cloneNode(true);
  copy.querySelectorAll('.collaboration-cursor__caret, .collaboration-cursor__label')
    .forEach((el) => el.remove());
  return (copy.innerText || copy.textContent || '').replace(/\s+/g, ' ').trim();
});

async function waitForText(w, needle, budgetMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < budgetMs) {
    if ((await docText(w)).includes(needle)) return Date.now() - t0;
    await w.waitForTimeout(350);
  }
  return null;
}

async function signIn(page, acct, label) {
  const inSession = await page.evaluate(() => !!sessionStorage.getItem('docusync_auth_user')).catch(() => false);
  if (inSession) return;

  // Two attempts, with a settle before each.
  //
  // `domcontentloaded` fires before React has attached its handlers, so
  // filling the form immediately types into inputs nothing is listening
  // to and the submit does nothing at all -- the wait below then sits
  // until it times out on a page that is working perfectly. Waiting for
  // the button to be enabled is the signal that hydration has finished.
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.goto(`${BASE}/app/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 60000 });
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /log in/i.test(x.textContent || ''));
      return !!b && !b.disabled;
    }, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);

    await page.fill('input[placeholder="Enter your username"]', acct.email);
    await page.fill('input[placeholder="Enter your password"]', acct.password);
    await page.click('button:has-text("Log In")');

    try {
      await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), null, { timeout: 30000 });
      return;
    } catch {
      if (attempt === 2) {
        const shown = (await page.evaluate(() => document.body.innerText || '').catch(() => ''))
          .replace(/\s+/g, ' ').slice(0, 140);
        throw new Error(`${label} sign-in failed for ${acct.email}: ${shown}`);
      }
    }
  }
}

/** Puts the room and file into this client's storage, then opens the editor. */
async function openDoc(page, otp, fileId, fileName) {
  // Re-read the session, and sign in again if it has gone.
  //
  // The app polls its own auth and will clear the session if the server
  // stops recognising the account, so a run that signed in successfully
  // can still find nothing here a moment later. Reading it blind threw
  // "Cannot read properties of null" and failed the run for a reason that
  // had nothing to do with the behaviour under test.
  const live = await page.evaluate(() => sessionStorage.getItem('docusync_auth_user'));
  if (!live) throw new Error('the session was dropped after signing in -- is the account still active?');

  await page.evaluate(({ otp, fileId, fileName }) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    const k = (n) => `ds_${u.id}_${n}`;
    localStorage.setItem(k('current_room'), JSON.stringify({ otp, id: otp, name: 'Cross Platform' }));
    localStorage.setItem(k('files'), JSON.stringify([{ id: String(fileId), name: fileName }]));
  }, { otp, fileId, fileName });
  await page.goto(`${BASE}/app/editor/${fileId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ProseMirror', { timeout: 60000 });
  await page.waitForTimeout(1500);
}

async function typeAtEnd(page, line) {
  await page.click('.ProseMirror');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(line, { delay: 12 });
}

async function main() {
  console.log(`\nCross-platform: real desktop app <-> real browser -- ${BASE}\n`);

  if (!fs.existsSync(MAIN)) {
    console.error(`Desktop build not found at ${MAIN}. Run: npm run build:renderer --prefix desktop`);
    process.exit(1);
  }

  // Room and file created through the API, so both platforms start level.
  const HOST = 'xp-host-' + Date.now();
  const room = await post('/create', {
    hostNodeId: HOST, hostIp: '127.0.0.1', hostPort: 9000, roomName: 'Cross Platform', hostType: 'web',
  });
  const otp = room.data?.otp;
  if (!otp) { console.error('create failed', room); process.exit(1); }
  const shared = await post('/files', {
    otp,
    file: {
      fileId: Date.now(), fileName: 'Chapter 3.docx',
      content: '<p>Chapter 3 Methodology.</p>', sharedBy: 'Setup', sharedByNodeId: HOST,
    },
  });
  const fileId = shared.data?.fileId;
  console.log(`  room ${otp}  fileId ${fileId}\n`);

  let app, browser;
  try {
    // The genuine desktop shell, pointed at this machine. See the header.
    // A disposable profile per run, as the other Electron probes get.
    // Electron keeps its user data between launches, so the window came
    // up still signed in as whoever ran this last -- an account since
    // revoked -- and sat in a redirect loop instead of showing a login.
    const userDataDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ds-xplat-'));
    app = await electron.launch({
      executablePath: ELECTRON_EXE,
      args: [MAIN, `--user-data-dir=${userDataDir}`],
      cwd: DESKTOP,
      timeout: 120000,
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: `${BASE}/app/login`,
        DOCUSYNC_WS_PORT: '9421',
      },
    });
    const desk = await app.firstWindow({ timeout: 120000 });
    desk.setDefaultTimeout(60000);
    await desk.waitForLoadState('domcontentloaded');

    check(
      new URL(desk.url()).origin === new URL(BASE).origin,
      'the desktop app is running against this server, not production',
      desk.url().slice(0, 48)
    );

    browser = await chromium.launch();
    const web = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    web.setDefaultTimeout(60000);

    await signIn(desk, accts[0], 'desktop');
    await signIn(web, accts[1], 'web');
    check(true, 'both platforms signed in as different people',
      `${accts[0].email} / ${accts[1].email}`);

    await openDoc(desk, otp, fileId, 'Chapter 3.docx');
    await openDoc(web, otp, fileId, 'Chapter 3.docx');
    check(true, 'both platforms opened the same document');

    // ── Desktop -> Web ─────────────────────────────────────────────────
    console.log('\n  Desktop -> Web');
    const D_LINE = 'DESKTOP wrote this line for the web app to receive';
    await typeAtEnd(desk, D_LINE);
    await desk.waitForTimeout(1200);
    const dToW = await waitForText(web, D_LINE, 30000);
    check(dToW !== null, 'text typed on the DESKTOP arrives in the WEB app',
      dToW !== null ? `${dToW}ms` : 'never arrived');

    // ── Web -> Desktop ─────────────────────────────────────────────────
    console.log('\n  Web -> Desktop');
    const W_LINE = 'WEB wrote this line for the desktop app to receive';
    await typeAtEnd(web, W_LINE);
    await web.waitForTimeout(1200);
    const wToD = await waitForText(desk, W_LINE, 30000);
    check(wToD !== null, 'text typed in the WEB app arrives on the DESKTOP',
      wToD !== null ? `${wToD}ms` : 'never arrived');

    // ── Neither side lost the other's work ─────────────────────────────
    console.log('\n  Convergence');
    await desk.waitForTimeout(3000);
    const dText = await docText(desk);
    const wText = await docText(web);
    check(dText.includes(D_LINE) && dText.includes(W_LINE),
      'the desktop holds BOTH contributions');
    check(wText.includes(D_LINE) && wText.includes(W_LINE),
      'the web app holds BOTH contributions');
    check(dText === wText, 'both platforms show an identical document',
      dText === wText ? 'identical' : `desktop "${dText.slice(-46)}" vs web "${wText.slice(-46)}"`);

    // Visual evidence of the converged state on each platform.
    const shotDir = process.env.XP_SHOTS;
    if (shotDir) {
      fs.mkdirSync(shotDir, { recursive: true });
      await desk.screenshot({ path: path.join(shotDir, 'xp-desktop-app.png') });
      await web.screenshot({ path: path.join(shotDir, 'xp-web-app.png') });
      console.log(`    (screenshots written to ${shotDir})`);
    }

    // ── The same history on both ───────────────────────────────────────
    console.log('\n  Version history agreement');
    await desk.goto(`${BASE}/app/history/${fileId}`, { waitUntil: 'domcontentloaded' });
    await web.goto(`${BASE}/app/history/${fileId}`, { waitUntil: 'domcontentloaded' });
    await desk.waitForTimeout(3000);
    await web.waitForTimeout(3000);

    const readRows = (p) => p.evaluate(() => {
      const out = [];
      document.querySelectorAll('.ds-card').forEach((c) => {
        const t = (c.innerText || '').replace(/\s+/g, ' ').trim();
        const m = t.match(/^v(\d+)\s+([A-Za-z ]+?)\s/);
        if (m) out.push(`v${m[1]}:${m[2].trim()}`);
      });
      return out;
    });
    const dRows = await readRows(desk);
    const wRows = await readRows(web);
    check(dRows.length > 0, 'the desktop lists versions', `${dRows.length} rows`);
    check(wRows.length > 0, 'the web app lists versions', `${wRows.length} rows`);
    check(dRows.length === wRows.length, 'both list the SAME NUMBER of versions',
      `desktop ${dRows.length}, web ${wRows.length}`);
    check(JSON.stringify(dRows) === JSON.stringify(wRows),
      'every row matches: same version number, same label, same order',
      JSON.stringify(dRows) === JSON.stringify(wRows) ? dRows.slice(0, 4).join(' | ') : `D ${dRows.slice(0, 3)} vs W ${wRows.slice(0, 3)}`);

    // ── An upload reaches both platforms, and tells them ───────────────
    console.log('\n  An upload replaces the file while both are editing');
    await openDoc(desk, otp, fileId, 'Chapter 3.docx');
    await openDoc(web, otp, fileId, 'Chapter 3.docx');
    await post('/files', {
      otp,
      file: {
        fileId: Date.now(), fileName: 'Chapter 3.docx',
        content: '<p>REPLACEMENT CHAPTER uploaded from another device.</p>',
        sharedBy: 'Groupmate', sharedByNodeId: 'xp-uploader',
      },
    });
    const dGot = await waitForText(desk, 'REPLACEMENT CHAPTER', 30000);
    const wGot = await waitForText(web, 'REPLACEMENT CHAPTER', 30000);
    check(dGot !== null, 'the DESKTOP receives the uploaded version', dGot !== null ? `${dGot}ms` : 'never');
    check(wGot !== null, 'the WEB app receives the uploaded version', wGot !== null ? `${wGot}ms` : 'never');

    const noticeOn = async (p) => {
      const body = (await p.evaluate(() => document.body.innerText || '')).replace(/\s+/g, ' ');
      return /uploaded a new copy|Replaced by a new upload/i.test(body);
    };
    check(await noticeOn(desk), 'the DESKTOP tells its user the file was replaced');
    check(await noticeOn(web), 'the WEB app tells its user the file was replaced');

    // ── A host lock reaches the other platform ─────────────────────────
    console.log('\n  A lock set on one platform is enforced on the other');
    await post('/lock', { otp, nodeId: HOST, fileId, locked: true, allowedNodeIds: [] });
    await desk.waitForTimeout(6000);
    await web.waitForTimeout(1000);

    const readOnly = async (p) => p.evaluate(() => {
      const pm = document.querySelector('.ProseMirror');
      const banner = /view only/i.test(document.body.innerText || '');
      return { editable: pm ? pm.getAttribute('contenteditable') : null, banner };
    });
    const dLock = await readOnly(desk);
    const wLock = await readOnly(web);
    check(dLock.editable === 'false' || dLock.banner,
      'the DESKTOP goes view-only when the host locks the file',
      JSON.stringify(dLock));
    check(wLock.editable === 'false' || wLock.banner,
      'the WEB app goes view-only when the host locks the file',
      JSON.stringify(wLock));

    await post('/lock', { otp, nodeId: HOST, fileId, locked: false, allowedNodeIds: [] });
    await desk.waitForTimeout(6000);
    const dFree = await readOnly(desk);
    check(dFree.editable !== 'false', 'unlocking restores editing on the desktop', JSON.stringify(dFree));

  } catch (err) {
    check(false, 'the cross-platform run completed', String(err).slice(0, 160));
  } finally {
    try { if (browser) await browser.close(); } catch {}
    try { if (app) await app.close(); } catch {}
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nProbe crashed:', e); process.exit(1); });
