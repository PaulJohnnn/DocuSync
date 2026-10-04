/**
 * Reported: when two people type at the same time, each other's text arrives
 * late, or not at all until somebody stops.
 *
 * The push was debounced on the typist going idle, and every keystroke
 * restarted that timer — so a continuous writer sent nothing. The poll was
 * skipped for the same reason, so they received nothing either. Both halves
 * lasted as long as the typing did.
 *
 * Here both browsers type for several seconds WITHOUT pausing, on different
 * lines, and the clock starts when they stop. What matters is how long after
 * that each side can see the other's words, and that nothing is lost.
 *
 * Run: node scripts/probe-simultaneous-typing.js [baseUrl]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000';
const API = `${BASE}/api/lobby`;
const accts = JSON.parse(fs.readFileSync(path.join(__dirname, 'local-account.json'), 'utf8'));
const FILE_ID = '636363';

const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok, name });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

async function openEditor(page, acct, otp) {
  await page.goto(`${BASE}/app/login`, { waitUntil: 'networkidle' });
  await page.fill('input[placeholder="Enter your username"]', acct.email);
  await page.fill('input[placeholder="Enter your password"]', acct.password);
  await page.click('button:has-text("Log In")');
  await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), null, { timeout: 45000 });
  await page.evaluate(({ otp, fileId }) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    const k = (n) => `ds_${u.id}_${n}`;
    localStorage.setItem(k('current_room'), JSON.stringify({ otp, name: 'Typing Check' }));
    localStorage.setItem(k('files'), JSON.stringify([{ id: fileId, name: 'Chapter 3.docx' }]));
  }, { otp, fileId: FILE_ID });
  await page.goto(`${BASE}/app/editor/${FILE_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ProseMirror', { timeout: 45000 });
}

const text = (page) => page.evaluate(() => document.querySelector('.ProseMirror')?.innerText || '');

/** How long until `needle` shows up, or null if it never does. */
async function waitFor(page, needle, budgetMs) {
  const started = Date.now();
  while (Date.now() - started < budgetMs) {
    if ((await text(page)).includes(needle)) return Date.now() - started;
    await page.waitForTimeout(400);
  }
  return null;
}

(async () => {
  console.log(`target: ${BASE}\n`);
  const otp = String(100000 + Math.floor(Math.random() * 899999));
  const seed = '<div data-margin="96">'
    + '<p>LINE FOR PAUL:</p>'
    + '<p>LINE FOR ZYRA:</p></div>';
  await fetch(`${API}/doc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp, fileId: FILE_ID, content: seed, authorNodeId: 'seed', seq: 1, committedAt: Date.now(), isSessionEnd: true }),
  });

  const browser = await chromium.launch();
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const a = await ctxA.newPage(), b = await ctxB.newPage();
  for (const p of [a, b]) p.setDefaultTimeout(45000);

  try {
    await openEditor(a, accts[0], otp);
    await openEditor(b, accts[1], otp);
    await a.waitForTimeout(2500);

    await a.locator('.ProseMirror p').nth(0).click();
    await a.keyboard.press('End');
    await b.locator('.ProseMirror p').nth(1).click();
    await b.keyboard.press('End');

    // Both type continuously for roughly six seconds. No pauses: this is the
    // state in which the old code sent and received nothing at all.
    const PAUL = ' paul is writing a long sentence without stopping at all';
    const ZYRA = ' zyra is also writing a long sentence without stopping';
    await Promise.all([
      a.keyboard.type(PAUL, { delay: 110 }),
      b.keyboard.type(ZYRA, { delay: 110 }),
    ]);

    // The clock starts the moment both stop.
    const [paulSeenByZyra, zyraSeenByPaul] = await Promise.all([
      waitFor(b, 'paul is writing', 25000),
      waitFor(a, 'zyra is also writing', 25000),
    ]);

    console.log(`\n  Paul's text reached Zyra in: ${paulSeenByZyra === null ? 'never' : paulSeenByZyra + 'ms'}`);
    console.log(`  Zyra's text reached Paul in: ${zyraSeenByPaul === null ? 'never' : zyraSeenByPaul + 'ms'}\n`);

    check(paulSeenByZyra !== null, 'Paul’s text reaches Zyra');
    check(zyraSeenByPaul !== null, 'Zyra’s text reaches Paul');
    check(paulSeenByZyra !== null && paulSeenByZyra < 8000,
      'it arrives within a few seconds of the typing stopping',
      paulSeenByZyra === null ? 'never arrived' : `${paulSeenByZyra}ms`);

    // Neither person's words may be lost on either screen.
    await a.waitForTimeout(4000);
    const [ta, tb] = [await text(a), await text(b)];
    check(/paul is writing/.test(ta) && /zyra is also writing/.test(ta),
      'Paul’s screen holds both people’s sentences',
      ta.replace(/\n+/g, ' | ').slice(0, 120));
    check(/paul is writing/.test(tb) && /zyra is also writing/.test(tb),
      'Zyra’s screen holds both people’s sentences',
      tb.replace(/\n+/g, ' | ').slice(0, 120));

    // The offline banner must not have appeared: the network was fine.
    for (const [name, page] of [['Paul', a], ['Zyra', b]]) {
      const body = await page.evaluate(() => document.body.innerText);
      check(!/\[Offline Edit appended by/i.test(body),
        `${name} was not given a spurious offline-merge page`);
    }

    fs.mkdirSync(path.join(__dirname, 'ui-shots'), { recursive: true });
    await a.screenshot({ path: path.join(__dirname, 'ui-shots', 'simultaneous-typing.png') });
  } catch (err) {
    check(false, 'the simultaneous-typing run completed', String(err.message || err).split('\n')[0]);
  } finally {
    await browser.close();
    const pass = results.filter((r) => r.ok).length;
    console.log(`\n  ${pass} passed, ${results.length - pass} failed`);
    if (results.length - pass) process.exitCode = 1;
  }
})();
