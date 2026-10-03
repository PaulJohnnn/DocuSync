/**
 * Records the FULL DocuSync demonstration — user flow and administrator
 * flow, start to finish — as three synchronised device recordings.
 *
 * This is the longer sibling of record-demo-video.js. That one shows the
 * product works; this one shows the four algorithms the manuscript is about:
 *
 *   log-based sync    the version history IS the event log
 *   tree clocks       concurrent edits are detected, not guessed at
 *   LWW resolution    a contested line resolves; untouched lines do not
 *   delta encoding    narrated, with the measured evidence (see the script)
 *
 * plus the offline push: a device is genuinely taken off the network with
 * context.setOffline, both sides edit, and the network is restored.
 *
 * Pacing is deliberately slow — this is meant to be watched and narrated
 * over, not asserted on. Scene offsets are written to timeline.json so the
 * captions and the spoken script can be lined up afterwards.
 *
 * Run: node scripts/record-demo-full.js [outDir]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.DEMO_BASE || 'http://localhost:3000';
const OUT_DIR = process.argv[2]
  || path.join('C:', 'Users', 'Paul John Palamara', 'Downloads', 'DocuSync-Defense', 'demo-video-full');
const RAW_DIR = path.join(OUT_DIR, 'raw');
const VIEW = { width: 1280, height: 720 };

const beat = (page, ms) => page.waitForTimeout(ms);

// Real registered accounts, so the two collaborators are genuinely separate
// users and not three windows signed into the administrator.
const ACCOUNTS = (() => {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(__dirname, 'qa-accounts.json'), 'utf8'));
    return Object.fromEntries(list.map((a) => [a.id, a]));
  } catch {
    return {};
  }
})();

async function login(page, displayName, account) {
  const user = account ? account.email : 'admin';
  const pass = account ? account.password : 'admin';
  await page.goto(`${BASE}/app/login`);
  await page.waitForSelector('input[placeholder="Enter your username"]');
  await beat(page, 700);
  await page.fill('input[placeholder="Enter your username"]', user);
  await beat(page, 400);
  await page.fill('input[placeholder="Enter your password"]', pass);
  await beat(page, 500);
  await page.click('button:has-text("Log In")');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 25000 });
  await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), { timeout: 25000 });
  await page.evaluate((name) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    u.name = name;
    sessionStorage.setItem('docusync_auth_user', JSON.stringify(u));
  }, displayName);
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

/** Clicks into the editor and parks the caret at the end of a given line. */
async function caretAtEndOfLine(page, lineText) {
  await page.locator('.ProseMirror').click();
  const ok = await page.evaluate((t) => {
    const root = document.querySelector('.ProseMirror');
    if (!root) return false;
    const node = Array.from(root.querySelectorAll('p,h1,h2,h3,li'))
      .find((el) => el.innerText.includes(t));
    if (!node) return false;
    const r = document.createRange();
    r.selectNodeContents(node);
    r.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    return true;
  }, lineText);
  if (!ok) throw new Error(`could not place caret on line containing "${lineText}"`);
  await beat(page, 250);
}

/** Runs a scene; a failure is reported and the recording continues. */
async function safe(label, fn) {
  try {
    await fn();
  } catch (err) {
    console.log(`  ! ${label}: ${String(err.message).split(String.fromCharCode(10))[0]}`);
  }
}

const hasText = (page, t, timeout = 60000) => page.waitForFunction(
  (s) => document.querySelector('.ProseMirror')?.innerText.includes(s),
  t, { timeout });

(async () => {
  fs.rmSync(RAW_DIR, { recursive: true, force: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });

  const browser = await chromium.launch();

  console.log('Warming routes...');
  const warm = await browser.newContext({ viewport: VIEW });
  const wp = await warm.newPage();
  for (const r of ['/app/login', '/app/peers', '/app/files', '/app/metrics', '/app/admin/dashboard']) {
    try { await wp.goto(BASE + r, { timeout: 60000 }); await wp.waitForTimeout(700); } catch { }
  }
  await warm.close();

  const mk = (name) => browser.newContext({
    viewport: VIEW,
    recordVideo: { dir: path.join(RAW_DIR, name), size: VIEW },
  });

  const ctxA = await mk('paul');
  const ctxB = await mk('zyra');
  const ctxC = await mk('admin');
  const paul = await ctxA.newPage();
  const zyra = await ctxB.newPage();
  const admin = await ctxC.newPage();

  const T0 = Date.now();
  const timeline = [];
  const scene = (id, caption) => {
    const at = (Date.now() - T0) / 1000;
    timeline.push({ id, caption, at });
    console.log(`  [${String(at.toFixed(1)).padStart(6)}s] ${id} — ${caption}`);
  };

  try {
    // ── 1. Sign in ──────────────────────────────────────────────────────
    scene('signin', 'Two collaborators and an administrator sign in');
    // Stagger the sign-ins: /api/auth is rate limited per IP, and three
    // simultaneous attempts from one machine can trip it.
    await login(paul, 'Paul', ACCOUNTS.A);
    await beat(paul, 600);
    await login(zyra, 'Zyra', ACCOUNTS.B);
    await beat(zyra, 600);
    await login(admin, 'Administrator');
    await admin.goto(`${BASE}/app/admin/dashboard`);
    await beat(paul, 2000);

    // ── 2. Create a room ────────────────────────────────────────────────
    scene('create', 'Creating a sync room — the code is the invitation');
    await paul.goto(`${BASE}/app/peers`);
    await beat(paul, 1500);
    await paul.click('button:has-text("Create Room")');
    await beat(paul, 900);
    await paul.fill('input[placeholder*="Thesis Project"]', 'Thesis Defense Demo');
    await beat(paul, 900);
    await paul.click('button:has-text("Generate Room")');
    await paul.waitForSelector('text=INVITE CODE');
    await beat(paul, 2800);
    const otp = (await paul.locator('text=INVITE CODE').locator('xpath=following-sibling::*[1]').innerText()).trim();
    console.log('  room', otp);
    await paul.click('text=Enter Workspace');
    await beat(paul, 1800);

    // ── 3. Second device joins ──────────────────────────────────────────
    scene('join', 'Second device joins with the invite code');
    await zyra.goto(`${BASE}/app/peers`);
    await beat(zyra, 1200);
    await zyra.click('button:has-text("Join Room")');
    await beat(zyra, 800);
    const otpBox = zyra.locator('input[maxlength="6"]');
    await otpBox.fill(otp);
    await zyra.waitForFunction(
      (code) => document.querySelector('input[maxlength="6"]')?.value === code,
      otp, { timeout: 10000 });
    await beat(zyra, 900);
    await zyra.locator('button:has-text("Join Room")').last().click();
    try {
      await zyra.waitForSelector('text=Joined Room!', { timeout: 25000 });
    } catch {
      console.log('  join did not confirm — retrying once');
      await zyra.goto(`${BASE}/app/peers`);
      await beat(zyra, 1500);
      await zyra.click('button:has-text("Join Room")');
      await beat(zyra, 800);
      await zyra.locator('input[maxlength="6"]').fill(otp);
      await beat(zyra, 900);
      await zyra.locator('button:has-text("Join Room")').last().click();
      await zyra.waitForSelector('text=Joined Room!', { timeout: 40000 });
    }
    await beat(zyra, 1600);
    await zyra.click('text=Enter Workspace');
    await beat(zyra, 1800);

    // ── 4. The administrator sees the room ──────────────────────────────
    scene('adminroom', 'The administrator sees the room and its members');
    await admin.goto(`${BASE}/app/admin/dashboard`);
    await beat(admin, 1000);
    await admin.reload();
    await beat(admin, 4000);

    // Peer list with both connected
    await paul.goto(`${BASE}/app/peers`);
    await beat(paul, 3000);

    // ── 5. Open the shared document ─────────────────────────────────────
    scene('open', 'Both devices open the same document');
    const fileId = String(Date.now()).slice(-6);
    const base = '<div data-margin="96"><h2>Q4 Engineering Roadmap</h2>\n'
      + '<p>LINE A. The quarterly roadmap will be finalized before the end of the sprint.</p>\n'
      + '<p>LINE B. All stakeholders should confirm availability for the planning session.</p>\n'
      + '<p>LINE C. Budget review is scheduled for the second week.</p>\n</div>';
    await seedFile(paul, otp, fileId, base, 'roadmap.txt');
    await seedFile(zyra, otp, fileId, base, 'roadmap.txt');

    await paul.goto(`${BASE}/app/files`);
    await beat(paul, 2500);
    await paul.goto(`${BASE}/app/editor/${fileId}`);
    await paul.waitForSelector('.ProseMirror');
    await beat(paul, 1500);
    await zyra.goto(`${BASE}/app/editor/${fileId}`);
    await zyra.waitForSelector('.ProseMirror');
    await beat(zyra, 2500);

    // ── 6. Live sync, one direction then the other ──────────────────────
    scene('syncAB', 'Paul types — only the change travels, not the document');
    await caretAtEndOfLine(paul, 'LINE A.');
    await paul.keyboard.type(' Paul: release candidate ships Monday.', { delay: 55 });
    await hasText(zyra, 'ships Monday');
    await beat(zyra, 2500);

    scene('syncBA', 'Zyra replies — both sides stay in step');
    await caretAtEndOfLine(zyra, 'LINE C.');
    await zyra.keyboard.type(' Zyra: I will prepare the release notes.', { delay: 55 });
    await hasText(paul, 'release notes');
    await beat(paul, 3000);

    // ── 7. CONCURRENT EDIT, DIFFERENT LINES — both must survive ─────────
    scene('concurrentDifferent', 'Both type at once on DIFFERENT lines — both edits survive');
    await caretAtEndOfLine(paul, 'LINE A.');
    await caretAtEndOfLine(zyra, 'LINE C.');
    await Promise.all([
      paul.keyboard.type(' [A-EDIT]', { delay: 70 }),
      zyra.keyboard.type(' [C-EDIT]', { delay: 70 }),
    ]);
    // Both markers must appear on BOTH devices. This is the headline claim.
    await Promise.all([
      hasText(paul, '[C-EDIT]', 90000).catch(() => console.log('  ! C-EDIT not seen on Paul')),
      hasText(zyra, '[A-EDIT]', 90000).catch(() => console.log('  ! A-EDIT not seen on Zyra')),
    ]);
    await beat(paul, 6000);

    // ── 8. CONCURRENT EDIT, SAME LINE — one wins, the rest untouched ────
    scene('concurrentSame', 'Both type at once on the SAME line — one version wins');
    await caretAtEndOfLine(paul, 'LINE B.');
    await caretAtEndOfLine(zyra, 'LINE B.');
    await Promise.all([
      paul.keyboard.type(' <<FROM PAUL>>', { delay: 70 }),
      zyra.keyboard.type(' <<FROM ZYRA>>', { delay: 70 }),
    ]);
    await beat(paul, 7000);
    // Show that the uncontested lines are intact on both sides.
    await beat(zyra, 3000);

    // ── 9. Version history — the append-only event log ──────────────────
    scene('history', 'Version history IS the event log — nothing is overwritten');
    await paul.goto(`${BASE}/app/history/${fileId}`);
    await beat(paul, 6000);
    await paul.evaluate(() => window.scrollBy({ top: 320, behavior: 'smooth' }));
    await beat(paul, 4000);

    // ── 10. OFFLINE PUSH ────────────────────────────────────────────────
    // Both devices must already be sitting in the editor BEFORE the network
    // is cut. Navigating an offline context just fails to load the page.
    await safe('return to editor', async () => {
      await Promise.all([
        paul.goto(`${BASE}/app/editor/${fileId}`),
        zyra.goto(`${BASE}/app/editor/${fileId}`),
      ]);
      await paul.waitForSelector('.ProseMirror');
      await zyra.waitForSelector('.ProseMirror');
    });
    await beat(paul, 2000);

    scene('offlineDrop', 'Zyra goes offline — the network is genuinely cut');
    await ctxB.setOffline(true);
    await beat(zyra, 4000);

    scene('offlineEdit', 'Both keep working — one online, one with no network');
    await safe('offline edit', async () => {
      await caretAtEndOfLine(zyra, 'LINE C.');
      await zyra.keyboard.type(' [ZYRA OFFLINE]', { delay: 60 });
    });
    await beat(zyra, 2500);
    await safe('online edit', async () => {
      await caretAtEndOfLine(paul, 'LINE A.');
      await paul.keyboard.type(' [PAUL ONLINE]', { delay: 60 });
    });
    await beat(paul, 3000);

    scene('offlineReturn', 'The network returns — the two versions reconcile');
    await ctxB.setOffline(false);
    // No reload: the app detects the reconnection itself. Reloading would
    // also be a fair way to lose the offline work, which is the opposite of
    // what this scene is meant to show.
    await beat(zyra, 10000);
    await safe('await reconciliation', async () => {
      await Promise.all([
        hasText(zyra, '[PAUL ONLINE]', 45000),
        hasText(paul, '[ZYRA OFFLINE]', 45000),
      ]);
    });
    await beat(paul, 6000);

    // ── 11. Administrator view ──────────────────────────────────────────
    scene('adminreview', 'The administrator reviews rooms and membership');
    await admin.goto(`${BASE}/app/admin/dashboard`);
    await beat(admin, 1200);
    await admin.reload();
    await beat(admin, 5000);

    // ── 12. Metrics ─────────────────────────────────────────────────────
    scene('metrics', 'Evaluation metrics, measured from real traffic');
    await Promise.all([
      paul.goto(`${BASE}/app/metrics`),
      zyra.goto(`${BASE}/app/metrics`),
    ]);
    await beat(paul, 4500);
    const scrollDown = (page) => page.evaluate(() => {
      const target = [...document.querySelectorAll('*')]
        .find((el) => el.scrollHeight > el.clientHeight + 200 && getComputedStyle(el).overflowY !== 'visible');
      (target || window).scrollBy({ top: 430, behavior: 'smooth' });
    });
    await Promise.all([scrollDown(paul), scrollDown(zyra)]);
    await beat(paul, 6500);

    console.log('\nRoom used:', otp);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'room.txt'), otp);
    fs.writeFileSync(path.join(OUT_DIR, 'timeline.json'),
      JSON.stringify({ totalSeconds: (Date.now() - T0) / 1000, scenes: timeline }, null, 2));
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await ctxA.close();
    await ctxB.close();
    await ctxC.close();
    await browser.close();
  }

  const pick = (dir) => {
    const d = path.join(RAW_DIR, dir);
    const f = fs.existsSync(d) ? fs.readdirSync(d).filter((x) => x.endsWith('.webm'))[0] : null;
    return f ? path.join(d, f) : null;
  };
  for (const [dir, name] of [
    ['paul', 'Device1-Paul.webm'],
    ['zyra', 'Device2-Zyra.webm'],
    ['admin', 'Device3-Admin.webm'],
  ]) {
    const src = pick(dir);
    if (!src) { console.error('missing recording for', dir); continue; }
    const dest = path.join(OUT_DIR, name);
    fs.copyFileSync(src, dest);
    console.log('wrote', dest, '(' + Math.round(fs.statSync(dest).size / 1024) + ' KB)');
  }
  fs.rmSync(RAW_DIR, { recursive: true, force: true });
})();
