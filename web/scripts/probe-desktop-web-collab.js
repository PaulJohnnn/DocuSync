/**
 * Desktop app and web browser editing the same document at the same moment.
 *
 * Not two browser tabs standing in for two platforms: this launches the real
 * Electron build on one side and Chromium on the other, signs each in as a
 * different person, and has them type simultaneously on different lines. The
 * questions it answers are the ones that matter in a live demo — does
 * everything arrive, does it arrive quickly, and does anything get mangled or
 * lost on the way.
 *
 * Run: node scripts/probe-desktop-web-collab.js [baseUrl]
 */
const { chromium, _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'https://docusync-dusky.vercel.app';
const API = `${BASE}/api/lobby`;
const DESKTOP = path.resolve(__dirname, '..', '..', 'desktop');
const MAIN = path.join(DESKTOP, 'dist-electron', 'main.js');
const accts = JSON.parse(fs.readFileSync(path.join(__dirname, 'live-accounts.json'), 'utf8'));
const FILE_ID = '737373';

const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok, name });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

const DESKTOP_LINE = 'DESKTOP typing a whole sentence without pausing once';
const WEB_LINE = 'WEB typing its own sentence at the very same moment';

async function signInAndOpen(win, acct, otp) {
  // The desktop window may already hold a session from an earlier run, in
  // which case there is no login form to fill; waiting for one then times out
  // on a window that is working perfectly well.
  const alreadyIn = await win.evaluate(() => !!sessionStorage.getItem('docusync_auth_user')).catch(() => false);
  if (!alreadyIn) {
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
    localStorage.setItem(k('current_room'), JSON.stringify({ otp, name: 'Cross Platform' }));
    localStorage.setItem(k('files'), JSON.stringify([{ id: fileId, name: 'Chapter 3.docx' }]));
  }, { otp, fileId: FILE_ID });
  await win.goto(`${BASE}/app/editor/${FILE_ID}`, { waitUntil: 'domcontentloaded' });
  await win.waitForSelector('.ProseMirror', { timeout: 90000 });
}

/**
 * The document's words, without the collaboration furniture.
 *
 * `innerText` includes the remote cursor's name tag, which is a decoration
 * rather than content — and each side shows the OTHER person's name, so two
 * perfectly converged documents read as different strings.
 */
const text = (w) => w.evaluate(() => {
  const pm = document.querySelector('.ProseMirror');
  if (!pm) return '';
  const copy = pm.cloneNode(true);
  copy.querySelectorAll('.collaboration-cursor__caret, .collaboration-cursor__label')
    .forEach((el) => el.remove());
  return copy.innerText || copy.textContent || '';
});

async function waitFor(w, needle, budgetMs) {
  const started = Date.now();
  while (Date.now() - started < budgetMs) {
    if ((await text(w)).includes(needle)) return Date.now() - started;
    await w.waitForTimeout(400);
  }
  return null;
}

(async () => {
  console.log(`target: ${BASE}`);
  console.log(`desktop: ${MAIN}\n`);

  const otp = String(100000 + Math.floor(Math.random() * 899999));
  const seed = '<div data-margin="96">'
    + '<p>LINE ONE:</p><p>LINE TWO:</p><p>UNTOUCHED LINE THREE.</p></div>';
  await fetch(`${API}/doc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp, fileId: FILE_ID, content: seed, authorNodeId: 'seed', seq: 1, committedAt: Date.now(), isSessionEnd: true }),
  });

  let app, browser;
  try {
    app = await electron.launch({
      executablePath: path.join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe'),
      args: [MAIN],
      cwd: DESKTOP,
      timeout: 120000,
      env: { ...process.env, DOCUSYNC_WS_PORT: '9412' },
    });
    const desk = await app.firstWindow({ timeout: 180000 });
    desk.setDefaultTimeout(90000);
    await desk.waitForLoadState('domcontentloaded');
    check(/docusync-dusky\.vercel\.app/.test(desk.url()), 'the desktop app opened the live site', desk.url().slice(0, 60));

    browser = await chromium.launch();
    const web = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
    web.setDefaultTimeout(90000);

    await signInAndOpen(desk, accts[0], otp);
    await signInAndOpen(web, accts[1], otp);
    check(true, 'both platforms opened the same document');
    await desk.waitForTimeout(3000);

    // Different lines, typed at the same time, neither pausing.
    await desk.locator('.ProseMirror p').nth(0).click();
    await desk.keyboard.press('End');
    await web.locator('.ProseMirror p').nth(1).click();
    await web.keyboard.press('End');

    await Promise.all([
      desk.keyboard.type(' ' + DESKTOP_LINE, { delay: 110 }),
      web.keyboard.type(' ' + WEB_LINE, { delay: 110 }),
    ]);

    // The clock starts when both stop.
    const [deskSeenByWeb, webSeenByDesk] = await Promise.all([
      waitFor(web, 'DESKTOP typing', 30000),
      waitFor(desk, 'WEB typing', 30000),
    ]);

    console.log(`\n  desktop's text reached the web in: ${deskSeenByWeb === null ? 'never' : deskSeenByWeb + 'ms'}`);
    console.log(`  web's text reached the desktop in: ${webSeenByDesk === null ? 'never' : webSeenByDesk + 'ms'}\n`);

    check(deskSeenByWeb !== null, 'the desktop’s typing reaches the web app');
    check(webSeenByDesk !== null, 'the web app’s typing reaches the desktop');
    check(deskSeenByWeb !== null && deskSeenByWeb < 8000 && webSeenByDesk !== null && webSeenByDesk < 8000,
      'both arrive within a few seconds of the typing stopping',
      `${deskSeenByWeb}ms / ${webSeenByDesk}ms`);

    await desk.waitForTimeout(5000);
    const td = await text(desk), tw = await text(web);

    // Nothing lost on either platform.
    for (const [who, t] of [['desktop', td], ['web app', tw]]) {
      check(t.includes(DESKTOP_LINE) && t.includes(WEB_LINE),
        `the ${who} holds both people’s sentences`,
        t.replace(/\n+/g, ' | ').slice(0, 130));
    }

    // Nothing mangled: each sentence must appear whole, once, and the line
    // nobody touched must be exactly as it started.
    for (const [who, t] of [['desktop', td], ['web app', tw]]) {
      const deskCount = (t.match(/DESKTOP typing a whole sentence without pausing once/g) || []).length;
      const webCount = (t.match(/WEB typing its own sentence at the very same moment/g) || []).length;
      check(deskCount === 1 && webCount === 1,
        `on the ${who}, each sentence appears once and intact`,
        `desktop sentence x${deskCount}, web sentence x${webCount}`);
      check(/UNTOUCHED LINE THREE\./.test(t),
        `on the ${who}, the line nobody edited is unchanged`);
    }

    // And the two platforms agree with each other.
    const normalise = (t) => t.replace(/\s+/g, ' ').trim();
    check(normalise(td) === normalise(tw), 'both platforms show the same document',
      normalise(td) === normalise(tw) ? 'identical' : `desktop "${normalise(td).slice(0, 60)}" vs web "${normalise(tw).slice(0, 60)}"`);

    // No spurious offline page on either side.
    for (const [who, w] of [['desktop', desk], ['web app', web]]) {
      const body = await w.evaluate(() => document.body.innerText);
      check(!/\[Offline Edit appended by/i.test(body), `the ${who} was not given a spurious offline-merge page`);
    }

    fs.mkdirSync(path.join(__dirname, 'ui-shots'), { recursive: true });
    await desk.screenshot({ path: path.join(__dirname, 'ui-shots', 'collab-desktop.png') });
    await web.screenshot({ path: path.join(__dirname, 'ui-shots', 'collab-web.png') });
  } catch (err) {
    check(false, 'the cross-platform run completed', String(err.message || err).split('\n')[0]);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (app) await app.close().catch(() => {});
    const pass = results.filter((r) => r.ok).length;
    console.log(`\n  ${pass} passed, ${results.length - pass} failed`);
    if (results.length - pass) process.exitCode = 1;
  }
})();
