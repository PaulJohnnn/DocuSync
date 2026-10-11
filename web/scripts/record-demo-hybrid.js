/**
 * Records the demo with the two collaborators on DIFFERENT PLATFORMS:
 *
 *   Paul   — the DocuSync DESKTOP application (real Electron window)
 *   Zyra   — the DocuSync WEB app (browser)
 *   Admin  — the web admin console (browser)
 *
 * Both reach the same room through the cloud relay, which is exactly how the
 * shipped desktop behaves: it is an Electron shell that loads the web UI, so
 * a desktop user and a browser user collaborate on the same document.
 *
 * Playwright cannot record video from an Electron context, so every panel is
 * captured the same way instead — one loop grabs a frame from all three at
 * the same instant. That also removes any drift between the panels: the
 * three image sequences share an index, so frame N is the same moment on all
 * three, which matters when the point of a scene is that an edit appeared on
 * the other machine.
 *
 * Run: node scripts/record-demo-hybrid.js
 */
const { chromium, _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const BASE = process.env.DEMO_BASE || 'http://localhost:3000';
const DESKTOP_DIR = path.resolve(__dirname, '..', '..', 'desktop');
const MAIN = path.join(DESKTOP_DIR, 'dist-electron', 'main.js');
const ELECTRON_BIN = path.join(DESKTOP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe');

const OUT_DIR = process.argv[2]
  || path.join('C:', 'Users', 'Paul John Palamara', 'Downloads', 'DocuSync-Defense', 'demo-video-hybrid');
const FRAMES = path.join(OUT_DIR, 'frames');
const VIEW = { width: 1280, height: 720 };
const CAPTURE_MS = 400; // ~2.5 fps — enough for a narrated walkthrough

const ACCOUNTS = (() => {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(__dirname, 'qa-accounts.json'), 'utf8'));
    return Object.fromEntries(list.map((a) => [a.id, a]));
  } catch { return {}; }
})();

function findFfmpeg() {
  const guesses = [];
  for (const root of ['C:/Program Files', 'C:/ProgramData/chocolatey/bin', process.env.LOCALAPPDATA || '']) {
    if (!root) continue;
    try {
      for (const sub of fs.readdirSync(root)) {
        if (/ffmpeg/i.test(sub)) guesses.push(path.join(root, sub, 'bin', 'ffmpeg.exe'));
      }
    } catch { }
  }
  guesses.push('ffmpeg');
  for (const g of guesses) {
    try { execFileSync(g, ['-version'], { stdio: 'ignore' }); return g; } catch { }
  }
  throw new Error('No capable ffmpeg found.');
}
const FFMPEG = findFfmpeg();

const beat = (page, ms) => page.waitForTimeout(ms);

async function login(page, displayName, account) {
  const user = account ? account.email : 'admin';
  const pass = account ? account.password : 'admin';
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 60000 });
  await beat(page, 800);
  await page.fill('input[placeholder="Enter your username"]', user);
  await beat(page, 400);
  await page.fill('input[placeholder="Enter your password"]', pass);
  await beat(page, 500);
  await page.click('button:has-text("Log In")');
  await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), { timeout: 40000 });
  await page.evaluate((name) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    u.name = name;
    sessionStorage.setItem('docusync_auth_user', JSON.stringify(u));
  }, displayName);
  await beat(page, 800);
}

async function seedFile(page, otp, fileId, html, fileName) {
  await page.evaluate(async ({ otp, fileId, html, fileName }) => {
    const DB = 'DocuSyncDB', STORE = 'files';
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onerror = () => rej(r.error);
      r.onsuccess = () => res(r.result);
      r.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      };
    });
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({
        id: fileId, name: fileName, type: 'text/plain', size: html.length,
        content: html, status: 'synced',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    await fetch('/api/lobby/doc', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp, fileId, content: html, authorNodeId: 'seed', seq: 1, committedAt: Date.now(), isSessionEnd: true }),
    });
  }, { otp, fileId, html, fileName });
}

async function caretAtEndOfLine(page, lineText) {
  await page.locator('.ProseMirror').click();
  const ok = await page.evaluate((t) => {
    const root = document.querySelector('.ProseMirror');
    if (!root) return false;
    const node = Array.from(root.querySelectorAll('p,h1,h2,h3,li')).find((el) => el.innerText.includes(t));
    if (!node) return false;
    const r = document.createRange();
    r.selectNodeContents(node); r.collapse(false);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    return true;
  }, lineText);
  if (!ok) throw new Error(`caret: no line containing "${lineText}"`);
  await beat(page, 250);
}

const hasText = (page, t, timeout = 90000) => page.waitForFunction(
  (s) => document.querySelector('.ProseMirror')?.innerText.includes(s), t, { timeout });

async function safe(label, fn) {
  try { await fn(); } catch (e) { console.log(`  ! ${label}: ${String(e.message).split('\n')[0]}`); }
}

(async () => {
  fs.rmSync(FRAMES, { recursive: true, force: true });
  for (const n of ['paul', 'zyra', 'admin']) fs.mkdirSync(path.join(FRAMES, n), { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // ── Paul: the real desktop application ────────────────────────────────
  // VITE_DEV_SERVER_URL makes the Electron shell load the local web app, so
  // Paul is genuinely the desktop binary while sharing the room with a
  // browser user through the cloud relay.
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-desktop-'));
  console.log('Launching the desktop application...');
  const app = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: [MAIN, `--user-data-dir=${userData}`],
    cwd: DESKTOP_DIR,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: `${BASE}/app/login`,
      DOCUSYNC_WS_PORT: '9000',
      DOCUSYNC_NODE_INDEX: '0',
      DOCUSYNC_NODE_COUNT: '3',
    },
    timeout: 90000,
  });
  const paul = await app.firstWindow({ timeout: 60000 });
  await paul.setViewportSize(VIEW).catch(() => { });
  await paul.waitForLoadState('domcontentloaded').catch(() => { });
  console.log('  desktop window at', paul.url());

  // ── Zyra and the administrator: the web app ───────────────────────────
  const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: VIEW });
  const ctxC = await browser.newContext({ viewport: VIEW });
  const zyra = await ctxB.newPage();
  const admin = await ctxC.newPage();
  await zyra.goto(`${BASE}/app/login`);
  await admin.goto(`${BASE}/app/login`);

  // ── Synchronised frame capture ────────────────────────────────────────
  let frame = 0;
  let capturing = true;
  const shot = async (page, dir) => {
    try {
      await page.screenshot({
        path: path.join(FRAMES, dir, String(frame).padStart(5, '0') + '.jpg'),
        type: 'jpeg', quality: 70, timeout: 5000,
      });
    } catch { /* a frame is allowed to be missed */ }
  };
  const captureLoop = (async () => {
    while (capturing) {
      const t = Date.now();
      await Promise.all([shot(paul, 'paul'), shot(zyra, 'zyra'), shot(admin, 'admin')]);
      frame++;
      const left = CAPTURE_MS - (Date.now() - t);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
    }
  })();

  const T0 = Date.now();
  const timeline = [];
  const scene = (id, caption) => {
    const at = (Date.now() - T0) / 1000;
    timeline.push({ id, caption, at });
    console.log(`  [${String(at.toFixed(1)).padStart(6)}s] ${caption}`);
  };

  try {
    scene('signin', 'Paul signs in on the DESKTOP app - Zyra on the WEB app');
    await login(paul, 'Paul', ACCOUNTS.A);
    await login(zyra, 'Zyra', ACCOUNTS.B);
    await login(admin, 'Administrator');
    await admin.goto(`${BASE}/app/admin/dashboard`);
    await beat(paul, 2500);

    scene('create', 'The desktop user creates a room - the code is the invitation');
    await paul.goto(`${BASE}/app/peers`);
    await beat(paul, 1800);
    await paul.click('button:has-text("Create Room")');
    await beat(paul, 900);
    await paul.fill('input[placeholder*="Thesis Project"]', 'Thesis Defense Demo');
    await beat(paul, 900);
    await paul.click('button:has-text("Generate Room")');
    await paul.waitForSelector('text=INVITE CODE', { timeout: 40000 });
    await beat(paul, 3000);
    const otp = (await paul.locator('text=INVITE CODE').locator('xpath=following-sibling::*[1]').innerText()).trim();
    console.log('  room', otp);
    await paul.click('text=Enter Workspace');
    await beat(paul, 2000);

    scene('join', 'The web user joins the same room with that code');
    await zyra.goto(`${BASE}/app/peers`);
    await beat(zyra, 1400);
    await zyra.click('button:has-text("Join Room")');
    await beat(zyra, 900);
    await zyra.locator('input[maxlength="6"]').fill(otp);
    await zyra.waitForFunction((c) => document.querySelector('input[maxlength="6"]')?.value === c, otp, { timeout: 10000 });
    await beat(zyra, 1000);
    await zyra.locator('button:has-text("Join Room")').last().click();
    try {
      await zyra.waitForSelector('text=Joined Room!', { timeout: 30000 });
    } catch {
      console.log('  join retry');
      await zyra.goto(`${BASE}/app/peers`);
      await beat(zyra, 1500);
      await zyra.click('button:has-text("Join Room")');
      await beat(zyra, 800);
      await zyra.locator('input[maxlength="6"]').fill(otp);
      await beat(zyra, 900);
      await zyra.locator('button:has-text("Join Room")').last().click();
      await zyra.waitForSelector('text=Joined Room!', { timeout: 40000 });
    }
    await beat(zyra, 1800);
    await zyra.click('text=Enter Workspace');
    await beat(zyra, 2000);

    scene('adminroom', 'The administrator sees the room and its members');
    await safe('admin room', async () => {
      await admin.goto(`${BASE}/app/admin/dashboard`);
      await beat(admin, 1000);
      await admin.reload();
    });
    await beat(admin, 4000);

    scene('open', 'Desktop and web open the SAME document');
    const fileId = String(Date.now()).slice(-6);
    const doc = '<div data-margin="96"><h2>Q4 Engineering Roadmap</h2>\n'
      + '<p>LINE A. The quarterly roadmap will be finalized before the end of the sprint.</p>\n'
      + '<p>LINE B. All stakeholders should confirm availability for the planning session.</p>\n'
      + '<p>LINE C. Budget review is scheduled for the second week.</p>\n</div>';
    await seedFile(paul, otp, fileId, doc, 'roadmap.txt');
    await seedFile(zyra, otp, fileId, doc, 'roadmap.txt');
    await paul.goto(`${BASE}/app/editor/${fileId}`);
    await paul.waitForSelector('.ProseMirror', { timeout: 40000 });
    await beat(paul, 1500);
    await zyra.goto(`${BASE}/app/editor/${fileId}`);
    await zyra.waitForSelector('.ProseMirror', { timeout: 40000 });
    await beat(zyra, 2500);

    scene('syncAB', 'Desktop types - the edit reaches the web app');
    await safe('A->B', async () => {
      await caretAtEndOfLine(paul, 'LINE A.');
      await paul.keyboard.type(' Paul (desktop): ships Monday.', { delay: 55 });
      await hasText(zyra, 'ships Monday');
    });
    await beat(zyra, 3000);

    scene('syncBA', 'Web app replies - the edit reaches the desktop');
    await safe('B->A', async () => {
      await caretAtEndOfLine(zyra, 'LINE C.');
      await zyra.keyboard.type(' Zyra (web): I will prepare the notes.', { delay: 55 });
      await hasText(paul, 'prepare the notes');
    });
    await beat(paul, 3000);

    scene('concurrentDifferent', 'Both type at once on DIFFERENT lines - both edits survive');
    await safe('concurrent different', async () => {
      await caretAtEndOfLine(paul, 'LINE A.');
      await caretAtEndOfLine(zyra, 'LINE C.');
      await Promise.all([
        paul.keyboard.type(' [DESKTOP EDIT]', { delay: 70 }),
        zyra.keyboard.type(' [WEB EDIT]', { delay: 70 }),
      ]);
      await Promise.all([
        hasText(paul, '[WEB EDIT]').catch(() => console.log('  ! WEB EDIT not on desktop')),
        hasText(zyra, '[DESKTOP EDIT]').catch(() => console.log('  ! DESKTOP EDIT not on web')),
      ]);
    });
    await beat(paul, 6000);

    scene('concurrentSame', 'Both type at once on the SAME line - one version wins');
    await safe('concurrent same', async () => {
      await caretAtEndOfLine(paul, 'LINE B.');
      await caretAtEndOfLine(zyra, 'LINE B.');
      await Promise.all([
        paul.keyboard.type(' <<FROM DESKTOP>>', { delay: 70 }),
        zyra.keyboard.type(' <<FROM WEB>>', { delay: 70 }),
      ]);
    });
    await beat(paul, 8000);

    scene('history', 'Version history IS the event log - nothing is overwritten');
    await safe('history', async () => {
      await paul.goto(`${BASE}/app/history/${fileId}`);
      await beat(paul, 6000);
      await paul.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
    });
    await beat(paul, 4000);

    scene('offlineDrop', 'The web user goes offline - the network is genuinely cut');
    await safe('back to editor', async () => {
      await paul.goto(`${BASE}/app/editor/${fileId}`);
      await paul.waitForSelector('.ProseMirror');
      await zyra.goto(`${BASE}/app/editor/${fileId}`);
      await zyra.waitForSelector('.ProseMirror');
    });
    await beat(paul, 2000);
    await ctxB.setOffline(true);
    await beat(zyra, 4000);

    scene('offlineEdit', 'Both keep working - desktop online, web with no network');
    await safe('offline edits', async () => {
      await caretAtEndOfLine(zyra, 'LINE C.');
      await zyra.keyboard.type(' [WEB OFFLINE]', { delay: 60 });
      await beat(zyra, 2000);
      await caretAtEndOfLine(paul, 'LINE A.');
      await paul.keyboard.type(' [DESKTOP ONLINE]', { delay: 60 });
    });
    await beat(paul, 3000);

    scene('offlineReturn', 'The network returns - the two versions reconcile');
    await ctxB.setOffline(false);
    await beat(zyra, 10000);
    await safe('reconcile', async () => {
      await Promise.all([
        hasText(zyra, '[DESKTOP ONLINE]', 45000),
        hasText(paul, '[WEB OFFLINE]', 45000),
      ]);
    });
    await beat(paul, 6000);

    scene('adminreview', 'The administrator reviews rooms and membership');
    await safe('admin', async () => {
      await admin.goto(`${BASE}/app/admin/dashboard`);
      await beat(admin, 1000);
      await admin.reload();
    });
    await beat(admin, 5000);

    scene('metrics', 'Evaluation metrics, measured from real traffic');
    await safe('metrics', async () => {
      await Promise.all([paul.goto(`${BASE}/app/metrics`), zyra.goto(`${BASE}/app/metrics`)]);
      await beat(paul, 4500);
      const down = (p) => p.evaluate(() => {
        const t = [...document.querySelectorAll('*')]
          .find((el) => el.scrollHeight > el.clientHeight + 200 && getComputedStyle(el).overflowY !== 'visible');
        (t || window).scrollBy({ top: 420, behavior: 'smooth' });
      });
      await Promise.all([down(paul), down(zyra)]);
    });
    await beat(paul, 6000);

    fs.writeFileSync(path.join(OUT_DIR, 'room.txt'), otp);
  } catch (err) {
    console.error('FAILED:', err.message);
  } finally {
    capturing = false;
    await captureLoop;
    const seconds = (Date.now() - T0) / 1000;
    fs.writeFileSync(path.join(OUT_DIR, 'timeline.json'),
      JSON.stringify({ totalSeconds: seconds, frames: frame, fps: frame / seconds, scenes: timeline }, null, 2));
    console.log(`\ncaptured ${frame} frames over ${seconds.toFixed(1)}s (${(frame / seconds).toFixed(2)} fps)`);
    await ctxB.close().catch(() => { });
    await ctxC.close().catch(() => { });
    await browser.close().catch(() => { });
    await app.close().catch(() => { });
    fs.rmSync(userData, { recursive: true, force: true });
  }
})();
