/**
 * Reported: the "Snapshot Content" comparison showed raw markup to the
 * reader — a highlighted `<p></p>` and a stray `div>` sitting in the page as
 * if they were words.
 *
 * The diff ran on the stored HTML as one string and wrapped each changed
 * token in <mark>. Word boundaries fall inside tags, so a structural change
 * cut one in half and the two pieces landed on opposite sides.
 *
 * This opens the real modal on a document edited the way the report showed
 * and checks that nothing in either panel reads as markup.
 *
 * Run: node scripts/probe-history-diff.js [baseUrl]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000';
const API = `${BASE}/api/lobby`;
const acct = JSON.parse(fs.readFileSync(path.join(__dirname, 'local-account.json'), 'utf8'))[0];
const FILE_ID = '515151';

const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok, name });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

const post = (p, b) => fetch(`${API}${p}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
}).then((r) => r.json());

(async () => {
  console.log(`target: ${BASE}\n`);
  const otp = String(100000 + Math.floor(Math.random() * 899999));

  // The document from the report: an italic line, a bold heading, several
  // paragraphs, then a later version that adds two paragraphs and leaves an
  // empty one behind — the shape that split a tag.
  const head =
    '<div data-margin="96">'
    + '<p style="text-align:center"><em>Ako si john benedict bajado</em></p>'
    + '<p><strong>Nakatira sa mabuhay</strong></p>'
    + '<p>At kagrupo ko sila</p><p>Paul, zyra, at palma</p><p>sa thesis</p><p>pepe</p>';
  const v1 = head + '</div>';
  const v2 = head + '<p></p><p>mahal kong pnc</p><p>tite</p></div>';

  await post('/doc', { otp, fileId: FILE_ID, content: v1, authorNodeId: 'web-A', seq: 1, committedAt: Date.now(), isSessionEnd: true });
  await post('/doc', { otp, fileId: FILE_ID, content: v2, authorNodeId: 'web-B', seq: 2, committedAt: Date.now() + 1, isSessionEnd: true, baseContent: v1 });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);

  try {
    await page.goto(`${BASE}/app/login`, { waitUntil: 'networkidle' });
    await page.fill('input[placeholder="Enter your username"]', acct.email);
    await page.fill('input[placeholder="Enter your password"]', acct.password);
    await page.click('button:has-text("Log In")');
    await page.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'));
    await page.evaluate(({ otp, fileId }) => {
      const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
      const k = (n) => `ds_${u.id}_${n}`;
      localStorage.setItem(k('current_room'), JSON.stringify({ otp, name: 'Diff Check' }));
      localStorage.setItem(k('files'), JSON.stringify([{ id: fileId, name: 'Chapter 3.docx' }]));
    }, { otp, fileId: FILE_ID });

    await page.goto(`${BASE}/app/history/${FILE_ID}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Open the oldest version's comparison — the one that differs from latest.
    const viewButtons = page.locator('button:has-text("View")');
    const count = await viewButtons.count();
    check(count >= 2, 'the version list has more than one version to compare', `${count} versions`);
    await viewButtons.last().click();
    await page.waitForSelector('text=Snapshot Content', { timeout: 20000 });
    await page.waitForTimeout(1200);

    const panels = await page.evaluate(() => {
      const marks = Array.from(document.querySelectorAll('mark')).map((m) => m.textContent || '');
      const prev = document.querySelectorAll('.tiptap')[0];
      const curr = document.querySelectorAll('.tiptap')[1];
      return {
        previous: (prev?.innerText || '').replace(/\s+/g, ' ').trim(),
        current: (curr?.innerText || '').replace(/\s+/g, ' ').trim(),
        marks,
        // Does the rebuilt markup still parse into the same blocks?
        currentBlocks: curr ? curr.querySelectorAll('p,h1,h2,h3,li').length : 0,
      };
    });

    console.log(`\n  previous: "${panels.previous.slice(0, 90)}"`);
    console.log(`  current : "${panels.current.slice(0, 90)}"`);
    console.log(`  highlighted: ${JSON.stringify(panels.marks)}\n`);

    // The defect, stated as the reader sees it: no tag may appear as text.
    const asText = `${panels.previous} ${panels.current}`;
    const leaks = asText.match(/<\/?\w+>|^\s*\w+>|\s\w+>/g) || [];
    check(leaks.length === 0, 'no markup is shown to the reader as text',
      leaks.length ? `found ${JSON.stringify(leaks.slice(0, 5))}` : 'none');

    check(!/[<>]/.test(panels.marks.join(' ')),
      'nothing highlighted is a tag',
      panels.marks.filter((m) => /[<>]/.test(m)).join(' | ') || 'none');

    // The added words must be the ones highlighted, and the rest left alone.
    check(panels.marks.some((m) => /mahal kong pnc/.test(m)) || /mahal kong pnc/.test(panels.current),
      'the added text appears on the current side');
    check(!/mahal kong pnc/.test(panels.previous),
      'the added text does not appear on the previous side');
    check(/Ako si john benedict bajado/.test(panels.previous) && /Ako si john benedict bajado/.test(panels.current),
      'unchanged paragraphs appear on both sides');
    check(panels.currentBlocks >= 6, 'the rebuilt page still has its paragraphs',
      `${panels.currentBlocks} blocks`);

    fs.mkdirSync(path.join(__dirname, 'ui-shots'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, 'ui-shots', 'history-diff.png') });
  } catch (err) {
    check(false, 'the comparison opened', String(err.message || err).split('\n')[0]);
  } finally {
    await browser.close();
    const pass = results.filter((r) => r.ok).length;
    console.log(`\n  ${pass} passed, ${results.length - pass} failed`);
    if (results.length - pass) process.exitCode = 1;
  }
})();
