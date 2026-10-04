/**
 * Reported: "the time of the version history to all devices are not same
 * and the position is not right".
 *
 * Two independent devices open the same document's history on the live site
 * and are compared row by row: same versions, same order, same times.
 *
 * Run: node scripts/probe-history-agreement.js [baseUrl]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'https://docusync-dusky.vercel.app';
const API = `${BASE}/api/lobby`;
const file = BASE.includes('localhost') ? 'qa-accounts.json' : 'live-accounts.json';
const accounts = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
const U = Object.fromEntries(accounts.map((a) => [a.id, a]));
const FILE_ID = '606060';

const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok, name });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

const post = (p, b) => fetch(`${API}${p}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
}).then((r) => r.json());

async function openHistory(p, acct, otp) {
  await p.goto(`${BASE}/app/login`, { waitUntil: 'networkidle' });
  await p.waitForSelector('input[placeholder="Enter your username"]', { timeout: 60000 });
  await p.fill('input[placeholder="Enter your username"]', acct.email);
  await p.fill('input[placeholder="Enter your password"]', acct.password);
  await p.click('button:has-text("Log In")');
  await p.waitForFunction(() => !!sessionStorage.getItem('docusync_auth_user'), null, { timeout: 60000 });
  await p.evaluate(({ otp, fileId }) => {
    const u = JSON.parse(sessionStorage.getItem('docusync_auth_user'));
    const k = (n) => `ds_${u.id}_${n}`;
    localStorage.setItem(k('current_room'), JSON.stringify({ otp, name: 'History Agreement' }));
    localStorage.setItem(k('files'), JSON.stringify([{ id: fileId, name: 'Chapter 3.docx' }]));
  }, { otp, fileId: FILE_ID });
  await p.goto(`${BASE}/app/history/${FILE_ID}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3500);
}

// What the reader sees, in the order the page lists it.
const readRows = (p) => p.evaluate(() =>
  Array.from(document.querySelectorAll('.ds-card'))
    .map((el) => el.innerText)
    .filter((t) => /^v\d+/.test(t.trim()))
    .map((t) => {
      const line = t.replace(/\s+/g, ' ').trim();
      const version = (line.match(/^v\d+/) || [''])[0];
      const time = (line.match(/\d{1,2}:\d{2}\s?[AP]M/i) || [''])[0];
      const author = (line.match(/Modified by:\s*(\S+)/) || ['', ''])[1];
      return { version, time, author };
    }));

(async () => {
  console.log(`target: ${BASE}\n`);
  const otp = String(100000 + Math.floor(Math.random() * 899999));
  const base = '<div data-margin="96"><p>LINE A.</p><p>LINE B.</p></div>';
  await post('/doc', { otp, fileId: FILE_ID, content: base, authorNodeId: 'seed', seq: 1, committedAt: Date.now(), isSessionEnd: true });

  const t = Date.now();
  // Paul's laptop is on time; Zyra's is 90 seconds behind. Both branch from
  // the same base and touch the same line, so Last-Write-Wins decides it.
  await post('/doc', { otp, fileId: FILE_ID, content: '<div data-margin="96"><p>LINE A.</p><p>LINE B. PAUL</p></div>', authorNodeId: 'web-paul', seq: 1, committedAt: t, isSessionEnd: true, baseContent: base });
  await post('/doc', { otp, fileId: FILE_ID, content: '<div data-margin="96"><p>LINE A.</p><p>LINE B. ZYRA</p></div>', authorNodeId: 'web-zyra', seq: 1, committedAt: t - 90000, isSessionEnd: true, baseContent: base });

  const browser = await chromium.launch();
  const devA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const devB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const a = await devA.newPage(), b = await devB.newPage();
  for (const p of [a, b]) { p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000); }

  try {
    await openHistory(a, U.A, otp);
    await openHistory(b, U.B, otp);

    const rowsA = await readRows(a);
    const rowsB = await readRows(b);
    console.log(`  device A: ${rowsA.map((r) => `${r.version} ${r.time}`).join(' | ')}`);
    console.log(`  device B: ${rowsB.map((r) => `${r.version} ${r.time}`).join(' | ')}\n`);

    check(rowsA.length > 0 && rowsA.length === rowsB.length,
      'both devices list the same number of versions', `${rowsA.length} vs ${rowsB.length}`);
    check(JSON.stringify(rowsA.map((r) => r.version)) === JSON.stringify(rowsB.map((r) => r.version)),
      'both devices list them in the same order');
    check(JSON.stringify(rowsA.map((r) => r.time)) === JSON.stringify(rowsB.map((r) => r.time)),
      'both devices show the same time for each version');
    check(JSON.stringify(rowsA.map((r) => r.author)) === JSON.stringify(rowsB.map((r) => r.author)),
      'both devices attribute each version to the same author');

    const bodyA = await a.evaluate(() => document.body.innerText);
    check(/Conflict resolved/.test(bodyA), 'the conflict is shown as a conflict');
    const versions = (bodyA.match(/\bv\d+\b/g) || []);
    check(new Set(versions).size === versions.length,
      'no version number appears twice', versions.join(', '));

    fs.mkdirSync(path.join(__dirname, 'ui-shots'), { recursive: true });
    await a.screenshot({ path: path.join(__dirname, 'ui-shots', 'history-live-A.png'), fullPage: true });
    await b.screenshot({ path: path.join(__dirname, 'ui-shots', 'history-live-B.png'), fullPage: true });
  } catch (e) {
    check(false, 'the two-device comparison ran to completion', e.message?.split('\n')[0]);
  } finally {
    await browser.close();
    const pass = results.filter((r) => r.ok).length;
    console.log(`\n  ${pass} passed, ${results.length - pass} failed`);
    if (results.length - pass) process.exitCode = 1;
  }
})();
