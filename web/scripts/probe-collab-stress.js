/**
 * Desktop app and web browser, three things that have gone wrong before:
 *
 *   1. Spamming spaces — do the spaces survive, and can each side still see
 *      the other's cursor afterwards?
 *   2. Pressing Enter above someone else's caret — does their caret stay on
 *      the words they left it on, or drift onto different text?
 *   3. Both typing at once on different lines, with spaces and new lines —
 *      does everything land, and do the carets stay where they belong?
 *
 * A remote caret SHOULD move down the page when someone inserts a line above
 * it: it is anchored to text, and that text has moved. What it must never do
 * is end up on different words. That is what these checks measure.
 *
 * Run: node scripts/probe-collab-stress.js [baseUrl]
 */
const { chromium, _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'https://docusync-dusky.vercel.app';
const API = `${BASE}/api/lobby`;
const DESKTOP = path.resolve(__dirname, '..', '..', 'desktop');
const MAIN = path.join(DESKTOP, 'dist-electron', 'main.js');
const accts = JSON.parse(fs.readFileSync(path.join(__dirname, 'live-accounts.json'), 'utf8'));
const FILE_ID = '464646';

const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok, name });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

async function openEditor(win, acct, otp) {
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
    localStorage.setItem(k('current_room'), JSON.stringify({ otp, name: 'Collab Stress' }));
    localStorage.setItem(k('files'), JSON.stringify([{ id: fileId, name: 'Chapter 3.docx' }]));
  }, { otp, fileId: FILE_ID });
  await win.goto(`${BASE}/app/editor/${FILE_ID}`, { waitUntil: 'domcontentloaded' });
  await win.waitForSelector('.ProseMirror', { timeout: 90000 });
}

/** The document's text, without the cursor name tags. */
const text = (w) => w.evaluate(() => {
  const pm = document.querySelector('.ProseMirror');
  if (!pm) return '';
  const copy = pm.cloneNode(true);
  copy.querySelectorAll('.collaboration-cursor__caret, .collaboration-cursor__label').forEach((el) => el.remove());
  return copy.textContent || '';
});

/** Which paragraph each remote caret sits in, and that paragraph's words. */
const carets = (w) => w.evaluate(() => {
  const paras = Array.from(document.querySelectorAll('.ProseMirror p'));
  return Array.from(document.querySelectorAll('.collaboration-cursor__caret')).map((c) => {
    const i = paras.findIndex((p) => p.contains(c));
    const el = paras[i];
    const clone = el ? el.cloneNode(true) : null;
    if (clone) clone.querySelectorAll('.collaboration-cursor__caret, .collaboration-cursor__label').forEach((x) => x.remove());
    return { index: i, words: (clone?.textContent || '').trim() };
  });
});

const waitFor = async (w, needle, budget) => {
  const t0 = Date.now();
  while (Date.now() - t0 < budget) {
    if ((await text(w)).includes(needle)) return Date.now() - t0;
    await w.waitForTimeout(400);
  }
  return null;
};

(async () => {
  console.log(`target: ${BASE}\n`);
  const otp = String(100000 + Math.floor(Math.random() * 899999));
  const seed = '<div data-margin="96">'
    + '<p>ALPHA LINE.</p><p>BRAVO LINE.</p><p>CHARLIE LINE.</p><p>DELTA LINE.</p></div>';
  await fetch(`${API}/doc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp, fileId: FILE_ID, content: seed, authorNodeId: 'seed', seq: 1, committedAt: Date.now(), isSessionEnd: true }),
  });

  let app, browser;
  try {
    app = await electron.launch({
      executablePath: path.join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe'),
      args: [MAIN], cwd: DESKTOP, timeout: 120000,
      env: { ...process.env, DOCUSYNC_WS_PORT: '9414' },
    });
    const desk = await app.firstWindow({ timeout: 180000 });
    desk.setDefaultTimeout(90000);
    await desk.waitForLoadState('domcontentloaded');

    browser = await chromium.launch();
    const web = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    web.setDefaultTimeout(90000);

    await openEditor(desk, accts[0], otp);
    await openEditor(web, accts[1], otp);
    await desk.waitForTimeout(3500);

    // ── 1. Spam spaces on the desktop ─────────────────────────────────
    console.log('  --- 1. spamming spaces ---');
    // The web user parks a caret on the LAST line and then leaves it alone.
    await web.locator('.ProseMirror p').nth(3).click();
    await web.keyboard.press('End');
    await desk.waitForTimeout(4000);
    const caretBefore = (await carets(desk))[0];
    check(!!caretBefore, 'the desktop can see the web user’s caret',
      caretBefore ? `on "${caretBefore.words}"` : 'none');

    await desk.locator('.ProseMirror p').nth(0).click();
    await desk.keyboard.press('End');
    await desk.keyboard.type('   SPACED', { delay: 50 });
    await desk.keyboard.type('          ', { delay: 30 }); // ten more
    await desk.keyboard.type('END', { delay: 50 });

    const spacedSeen = await waitFor(web, 'SPACED', 25000);
    check(spacedSeen !== null, 'the spaced line reaches the web app',
      spacedSeen === null ? 'never' : `${spacedSeen}ms`);

    const deskLine = (await text(desk)).match(/ALPHA LINE\.[^A-Z]*SPACED\s*END/)?.[0] ?? '';
    const webLine = (await text(web)).match(/ALPHA LINE\.[^A-Z]*SPACED\s*END/)?.[0] ?? '';
    check(deskLine === webLine && deskLine.length > 0,
      'both sides show the same spacing, space for space',
      `desktop ${JSON.stringify(deskLine)} / web ${JSON.stringify(webLine)}`);

    await desk.waitForTimeout(3000);
    const caretAfterSpaces = (await carets(desk))[0];
    check(!!caretAfterSpaces, 'the other cursor is still visible after the spaces',
      caretAfterSpaces ? `on "${caretAfterSpaces.words}"` : 'DISAPPEARED');
    check(caretAfterSpaces && /DELTA LINE/.test(caretAfterSpaces.words),
      'it is still on the line its owner left it on',
      caretAfterSpaces ? `"${caretAfterSpaces.words}"` : 'n/a');

    // ── 2. Enter above someone else's caret ───────────────────────────
    console.log('\n  --- 2. pressing Enter above their caret ---');
    await desk.locator('.ProseMirror p').nth(0).click();
    await desk.keyboard.press('End');
    for (let i = 0; i < 3; i++) {
      await desk.keyboard.press('Enter');
      await desk.keyboard.type(`NEW LINE ${i + 1}`, { delay: 45 });
    }
    await desk.waitForTimeout(7000);

    const caretAfterEnters = (await carets(desk))[0];
    check(!!caretAfterEnters, 'the other cursor survives the new lines',
      caretAfterEnters ? `paragraph ${caretAfterEnters.index}, "${caretAfterEnters.words}"` : 'DISAPPEARED');
    check(caretAfterEnters && /DELTA LINE/.test(caretAfterEnters.words),
      'it is still attached to the same words, further down the page',
      caretAfterEnters ? `"${caretAfterEnters.words}"` : 'n/a');

    const newLinesSeen = await waitFor(web, 'NEW LINE 3', 25000);
    check(newLinesSeen !== null, 'the new lines reach the web app',
      newLinesSeen === null ? 'never' : `${newLinesSeen}ms`);

    // ── 3. Both typing at once, with spaces and new lines ─────────────
    console.log('\n  --- 3. both typing at once ---');
    const deskParas = await desk.evaluate(() => document.querySelectorAll('.ProseMirror p').length);
    await desk.locator('.ProseMirror p').nth(0).click();
    await desk.keyboard.press('End');
    await web.locator('.ProseMirror p').nth(Math.max(0, deskParas - 1)).click();
    await web.keyboard.press('End');

    await Promise.all([
      (async () => {
        await desk.keyboard.type('  DESK-A  ', { delay: 70 });
        await desk.keyboard.press('Enter');
        await desk.keyboard.type('DESK-B', { delay: 70 });
      })(),
      (async () => {
        await web.keyboard.type('  WEB-A  ', { delay: 70 });
        await web.keyboard.press('Enter');
        await web.keyboard.type('WEB-B', { delay: 70 });
      })(),
    ]);

    const [deskOnWeb, webOnDesk] = await Promise.all([
      waitFor(web, 'DESK-B', 30000),
      waitFor(desk, 'WEB-B', 30000),
    ]);
    console.log(`\n  desktop -> web: ${deskOnWeb === null ? 'never' : deskOnWeb + 'ms'}`);
    console.log(`  web -> desktop: ${webOnDesk === null ? 'never' : webOnDesk + 'ms'}\n`);

    check(deskOnWeb !== null && webOnDesk !== null, 'both sides’ work arrives');
    await desk.waitForTimeout(5000);

    const td = await text(desk), tw = await text(web);
    for (const [who, t] of [['desktop', td], ['web app', tw]]) {
      const all = ['DESK-A', 'DESK-B', 'WEB-A', 'WEB-B'].every((m) => t.includes(m));
      check(all, `the ${who} holds every piece typed on both sides`,
        ['DESK-A', 'DESK-B', 'WEB-A', 'WEB-B'].filter((m) => !t.includes(m)).join(', ') || 'all present');
      const dup = (t.match(/DESK-A/g) || []).length === 1 && (t.match(/WEB-A/g) || []).length === 1;
      check(dup, `on the ${who}, nothing is duplicated`);
    }

    const norm = (t) => t.replace(/\s+/g, ' ').trim();
    check(norm(td) === norm(tw), 'both platforms end on the same document',
      norm(td) === norm(tw) ? 'identical' : `desktop ${norm(td).length} chars vs web ${norm(tw).length}`);

    const finalCarets = await carets(desk);
    check(finalCarets.length > 0, 'the other cursor is still on screen at the end',
      finalCarets.length ? `on "${finalCarets[0].words}"` : 'DISAPPEARED');

    fs.mkdirSync(path.join(__dirname, 'ui-shots'), { recursive: true });
    await desk.screenshot({ path: path.join(__dirname, 'ui-shots', 'stress-desktop.png') });
    await web.screenshot({ path: path.join(__dirname, 'ui-shots', 'stress-web.png') });
  } catch (err) {
    check(false, 'the stress run completed', String(err.message || err).split('\n')[0]);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (app) await app.close().catch(() => {});
    const pass = results.filter((r) => r.ok).length;
    console.log(`\n  ${pass} passed, ${results.length - pass} failed`);
    if (results.length - pass) process.exitCode = 1;
  }
})();
