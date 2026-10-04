/**
 * Two people type in the same document at the same time, through the real
 * editor. Checks that the divergence is reported — and reported ONCE, not
 * once per poll tick, which is what filled the history page with a column
 * of merge notifications that all looked the same.
 *
 * Run: node scripts/probe-conflict-once.js [baseUrl]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000';
const API = `${BASE}/api/lobby`;
const accts = JSON.parse(fs.readFileSync(path.join(__dirname, 'local-account.json'), 'utf8'));
const FILE_ID = '818181';

const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok, name });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

async function login(p, acct, otp) {
  await p.goto(`${BASE}/app/login`, { waitUntil: 'networkidle' });
  await p.fill('input[placeholder="Enter your username"]', acct.email);
  await p.fill('input[placeholder="Enter your password"]', acct.password);
  await p.click('button:has-text("Log In")');
  await p.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), null, { timeout: 45000 });
  await p.evaluate(({ otp, fileId }) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    const k = (n) => `ds_${u.id}_${n}`;
    localStorage.setItem(k('current_room'), JSON.stringify({ otp, name: 'Conflict Check' }));
    localStorage.setItem(k('files'), JSON.stringify([{ id: fileId, name: 'Chapter 3.docx' }]));
  }, { otp, fileId: FILE_ID });
}

(async () => {
  const otp = String(100000 + Math.floor(Math.random() * 899999));
  const base = '<div data-margin="96"><p>LINE A.</p><p>LINE B.</p><p>LINE C.</p></div>';
  await fetch(`${API}/doc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp, fileId: FILE_ID, content: base, authorNodeId: 'seed', seq: 1, committedAt: Date.now(), isSessionEnd: true }),
  });
  console.log(`  room ${otp}\n`);

  const browser = await chromium.launch();
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const a = await ctxA.newPage(), b = await ctxB.newPage();
  for (const p of [a, b]) { p.setDefaultTimeout(45000); }

  try {
    await login(a, accts[0], otp);
    await login(b, accts[1], otp);
    for (const p of [a, b]) {
      await p.goto(`${BASE}/app/editor/${FILE_ID}`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('.ProseMirror', { timeout: 45000 });
    }
    await a.waitForTimeout(2000);

    // Both type at once, on different lines, and keep typing — the state
    // that made the old code re-file the same conflict on every tick.
    // Same line, both of them — a real disagreement, not two edits that
    // happen to merge cleanly.
    await a.locator('.ProseMirror p').nth(1).click();
    await a.keyboard.press('End');
    await b.locator('.ProseMirror p').nth(1).click();
    await b.keyboard.press('End');
    await Promise.all([
      a.keyboard.type(' PAUL WAS TYPING HERE FOR A WHILE', { delay: 120 }),
      b.keyboard.type(' ZYRA WAS TYPING HERE TOO', { delay: 120 }),
    ]);
    await a.waitForTimeout(9000);

    const stored = await fetch(`${API}/conflicts?otp=${otp}`).then((r) => r.json());
    const mine = (stored.conflicts || []).filter((c) => String(c.fileId) === FILE_ID);
    check(mine.length <= 1, 'a divergence is reported at most once, never once per poll tick',
      `${mine.length} open conflict record${mine.length === 1 ? '' : 's'}`);

    const h = await fetch(`${API}/history?otp=${otp}&fileId=${FILE_ID}`).then((r) => r.json());
    const entries = h?.data?.entries || [];
    const plain = (e) => (e.fullContent || '').replace(/<[^>]+>/g, ' ');

    const bodies = new Set(entries.map((e) => e.fullContent));
    check(entries.length === bodies.size,
      'no two history versions hold identical content',
      `${entries.length} versions, ${bodies.size} distinct`);
    check(entries.every((e) => typeof e.seqNo === 'number'),
      'every version carries the server’s own ordering');

    // Two people editing the same line is arbitrated by Last-Write-Wins, so
    // one of the two texts becomes the current document. What this run can
    // establish is that the arbitration is LOGGED rather than silent; which
    // of the two browsers wins the race is timing, so the recoverability of
    // the losing text is asserted deterministically against the API instead
    // (see probe-history-spam.js, "the version that lost ... is still in the
    // log"). This run also surfaces a separate, pre-existing limitation: two
    // people typing into the SAME line at the same moment can have one side
    // resolved away in the client's own signature merge, before the server
    // ever arbitrates, so only one of them reaches the log at all.
    check(entries.some((e) => e.eventType === 'conflict-resolve'),
      'the same-line conflict is logged as a conflict',
      entries.map((e) => e.eventType).join(', '));

    entries.forEach((e) => console.log('      seq=' + e.seqNo, String(e.eventType).padEnd(17),
      'by', String(e.nodeId).padEnd(12), '::', plain(e).replace(/\s+/g, ' ').trim().slice(0, 95)));

    const authors = new Set(entries.map((e) => e.nodeId).filter((n) => n !== 'seed'));
    console.log(`      peers that reached the log: ${authors.size} (${[...authors].join(', ')})`);

    fs.mkdirSync(path.join(__dirname, 'ui-shots'), { recursive: true });
    await a.goto(`${BASE}/app/history/${FILE_ID}`, { waitUntil: 'networkidle' });
    await a.waitForTimeout(3000);
    await a.screenshot({ path: path.join(__dirname, 'ui-shots', 'history-after-conflict.png'), fullPage: true });
  } catch (e) {
    check(false, 'the two-editor run completed', e.message?.split('\n')[0]);
  } finally {
    await browser.close();
    const pass = results.filter((r) => r.ok).length;
    console.log(`\n  ${pass} passed, ${results.length - pass} failed`);
    if (results.length - pass) process.exitCode = 1;
  }
})();
