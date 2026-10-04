/**
 * Reported: another person's cursor moves on its own. Nobody touches their
 * keyboard, you type somewhere else, and their caret wanders off.
 *
 * Each peer publishes an ABSOLUTE position measured in its own copy of the
 * document. The moment anyone types, those numbers stop describing anyone
 * else's copy — insert a word above someone's caret and their reported
 * position now points several characters earlier than where they are. The
 * decorations were rebuilt from the reported numbers on every poll, so an
 * idle peer's caret jumped every time somebody else typed.
 *
 * Two real browsers: B places its caret in a known paragraph and then does
 * nothing at all. A types in an earlier paragraph. B's caret, as A sees it,
 * must stay in the paragraph B put it in.
 *
 * Run: node scripts/probe-cursor-stability.js [baseUrl]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000';
const API = `${BASE}/api/lobby`;
const accts = JSON.parse(fs.readFileSync(path.join(__dirname, 'local-account.json'), 'utf8'));
const FILE_ID = '424242';

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
    localStorage.setItem(k('current_room'), JSON.stringify({ otp, name: 'Cursor Check' }));
    localStorage.setItem(k('files'), JSON.stringify([{ id: fileId, name: 'Chapter 3.docx' }]));
  }, { otp, fileId: FILE_ID });
  await page.goto(`${BASE}/app/editor/${FILE_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ProseMirror', { timeout: 45000 });
}

/** Which paragraph each remote caret is sitting in, as this browser draws it. */
const caretParagraphs = (page) => page.evaluate(() => {
  const paras = Array.from(document.querySelectorAll('.ProseMirror > p, .ProseMirror > div > p'));
  return Array.from(document.querySelectorAll('.collaboration-cursor__caret')).map((caret) => {
    const owner = paras.findIndex((p) => p.contains(caret));
    return { paragraph: owner, text: (paras[owner]?.innerText || '').slice(0, 40) };
  });
});

(async () => {
  console.log(`target: ${BASE}\n`);
  const otp = String(100000 + Math.floor(Math.random() * 899999));
  const seed = '<div data-margin="96">'
    + '<p>PARAGRAPH ONE where Paul will type.</p>'
    + '<p>PARAGRAPH TWO which nobody touches.</p>'
    + '<p>PARAGRAPH THREE where Zyra leaves her caret.</p></div>';
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

    // B puts its caret in the LAST paragraph, then stops touching anything.
    await b.locator('.ProseMirror p').nth(2).click();
    await b.keyboard.press('End');
    await a.waitForTimeout(4000);

    const before = await caretParagraphs(a);
    check(before.length > 0, 'Paul can see Zyra’s caret', JSON.stringify(before));
    const startedIn = before[0]?.paragraph;
    check(startedIn === 2, 'it starts in the paragraph Zyra clicked',
      `paragraph ${startedIn}: "${before[0]?.text}"`);

    // A types in the FIRST paragraph. B does nothing — no clicks, no keys.
    await a.locator('.ProseMirror p').nth(0).click();
    await a.keyboard.press('Home');
    // Enough text, and enough new paragraphs, that a caret replayed at its
    // old ABSOLUTE offset lands in a visibly different paragraph. A few
    // characters would shift the number without moving the caret across a
    // boundary, and the test would pass while the defect was still there.
    for (let i = 1; i <= 3; i++) {
      await a.keyboard.type(`INSERTED PARAGRAPH ${i} BY PAUL AT THE VERY START OF THE DOCUMENT.`, { delay: 15 });
      await a.keyboard.press('Enter');
    }
    await a.waitForTimeout(12000);

    const after = await caretParagraphs(a);
    check(after.length > 0, 'the caret is still drawn after Paul types',
      JSON.stringify(after));
    // Three paragraphs were inserted above, so the caret must have moved
    // down with its text — from index 2 to index 5 — and must still be in
    // the paragraph whose words Zyra clicked into.
    check(/PARAGRAPH THREE/.test(after[0]?.text || ''),
      'an idle peer’s caret stays in the paragraph they left it in',
      `now paragraph ${after[0]?.paragraph}: "${after[0]?.text}"`);

    // And B really did nothing: its own document still shows Paul's text,
    // so the two were genuinely connected rather than isolated.
    const bText = await b.evaluate(() => document.querySelector('.ProseMirror')?.innerText || '');
    check(/INSERTED PARAGRAPH 3 BY PAUL/.test(bText), 'the two browsers were actually in sync');

    fs.mkdirSync(path.join(__dirname, 'ui-shots'), { recursive: true });
    await a.screenshot({ path: path.join(__dirname, 'ui-shots', 'cursor-stability.png') });
  } catch (err) {
    check(false, 'the two-browser cursor run completed', String(err.message || err).split('\n')[0]);
  } finally {
    await browser.close();
    const pass = results.filter((r) => r.ok).length;
    console.log(`\n  ${pass} passed, ${results.length - pass} failed`);
    if (results.length - pass) process.exitCode = 1;
  }
})();
