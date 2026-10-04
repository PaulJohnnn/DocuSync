/**
 * Opens the real Document History page on a room that has been driven into
 * exactly the state the bug reports showed: two people handing a document
 * back and forth, and one divergence the editor re-filed on every poll tick.
 *
 * Screenshots land in scripts/ui-shots/history-*.png.
 *
 * Run: node scripts/probe-history-ui.js [baseUrl]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000';
const API = `${BASE}/api/lobby`;
const acct = JSON.parse(fs.readFileSync(path.join(__dirname, 'local-account.json'), 'utf8'))[0];

const post = (p, b) => fetch(`${API}${p}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
}).then((r) => r.json());

const FILE_ID = '909090';
const page1 = (a, b) => `<div data-margin="96"><p>${a}</p><p>${b}</p></div>`;

(async () => {
  const otp = String(100000 + Math.floor(Math.random() * 899999));
  const base = page1('PARA ONE.', 'PARA TWO.');

  // A room two people worked in: a seed, then six exchanges of the same two
  // states, then a genuine three-way merge from a device whose clock is behind.
  await post('/doc', { otp, fileId: FILE_ID, content: base, authorNodeId: 'web-2032', seq: 1, committedAt: Date.now(), isSessionEnd: true });
  const A = page1('PARA ONE BY PAUL.', 'PARA TWO.');
  const B = page1('PARA ONE BY PAUL.', 'PARA TWO BY ZYRA.');
  for (let i = 0; i < 6; i++) {
    await post('/doc', { otp, fileId: FILE_ID, content: A, authorNodeId: 'web-2032', seq: 1, committedAt: Date.now(), isSessionEnd: true });
    await post('/doc', { otp, fileId: FILE_ID, content: B, authorNodeId: 'web-2157', seq: 1, committedAt: Date.now(), isSessionEnd: true });
  }
  await post('/doc', {
    otp, fileId: FILE_ID, content: page1('PARA ONE BY PAUL.', 'PARA TWO BY ZYRA, LATER.'),
    authorNodeId: 'web-2157', seq: 1, committedAt: Date.now() - 90000, isSessionEnd: true, baseContent: B,
  });

  // One divergence, re-filed per tick as the local draft grew — the stack of
  // identical-looking merge notifications in the report.
  const typed = 'zyra';
  for (let i = 1; i <= 5; i++) {
    await post('/conflicts', {
      otp, conflictId: `drift-${i}`, fileId: FILE_ID,
      localContent: page1('PARA ONE BY PAUL.', `PARA TWO ${typed.slice(0, i)}`),
      serverContent: B, mergedContent: B, timestamp: Date.now(),
    });
  }

  const hist = await fetch(`${API}/history?otp=${otp}&fileId=${FILE_ID}`).then((r) => r.json());
  const conf = await fetch(`${API}/conflicts?otp=${otp}`).then((r) => r.json());
  console.log(`  room ${otp}`);
  console.log(`  history entries stored: ${hist.data.entries.length}  (13 saves of 3 states + 1 merge)`);
  console.log(`  conflicts stored:       ${conf.conflicts.length}  (5 filings of 1 divergence)`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(45000);

  await p.goto(`${BASE}/app/login`, { waitUntil: 'networkidle' });
  await p.fill('input[placeholder="Enter your username"]', acct.email);
  await p.fill('input[placeholder="Enter your password"]', acct.password);
  await p.click('button:has-text("Log In")');
  await p.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'));

  // Join the room this device, and point its local state at the file.
  await p.evaluate(({ otp, fileId, conflicts }) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    const k = (n) => `ds_${u.id}_${n}`;
    localStorage.setItem(k('current_room'), JSON.stringify({ otp, name: 'History Check' }));
    localStorage.setItem(k('files'), JSON.stringify([{ id: fileId, name: 'Chapter 3.docx' }]));
    localStorage.setItem(k('docusync_web_conflicts'), JSON.stringify(conflicts));
  }, { otp, fileId: FILE_ID, conflicts: conf.conflicts });

  await p.goto(`${BASE}/app/history/${FILE_ID}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3500);

  const out = path.join(__dirname, 'ui-shots');
  fs.mkdirSync(out, { recursive: true });
  await p.screenshot({ path: path.join(out, 'history-top.png') });
  await p.screenshot({ path: path.join(out, 'history-full.png'), fullPage: true });

  const shown = await p.evaluate(() => ({
    versions: document.body.innerText.match(/\bv\d+\b/g) || [],
    conflictCards: document.querySelectorAll('article').length,
    header: (document.body.innerText.match(/\d+ events?/) || [''])[0],
    times: Array.from(document.body.innerText.matchAll(/(\d{2}:\d{2} [AP]M)/g)).map((m) => m[1]),
  }));
  console.log(`\n  page shows: ${shown.header}`);
  console.log(`  version rows:   ${shown.versions.join(', ') || '(none)'}`);
  console.log(`  conflict cards: ${shown.conflictCards}`);
  console.log(`  times:          ${shown.times.join(', ')}`);

  await browser.close();
})();
