/**
 * A peer who only RECEIVES a long document — they never type — must still see
 * it broken into pages.
 *
 * Content that arrives from someone else is applied with `emitUpdate: false`,
 * so the editor raises no update event, so the pagination loop was never told
 * to re-measure. The receiving device kept whatever page breaks its previous
 * text had, which on a freshly opened document is none: the text ran straight
 * past the bottom of the page. The typing device paginated fine, which is why
 * this only ever showed up on the other person's screen.
 *
 * Run: node scripts/probe-received-pagination.js [baseUrl]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000';
const API = `${BASE}/api/lobby`;
const accts = JSON.parse(fs.readFileSync(path.join(__dirname, 'local-account.json'), 'utf8'));
const FILE_ID = '919292';

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
    localStorage.setItem(k('current_room'), JSON.stringify({ otp, name: 'Received Pagination' }));
    localStorage.setItem(k('files'), JSON.stringify([{ id: fileId, name: 'Long.docx' }]));
  }, { otp, fileId: FILE_ID });
  await page.goto(`${BASE}/app/editor/${FILE_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ProseMirror', { timeout: 45000 });
}

const layout = (page) => page.evaluate(() => {
  const pm = document.querySelector('.ProseMirror');
  const rect = pm.getBoundingClientRect();
  const pushed = Array.from(pm.children).filter((el) => parseFloat(getComputedStyle(el).marginTop || '0') > 40);
  const boxes = Array.from(pm.children).map((el) => el.getBoundingClientRect());
  let overlaps = 0;
  for (let i = 1; i < boxes.length; i++) if (boxes[i].top < boxes[i - 1].bottom - 1) overlaps++;
  return { blocks: pm.children.length, height: Math.round(rect.height), pageBreaks: pushed.length, overlaps };
});

(async () => {
  console.log(`target: ${BASE}\n`);
  const otp = String(100000 + Math.floor(Math.random() * 899999));
  await fetch(`${API}/doc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      otp, fileId: FILE_ID, content: '<div data-margin="96"><p>Short.</p></div>',
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

    const before = await layout(b);
    check(before.pageBreaks === 0, 'the receiver starts on a single short page',
      `${before.blocks} block(s)`);

    // The other device gets a long document. B never touches the keyboard.
    const paras = Array.from({ length: 70 }, (_, i) =>
      `<p>Paragraph ${i + 1}: the quick brown fox jumps over the lazy dog, repeatedly, so the document needs several pages.</p>`
    ).join('');
    await a.evaluate(async ({ otp, fileId, html }) => {
      await fetch('/api/lobby/doc', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp, fileId, content: html, authorNodeId: 'web-paul', seq: 2, committedAt: Date.now(), isSessionEnd: true }),
      });
    }, { otp, fileId: FILE_ID, html: `<div data-margin="96">${paras}</div>` });

    // Wait for it to arrive on the receiving side.
    let arrived = false;
    for (let i = 0; i < 30; i++) {
      const l = await layout(b);
      if (l.blocks > 10) { arrived = true; break; }
      await b.waitForTimeout(700);
    }
    check(arrived, 'the long document reached the receiving device');
    await b.waitForTimeout(5000);

    const after = await layout(b);
    console.log(`\n  receiver: ${after.blocks} blocks, ${after.height}px tall, `
      + `${after.pageBreaks} page break(s), ${after.overlaps} overlap(s)\n`);

    check(after.pageBreaks > 0,
      'the received document is broken into pages on the device that did not type',
      `${after.pageBreaks} page break(s)`);
    check(after.overlaps === 0, 'no block overlaps the one above it',
      `${after.overlaps} overlap(s)`);

    fs.mkdirSync(path.join(__dirname, 'ui-shots'), { recursive: true });
    await b.screenshot({ path: path.join(__dirname, 'ui-shots', 'received-pagination.png') });
  } catch (err) {
    check(false, 'the received-pagination run completed', String(err.message || err).split('\n')[0]);
  } finally {
    await browser.close();
    const pass = results.filter((r) => r.ok).length;
    console.log(`  ${pass} passed, ${results.length - pass} failed`);
    if (results.length - pass) process.exitCode = 1;
  }
})();
