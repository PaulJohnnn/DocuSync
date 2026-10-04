/**
 * Two reports from the same root:
 *
 *  - "when I type multiple spaces the other app doesn't show the same spacing"
 *  - "the page shakes while typing, and the other cursor disappears"
 *
 * Runs of spaces were lost because the editor parses incoming HTML with
 * ProseMirror's default whitespace handling, which collapses them the way a
 * browser renders HTML. And the whole document was being rebuilt whenever the
 * stored markup differed from the editor's own serialisation of it — which is
 * constantly, over details no reader can see — and each rebuild re-measures
 * the page breaks and re-creates the cursor decorations.
 *
 * Run: node scripts/probe-spacing-and-churn.js [baseUrl]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000';
const API = `${BASE}/api/lobby`;
const accts = JSON.parse(fs.readFileSync(path.join(__dirname, 'local-account.json'), 'utf8'));
const FILE_ID = '545454';

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
    localStorage.setItem(k('current_room'), JSON.stringify({ otp, name: 'Spacing Check' }));
    localStorage.setItem(k('files'), JSON.stringify([{ id: fileId, name: 'Chapter 3.docx' }]));
  }, { otp, fileId: FILE_ID });
  await page.goto(`${BASE}/app/editor/${FILE_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ProseMirror', { timeout: 45000 });
}

/** The first paragraph's text, spaces and all. */
const firstLine = (p) => p.evaluate(() =>
  document.querySelector('.ProseMirror p')?.textContent ?? '');

(async () => {
  console.log(`target: ${BASE}\n`);
  const otp = String(100000 + Math.floor(Math.random() * 899999));
  await fetch(`${API}/doc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      otp, fileId: FILE_ID,
      content: '<div data-margin="96"><p>START</p><p>SECOND LINE.</p></div>',
      authorNodeId: 'seed', seq: 1, committedAt: Date.now(), isSessionEnd: true,
    }),
  });

  const browser = await chromium.launch();
  const a = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  const b = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  for (const p of [a, b]) p.setDefaultTimeout(45000);

  try {
    await openEditor(a, accts[0], otp);
    await openEditor(b, accts[1], otp);
    await a.waitForTimeout(2500);

    // Count how often the receiving side rebuilds its whole document. Each
    // rebuild throws away and re-creates every node, which is what makes the
    // page jump and the remote caret blink out.
    await b.evaluate(() => {
      window.__rebuilds = 0;
      const pm = document.querySelector('.ProseMirror');
      new MutationObserver((records) => {
        for (const r of records) {
          // A rebuild replaces the top-level children wholesale.
          if (r.type === 'childList' && r.removedNodes.length > 2) window.__rebuilds++;
        }
      }).observe(pm, { childList: true });
    });

    // A line with runs of spaces in it, typed on A.
    await a.locator('.ProseMirror p').nth(0).click();
    await a.keyboard.press('End');
    await a.keyboard.type('   THREE SPACES BEFORE AND     FIVE HERE', { delay: 60 });

    // Wait for it on B.
    let seen = null;
    for (let i = 0; i < 40; i++) {
      const t = await firstLine(b);
      if (t.includes('THREE SPACES BEFORE')) { seen = t; break; }
      await b.waitForTimeout(500);
    }
    check(seen !== null, 'the line reached the other device');

    const sent = await firstLine(a);
    console.log(`\n  sender  : ${JSON.stringify(sent)}`);
    console.log(`  receiver: ${JSON.stringify(seen)}\n`);

    check(seen === sent, 'the receiving device shows exactly the same spacing',
      seen === sent ? 'identical' : 'spacing differs');
    check((seen || '').includes('AND     FIVE'),
      'a run of five spaces survives the trip',
      JSON.stringify((seen || '').slice(-28)));

    // Idle for a while with nobody typing. A document that nobody is changing
    // should not be rebuilt at all.
    await b.evaluate(() => { window.__rebuilds = 0; });
    await b.waitForTimeout(9000);
    const idleRebuilds = await b.evaluate(() => window.__rebuilds);
    console.log(`  full-document rebuilds while idle (9s): ${idleRebuilds}\n`);
    check(idleRebuilds === 0, 'an untouched document is not rebuilt while idle',
      `${idleRebuilds} rebuild(s)`);

    // The other person's caret must still be on screen after all that.
    await a.locator('.ProseMirror p').nth(1).click();
    await a.keyboard.press('End');
    await b.waitForTimeout(4000);
    const caretsOnB = await b.evaluate(() =>
      document.querySelectorAll('.collaboration-cursor__caret').length);
    check(caretsOnB > 0, 'the other person’s caret is still shown', `${caretsOnB} caret(s)`);

    fs.mkdirSync(path.join(__dirname, 'ui-shots'), { recursive: true });
    await b.screenshot({ path: path.join(__dirname, 'ui-shots', 'spacing-receiver.png') });
  } catch (err) {
    check(false, 'the spacing run completed', String(err.message || err).split('\n')[0]);
  } finally {
    await browser.close();
    const pass = results.filter((r) => r.ok).length;
    console.log(`\n  ${pass} passed, ${results.length - pass} failed`);
    if (results.length - pass) process.exitCode = 1;
  }
})();
