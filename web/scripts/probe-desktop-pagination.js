/**
 * Does the DESKTOP app paginate a long document, or does the text run on
 * without page breaks and overlap the paper?
 *
 * Launches the real Electron build — not a browser at the same size — logs
 * in to the live site the way the shipped app does, opens a document long
 * enough to need several pages, and measures the result.
 *
 * Run: node scripts/probe-desktop-pagination.js [baseUrl]
 */
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'https://docusync-dusky.vercel.app';
const API = `${BASE}/api/lobby`;
const DESKTOP = path.resolve(__dirname, '..', '..', 'desktop');
const MAIN = path.join(DESKTOP, 'dist-electron', 'main.js');
const acct = JSON.parse(fs.readFileSync(path.join(__dirname, 'live-accounts.json'), 'utf8'))[0];
const FILE_ID = '818282';

const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok, name });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

(async () => {
  console.log(`target: ${BASE}`);
  console.log(`electron main: ${MAIN}\n`);

  const otp = String(100000 + Math.floor(Math.random() * 899999));
  const paras = Array.from({ length: 70 }, (_, i) =>
    `<p>Paragraph ${i + 1}: the quick brown fox jumps over the lazy dog, repeatedly, so that the document is long enough to need more than one page.</p>`
  ).join('');
  await fetch(`${API}/doc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      otp, fileId: FILE_ID, content: `<div data-margin="96">${paras}</div>`,
      authorNodeId: 'seed', seq: 1, committedAt: Date.now(), isSessionEnd: true,
    }),
  });

  let app;
  try {
    app = await electron.launch({
      executablePath: path.join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe'),
      args: [MAIN],
      cwd: DESKTOP,
      timeout: 120000,
      env: { ...process.env, DOCUSYNC_WS_PORT: '9411' },
    });
  } catch (err) {
    check(false, 'the desktop app launched', String(err.message || err).split('\n')[0]);
    console.log(`\n  0 passed, 1 failed`);
    process.exitCode = 1;
    return;
  }

  try {
    // The engine opens SQLite and binds the peer port before the window is
    // created, which on a cold start takes a while.
    const win = await app.firstWindow({ timeout: 180000 });
    win.setDefaultTimeout(60000);
    await win.waitForLoadState('domcontentloaded');

    const url = win.url();
    check(/docusync-dusky\.vercel\.app/.test(url) || /localhost/.test(url),
      'it opened the hosted application', url.slice(0, 70));

    await win.waitForSelector('input[placeholder="Enter your username"]', { timeout: 60000 });
    await win.fill('input[placeholder="Enter your username"]', acct.email);
    await win.fill('input[placeholder="Enter your password"]', acct.password);
    await win.click('button:has-text("Log In")');
    await win.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), null, { timeout: 60000 });
    check(true, 'signed in inside the desktop window');

    await win.evaluate(({ otp, fileId }) => {
      const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
      const k = (n) => `ds_${u.id}_${n}`;
      localStorage.setItem(k('current_room'), JSON.stringify({ otp, name: 'Desktop Pagination' }));
      localStorage.setItem(k('files'), JSON.stringify([{ id: fileId, name: 'Long.docx' }]));
    }, { otp, fileId: FILE_ID });

    await win.goto(`${BASE}/app/editor/${FILE_ID}`, { waitUntil: 'domcontentloaded' });
    await win.waitForSelector('.ProseMirror', { timeout: 60000 });
    // The page-break measurement settles over a few animation frames.
    await win.waitForTimeout(8000);

    const layout = await win.evaluate(() => {
      const pm = document.querySelector('.ProseMirror');
      const rect = pm.getBoundingClientRect();
      // Page breaks are applied as top margin pushed onto the node that
      // starts each new page.
      const pushed = Array.from(pm.children).filter((el) => {
        const mt = parseFloat(getComputedStyle(el).marginTop || '0');
        return mt > 40;
      });
      // Does any block overlap the one before it?
      const boxes = Array.from(pm.children).map((el) => el.getBoundingClientRect());
      let overlaps = 0;
      for (let i = 1; i < boxes.length; i++) {
        if (boxes[i].top < boxes[i - 1].bottom - 1) overlaps++;
      }
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        pageBreaks: pushed.length,
        overlaps,
        // Where each page break falls, so the spacing can be checked.
        breakOffsets: pushed.map((el) => Math.round(el.getBoundingClientRect().top - rect.top)),
        blocks: pm.children.length,
      };
    });

    console.log(`\n  document: ${layout.blocks} blocks, ${layout.width}px wide, ${layout.height}px tall`);
    console.log(`  page breaks applied: ${layout.pageBreaks}`);
    console.log(`  overlapping blocks:  ${layout.overlaps}\n`);

    check(layout.pageBreaks > 0, 'the document is broken into pages',
      `${layout.pageBreaks} page break(s)`);
    check(layout.overlaps === 0, 'no block overlaps the one above it',
      `${layout.overlaps} overlap(s)`);
    // Breaks should fall roughly a page apart. A cosmetic check on the
    // paper's background colour used to sit here; it reported a failure over
    // a screenshot that plainly showed the paper, because the paper is
    // painted by an ancestor the check never looked at. Geometry is the part
    // that can be asserted, and it is the part that matters.
    const gaps = layout.breakOffsets.slice(1).map((o, i) => o - layout.breakOffsets[i]);
    const evenlySpaced = gaps.length === 0 || gaps.every((g) => g > 600 && g < 1600);
    check(evenlySpaced, 'the breaks fall about a page apart',
      gaps.length ? `gaps: ${gaps.join(', ')}px` : 'single break');

    fs.mkdirSync(path.join(__dirname, 'ui-shots'), { recursive: true });
    await win.screenshot({ path: path.join(__dirname, 'ui-shots', 'desktop-pagination.png') });
    // Further down the document, where a later page break would show.
    await win.evaluate(() => window.scrollTo(0, 1400));
    await win.waitForTimeout(1200);
    await win.screenshot({ path: path.join(__dirname, 'ui-shots', 'desktop-pagination-scrolled.png') });
  } catch (err) {
    check(false, 'the desktop pagination run completed', String(err.message || err).split('\n')[0]);
  } finally {
    await app.close().catch(() => {});
    const pass = results.filter((r) => r.ok).length;
    console.log(`\n  ${pass} passed, ${results.length - pass} failed`);
    if (results.length - pass) process.exitCode = 1;
  }
})();
